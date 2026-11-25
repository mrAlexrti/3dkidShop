import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import type { CartItem } from "../src/types";
import type { CartMutation } from "../src/lib/customer/cart-contract";
import { consumePaidCart, matchesCart, mutateCart, projectCart, readCart } from "../src/lib/customer/cart";
import * as sessions from "../src/lib/customer/session";
import * as security from "../src/lib/customer/security";
import * as transitions from "../src/lib/payments/transitions";
import * as money from "../src/lib/payments/money";
import * as checkout from "../src/lib/validations/checkout";
import * as orderResult from "../src/lib/payments/order-result";
import * as orderStatus from "../src/lib/order-status";
import * as orderNumber from "../src/lib/order-number";
import * as initializationState from "../src/lib/payments/initialization-state";
import * as checkoutIdentity from "../src/lib/payments/checkout-identity";
import * as cartItems from "../src/lib/cart-items";
import * as variantTransaction from "../src/lib/variant-transaction";
import * as productVariants from "../src/lib/product-variants";
import * as crypto from "node:crypto";
import * as prismaExports from "@prisma/client";
import { translations } from "../src/lib/i18n";
import { sourceModule } from "./source-module";

const runtime = new URL(process.env.DATABASE_URL ?? "");
const ownerUrl = new URL(process.env.BATCH19_OWNER_DATABASE_URL ?? "");
const marker = process.env.BATCH19_QA_MARKER;
assert.match(marker ?? "", /^[a-f0-9]{32}$/);
assert.equal(readFileSync(join(process.env.BATCH19_QA_DIRECTORY!, "qa-marker"), "utf8"), marker);
assert.equal(runtime.hostname, "127.0.0.1");
assert.equal(runtime.pathname, "/batch18_review_" + marker);
assert.equal(runtime.username, "app_3dkid");
assert.equal(ownerUrl.host + ownerUrl.pathname, runtime.host + runtime.pathname);
assert.equal(ownerUrl.username, "batch18a_qa");
const db = new PrismaClient({ datasourceUrl: runtime.href, log: [{ emit: "event", level: "query" }] });
const owner = new PrismaClient({ datasourceUrl: ownerUrl.href });
let count = 0;
db.$on("query", () => { count++; });
const first = "ux0910_a", second = "ux0910_b";
const simple = { productId: "qa_product", quantity: 1 };
const configured = (variantId: string, SIZE: string, COLOR = "pink") => ({
  productId: "qa_native", selection: { version: 2 as const, variantId, values: { COLOR, SIZE } }, quantity: 1,
});

const apply = (user: string, mutation: CartMutation) => db.$transaction(async (tx) => {
  assert.ok(await sessions.lockCustomer(tx, user));
  return mutateCart(tx, user, mutation, "en");
});
const read = (id = first) => db.$transaction(async (tx) => projectCart(tx, await readCart(tx, id), "en"), { isolationLevel: "RepeatableRead" });
const quantity = (snapshot: Awaited<ReturnType<typeof read>>, id: string) => snapshot.items.find((line) => line.id === id)?.quantity ?? 0;

