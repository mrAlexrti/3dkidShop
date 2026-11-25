import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { cartTotalMinor, MAX_CART_LINES, MAX_QUANTITY } from "@/lib/cart-limits";
import { readCartProducts } from "@/lib/cart-products";
import { reconcileCart } from "@/lib/cart-reconciliation";
import type { Locale } from "@/lib/i18n";
import { translations } from "@/lib/i18n";
import type { CartItem } from "@/types";
import { cartLineId, cartLineKey, purchaseLines, storedCart, type CartLineInput, type CartMutation, type CartMutationResult, type CartSnapshot, type StoredCartLine } from "./cart-contract";

export async function readCart(tx: Prisma.TransactionClient, userId: string) {
  const cart = await tx.customerCart.findUnique({ where: { userId } });
  return { revision: cart?.revision ?? 0, lines: storedCart.parse(cart?.lines ?? []) };
}

function placeholder(line: CartLineInput, locale: Locale): CartItem {
  return { id: cartLineId(line), productId: line.productId, name: translations[locale].cart.sync.missing,
    slug: "", image: "/images/placeholder.svg", price: 0, quantity: line.quantity,
    ...(line.selection ? { selection: line.selection } : line.sizeId ? { variant: { id: line.sizeId, labelUa: "", labelEn: null } } : {}) };
}

export async function projectCart(tx: Prisma.TransactionClient, cart: Awaited<ReturnType<typeof readCart>>, locale: Locale): Promise<CartSnapshot> {
  const products = await readCartProducts(tx, cart.lines);
  const { items, issues } = reconcileCart(cart.lines.map((line) => placeholder(line, locale)), products, locale);
  return { revision: cart.revision, items, issues: { ...issues } };
}

type Db = Prisma.TransactionClient;
async function writeCart(tx: Db, userId: string, revision: number, lines: StoredCartLine[]) {
  const json = lines as Prisma.InputJsonValue;
  await tx.customerCart.upsert({ where: { userId }, create: { userId, revision, lines: json }, update: { revision, lines: json }, select: { userId: true } });
}

