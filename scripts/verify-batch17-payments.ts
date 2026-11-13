// Actual provider/action/webhook/transition/reconciliation sources; isolated DB,
// provider HTTP, email and Telegram boundaries. Never load .env or PrismaClient.
import assert from "node:assert/strict";
import * as crypto from "node:crypto";
import { NextResponse } from "next/server";
import { sourceModule } from "./source-module";
import { PaymentMemory, type Row } from "./payment-memory";
import * as money from "../src/lib/payments/money";
import * as numbers from "../src/lib/order-number";
import * as serverEnv from "../src/lib/server-env";
import * as orderStatus from "../src/lib/order-status";
import * as status from "../src/lib/status";
import * as events from "../src/lib/notifications/events";
import * as validation from "../src/lib/validations/checkout";
import * as variants from "../src/lib/product-variants";
import * as cart from "../src/lib/cart-items";
import * as result from "../src/lib/payments/order-result";
import * as states from "../src/lib/payments/payment-state";
import * as methods from "../src/lib/payments/payment-method";
import { translations } from "../src/lib/i18n";
import { Prisma, type Order } from "@prisma/client";

const savedEnv = { ...process.env }; const savedFetch = globalThis.fetch; const savedNow = Date.now;
let networkCalls = 0; let creates = 0; let statusCalls = 0; let keyCalls = 0;
let invoiceFailure = false; let invalidPage = false; let afterCreate: (() => Promise<void>) | undefined;
const keys = () => crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" });
let signing = keys(); let timestamp = Date.parse("2026-11-13T12:00:00Z"); Date.now = () => timestamp;
process.env.MONO_ACQUIRING_TOKEN = "isolated-mono-fixture-token";
process.env.SITE_URL = "https://shop.example.invalid";
process.env.AUTH_SECRET = "isolated-batch17-result-secret";
process.env.ONLINE_PAYMENT_MODE = "sandbox";
process.env.CRON_SECRET = "isolated-cron-secret";
const db = new PaymentMemory();
let querySnapshot: Record<string, unknown>;
const snapshot = (changes: Record<string, unknown> = {}) => ({ invoiceId: "invoice_1", reference: "3DK-isolated", amount: 19900, ccy: 980,
  status: "created", modifiedDate: new Date(timestamp).toISOString(), ...changes });