async function run() {
  for (const id of [first, second]) await owner.user.create({ data: { id, role: "CUSTOMER", email: id + "@example.test", emailVerified: new Date() } });
  assert.deepEqual(await read(), { revision: 0, items: [], issues: {} });
  const countBefore = count;
  await apply(first, { type: "add", line: configured("v1", "small"), revision: 0 });
  const mutationQueries = count - countBefore;
  const batch = randomUUID();
  const transfer = { type: "merge", batch, lines: [configured("v1", "small"), configured("v2", "medium"), configured("v3", "large", "blue"), simple] } as const;
  const merge = () => apply(first, { ...transfer, lines: [...transfer.lines] });
  const [mergeA, mergeB] = await Promise.all([merge(), merge()]);
  assert.ok("accepted" in mergeA && "accepted" in mergeB);
  assert.deepEqual(mergeA.accepted, mergeB.accepted);
  assert.deepEqual(Object.keys(mergeA.accepted!).sort(), ["qa_native:variant:v1", "qa_native:variant:v2", "qa_product"]);
  assert.equal(quantity(await read(), "qa_native:variant:v1"), 2);
  assert.equal(quantity(await read(), "qa_native:variant:v2"), 1);
  assert.equal((await apply(second, { ...transfer, lines: [...transfer.lines] })).problem, "merge");
  assert.equal((await read(second)).items.length, 0);
  const stale = (await read()).revision;
  const race = await Promise.all([
    apply(first, { type: "set", id: "qa_product", quantity: 2, revision: stale }),
    apply(first, { type: "set", id: "qa_product", quantity: 3, revision: stale }),
  ]);
  assert.equal(race.filter((result) => result.problem === "conflict").length, 1);
  const before = await read();
  assert.equal(matchesCart((await readCart(db, first)).lines, [simple]), false);
  await owner.product.update({ where: { id: "qa_product" }, data: { price: 107, isOrderable: false } });
  const blocked = await read();
  assert.equal(blocked.items.find((line) => line.productId === "qa_product")?.price, 107);
  assert.equal(blocked.issues.qa_product, "unavailable");
  await owner.filament.update({ where: { id: "f1" }, data: { isAvailable: false } });
  assert.equal((await read()).issues["qa_native:variant:v1"], "variantUnavailable");
  await owner.filament.update({ where: { id: "f1" }, data: { isAvailable: true } });
  await owner.product.update({ where: { id: "qa_product" }, data: { price: 100, isOrderable: true } });

  const temporary = await owner.product.create({ data: { name: "Temporary", slug: "ux0910-removed", description: "Synthetic", price: 20,
    categoryId: "qa_category", isActive: true, isOrderable: true } });
  await apply(first, { type: "add", line: { productId: temporary.id, quantity: 1 }, revision: before.revision });
  await owner.product.delete({ where: { id: temporary.id } });
  assert.equal((await read()).issues[temporary.id], "unavailable");
  await apply(first, { type: "set", id: temporary.id, quantity: 0, revision: (await read()).revision });
  assert.equal((await read()).items.some((row) => row.productId === temporary.id), false);
  console.log("PASS UX-09 bounded cart, atomic same-variant and distinct-variant import, repeated and cross-account import, CAS, current prices and deleted products");

  const issued = await db.$transaction((tx) => sessions.issueSession(tx, first));
  const binding = security.tokenHash(issued.sid);
  const scope = sessions.favoritesVersion(binding);
  const expires = new Date(Date.now() + 86400000);
  let invoices = 0;
  let notified = 0;
  const { createOrder } = sourceModule<typeof import("../src/lib/actions/create-order")>("src/lib/actions/create-order.ts", {
    "node:crypto": crypto, "@prisma/client": prismaExports, "@/lib/prisma": { prisma: db }, "@/lib/cart-items": cartItems,
    "@/lib/product-variants": productVariants,
    "@/lib/payments/online-payment": { getOnlinePaymentConfig: () => ({ provider: "mono", mode: "sandbox" }) },
    "@/lib/payments/order-result": orderResult, "@/lib/payments/checkout-identity": checkoutIdentity, "@/lib/i18n": { translations },
    "@/lib/validations/checkout": checkout, "@/lib/order-status": orderStatus, "@/lib/order-number": orderNumber,
    "@/lib/payments/money": money, "@/lib/variant-transaction": variantTransaction,
    "@/lib/customer/session": { ...sessions, customerSession: async () => ({ id: first, binding, expires }) },
    "@/lib/customer/security": { ...security, customerPost: async () => true },
    "@/lib/payments/initialization-state": initializationState,
    "@/lib/payments/retry": { verifiedPaymentRetry: async () => "e".repeat(64) },
    "@/lib/payments/initialization": { recoverUnacceptedInvoice: () => assert.fail("unexpected provider recovery") },
    "@/lib/notifications/orders": { notifyOrderCreated: async () => { notified++; return false; } },
    "@/lib/payments/mono": { MONO_VALIDITY_SECONDS: 3600, logMonoInitializationError: () => {}, MonoError: class extends Error {},
      createMonoInvoice: async () => ({ invoiceId: "ux0910_invoice_" + ++invoices, pageUrl: "https://pay.mbnk.biz/fixture" }) },
    "@/lib/payments/transitions": { ...transitions, acceptPaymentInvoice: async (number: string, id: string, expiry: Date, pageUrl: string) => ({
      order: await owner.order.update({ where: { paymentReference: number }, data: { paymentInvoiceId: id, paymentExpiresAt: expiry, paymentPageUrl: pageUrl } }),
      notify: false,
    }) },
  });
  const details = { customerName: "Cart", customerSurname: "Fixture", customerPhone: "0501112222", deliveryType: "np_warehouse",
    npCityName: "Local city", npWarehouseRef: "fixture", npWarehouseAddress: "Fixture", paymentMethod: "cash_on_delivery" };
  const snapshot = await read();
  const submit = (items: CartItem[], revision: number, method = "cash_on_delivery", retryKey?: string, retrySource?: { reference: string; token: string }) =>
    createOrder({ ...details, paymentMethod: method }, items, "en", retryKey, retrySource, true, { scope, revision });
  assert.equal((await submit([{ ...snapshot.items[0], price: 1 }, ...snapshot.items.slice(1)], snapshot.revision)).success, false);
  assert.equal((await submit(snapshot.items.slice(1), snapshot.revision)).success, false);
  assert.deepEqual((await read()).items, snapshot.items);
  const [codA, codB] = await Promise.all([submit(snapshot.items, snapshot.revision), submit(snapshot.items, snapshot.revision)]);
  assert.ok(codA.success && codB.success);
  assert.equal(codA.orderNumber, codB.orderNumber);
  assert.equal(notified, 1);
  assert.equal((await read()).items.length, 0);

  await apply(first, { type: "add", line: { ...simple, quantity: 2 }, revision: (await read()).revision });
  const card = await read();
  const payment = await submit(card.items, card.revision, "card_online");
  assert.ok(payment.success && payment.payment);
  const replay = await submit(card.items, card.revision, "card_online");
  assert.ok(replay.success);
  const referenceOf = (url: string) => new URL(url, "http://localhost").searchParams.get("attempt");
  assert.ok(referenceOf(payment.resultUrl) === referenceOf(replay.resultUrl), "Replay resolves to the same payment reference");
  assert.equal(invoices, 1);
  assert.equal(quantity(await read(), "qa_product"), 2);
  const original = await owner.order.findFirstOrThrow({ where: { paymentInvoiceId: "ux0910_invoice_1" } });
  const applyEvidence = (reference: string, invoiceId: string, status: "PAID" | "FAILED") =>
    transitions.applyPaymentEvidence({ provider: "mono", invoiceId, reference, amount: 20000, currency: 980,
      modifiedAt: new Date(), status, providerStatus: status, errorCode: status === "PAID" ? null : "fixture" });
  assert.equal(await applyEvidence(original.paymentReference!, "ux0910_invoice_1", "FAILED"), "applied");
  assert.equal(quantity(await read(), "qa_product"), 2);
  const source = { reference: original.paymentReference!, token: "fixture" };
  assert.equal((await submit(card.items, card.revision, "card_online", "bad", source)).success, false);
  const retry = await submit(card.items, card.revision, "card_online", "e".repeat(64), source);
  assert.ok(retry.success && retry.payment);
  assert.equal(invoices, 2);
  assert.ok((await submit(card.items, card.revision, "card_online", "e".repeat(64), source)).success);
  assert.equal(invoices, 2);

  await apply(first, { type: "set", id: "qa_product", quantity: 1, revision: card.revision });
  await apply(first, { type: "add", line: { ...simple, quantity: 3 }, revision: (await read()).revision });
  await apply(first, { type: "add", line: configured("v2", "medium"), revision: (await read()).revision });
  const paid = await owner.order.findFirstOrThrow({ where: { paymentInvoiceId: "ux0910_invoice_2" } });
  assert.equal(await applyEvidence(paid.paymentReference!, "ux0910_invoice_2", "PAID"), "applied");
  assert.equal(quantity(await read(), "qa_product"), 3, "Unpurchased new quantities stay");
  assert.equal(quantity(await read(), "qa_native:variant:v2"), 1, "Other device's product stays");
  assert.equal(await db.customerCartPurchase.count({ where: { orderId: paid.id } }), 0);
  await db.$transaction(async (tx) => {
    assert.ok(await sessions.lockCustomer(tx, first));
    await consumePaidCart(tx, paid.id, first);
  });
  assert.equal(quantity(await read(), "qa_product"), 3);
  await db.session.deleteMany({ where: { sessionToken: binding } });
  const next = await read();
  assert.equal((await submit(next.items, next.revision)).success, false);
  assert.deepEqual((await read()).items, next.items);
  console.log("PASS UX-09 real order transaction and payment evidence, duplicate COD/card requests, failure and approved payment retry, isolated quantity deduction and revoked session");

  const readBefore = count;
  const started = performance.now();
  await read();
  console.log("UX-09 PostgreSQL sample: " + (count - readBefore) + " statements for a two-line configured cart read and " +
    mutationQueries + " for one configured add, including transaction statements; " + Math.round(performance.now() - started) + " ms for the read.");
}
run().finally(() => Promise.all([db.$disconnect(), owner.$disconnect()])).catch((error) => { console.error(error); process.exitCode = 1; });