// Caller holds the existing customer row lock, including session validation.
export async function mutateCart(tx: Db, userId: string, mutation: CartMutation, locale: Locale): Promise<CartMutationResult> {
  const cart = await readCart(tx, userId);
  const snapshot = () => projectCart(tx, cart, locale);
  if (mutation.type === "merge") {
    const receipt = await tx.customerCartImport.findUnique({ where: { id: mutation.batch } });
    if (receipt) {
      return receipt.userId === userId
        ? { snapshot: await snapshot(), accepted: receipt.accepted as Record<string, number> }
        : { snapshot: await snapshot(), problem: "merge" };
    }
    // One lock per batch across customers. A concurrent account switch must not
    // transfer one physical guest cart into both accounts.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${mutation.batch}, 380910))`;
    const claimed = await tx.customerCartImport.findUnique({ where: { id: mutation.batch } });
    if (claimed) return { snapshot: await snapshot(), problem: "merge" };
  } else if (cart.revision !== mutation.revision) {
    return { snapshot: await snapshot(), problem: "conflict" };
  }

  const incoming = mutation.type === "add" ? [mutation.line] : mutation.type === "merge" ? mutation.lines : [];
  const products = await readCartProducts(tx, [...cart.lines, ...incoming]);
  const project = (lines: StoredCartLine[] | CartLineInput[]) => reconcileCart(lines.map((line) => placeholder(line, locale)), products, locale);
  const lines = [...cart.lines];
  const available = project(cart.lines);
  const prices = new Map(available.items.filter((line) => !Object.hasOwn(available.issues, line.id)).map((line) => [line.id, line.price]));
  const withinLimit = (candidate: StoredCartLine[]) => cartTotalMinor(candidate.filter((line) => prices.has(cartLineId(line)))
    .map((line) => ({ price: prices.get(cartLineId(line))!, quantity: line.quantity }))) !== null;
  const accepted: Record<string, number> = Object.create(null);
  let changed = false;
  let problem: "limit" | "unavailable" | undefined;

  if (mutation.type === "set") {
    const index = lines.findIndex((line) => cartLineId(line) === mutation.id);
    const previous = lines[index];
    if (previous && previous.quantity !== mutation.quantity) {
      if (mutation.quantity === 0) { lines.splice(index, 1); changed = true; }
      else if (mutation.quantity < previous.quantity) {
        const removed = previous.removed + previous.quantity - mutation.quantity;
        lines[index] = { ...previous, quantity: mutation.quantity, ...(Number.isSafeInteger(removed) ? { removed } : { removed: 0, generation: randomUUID() }) };
        changed = true;
      } else if (Object.hasOwn(available.issues, mutation.id)) problem = "unavailable";
      else {
        lines[index] = { ...previous, quantity: mutation.quantity };
        if (withinLimit(lines)) changed = true;
        else { lines[index] = previous; problem = "limit"; }
      }
    }
  } else {
    const eligible = new Set<string>();
    for (const line of incoming) {
      const id = cartLineId(line);
      const offered = project([line]);
      if (eligible.has(id) || Object.hasOwn(offered.issues, id)) { problem = "unavailable"; continue; }
      eligible.add(id);
      const index = lines.findIndex((existing) => cartLineId(existing) === id);
      const previous = lines[index];
      if (previous && cartLineKey(previous) !== cartLineKey(line)) { problem = "unavailable"; continue; }
      prices.set(id, offered.items[0].price);
      const quantity = (previous?.quantity ?? 0) + line.quantity;
      if ((!previous && lines.length >= MAX_CART_LINES) || quantity > MAX_QUANTITY) { problem = "limit"; continue; }
      const next = { ...line, quantity, generation: previous?.generation ?? randomUUID(), removed: previous?.removed ?? 0 };
      if (previous) lines[index] = next;
      else lines.push(next);
      if (!withinLimit(lines)) {
        if (previous) lines[index] = previous;
        else lines.pop();
        problem = "limit";
        continue;
      }
      accepted[id] = line.quantity;
      changed = true;
    }
  }

  const revision = cart.revision + Number(changed);
  if (changed || (mutation.type === "merge" && cart.revision === 0)) await writeCart(tx, userId, revision, lines);
  if (mutation.type === "merge") await tx.customerCartImport.create({ data: { id: mutation.batch, userId, accepted: { ...accepted } } });
  const { items, issues } = project(lines);
  return { snapshot: { revision, items, issues: { ...issues } }, ...(mutation.type === "merge" ? { accepted: { ...accepted } } : {}), ...(problem ? { problem } : {}) };
}

export function matchesCart(stored: StoredCartLine[], requested: CartLineInput[]) {
  if (stored.length !== requested.length) return false;
  const byKey = new Map(requested.map((line) => [cartLineKey(line), line.quantity]));
  return byKey.size === stored.length && stored.every((line) => byKey.get(cartLineKey(line)) === line.quantity);
}

// COD uses this within the creation transaction. A card attempt captures the
// same generation/quantity at reservation and consumes once at paid acceptance.
export async function consumeCart(tx: Db, userId: string, consumed: unknown) {
  const plan = new Map(purchaseLines.parse(consumed).map((line) => [line.generation, line]));
  const cart = await readCart(tx, userId);
  let changed = false;
  const lines = cart.lines.flatMap((line) => {
    const original = plan.get(line.generation);
    const amount = original ? Math.min(line.quantity, Math.max(0, original.quantity - (line.removed - original.removed))) : 0;
    if (!amount) return [line];
    changed = true;
    return line.quantity > amount ? [{ ...line, quantity: line.quantity - amount, removed: line.removed + amount }] : [];
  });
  if (changed) await writeCart(tx, userId, cart.revision + 1, lines);
}

export async function consumePaidCart(tx: Db, orderId: string, userId: string) {
  const plan = await tx.customerCartPurchase.findUnique({ where: { orderId } });
  if (!plan) return;
  await consumeCart(tx, userId, plan.lines);
  await tx.customerCartPurchase.delete({ where: { orderId } });
}
