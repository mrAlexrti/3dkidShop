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
import * as cartContract from "../src/lib/customer/cart-contract";
import * as mono from "../src/lib/payments/mono";
import * as monoState from "../src/lib/payments/mono-state";
import * as initialization from "../src/lib/payments/initialization";
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
import { translations, type Locale } from "../src/lib/i18n";
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
globalThis.fetch = async () => { throw new Error("EXTERNAL_PROVIDER_FORBIDDEN_IN_CART_QA"); };
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
  let providerClock = Date.now();
  let createUncertain: "with-id" | "without-id" | undefined;
  let statusError: mono.MonoError | undefined;
  let onRemove: ((id: string) => Promise<void>) | undefined;
  const merchant = new Map<string, mono.MonoSnapshot>();
  const calls: string[] = [];
  const put = (id: string, status: string, finalAmount = 0) => {
    const current = merchant.get(id)!;
    const updated = { ...current, status, finalAmount, modifiedDate: new Date(++providerClock).toISOString() };
    merchant.set(id, updated);
    return updated;
  };
  const provider = {
    ...mono, logMonoInitializationError: () => {},
    async createMonoInvoice({ number, amount }: { number: string; amount: number }) {
      const invoiceId = "ux0910_invoice_" + ++invoices;
      calls.push("create " + invoiceId);
      const createdDate = new Date(++providerClock).toISOString();
      merchant.set(invoiceId, { invoiceId, reference: number, amount, ccy: 980, status: "created", modifiedDate: createdDate, createdDate, finalAmount: amount });
      if (createUncertain) throw new mono.MonoError("MONO_UNAVAILABLE", { endpoint: "invoice/create", category: "timeout",
        invoiceId: createUncertain === "with-id" ? invoiceId : undefined });
      return { invoiceId, pageUrl: "https://pay.mbnk.biz/" + invoiceId };
    },
    async queryMonoInvoice(id: string) {
      calls.push("status " + id);
      if (statusError) throw statusError;
      const snapshot = merchant.get(id);
      if (!snapshot) throw new mono.MonoError("MONO_HTTP_REJECTED", { endpoint: "invoice/status", httpStatus: 404 });
      return snapshot;
    },
    async invalidateUnpaidMonoInvoice(id: string) {
      calls.push("remove " + id);
      await onRemove?.(id);
      assert.ok(["created", "failure"].includes(merchant.get(id)?.status ?? ""), "Paid and processing invoices must never be removed");
      merchant.delete(id);
    },
  };
  const cartCheckout = sourceModule<typeof import("../src/lib/payments/cart-checkout")>("src/lib/payments/cart-checkout.ts", {
    "@/lib/prisma": { prisma: db }, "@/lib/customer/session": sessions, "@/lib/customer/cart-contract": cartContract,
    "./initialization-state": initializationState, "./mono": provider, "./mono-state": monoState, "./money": money, "./transitions": transitions,
  });
  const { createOrder } = sourceModule<typeof import("../src/lib/actions/create-order")>("src/lib/actions/create-order.ts", {
    "node:crypto": crypto, "@prisma/client": prismaExports, "@/lib/prisma": { prisma: db }, "@/lib/cart-items": cartItems,
    "@/lib/product-variants": productVariants,
    "@/lib/payments/online-payment": { getOnlinePaymentConfig: () => ({ provider: "mono", mode: "sandbox" }) },
    "@/lib/payments/order-result": orderResult, "@/lib/payments/checkout-identity": checkoutIdentity, "@/lib/i18n": { translations },
    "@/lib/validations/checkout": checkout, "@/lib/order-status": orderStatus, "@/lib/order-number": orderNumber,
    "@/lib/payments/money": money, "@/lib/variant-transaction": variantTransaction,
    "@/lib/customer/session": { ...sessions, customerSession: async () => ({ id: first, binding, expires }) },
    "@/lib/customer/security": { ...security, customerPost: async () => true },
    "@/lib/payments/initialization-state": initializationState, "@/lib/payments/cart-checkout": cartCheckout,
    "@/lib/payments/retry": { verifiedPaymentRetry: async () => "e".repeat(64) },
    "@/lib/payments/initialization": initialization,
    "@/lib/notifications/orders": { notifyOrderCreated: async () => { notified++; return false; } },
    "@/lib/payments/mono": provider, "@/lib/payments/transitions": transitions,
  });
  const details = { customerName: "Cart", customerSurname: "Fixture", customerPhone: "0501112222", deliveryType: "np_warehouse",
    npCityName: "Local city", npWarehouseRef: "fixture", npWarehouseAddress: "Fixture", paymentMethod: "cash_on_delivery" };
  const submit = (items: CartItem[], revision: number, method = "cash_on_delivery", key = randomUUID(), locale: Locale = "en") =>
    createOrder({ ...details, paymentMethod: method }, items, locale, key, undefined, true, { scope, revision });
  const current = async (method = "cash_on_delivery", key = randomUUID(), locale: Locale = "en") => {
    const cart = await read();
    return submit(cart.items, cart.revision, method, key, locale);
  };
  const add = async (line = simple) => apply(first, { type: "add", line, revision: (await read()).revision });
  const clear = async () => {
    for (const line of (await read()).items) await apply(first, { type: "set", id: line.id, quantity: 0, revision: (await read()).revision });
  };
  const freshOrder = (id: string) => owner.order.findUniqueOrThrow({ where: { id }, include: { cartPurchase: true } });
  const findInvoice = (id: string) => owner.order.findFirstOrThrow({ where: { paymentInvoiceId: id }, include: { cartPurchase: true } });
  const receipt = (resultUrl: string) => new URL(resultUrl, "http://localhost").searchParams.get("attempt");
  const resetLease = (orderId: string) => owner.customerCartPurchase.update({ where: { orderId }, data: { reconcileUntil: null } });
  const evidence = (snapshot: mono.MonoSnapshot) => transitions.applyPaymentEvidence(monoState.monoEvidence(snapshot));
  const card = "card_online";
  const snapshot = await read();
  assert.equal((await submit([{ ...snapshot.items[0], price: 1 }, ...snapshot.items.slice(1)], snapshot.revision)).success, false);
  assert.equal((await submit(snapshot.items.slice(1), snapshot.revision)).success, false);
  assert.deepEqual((await read()).items, snapshot.items);
  const codKey = randomUUID();
  const [codA, codB] = await Promise.all([submit(snapshot.items, snapshot.revision, undefined, codKey), submit(snapshot.items, snapshot.revision, undefined, codKey)]);
  assert.ok(codA.success && codB.success);
  assert.equal(codA.orderNumber, codB.orderNumber);
  assert.equal(notified, 1);
  assert.equal((await read()).items.length, 0);

  // Abandonment leaves the cart and reference intact; a different session and
  // request key recover the same invoice using the authoritative provider.
  await add({ ...simple, quantity: 2 });
  const originalCheckout = await read();
  const original = await current(card);
  assert.ok(original.success && original.payment);
  const firstInvoice = await findInvoice("ux0910_invoice_1");
  assert.equal(await db.order.count({ where: { id: firstInvoice.id, ...ownedOrders(first) } }), 0);
  const otherDevice = await db.$transaction((tx) => sessions.issueSession(tx, first, binding));
  binding = security.tokenHash(otherDevice.sid);
  scope = sessions.favoritesVersion(binding);
  const replay = await current(card);
  assert.ok(replay.success && replay.payment);
  assert.equal(receipt(replay.resultUrl), receipt(original.resultUrl));
  assert.equal(invoices, 1);
  assert.deepEqual((await read()).items, originalCheckout.items);

  await add(configured("v2", "medium"));
  const staleQuote = await read();
  assert.ok(!(await submit(staleQuote.items.map((line) => ({ ...line, price: 1 })), staleQuote.revision, card)).success);
  assert.equal(merchant.get("ux0910_invoice_1")?.status, "created", "Invalid quotes do not deactivate a valid invoice");
  calls.length = 0;
  const changed = await current(card);
  assert.ok(changed.success && changed.payment);
  assert.deepEqual(calls, ["status ux0910_invoice_1", "remove ux0910_invoice_1", "create ux0910_invoice_2"]);
  const secondInvoice = await findInvoice("ux0910_invoice_2");
  assert.equal((await freshOrder(firstInvoice.id)).cartPurchase?.supersededByOrderId, secondInvoice.id);

  // A second tab cannot pass the outstanding removal. Switching to COD can
  // create exactly one order after the confirmed deactivation.
  let startedRemove!: () => void;
  let permitRemove!: () => void;
  const removing = new Promise<void>((resolve) => { startedRemove = resolve; });
  const permitted = new Promise<void>((resolve) => { permitRemove = resolve; });
  onRemove = async () => { startedRemove(); await permitted; };
  const cod = current();
  await Promise.race([removing, cod.then(() => assert.fail("Expected removal before COD"))]);
  try {
    const overlapping = await current();
    assert.ok(!overlapping.success && overlapping.pendingPaymentUrl && receipt(overlapping.pendingPaymentUrl) === secondInvoice.paymentReference);
  } finally { permitRemove(); }
  const paidLater = await cod;
  onRemove = undefined;
  assert.ok(paidLater.success && paidLater.orderNumber);
  assert.equal(invoices, 2);
  assert.equal((await read()).items.length, 0);
  const lateSuccess = { invoiceId: "ux0910_invoice_2", reference: secondInvoice.paymentReference!, ccy: 980,
    status: "success", amount: money.moneyMinorUnits(secondInvoice.total.toString())!, modifiedDate: new Date(++providerClock).toISOString() };
  await add();
  assert.equal(await evidence(lateSuccess), "applied");
  assert.equal(await evidence(lateSuccess), "duplicate");
  const late = await freshOrder(secondInvoice.id);
  assert.equal(late.checkoutAcceptance, "REVIEW");
  assert.equal(late.number, null);
  assert.equal(late.paymentErrorCode, "SUPERSEDED_PAYMENT_PAID");
  assert.ok(late.paidAt);
  assert.equal(await evidence({ ...lateSuccess, status: "processing", modifiedDate: new Date(++providerClock).toISOString() }), "applied");
  assert.equal((await freshOrder(secondInvoice.id)).paymentErrorCode, "SUPERSEDED_PAYMENT_PAID");
  assert.equal(quantity(await read(), "qa_product"), 1);
  console.log("PASS UX-09 abandoned invoice, other-device reuse, changed checkout, online-to-COD, concurrent checkout and superseded financial success audit");

  // No expired webhook. Passing the local validity timestamp proves nothing.
  const expiryKey = randomUUID();
  assert.ok((await current(card, expiryKey)).success);
  const expiring = await findInvoice("ux0910_invoice_3");
  await owner.order.update({ where: { id: expiring.id }, data: { paymentExpiresAt: new Date(Date.now() - 1000) } });
  const timeout = new mono.MonoError("MONO_UNAVAILABLE", { endpoint: "invoice/status", category: "timeout" });
  statusError = timeout;
  const unclear = await current(card, expiryKey, "ua");
  assert.ok(!unclear.success && unclear.error === translations.ua.checkout.errors.paymentVerification);
  assert.equal((await freshOrder(expiring.id)).paymentStatus, "PENDING");
  assert.equal(invoices, 3);
  statusError = new mono.MonoError("MONO_HTTP_REJECTED", { endpoint: "invoice/status", httpStatus: 429 });
  await resetLease(expiring.id);
  calls.length = 0;
  const throttled = await current(card, expiryKey);
  assert.ok(!throttled.success && throttled.error === translations.en.checkout.errors.paymentVerification);
  await current(card, expiryKey);
  assert.deepEqual(calls, ["status ux0910_invoice_3"]);
  await resetLease(expiring.id);
  statusError = undefined;
  put("ux0910_invoice_3", "expired");
  assert.ok((await current(card, expiryKey)).success);
  assert.equal((await freshOrder(expiring.id)).paymentProviderStatus, "expired");
  assert.equal(invoices, 4);
  put("ux0910_invoice_4", "failure");
  onRemove = async () => { throw new mono.MonoError("MONO_HTTP_REJECTED", { endpoint: "invoice/remove", httpStatus: 404 }); };
  const failedButUnconfirmed = await current(card, expiryKey);
  assert.ok(!failedButUnconfirmed.success && failedButUnconfirmed.error === translations.en.checkout.errors.paymentVerification);
  assert.equal(invoices, 4, "Failure alone and an ambiguous removal cannot open a second payable invoice");
  onRemove = undefined;
  await resetLease((await findInvoice("ux0910_invoice_4")).id);
  calls.length = 0;
  assert.ok((await current(card, expiryKey)).success);
  assert.equal((await findInvoice("ux0910_invoice_4")).paymentProviderStatus, "failure");
  assert.deepEqual(calls, ["status ux0910_invoice_4", "remove ux0910_invoice_4", "create ux0910_invoice_5"]);
  assert.equal(invoices, 5);

  const processingInvoice = await findInvoice("ux0910_invoice_5");
  put("ux0910_invoice_5", "processing");
  calls.length = 0;
  const processing = await current(undefined, undefined, "ua");
  assert.ok(!processing.success && processing.error === translations.ua.checkout.errors.pendingPayment);
  assert.deepEqual(calls, ["status ux0910_invoice_5"]);
  put("ux0910_invoice_5", "created");
  await resetLease(processingInvoice.id);
  onRemove = async () => { throw new mono.MonoError("MONO_UNAVAILABLE", { endpoint: "invoice/remove", category: "timeout" }); };
  const refused = await current();
  assert.ok(!refused.success && refused.error === translations.en.checkout.errors.paymentVerification);
  assert.equal(merchant.get("ux0910_invoice_5")?.status, "created");
  assert.equal((await freshOrder(processingInvoice.id)).cartPurchase?.supersededByOrderId, null);
  assert.equal(quantity(await read(), "qa_product"), 1);
  console.log("PASS UX-09 expiration without a webhook, failed invoice replacement, processing, verification timeout and rate limit, and unknown deactivation in UA and EN");

  // Success wins in the merchant race. The overlapping request must review the
  // changed cart, and the old attempt must never be silently ignored.
  await resetLease(processingInvoice.id);
  await add({ ...simple, quantity: 2 });
  await add(configured("v2", "medium"));
  let settled!: mono.MonoSnapshot;
  onRemove = async (id) => {
    settled = put(id, "success", merchant.get(id)!.amount);
    throw new mono.MonoError("MONO_HTTP_REJECTED", { endpoint: "invoice/remove", httpStatus: 400 });
  };
  const racing = await current();
  assert.ok(!racing.success && racing.error === translations.en.cart.sync.conflict);
  onRemove = undefined;
  const accepted = await freshOrder(processingInvoice.id);
  assert.equal(accepted.checkoutAcceptance, "ACCEPTED");
  assert.ok(accepted.paidAt && accepted.number);
  assert.equal(await evidence(settled), "duplicate");
  assert.equal(await evidence({ ...settled, status: "failure", modifiedDate: new Date(Date.parse(settled.modifiedDate) - 1).toISOString() }), "stale");
  await db.$transaction(async (tx) => {
    assert.ok(await sessions.lockCustomer(tx, first));
    await consumePaidCart(tx, accepted.id, first);
  });
  assert.equal(quantity(await read(), "qa_product"), 2);
  assert.equal(quantity(await read(), "qa_native:variant:v2"), 1);

  // Distinct unit generations permit a separate purchase. An old payment from
  // another device may still be accepted independently without consuming it.
  assert.ok((await current(card)).success);
  const independent = await findInvoice("ux0910_invoice_6");
  await clear();
  await add(configured("v1", "small"));
  calls.length = 0;
  assert.ok((await current()).success);
  assert.deepEqual(calls, []);
  assert.equal((await freshOrder(independent.id)).cartPurchase?.supersededByOrderId, null);
  await add();
  assert.equal(await evidence(put("ux0910_invoice_6", "success", merchant.get("ux0910_invoice_6")!.amount)), "applied");
  assert.equal((await freshOrder(independent.id)).checkoutAcceptance, "ACCEPTED");
  assert.equal(quantity(await read(), "qa_product"), 1);
  console.log("PASS UX-09 payment wins removal race, duplicate and out-of-order evidence, once-only quantity deduction and independent orders");

  createUncertain = "without-id";
  const uncertain = await current(card);
  createUncertain = undefined;
  assert.ok(!uncertain.success);
  const unknown = await owner.order.findFirstOrThrow({ where: { paymentReference: merchant.get("ux0910_invoice_7")!.reference } });
  assert.equal(unknown.paymentInvoiceId, null);
  assert.equal(unknown.paymentPageUrl, null);
  assert.equal(unknown.paymentErrorCode, initializationState.INVOICE_UNCERTAIN);
  assert.ok((await current()).success);
  assert.equal(await transitions.acceptPaymentInvoice(unknown.paymentReference!, "ux0910_invoice_7", new Date(), "https://pay.mbnk.biz/ux0910_invoice_7"), null);
  const laterEvidence = monoState.monoEvidence(put("ux0910_invoice_7", "success", merchant.get("ux0910_invoice_7")!.amount));
  assert.equal(await transitions.applyPaymentEvidence(laterEvidence, { authenticatedInvoiceBinding: true }), "applied");
  assert.equal((await freshOrder(unknown.id)).paymentErrorCode, "SUPERSEDED_PAYMENT_PAID");
  assert.equal((await freshOrder(unknown.id)).checkoutAcceptance, "REVIEW");

  await add(configured("v2", "medium"));
  const missingHandoffKey = randomUUID();
  createUncertain = "with-id";
  assert.ok(!(await current(card, missingHandoffKey)).success);
  createUncertain = undefined;
  const missingHandoff = await findInvoice("ux0910_invoice_8");
  assert.equal(missingHandoff.paymentPageUrl, null);
  calls.length = 0;
  assert.ok((await current(card, missingHandoffKey)).success);
  assert.deepEqual(calls, ["status ux0910_invoice_8", "remove ux0910_invoice_8", "create ux0910_invoice_9"]);
  await db.session.deleteMany({ where: { sessionToken: binding } });
  calls.length = 0;
  const next = await read();
  assert.ok(!(await current()).success);
  assert.deepEqual(calls, []);
  assert.deepEqual((await read()).items, next.items);
  console.log("PASS UX-09 unpublished create outcome, late handoff fence, early-bound financial success audit and revoked session");

  const readBefore = count;
  const started = performance.now();
  await read();
  console.log("UX-09 PostgreSQL sample: " + (count - readBefore) + " statements for a two-line configured cart read and " +
    mutationQueries + " for one configured add, including transaction statements; " + Math.round(performance.now() - started) + " ms for the read.");
  await profileCart();
}
run().finally(() => Promise.all([db.$disconnect(), owner.$disconnect()])).catch((error) => { console.error(error); process.exitCode = 1; });