globalThis.fetch = async (input, init) => {
  networkCalls++;
  const url = String(input);
  assert.ok(url.startsWith("https://api.monobank.ua/api/merchant/"), "Arbitrary provider URLs forbidden");
  assert.equal((init?.headers as Record<string, string>)["X-Token"], "isolated-mono-fixture-token");
  assert.equal(init?.redirect, "error");
  if (url.endsWith("/pubkey")) { keyCalls++; return Response.json({ key: signing.publicKey.export({ type: "spki", format: "pem" }).toString().length && Buffer.from(signing.publicKey.export({ type: "spki", format: "pem" })).toString("base64") }); }
  if (url.includes("/invoice/status?")) { statusCalls++; return Response.json(querySnapshot); }
  assert.equal(url, "https://api.monobank.ua/api/merchant/invoice/create"); creates++;
  assert.equal(init?.method, "POST");
  const body = JSON.parse(String(init?.body));
  assert.equal(body.amount, 19900); assert.equal(body.ccy, 980); assert.equal(body.paymentType, "debit"); assert.equal(body.validity, 3600);
  assert.equal(body.webHookUrl, "https://shop.example.invalid/api/payments/mono/webhook");
  assert.match(body.redirectUrl, /^https:\/\/shop\.example\.invalid\/checkout\/success\?/);
  assert.equal(body.merchantPaymInfo.customerEmails[0], "qa@example.invalid");
  assert.equal(body.merchantPaymInfo.basketOrder, undefined); assert.equal(body.saveCardData, undefined);
  if (invoiceFailure) throw new Error("MOCK_UNCERTAIN_NETWORK_FAILURE");
  if (afterCreate) await afterCreate();
  return Response.json({ invoiceId: "invoice_1", pageUrl: invalidPage ? "https://attacker.example.invalid/invoice_1" : "https://pay.mbnk.biz/invoice_1" });
};
const mono = sourceModule<typeof import("../src/lib/payments/mono")>("src/lib/payments/mono.ts", { "node:crypto": crypto, "@/lib/server-env": serverEnv });
const online = sourceModule<typeof import("../src/lib/payments/online-payment")>("src/lib/payments/online-payment.ts", { "@/lib/server-env": serverEnv, "@/lib/payments/mono": mono });
const adapter = sourceModule<typeof import("../src/lib/payments/mono-state")>("src/lib/payments/mono-state.ts", {});
const notifications = {
  emitOrderEvents: async (before: Order | null, after: Order) => { db.events.push(...events.notificationEvents(before, after)); return false; },
  notifyOrderCreated: async (order: Order) => { db.events.push(...events.notificationEvents(null, order)); return false; },
};
const lifecycle = sourceModule<typeof import("../src/lib/payments/transitions")>("src/lib/payments/transitions.ts", {
  "@/lib/prisma": { prisma: db }, "@/lib/payments/money": money, "@/lib/order-status": orderStatus, "@/lib/notifications/orders": notifications,
});
const webhook = sourceModule<typeof import("../src/app/api/payments/mono/webhook/route")>("src/app/api/payments/mono/webhook/route.ts", {
  "next/server": { NextResponse }, "@/lib/payments/mono": mono, "@/lib/payments/mono-state": adapter, "@/lib/payments/transitions": lifecycle,
});
const reconcile = sourceModule<typeof import("../src/lib/payments/reconciliation")>("src/lib/payments/reconciliation.ts", {
  "@/lib/prisma": { prisma: db }, "@/lib/payments/mono": mono, "@/lib/payments/mono-state": adapter, "@/lib/payments/transitions": lifecycle,
});
const cron = sourceModule<typeof import("../src/app/api/cron/payments/route")>("src/app/api/cron/payments/route.ts", {
  "next/server": { NextResponse }, "node:crypto": crypto, "@/lib/server-env": serverEnv, "@/lib/payments/reconciliation": reconcile,
});
const loadAction = (numberModule = numbers) => sourceModule<typeof import("../src/lib/actions/create-order")>("src/lib/actions/create-order.ts", {
  "@/lib/prisma": { prisma: db }, "@/lib/i18n": { translations }, "@/lib/validations/checkout": validation,
  "@/lib/product-variants": variants, "@/lib/cart-items": cart, "@/lib/payments/online-payment": online,
  "@/lib/payments/order-result": result, "@/lib/payments/mono": mono, "@/lib/payments/transitions": lifecycle,
  "@/lib/payments/money": money, "@/lib/order-number": numberModule, "@/lib/notifications/orders": notifications, "@/lib/order-status": orderStatus,
  "@prisma/client": { Prisma },
}).createOrder;
function reset(changes: Row = {}) {
  db.events = []; db.collisions = 0;
  db.products = [{ id: "p1", stock: 4, price: "199.00", name: "Server product", options: [], isActive: true, isOrderable: true }];
  db.orders = [{ id: "o1", number: "3DK-isolated", status: "PENDING", paymentMethod: "card_online", paymentProvider: "mono", paymentMode: "sandbox",
    paymentStatus: "PENDING", paidAt: null, total: "199.00", paymentInvoiceId: "invoice_1",
    paymentProviderStatus: null, paymentModifiedAt: null, paymentErrorCode: null, paymentExpiresAt: new Date(timestamp + 3600000),
    paymentNextCheckAt: new Date(timestamp), novaPoshtaTtn: null, novaPoshtaDeliveredAt: null, items: [{ productId: "p1", quantity: 1 }], ...changes }];
  invoiceFailure = false; invalidPage = false; afterCreate = undefined;
}
const post = async (body = snapshot(), invalid = false) => {
  const raw = JSON.stringify(body);
  const signature = crypto.sign("SHA256", Buffer.from(raw), signing.privateKey).toString("base64");
  return webhook.POST(new Request("https://shop.example.invalid/api/payments/mono/webhook", {
    method: "POST", body: raw, headers: { "x-sign": invalid ? signature.slice(0, -4) + "AAAA" : signature },
  }));
};
const checkout = { customerName: "Isolated", customerSurname: "QA", customerEmail: "qa@example.invalid", customerPhone: "+380000000000", deliveryType: "np_warehouse", npCityName: "QA city", npWarehouseRef: "manual", npWarehouseAddress: "QA address", paymentMethod: "card_online" };
const items = [{ id: "p1", productId: "p1", name: "Forged", slug: "p1", image: "/images/placeholder.svg", price: 0.01, quantity: 1 }];
async function verify() {
  assert.equal(money.moneyMinorUnits("0.29"), 29); assert.equal(money.moneyMinorUnits("99999999.99"), 9999999999);
  for (const value of ["1.001", -1, NaN, Infinity, "1e2", {}, null]) assert.equal(money.moneyMinorUnits(value), null);
  assert.equal(money.moneyDecimal(29), "0.29");
  assert.ok(online.getOnlinePaymentConfig()); process.env.ONLINE_PAYMENT_MODE = "disabled"; assert.equal(online.getOnlinePaymentConfig(), null);
  process.env.ONLINE_PAYMENT_MODE = "sandbox";
  const originalToken = process.env.MONO_ACQUIRING_TOKEN; delete process.env.MONO_ACQUIRING_TOKEN;
  assert.equal(online.getOnlinePaymentConfig(), null); process.env.MONO_ACQUIRING_TOKEN = originalToken;
  for (const url of ["https://evil.invalid/invoice_1", "http://pay.mbnk.biz/invoice_1", "https://pay.mbnk.biz.evil.invalid/invoice_1", "https://pay.mbnk.biz/invoice_1?redirect=evil", "https://u:p@pay.mbnk.biz/invoice_1"]) assert.equal(mono.validHostedPage(url, "invoice_1"), false);
  assert.equal(mono.validInvoiceId("../evil"), false);
  reset();
  assert.equal((await post(snapshot(), true)).status, 401); assert.equal(db.events.length, 0);
  assert.equal((await post()).status, 200); const firstKeyCalls = keyCalls;
  assert.equal((await post()).status, 200); assert.equal(keyCalls, firstKeyCalls, "Valid webhooks reuse public key");
  for (const patch of [{ invoiceId: "wrong" }, { reference: "3DK-wrong" }, { amount: 19899 }, { ccy: 840 }]) {
    reset(); assert.ok([400, 404].includes((await post(snapshot(patch))).status)); assert.equal(db.events.length, 0);
    assert.equal(db.products[0].stock, 4);
  }
  reset({ paymentProvider: "liqpay" }); assert.equal((await post()).status, 400);
  reset(); process.env.ONLINE_PAYMENT_MODE = "disabled";
  assert.equal((await post(snapshot({ status: "success" }))).status, 200, "Disabling new checkout does not disable existing invoice callbacks");
  process.env.ONLINE_PAYMENT_MODE = "sandbox";
  for (const patch of [{ modifiedDate: undefined }, { modifiedDate: "not-a-date" }, { invoiceId: "../x" }, { amount: "19900" }]) assert.throws(() => mono.parseMonoSnapshot(snapshot(patch)));
  assert.equal((await webhook.POST(new Request("https://shop.example.invalid/webhook", { method: "POST", body: "x".repeat(32769) }))).status, 413);
  reset(); await Promise.all([post(snapshot({ status: "success" })), post(snapshot({ status: "success" }))]);
  assert.equal(db.orders[0].paymentStatus, "PAID"); assert.equal(db.products[0].stock, 4);
  assert.equal(db.events.filter((event) => event === "PAYMENT_PAID").length, 1);
  await post(snapshot({ status: "processing", modifiedDate: new Date(timestamp - 1000).toISOString() })); assert.equal(db.orders[0].paymentStatus, "PAID");
  assert.equal((await post(snapshot({ status: "failure" }))).status, 409, "Equal-time conflicts cannot choose by arrival");
  await post(snapshot({ status: "reversed", finalAmount: 0, modifiedDate: new Date(timestamp + 1000).toISOString() }));
  assert.equal(db.orders[0].paymentStatus, "REFUNDED"); assert.equal(db.products[0].stock, 4);
  for (const patch of [{ status: "failure" }, { status: "failure", errCode: "8002" }, { status: "expired" }]) {
    reset(); const before = structuredClone(db.products);
    await Promise.all([post(snapshot(patch)), post(snapshot(patch))]);
    assert.equal(db.orders[0].paymentStatus, patch.status === "failure" && !patch.errCode ? "FAILED" : "CANCELLED");
    assert.equal(db.orders[0].status, "PENDING"); await post(snapshot(patch)); assert.deepEqual(db.products, before);
    assert.equal(db.events.filter((event) => event.startsWith("PAYMENT_")).length, 1);
  }
  reset({ novaPoshtaTtn: "00000000000000" }); await post(snapshot({ status: "failure" }));
  assert.equal(db.orders[0].paymentErrorCode, "FULFILLMENT_REVIEW_REQUIRED"); assert.equal(db.products[0].stock, 4);
  reset(); await post(snapshot({ status: "future_status" })); assert.equal(db.orders[0].paymentStatus, "UNKNOWN");
  reset(); await post(snapshot({ status: "hold" })); assert.equal(db.orders[0].paymentStatus, "PENDING"); assert.equal(db.orders[0].paymentErrorCode, "UNEXPECTED_HOLD");
  reset(); await post(snapshot({ status: "success", finalAmount: 10000 })); assert.equal(db.orders[0].paymentStatus, "UNKNOWN");
  reset(); await post(snapshot({ status: "failure" })); timestamp += 1000; await post(snapshot({ status: "success" }));
  assert.equal(db.orders[0].paymentStatus, "PAID"); assert.equal(db.orders[0].status, "PENDING"); assert.equal(db.products[0].stock, 4);
  reset({ status: "CANCELLED" }); await post(snapshot({ status: "success" }));
  assert.equal(db.orders[0].status, "CANCELLED"); assert.equal(db.orders[0].paymentErrorCode, "LATE_PAYMENT_REVIEW");
  reset({ paymentInvoiceId: null }); querySnapshot = snapshot({ reference: "3DK-wrong", status: "success" });
  assert.equal((await post(snapshot({ status: "success" }))).status, 400); assert.equal(db.orders[0].paymentInvoiceId, null);
  querySnapshot = snapshot({ status: "success" }); await post(snapshot({ status: "success" }));
  assert.equal(db.orders[0].paymentInvoiceId, "invoice_1"); assert.equal(await lifecycle.attachPaymentInvoice("3DK-isolated", "invoice_1", new Date(timestamp + 3600000)), true);
  assert.equal(await lifecycle.attachPaymentInvoice("3DK-isolated", "another", new Date()), false);
  timestamp += 61000; signing = keys(); reset(); const beforeRotation = keyCalls;
  assert.equal((await post()).status, 200); assert.equal(keyCalls, beforeRotation + 1);
  for (let attempt = 0; attempt < 5; attempt++) assert.equal((await post(snapshot(), true)).status, 401);
  assert.equal(keyCalls, beforeRotation + 1, "Invalid signatures cannot force key fetches");
  reset(); querySnapshot = snapshot({ status: "expired" });
  await Promise.all([reconcile.reconcilePendingPayments(new Date(timestamp)), reconcile.reconcilePendingPayments(new Date(timestamp))]);
  assert.equal(db.orders[0].paymentStatus, "CANCELLED"); assert.equal(db.products[0].stock, 4);
  reset({ paymentInvoiceId: null, paymentExpiresAt: new Date(timestamp - 1) });
  await reconcile.reconcilePendingPayments(new Date(timestamp)); assert.equal(db.orders[0].paymentErrorCode, "INITIALIZATION_EXPIRED"); assert.equal(db.products[0].stock, 4);
  reset(); querySnapshot = snapshot({ status: "processing" }); await reconcile.reconcilePendingPayments(new Date(timestamp + 7200000));
  assert.equal(db.orders[0].paymentStatus, "PENDING", "Wall clock expiry is not financial evidence");
  reset(); querySnapshot = snapshot({ reference: "3DK-wrong" }); await reconcile.reconcilePendingPayments(new Date(timestamp)); assert.equal(db.orders[0].paymentErrorCode, "RECONCILIATION_UNAVAILABLE");
  assert.equal((await cron.GET(new Request("https://shop.example.invalid/cron"))).status, 401);
  assert.equal((await cron.GET(new Request("https://shop.example.invalid/cron", { headers: { authorization: "Bearer isolated-cron-secret" } }))).status, 200);
  // All acceptance reads are inside the transaction, including a real SQL lock
  // statement. The mock checks the query contract; no live PG locking is claimed.
  for (const method of ["cash_on_delivery", "pay_on_pickup"]) {
    for (const legacy of [0, 1, 999999]) {
      reset(); db.orders = []; db.products[0].stock = legacy; const before = structuredClone(db.products); const calls = creates;
      const response = await loadAction()({ ...checkout, paymentMethod: method }, [{ ...items[0], quantity: 10 }], "en");
      assert.equal(response.success, true); assert.equal(creates, calls); assert.deepEqual(db.products, before);
      assert.equal(db.orders[0].paymentProvider, null); assert.equal(db.orders[0].total, "1990.00");
      assert.equal(db.orders[0].status, "PENDING", "New COD/pickup order remains operationally NEW");
    }
  }
  for (const flags of [{ isActive: true, isOrderable: false }, { isActive: false, isOrderable: true }, { isActive: false, isOrderable: false }]) {
    reset(); db.orders = []; Object.assign(db.products[0], flags); const calls = creates;
    assert.equal((await loadAction()(checkout, items, "en")).success, false); assert.equal(db.orders.length, 0); assert.equal(creates, calls);
  }
  for (const quantity of [0, -1, 1.5, NaN, 2147483648]) {
    reset(); db.orders = [];
    assert.equal((await loadAction()(checkout, [{ ...items[0], quantity }], "en")).success, false);
    assert.equal(db.orders.length, 0);
  }
  reset(); db.orders = [];
  db.products[0].options = [{ name: "Size", values: [{ id: "s1", value: "Small", price: "199.00" }] }];
  assert.equal((await loadAction()(checkout, items, "en")).success, false, "Configured size cannot be silently chosen");
  assert.equal((await loadAction()(checkout, [{ ...items[0], variant: { id: "another-product-size", labelUa: "Forged", labelEn: null } }], "en")).success, false);
  const adminAction = sourceModule<typeof import("../src/lib/actions/orders")>("src/lib/actions/orders.ts", {
    "@/lib/status": status, "@/lib/orders/take-into-work": { takeOrderIntoWork: () => { throw new Error("UNEXPECTED_WORK_ACTION"); } },
    "@/lib/prisma": { prisma: db }, "next/cache": { revalidatePath: () => {} }, "@/lib/actions/require-admin": { requireAdmin: async () => {} },
    "@/lib/order-status": orderStatus, "@/lib/payments/transitions": lifecycle, "@/lib/notifications/orders": notifications,
  });
  reset({ novaPoshtaTtn: "00000000000000" }); await adminAction.updateOrderStatus("o1", "CANCELLED");
  assert.equal(db.orders[0].status, "CANCELLED"); assert.equal(db.products[0].stock, 4);
  reset(); db.orders = []; db.collisions = 1;
  let number = 0;
  const numberSequence = { ...numbers, createOrderNumber: () => "3DK-20261113-" + String(++number).padStart(10, "0") };
  const response = await loadAction(numberSequence)(checkout, items, "en");
  assert.ok(response.success && response.payment?.pageUrl === "https://pay.mbnk.biz/invoice_1");
  assert.equal(db.products[0].stock, 4); assert.equal(db.orders.length, 1); assert.equal(db.orders[0].total, "199.00"); assert.equal(db.orders[0].number, "3DK-20261113-0000000002");
  assert.equal(db.orders[0].status, "PENDING", "New online order remains operationally NEW");
  assert.ok(db.events.includes("PAYMENT_PENDING"));
  for (const failure of ["network", "page"] as const) {
    reset(); db.orders = []; invoiceFailure = failure === "network"; invalidPage = failure === "page";
    assert.equal((await loadAction()(checkout, items, "ua")).success, false); assert.equal(db.products[0].stock, 4); assert.equal(db.orders[0].status, "PENDING"); assert.equal(db.orders[0].paymentStatus, "CANCELLED");
    const eventCount: number = db.events.length; await lifecycle.cancelPendingPayment(String(db.orders[0].number), "INVOICE_CREATE_UNCERTAIN"); assert.equal(db.events.length, eventCount);
  }
  reset(); db.orders = []; afterCreate = async () => {
    querySnapshot = snapshot({ reference: db.orders[0].number, status: "success" });
    assert.equal((await post(querySnapshot as ReturnType<typeof snapshot>)).status, 200);
  };
  assert.equal((await loadAction()(checkout, items, "en")).success, true); assert.equal(db.orders[0].paymentStatus, "PAID"); assert.equal(db.products[0].stock, 4);
  reset(); db.orders = []; db.products[0].stock = 0;
  const concurrent = await Promise.all(Array.from({ length: 8 }, () => loadAction()({ ...checkout, paymentMethod: "cash_on_delivery" }, items, "en")));
  assert.equal(concurrent.filter((entry) => entry.success).length, 8); assert.equal(db.products[0].stock, 0);
  // Actual selected Decimal size price, forged cart value ignored.
  reset(); db.orders = []; db.products[0].options = [{ name: "Size", values: [{ id: "s1", value: "Small", price: "0.29" }] }];
  assert.equal((await loadAction()({ ...checkout, paymentMethod: "cash_on_delivery" }, [{ ...items[0], quantity: 3, variant: { id: "s1", labelUa: "Forged", labelEn: null } }], "en")).success, true);
  assert.equal(db.orders[0].total, "0.87"); assert.equal(db.products[0].stock, 4);
  const generated = await Promise.all(Array.from({ length: 2000 }, async () => numbers.createOrderNumber(new Date(timestamp))));
  assert.equal(new Set(generated).size, generated.length); for (const value of generated) assert.match(value, /^3DK-\d{8}-[0-9A-HJKMNP-TV-Z]{10}$/);
  assert.equal(numbers.isOrderNumberCollision({ code: "P2002", meta: { target: ["id"] } }), false);
  assert.equal(numbers.isOrderNumberCollision({ code: "P2002", meta: { target: ["number"] } }), true);
  assert.equal(methods.isCashOnDelivery("Оплата при отриманні"), false); assert.equal(methods.isCashOnDelivery("not cod"), false);
  assert.equal(states.paymentResultState({ paymentProvider: "mono", paymentStatus: "UNKNOWN", status: "AWAITING_PAYMENT", paidAt: null }), "unknown");
  assert.equal(status.normalizePaymentStage({ paymentProvider: "mono", paymentStatus: "PAID", paidAt: null, status: "PAID" }), "UNKNOWN");
  assert.equal(db.productWrites, 0); assert.ok(db.lockReads > 0 && db.productReads > 0);
  assert.ok(networkCalls > 0 && creates > 0 && statusCalls > 0 && keyCalls > 0);
  console.log("PASS Batch 1.7: Mono invoice/kopecks/hosted URL; raw ECDSA invalid/valid/rotation/cache; amount/currency/identity/body bounds; duplicate/stale/conflict; payment/refund/expiry/init recovery/cron auth; early webhook/setup failure; active/orderable independence; legacy quantity independence; zero product writes for all payment/order paths; SQL acceptance-lock contract; number collision/concurrency. All HTTP, DB and notifications mocked.");
}
verify().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => { process.env = savedEnv; globalThis.fetch = savedFetch; Date.now = savedNow; });
