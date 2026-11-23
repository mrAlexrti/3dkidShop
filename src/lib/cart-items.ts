import type { CartItem } from "@/types";
import { productLineId } from "@/lib/product-variants";
import { MAX_CART_LINES, priceMinor, validQuantity, cartTotalMinor } from "@/lib/cart-limits";
import { combinationSelectionSchema } from "./product-configuration";

export function requestedSizeId(item: Pick<CartItem, "id" | "productId" | "variant"> & { selection?: unknown }): string | undefined {
  if (item.selection !== undefined) return item.variant || !combinationSelectionSchema.safeParse(item.selection).success ? "INVALID_SIZE" : undefined;
  if (typeof item.id === "string" && item.id.includes(":variant:")) return "INVALID_SIZE";
  if (item.variant) return typeof item.variant.id === "string" && /^[a-zA-Z0-9_]{1,128}$/.test(item.variant.id) ? item.variant.id : "INVALID_SIZE";
  if (typeof item.id !== "string" || typeof item.productId !== "string") return "INVALID_SIZE";
  const suffix = item.id.startsWith(`${item.productId}-`) ? item.id.slice(item.productId.length + 1) : "";
  return suffix ? (/^[a-zA-Z0-9_]+$/.test(suffix) ? suffix : "INVALID_SIZE") : undefined;
}

export function normalizeCartItems(input: unknown): CartItem[] {
  if (!Array.isArray(input)) return [];
  const merged = new Map<string, CartItem>();
  for (const raw of input) {
    if (!raw || typeof raw.productId !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(raw.productId) || typeof raw.name !== "string" || typeof raw.slug !== "string" || typeof raw.image !== "string" || priceMinor(raw.price) === null || !validQuantity(raw.quantity)) continue;
    if (raw.selection !== undefined) {
      const selected = combinationSelectionSchema.safeParse(raw.selection);
      if (!selected.success || raw.variant || raw.options) continue;
      const id = `${raw.productId}:variant:${selected.data.variantId}`;
      const label = (value: unknown) => {
        const v = value as { labelUa?: unknown; labelEn?: unknown } | undefined;
        return { labelUa: typeof v?.labelUa === "string" ? v.labelUa.slice(0,100) : "", labelEn: typeof v?.labelEn === "string" ? v.labelEn.slice(0,100) : null };
      };
      const item: CartItem = { id, productId: raw.productId, name: raw.name, slug: raw.slug, image: raw.image, price: raw.price, quantity: raw.quantity, selection: selected.data,
        selectionLabels: { COLOR: label(raw.selectionLabels?.COLOR), ...(selected.data.values.SIZE ? { SIZE: label(raw.selectionLabels?.SIZE) } : {}) } };
      const previous = merged.get(id);
      // Contradictory values for one ID are not an identical combination addition.
      if (previous && JSON.stringify(previous.selection) !== JSON.stringify(item.selection)) continue;
      const quantity = (previous?.quantity ?? 0) + item.quantity;
      if ((previous || merged.size < MAX_CART_LINES) && validQuantity(quantity)) merged.set(id, { ...item, quantity });
      continue;
    }
    const selectedId = requestedSizeId(raw);
    if (selectedId === "INVALID_SIZE") continue;
    const legacyLabel = raw.options && typeof raw.options === "object" ? Object.values(raw.options).find((value) => typeof value === "string") as string | undefined : undefined;
    // An old display label cannot identify a current size safely. Retain that
    // selection as unresolved instead of converting it into a simple product.
    const variantId = selectedId ?? (legacyLabel ? "LEGACY_UNRESOLVED" : undefined);
    const variant = variantId ? { id: variantId, labelUa: typeof raw.variant?.labelUa === "string" ? raw.variant.labelUa : legacyLabel ?? "", labelEn: typeof raw.variant?.labelEn === "string" ? raw.variant.labelEn : null } : undefined;
    const id = productLineId(raw.productId, variantId);
    const item: CartItem = { id, productId: raw.productId, name: raw.name, slug: raw.slug, image: raw.image, price: raw.price, quantity: raw.quantity, ...(variant ? { variant } : {}) };
    const previous = merged.get(id);
    const quantity = (previous?.quantity ?? 0) + item.quantity;
    if ((merged.has(id) || merged.size < MAX_CART_LINES) && validQuantity(quantity)) merged.set(id, { ...item, quantity });
  }
  return [...merged.values()];
}

// Preserve the original simple/size material byte-for-byte for Mono replay.
export function checkoutSelectionLines(items: CartItem[]) {
  return items.map((item) => {
    if (item.selection !== undefined) {
      if (item.variant || item.options) throw new Error("INVALID_SELECTION");
      const s = combinationSelectionSchema.parse(item.selection);
      return { productId: item.productId, selectionVersion: 2, variantId: s.variantId,
        values: { COLOR: s.values.COLOR, SIZE: s.values.SIZE ?? null }, quantity: item.quantity };
    }
    return { productId: item.productId, size: requestedSizeId(item) ?? null, quantity: item.quantity };
  }).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}

export function cartAfterAddition(before: CartItem[], item: CartItem): CartItem[] | null {
  const items = normalizeCartItems([...before, item]);
  const expected = before.reduce((sum, line) => sum + line.quantity, 0) + item.quantity;
  return items.reduce((sum, line) => sum + line.quantity, 0) === expected && cartTotalMinor(items) !== null ? items : null;
}
