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
import { ownedOrders } from "../src/lib/customer/pages";
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
let trace: { statement: string; ms: number }[] | undefined;
const statementName = (query: string) => {
  const normalized = query.replace(/\/\*[\s\S]*?\*\//g, "").trim().replaceAll("\\", "");
  const table = normalized.match(/(?:FROM|INTO|UPDATE) (?:"?public"?\.)?"([^"]+)"/i)?.[1];
  const verb = normalized.split(/\s+/)[0].toUpperCase();
  return table ? verb + " " + table : normalized.split(/\s+/).slice(0, 3).join(" ").toUpperCase();
};
db.$on("query", ({ query, duration }) => {
  count++;
  if (!trace) return;
  trace.push({ statement: statementName(query), ms: duration });
});
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

async function profileCart() {
  const products = Array.from({ length: 21 }, (_, i) => "ux0910_perf_" + i);
  await owner.$transaction(async (tx) => {
    for (const productId of products) {
      await tx.product.create({ data: { id: productId, name: "Cart workload product", slug: productId, description: "Synthetic",
        price: 100, categoryId: "qa_category", optionMode: "COLOR", isActive: true, isOrderable: true,
        images: { create: { url: "/images/placeholder.svg" } } } });
      await tx.productOption.create({ data: { id: productId + "_option", productId, kind: "COLOR", name: "Color",
        values: { create: { id: productId + "_red", value: "Red" } } } });
      await tx.productVariant.create({ data: { id: productId + "_variant", productId, combinationKey: "COLOR=" + productId + "_red",
        price: 100, isAvailable: true } });
      await tx.productVariantSelection.create({ data: { productId, optionId: productId + "_option", valueId: productId + "_red", variantId: productId + "_variant" } });
      await tx.variantFilamentGroup.create({ data: { variantId: productId + "_variant", position: 0, alternatives: { create: { filamentId: "f1" } } } });
    }
    await variantTransaction.flushVariantConstraints(tx);
  });
  const line = (productId: string) => ({ productId, quantity: 1, selection: { version: 2 as const,
    variantId: productId + "_variant", values: { COLOR: productId + "_red" } } });
  const quantile = (values: number[], p: number) => +[...values].sort((a, b) => a - b)[Math.ceil(values.length * p) - 1].toFixed(2);
  const pgTiming = process.env.BATCH19_CART_PROFILE === "1";
  for (const lines of [1, 2, 5, 10, 20]) {
    const base = products.slice(0, lines).map((id) => ({ ...line(id), generation: randomUUID(), removed: 0 }));
    const results = [];
    for (const mode of ["read", "add"]) {
      const samples = [];
      for (let i = 0; i < 16; i++) {
        if (i === 2 && pgTiming) await owner.$queryRaw`SELECT public.pg_stat_statements_reset()::text`;
        await owner.customerCart.upsert({ where: { userId: second }, create: { userId: second, revision: 1, lines: base }, update: { revision: 1, lines: base } });
        trace = [];
        const start = performance.now();
        if (mode === "read") assert.equal((await read(second)).items.length, lines);
        else {
          const result = await apply(second, { type: "add", line: line(products[lines]), revision: 1 });
          assert.ok("snapshot" in result && result.snapshot.items.length === lines + 1 && !result.problem);
        }
        const elapsed = performance.now() - start;
        samples.push({ trace, elapsed });
        trace = undefined;
      }
      const reported = samples.slice(2);
      const timings = new Map(pgTiming ? (await owner.$queryRaw<{query: string; mean: number; calls: number}[]>`
        SELECT query, mean_exec_time mean, calls::int FROM public.pg_stat_statements
        WHERE userid = 'app_3dkid'::regrole AND dbid = (SELECT oid FROM pg_database WHERE datname = current_database())
      `).map(({ query, mean, calls }) => [statementName(query), { mean: +mean.toFixed(4), calls }]) : []);
      const sequence = reported[0].trace.map(({ statement }) => statement);
      assert.ok(reported.every(sample => JSON.stringify(sample.trace.map(q => q.statement)) === JSON.stringify(sequence)));
      results.push({ mode, statements: sequence.length, p50: quantile(reported.map(row => row.elapsed), 0.5),
        p95: quantile(reported.map(row => row.elapsed), 0.95),
        sequence: sequence.map((name, index) => ({ name,
          meanEngine: +(reported.reduce((sum, row) => sum + row.trace[index].ms, 0) / reported.length).toFixed(2),
          maxEngine: Math.max(...reported.map(row => row.trace[index].ms)), postgres: timings.get(name) })) });
    }
    console.log("UX0910_WORKLOAD " + JSON.stringify({ lines, results }));
  }
  await owner.product.deleteMany({ where: { id: { in: products } } });
}

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
  let binding = security.tokenHash(issued.sid);
  let scope = sessions.favoritesVersion(binding);
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
  const otherDevice = await db.$transaction((tx) => sessions.issueSession(tx, first, binding));
  binding = security.tokenHash(otherDevice.sid);
  scope = sessions.favoritesVersion(binding);
  const replay = await submit(card.items, card.revision, "card_online");
  assert.ok(replay.success && replay.payment, "A new authorized session can resume the same hosted invoice");
  const referenceOf = (url: string) => new URL(url, "http://localhost").searchParams.get("attempt");
  assert.ok(referenceOf(payment.resultUrl) === referenceOf(replay.resultUrl), "Replay resolves to the same payment reference");
  assert.equal(invoices, 1);
  assert.equal(quantity(await read(), "qa_product"), 2);
  const original = await owner.order.findFirstOrThrow({ where: { paymentInvoiceId: "ux0910_invoice_1" } });
  assert.equal(await db.order.count({ where: { id: original.id, ...ownedOrders(first) } }), 0, "Provisional attempt is absent from account history");
  const applyEvidence = (reference: string, invoiceId: string, status: "PAID" | "FAILED" | "CANCELLED", modifiedAt = new Date()) =>
    transitions.applyPaymentEvidence({ provider: "mono", invoiceId, reference, amount: 20000, currency: 980,
      modifiedAt, status, providerStatus: status === "FAILED" ? "failure" : status === "CANCELLED" ? "expired" : "success",
      errorCode: status === "FAILED" ? "PAYMENT_FAILED" : status === "CANCELLED" ? "INVOICE_EXPIRED" : null });
  await apply(first, { type: "add", line: configured("v2", "medium"), revision: card.revision });
  const changed = await read();
  for (const method of ["card_online", "cash_on_delivery"]) {
    const overlapping = await submit(changed.items, changed.revision, method);
    assert.ok(!overlapping.success && overlapping.pendingPaymentUrl, "The owner can view the prior attempt while a second checkout is blocked");
    assert.ok(referenceOf(overlapping.pendingPaymentUrl) === original.paymentReference);
  }
  assert.equal(invoices, 1);
  assert.equal(await owner.order.count({ where: { customerId: first } }), 2, "No second order while first invoice is payable");
  await apply(first, { type: "set", id: "qa_native:variant:v2", quantity: 0, revision: changed.revision });
  const expiredAt = new Date();
  assert.equal(await applyEvidence(original.paymentReference!, "ux0910_invoice_1", "FAILED", new Date(expiredAt.getTime() - 10)), "applied");
  assert.equal(quantity(await read(), "qa_product"), 2);
  assert.equal(await applyEvidence(original.paymentReference!, "ux0910_invoice_1", "CANCELLED", expiredAt), "applied");
  assert.equal(quantity(await read(), "qa_product"), 2);
  const afterExpiry = await read();
  const source = { reference: original.paymentReference!, token: "fixture" };
  assert.equal((await submit(afterExpiry.items, afterExpiry.revision, "card_online", "bad", source)).success, false);
  const retry = await submit(afterExpiry.items, afterExpiry.revision, "card_online", "e".repeat(64), source);
  assert.ok(retry.success && retry.payment);
  assert.equal(invoices, 2);
  assert.ok((await submit(afterExpiry.items, afterExpiry.revision, "card_online", "e".repeat(64), source)).success);
  assert.equal(invoices, 2);

  await apply(first, { type: "set", id: "qa_product", quantity: 1, revision: afterExpiry.revision });
  await apply(first, { type: "add", line: { ...simple, quantity: 3 }, revision: (await read()).revision });
  await apply(first, { type: "add", line: configured("v2", "medium"), revision: (await read()).revision });
  const paid = await owner.order.findFirstOrThrow({ where: { paymentInvoiceId: "ux0910_invoice_2" } });
  const settledAt = new Date();
  assert.equal(await applyEvidence(paid.paymentReference!, "ux0910_invoice_2", "PAID", settledAt), "applied");
  assert.equal(await applyEvidence(paid.paymentReference!, "ux0910_invoice_2", "PAID", settledAt), "duplicate");
  assert.equal(await applyEvidence(paid.paymentReference!, "ux0910_invoice_2", "FAILED", new Date(settledAt.getTime() - 1000)), "stale");
  assert.equal(quantity(await read(), "qa_product"), 3, "Unpurchased new quantities stay");
  assert.equal(quantity(await read(), "qa_native:variant:v2"), 1, "Other device's product stays");
  assert.equal(await db.customerCartPurchase.count({ where: { orderId: paid.id } }), 0);
  assert.equal(await applyEvidence(original.paymentReference!, "ux0910_invoice_1", "PAID", new Date(expiredAt.getTime() - 100)), "stale");
  const late = await owner.order.findUniqueOrThrow({ where: { id: original.id } });
  assert.equal(late.checkoutAcceptance, "REVIEW");
  assert.ok(late.paidAt);
  assert.equal(quantity(await read(), "qa_product"), 3);
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
  await profileCart();
}
run().finally(() => Promise.all([db.$disconnect(), owner.$disconnect()])).catch((error) => { console.error(error); process.exitCode = 1; });
