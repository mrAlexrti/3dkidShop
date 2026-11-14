// Actual application sources; fail-closed DB/provider boundaries. No .env loading,
// PrismaClient construction, live payments, carrier calls or notifications.
import assert from "node:assert/strict";
import * as crypto from "node:crypto";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import * as jsxRuntime from "react/jsx-runtime";
import { sourceModule } from "./source-module";
import { PaymentMemory, matches, type Row } from "./payment-memory";
import * as acceptance from "../src/lib/payments/acceptance";
import * as flags from "../src/lib/payments/initialization-state";
import * as money from "../src/lib/payments/money";
import * as numbers from "../src/lib/order-number";
import * as orderStatus from "../src/lib/order-status";
import * as status from "../src/lib/status";
import * as variants from "../src/lib/product-variants";
import * as cart from "../src/lib/cart-items";
import * as validation from "../src/lib/validations/checkout";
import * as events from "../src/lib/notifications/events";
import * as callbacks from "../src/lib/notifications/telegram-actions";
import * as reference from "../src/lib/order-reference";
import * as states from "../src/lib/payments/payment-state";
import { translations } from "../src/lib/i18n";
import type { CartItem } from "../src/types";

const originalFetch = globalThis.fetch; const originalWarn = console.warn;
const logs: string[] = []; console.warn = (...args) => { logs.push(JSON.stringify(args)); };
const db = new PaymentMemory();
const env: Record<string, string> = { MONO_ACQUIRING_TOKEN: "qa-private-token", ONLINE_PAYMENT_MODE: "live", SITE_URL: "https://shop.example.invalid", TELEGRAM_BOT_TOKEN: "qa-bot-token", TELEGRAM_ADMIN_CHAT_ID: "123", RESEND_API_KEY: "qa-email-token", EMAIL_FROM: "qa@example.invalid", CRON_SECRET: "qa-cron-secret" };
const serverEnv = { readServerEnv: (name: string) => env[name] ?? "", getAuthSecret: () => "qa-result-secret" };
const forbidden = () => { throw new Error("UNEXPECTED_EXTERNAL_EFFECT"); };
let creates = 0; let queries = 0; let emailSends = 0; const telegramSends: string[] = [];
let transport: "ok" | "retry" | "unknown" | "permanent" = "ok";
let createMode: "ok" | "network" | "bad-page" | "rejected" = "ok";
let onCreate: ((snapshot: Row) => Promise<void>) | undefined;
let settingsFail = false;
let telegramEnabled = true;
const snapshots = new Map<string, Row>();
const settings = { getNotificationSettings: async () => { if (settingsFail) throw new Error("QA_SETTINGS"); const value = events.defaultNotificationSettings(); value.telegram.ORDER_CREATED = telegramEnabled; return value; } };
globalThis.fetch = async (input, init) => {
  const url = String(input);
  if (url === "https://api.monobank.ua/api/merchant/invoice/create") {
    creates++;
    const body = JSON.parse(String(init?.body));
    assert.equal(body.amount, 19900); assert.equal(body.ccy, 980);
    const snapshot = { invoiceId: `invoice_${creates}`, reference: body.merchantPaymInfo.reference, status: "created", amount: 19900, ccy: 980, modifiedDate: new Date().toISOString() };
    snapshots.set(snapshot.invoiceId, snapshot);
    if (onCreate) await onCreate(snapshot);
    if (createMode === "network") throw new Error("PRIVATE_TRANSPORT");
    if (createMode === "rejected") return new Response("PRIVATE_BODY", { status: 400 });
    return Response.json({ invoiceId: snapshot.invoiceId, pageUrl: `https://${createMode === "bad-page" ? "evil.invalid" : "pay.mbnk.biz"}/${snapshot.invoiceId}` });
  }
  if (url.startsWith("https://api.monobank.ua/api/merchant/invoice/status?")) {
    queries++; return Response.json(snapshots.get(new URL(url).searchParams.get("invoiceId")!));
  }
  if (url === "https://api.telegram.org/botqa-bot-token/sendMessage") {
    const body = JSON.parse(String(init?.body)); telegramSends.push(body.text);
    if (transport === "retry") return Response.json({ ok: false, error_code: 429 }, { status: 429 });
    if (transport === "permanent") return Response.json({ ok: false, error_code: 403 }, { status: 403 });
    if (transport === "unknown") throw new Error("LOST_TELEGRAM_RESPONSE");
    return Response.json({ ok: true, result: { message_id: telegramSends.length } });
  }
  return forbidden();
};
const mono = sourceModule<typeof import("../src/lib/payments/mono")>("src/lib/payments/mono.ts", { "node:crypto": crypto, "@/lib/server-env": serverEnv, "@/lib/order-reference": reference });
const result = sourceModule<typeof import("../src/lib/payments/order-result")>("src/lib/payments/order-result.ts", { "node:crypto": crypto, "@/lib/server-env": serverEnv });
const identity = sourceModule<typeof import("../src/lib/payments/checkout-identity")>("src/lib/payments/checkout-identity.ts", { "node:crypto": crypto, "@/lib/server-env": serverEnv, "@/lib/cart-items": cart });
const telegram = sourceModule<typeof import("../src/lib/notifications/telegram")>("src/lib/notifications/telegram.ts", { "@/lib/server-env": serverEnv });
const emailMessages: { subject: string; html: string }[] = [];
const email = { sendEmail: async (message: { subject: string; html: string }) => { emailSends++; emailMessages.push(message); return { sent: true as const, providerMessageId: "qa-email" }; } };
const templates = sourceModule<typeof import("../src/lib/notifications/templates")>("src/lib/notifications/templates.ts", { "@/lib/product-variants": variants, "@/lib/payments/order-result": result, "@/lib/i18n": { translations }, "@/lib/status": status, "@/lib/server-env": serverEnv, "./telegram-actions": callbacks, "@/lib/order-reference": reference });
const outbox = sourceModule<typeof import("../src/lib/notifications/outbox")>("src/lib/notifications/outbox.ts", { "node:crypto": crypto, "@/lib/prisma": { prisma: db }, "./templates": templates, "./settings": settings, "./telegram": telegram, "./email": email });
const notifications = sourceModule<typeof import("../src/lib/notifications/orders")>("src/lib/notifications/orders.ts", { "./email": email, "./telegram": telegram, "./settings": settings, "./events": events, "./templates": templates, "@/lib/payments/initialization-state": flags });
const lifecycle = sourceModule<typeof import("../src/lib/payments/transitions")>("src/lib/payments/transitions.ts", { "@prisma/client": { Prisma }, "@/lib/prisma": { prisma: db }, "@/lib/payments/money": money, "@/lib/order-status": orderStatus, "@/lib/notifications/orders": notifications, "@/lib/payments/initialization-state": flags, "./acceptance": acceptance, "@/lib/order-number": numbers, "@/lib/notifications/outbox": outbox });
const initialization = sourceModule<typeof import("../src/lib/payments/initialization")>("src/lib/payments/initialization.ts", { "@/lib/prisma": { prisma: db }, "@/lib/payments/transitions": lifecycle, "@/lib/payments/initialization-state": flags, "@/lib/payments/mono": mono, "@/lib/payments/money": money, "./acceptance": acceptance });
const adapter = sourceModule<typeof import("../src/lib/payments/mono-state")>("src/lib/payments/mono-state.ts", {});
const online = sourceModule<typeof import("../src/lib/payments/online-payment")>("src/lib/payments/online-payment.ts", { "@/lib/server-env": serverEnv, "@/lib/payments/mono": mono });
const action = sourceModule<typeof import("../src/lib/actions/create-order")>("src/lib/actions/create-order.ts", { "node:crypto": crypto, "@/lib/product-variants": variants, "@/lib/cart-items": cart, "@/lib/payments/online-payment": online, "@/lib/payments/order-result": result, "@/lib/payments/checkout-identity": identity, "@/lib/i18n": { translations }, "@/lib/prisma": { prisma: db }, "@/lib/validations/checkout": validation, "@/lib/notifications/orders": notifications, "@/lib/order-status": orderStatus, "@/lib/payments/mono": mono, "@/lib/payments/transitions": lifecycle, "@/lib/payments/initialization": initialization, "@/lib/payments/initialization-state": flags, "@/lib/payments/money": money, "@/lib/order-number": numbers, "@prisma/client": { Prisma } });
const reconciliation = sourceModule<typeof import("../src/lib/payments/reconciliation")>("src/lib/payments/reconciliation.ts", { "@/lib/prisma": { prisma: db }, "@/lib/payments/mono": mono, "@/lib/payments/mono-state": adapter, "@/lib/payments/transitions": lifecycle, "@/lib/payments/initialization-state": flags, "@/lib/payments/initialization": initialization, "./acceptance": acceptance });
const webhook = sourceModule<typeof import("../src/app/api/payments/mono/webhook/route")>("src/app/api/payments/mono/webhook/route.ts", { "next/server": { NextResponse }, "@/lib/payments/mono": { ...mono, verifyMonoSignature: async (_raw: Buffer, signature: string) => signature === "qa-verified" }, "@/lib/payments/mono-state": adapter, "@/lib/payments/transitions": lifecycle });
const statusRoute = sourceModule<typeof import("../src/app/api/payments/status/route")>("src/app/api/payments/status/route.ts", { "next/server": { NextResponse }, "@/lib/prisma": { prisma: db }, "@/lib/payments/order-result": result, "@/lib/payments/payment-state": states });
const work = sourceModule<typeof import("../src/lib/orders/take-into-work")>("src/lib/orders/take-into-work.ts", { "@/lib/prisma": { prisma: db }, "@/lib/payments/acceptance": acceptance, "@/lib/status": status, "@/lib/notifications/orders": notifications });
const ttn = sourceModule<typeof import("../src/app/api/admin/orders/[id]/create-ttn/route")>("src/app/api/admin/orders/[id]/create-ttn/route.ts", { "next/server": { NextResponse }, "@/lib/prisma": { prisma: db }, "@/lib/payments/acceptance": acceptance, "@/lib/auth": { auth: async () => ({ user: { role: "ADMIN" } }) }, "@/lib/novaposhta": { createNovaPoshtaWaybill: forbidden }, "@/lib/notifications/orders": notifications });
const admin = sourceModule<typeof import("../src/lib/actions/orders")>("src/lib/actions/orders.ts", { "@/lib/prisma": { prisma: db }, "@/lib/payments/acceptance": acceptance, "next/cache": { revalidatePath: () => {} }, "@/lib/actions/require-admin": { requireAdmin: async () => {} }, "@/lib/notifications/orders": notifications, "@/lib/order-status": orderStatus, "@/lib/payments/transitions": lifecycle, "@/lib/orders/take-into-work": work, "@/lib/status": status });
const cron = sourceModule<typeof import("../src/app/api/cron/payments/route")>("src/app/api/cron/payments/route.ts", { "node:crypto": crypto, "next/server": { NextResponse }, "@/lib/server-env": serverEnv, "@/lib/payments/reconciliation": reconciliation, "@/lib/notifications/outbox": outbox });
const data = { customerName: "Isolated", customerSurname: "QA", customerEmail: "qa@example.invalid", customerPhone: "+380000000000", deliveryType: "np_warehouse", npCityName: "QA city", npWarehouseRef: "qa", npWarehouseAddress: "QA address", paymentMethod: "card_online" };
const items: CartItem[] = [{ id: "p1", productId: "p1", name: "Forged", slug: "p1", image: "/images/placeholder.svg", price: .01, quantity: 1 }];
const current = () => db.orders.at(-1)!;
const submit = (key = crypto.randomUUID(), method = "card_online") => action.createOrder({ ...data, paymentMethod: method }, items, "en", key);
function reset() {
  db.orders = []; db.notifications = []; db.events = []; db.collisions = 0;
  db.products = [{ id: "p1", name: "Server product", price: "199.00", options: [], isActive: true, isOrderable: true, stock: 0 }];
  creates = queries = emailSends = 0; telegramSends.length = 0; emailMessages.length = 0; snapshots.clear(); onCreate = undefined;
  transport = "ok"; createMode = "ok"; settingsFail = false; telegramEnabled = true; env.ONLINE_PAYMENT_MODE = "live";
}
function paid(patch: Row = {}) {
  return { ...snapshots.get(String(current().paymentInvoiceId))!, status: "success", modifiedDate: new Date(Date.now() + 1000).toISOString(), ...patch };
}
const post = (snapshot: Row, signature = "qa-verified") => webhook.POST(new Request("https://shop.example.invalid/webhook", { method: "POST", headers: { "x-sign": signature }, body: JSON.stringify(snapshot) }));
const runOutbox = () => outbox.recoverNotificationOutbox(new Date(Date.now() + 10000));
async function verify() {
  // Execute real Admin data paths, including dashboard revenue. A predicate-only
  // test would miss a query that accidentally omits the acceptance restriction.
  let adminQueries = 0;
  const assertAcceptedQuery = (args: { where: unknown }) => { assert.deepEqual(args.where, acceptance.operationalOrderWhere); adminQueries++; };
  const adminBindings = {
    "react/jsx-runtime": jsxRuntime, "@/lib/payments/acceptance": acceptance,
    "@/components/admin/order-status-summary": { OrderStatusSummary: () => null }, "@/lib/order-reference": reference,
    "@/lib/utils": { formatPrice: () => "0" }, "@/lib/i18n-server": { getT: async () => translations.en, getLocale: async () => "en" },
    "lucide-react": { Package: () => null, FolderTree: () => null, ShoppingCart: () => null, TrendingUp: () => null }, "next/link": { default: () => null, __esModule: true },
    "@/lib/prisma": { prisma: { product: { count: async () => 0 }, category: { count: async () => 0 }, order: {
      count: async (args: { where: unknown }) => { assertAcceptedQuery(args); return 0; },
      findMany: async (args: { where: unknown }) => { assertAcceptedQuery(args); return []; },
      aggregate: async (args: { where: unknown }) => { assertAcceptedQuery(args); return { _sum: { total: 0 } }; },
    } } },
  };
  await sourceModule<typeof import("../src/app/admin/page")>("src/app/admin/page.tsx", adminBindings).default();
  await sourceModule<typeof import("../src/app/admin/orders/page")>("src/app/admin/orders/page.tsx", adminBindings).default();
  assert.equal(adminQueries, 4);
  reset();
  const key = crypto.randomUUID(); const first = await submit(key);
  assert.ok(first.success && first.payment); assert.equal(first.orderNumber, null);
  assert.equal(current().total, "199.00"); assert.equal(current().number, null); assert.equal(db.numberLocks, 0);
  assert.equal(current().checkoutAcceptance, "PROVISIONAL"); assert.equal(acceptance.isOperationalOrder(current()), false);
  assert.equal(matches(current(), acceptance.operationalOrderWhere as Row), false);
  assert.equal(telegramSends.length + emailSends + db.notifications.length, 0);
  const readsBeforeForgery = structuredClone(db.orders);
  const forged = await statusRoute.GET(new Request(`https://shop.example.invalid/api/payments/status?${first.resultUrl.split("?")[1]}&payment=success&paid=true`));
  assert.equal((await forged.json()).state, "pending"); assert.deepEqual(db.orders, readsBeforeForgery);
  assert.equal(await work.takeOrderIntoWork(String(current().id)), "not_found");
  await assert.rejects(admin.updateOrderStatus(String(current().id), "PROCESSING"));
  await assert.rejects(admin.updateOrderStatus(String(current().id), "COMPLETED"));
  assert.equal((await ttn.POST(new Request("https://shop.example.invalid/ttn"), { params: Promise.resolve({ id: String(current().id) }) })).status, 409);
  assert.equal((await submit(key)).success, true); assert.equal(creates, 1); assert.equal(db.orders.length, 1);
  assert.equal((await action.createOrder({ ...data, comment: "different purchase" }, items, "en", key)).success, false);
  assert.equal((await post(paid(), "invalid")).status, 401);
  assert.equal((await post(paid({ amount: 1 }))).status, 400); assert.equal(current().paidAt, null);
  assert.equal((await post(paid())).status, 200);
  assert.equal(current().checkoutAcceptance, "ACCEPTED"); assert.equal(current().number, "0001"); assert.ok(current().paidAt); assert.ok(current().acceptedAt); assert.equal(current().status, "PENDING");
  assert.equal(db.notifications.length, 2); assert.equal(telegramSends.length, 0);
  assert.equal(matches(current(), acceptance.operationalOrderWhere as Row), true);
  await Promise.all([post(paid()), post(paid()), runOutbox(), runOutbox()]);
  await runOutbox();
  assert.equal(telegramSends.length, 1, "Exactly one initial Telegram message TOTAL, not merely one creation event");
  assert.ok(telegramSends[0].startsWith("Нове замовлення")); assert.ok(telegramSends[0].includes("Оплата: Оплачено"));
  assert.ok(!telegramSends.some((text) => text.startsWith("Оплату підтверджено"))); assert.equal(emailSends, 1);
  assert.ok(emailMessages[0].subject.startsWith(translations.en.notifications.events.ORDER_CREATED)); assert.ok(emailMessages[0].html.includes('lang="en"'));
  assert.equal(db.notifications.filter((row) => row.state === "SENT").length, 2);
  const afterRetry = await submit(key); assert.ok(afterRetry.success && !afterRetry.payment); assert.equal(creates, 1);
  const paidState = await statusRoute.GET(new Request(`https://shop.example.invalid/status?${first.resultUrl.split("?")[1]}`));
  assert.deepEqual(await paidState.json(), { state: "paid", number: "0001" });

  // Separate authorized payment events retain the historical dispatcher/settings.
  const financial = adapter.monoEvidence(mono.parseMonoSnapshot(paid({ status: "reversed", finalAmount: 0, modifiedDate: new Date(Date.now() + 2000).toISOString() })));
  await lifecycle.applyPaymentEvidence(financial); assert.equal(current().paymentStatus, "REFUNDED"); assert.equal(current().number, "0001"); assert.ok(current().paidAt);

  for (const [providerStatus, errCode, expected] of [["failure", undefined, "failed"], ["failure", "8002", "cancelled"], ["expired", undefined, "expired"]] as const) {
    reset(); await submit(); const snapshot = paid({ status: providerStatus, ...(errCode ? { errCode } : {}) });
    await post(snapshot); assert.equal(states.paymentResultState(current() as unknown as states.PaymentOrderState), expected);
    assert.equal(current().number, null); assert.equal(db.notifications.length, 0); assert.equal(telegramSends.length + emailSends, 0);
    await post(paid({ modifiedDate: new Date(Date.now() + 3000).toISOString() }));
    assert.equal(current().checkoutAcceptance, "ACCEPTED"); assert.equal(db.notifications.length, 2);
  }
  reset(); await submit(); current().paymentExpiresAt = new Date(0); current().paymentNextCheckAt = new Date(0);
  await reconciliation.reconcilePendingPayments(); assert.equal(current().paymentStatus, "PENDING"); assert.equal(current().number, null); assert.equal(db.notifications.length, 0);
  // Provider-expired financial audit is retained after the follow-up horizon.
  const expiry = paid({ status: "expired" }); await post(expiry); await post(expiry);
  assert.equal(current().checkoutAcceptance, "REVIEW"); assert.equal(current().paymentNextCheckAt, null); assert.equal(db.orders.length, 1);
  await post(paid({ modifiedDate: new Date(Date.now() + 4000).toISOString() })); assert.equal(current().checkoutAcceptance, "ACCEPTED");

  reset(); await submit(); current().paymentNextCheckAt = new Date(0);
  const successful = paid(); snapshots.set(String(current().paymentInvoiceId), successful);
  await Promise.all([post(successful), reconciliation.reconcilePendingPayments()]);
  assert.equal(current().number, "0001"); assert.equal(db.notifications.length, 2); await runOutbox(); assert.equal(telegramSends.length, 1);
  reset(); await submit(); current().paymentNextCheckAt = new Date(0); snapshots.set(String(current().paymentInvoiceId), paid());
  await reconciliation.reconcilePendingPayments(); assert.equal(current().checkoutAcceptance, "ACCEPTED");
  assert.ok(queries > 0);

  // Early PAID is accepted atomically before invoice-create returns.
  reset(); onCreate = async (snapshot) => { const success = { ...snapshot, status: "success" }; snapshots.set(String(snapshot.invoiceId), success); assert.equal((await post(success)).status, 200); };
  const early = await submit(); assert.ok(early.success && !early.payment); assert.equal(current().checkoutAcceptance, "ACCEPTED"); await runOutbox(); assert.equal(telegramSends.length, 1);
  reset(); createMode = "network"; onCreate = async (snapshot) => { snapshots.set(String(snapshot.invoiceId), { ...snapshot, status: "success" }); await post({ ...snapshot, status: "success" }); };
  const paidDespiteLostCreate = await submit(); assert.ok(paidDespiteLostCreate.success && !paidDespiteLostCreate.payment); assert.equal(current().checkoutAcceptance, "ACCEPTED");
  reset(); createMode = "network"; const ambiguousKey = crypto.randomUUID(); assert.equal((await submit(ambiguousKey)).success, false);
  assert.equal(current().paymentStatus, "UNKNOWN"); assert.equal(current().checkoutAcceptance, "REVIEW"); assert.equal(current().number, null);
  await submit(ambiguousKey); assert.equal(creates, 1);
  const delayed = { ...snapshots.get("invoice_1")!, status: "success" }; snapshots.set("invoice_1", delayed);
  await post(delayed); assert.equal(current().checkoutAcceptance, "ACCEPTED");
  for (const mode of ["bad-page", "rejected"] as const) {
    reset(); createMode = mode; const retryKey = crypto.randomUUID(); assert.equal((await submit(retryKey)).success, false); await submit(retryKey);
    assert.equal(db.orders.length, 1); assert.equal(creates, 1); assert.equal(current().number, null); assert.equal(db.notifications.length, 0);
  }
  reset(); const resubmitKey = crypto.randomUUID(); await Promise.all([submit(resubmitKey), submit(resubmitKey)]);
  assert.equal(db.orders.length, 1); assert.equal(creates, 1);

  for (const failure of ["retry", "unknown", "permanent"] as const) {
    reset(); await submit(); await post(paid()); transport = failure; await runOutbox();
    const row = db.notifications.find((entry) => entry.channel === "telegram")!;
    assert.equal(row.state, failure === "retry" ? "RETRY" : "UNKNOWN");
    transport = "ok"; await outbox.recoverNotificationOutbox(new Date(Date.now() + 120000));
    assert.equal(telegramSends.length, failure === "retry" ? 2 : 1);
    if (failure !== "retry") assert.equal(row.state, "UNKNOWN");
  }
  reset(); await submit(); await post(paid()); settingsFail = true; await runOutbox(); assert.equal(telegramSends.length, 0);
  settingsFail = false; await outbox.recoverNotificationOutbox(new Date(Date.now() + 120000)); assert.equal(telegramSends.length, 1);
  reset(); await submit(); await post(paid()); Object.assign(db.notifications[0], { state: "SENDING", leaseUntil: new Date(0), dispatchId: "lost-worker" });
  await runOutbox(); assert.equal(db.notifications[0].state, "UNKNOWN"); assert.equal(telegramSends.length, 0);
  reset(); await submit(); await post(paid()); telegramEnabled = false; await runOutbox();
  assert.equal(telegramSends.length, 0); assert.equal(emailSends, 1); assert.equal(db.notifications[0].state, "SUPPRESSED");
  reset(); env.ONLINE_PAYMENT_MODE = "sandbox"; await submit(); await post(paid()); await runOutbox();
  assert.equal(telegramSends.length + emailSends, 0); assert.ok(db.notifications.every((row) => row.state === "SUPPRESSED"));

  // A failed outbox insert rolls the entire financial acceptance back.
  reset(); await submit(); const originalCreate = db.orderNotification.create;
  db.orderNotification.create = async () => { throw new Error("QA_OUTBOX_STORAGE_DOWN"); };
  assert.equal((await post(paid())).status, 503); assert.equal(current().number, null); assert.equal(current().paidAt, null); assert.equal(db.notifications.length, 0);
  db.orderNotification.create = originalCreate; assert.equal((await post(paid())).status, 200);

  // Receipt persistence failure after delivery must never cause a resend.
  reset(); await submit(); await post(paid()); const originalUpdate = db.orderNotification.updateMany;
  db.orderNotification.updateMany = async (args) => { if (args.data.state === "SENT") throw new Error("QA_LOST_RECEIPT_WRITE"); return originalUpdate(args); };
  await assert.rejects(runOutbox()); assert.equal(telegramSends.length, 1);
  db.orderNotification.updateMany = originalUpdate;
  await outbox.recoverNotificationOutbox(new Date(Date.now() + 120000)); assert.equal(telegramSends.length, 1); assert.equal(db.notifications[0].state, "UNKNOWN");

  reset(); await submit(); const equalTime = paid({ status: "processing" }); await post(equalTime);
  const tiedSuccess = { ...equalTime, status: "success" }; snapshots.set(String(current().paymentInvoiceId), tiedSuccess);
  assert.equal((await post(tiedSuccess)).status, 409); assert.ok(current().paidAt); assert.equal(current().checkoutAcceptance, "REVIEW");
  current().paymentNextCheckAt = new Date(0); await reconciliation.reconcilePendingPayments(); assert.equal(current().checkoutAcceptance, "ACCEPTED");
  reset(); await submit(); await post(paid({ status: "reversed", finalAmount: 0, modifiedDate: new Date(Date.now() + 5000).toISOString() }));
  assert.equal(current().checkoutAcceptance, "REVIEW"); assert.equal(current().paymentStatus, "REFUNDED");
  await post(paid({ modifiedDate: new Date(Date.now() + 1000).toISOString() })); assert.ok(current().paidAt); assert.equal(current().paymentStatus, "REFUNDED"); assert.equal(current().number, null);
  reset(); await submit(); current().status = "CANCELLED"; await post(paid());
  assert.ok(current().paidAt); assert.equal(current().status, "CANCELLED"); assert.equal(current().checkoutAcceptance, "REVIEW"); assert.equal(db.notifications.length, 0);

  reset(); await submit(); const pending = current();
  await Promise.all([post(paid()), submit(crypto.randomUUID(), "cash_on_delivery")]);
  assert.equal(new Set(db.orders.map((row) => row.number)).size, 2); assert.ok(db.orders.every((row) => row.number)); assert.equal(pending.status, "PENDING");
  reset(); db.orders = [{ id: "historical", number: "3DK-OLD", checkoutAcceptance: "LEGACY", paymentReference: null, paymentProvider: null, paymentErrorCode: null }];
  assert.equal(acceptance.isOperationalOrder(db.orders[0]), true);
  const cod = await submit(crypto.randomUUID(), "cash_on_delivery"); assert.ok(cod.success && !cod.payment); assert.equal(current().number, "0001"); assert.equal(creates, 0); assert.equal(telegramSends.length, 1);
  db.orders.push({ id: "max", number: "9999" }); await submit(crypto.randomUUID(), "cash_on_delivery"); assert.equal(current().number, "10000");
  assert.equal(acceptance.isOperationalOrder({ number: "0009", checkoutAcceptance: "LEGACY", paymentProvider: "mono", paymentErrorCode: flags.INVOICE_INITIALIZING }), false);
  for (const historic of ["0001", "3DK-OLD"]) { const token = result.createOrderResultToken(historic); assert.ok(result.validOrderResultToken(historic, token)); }
  const ref = "pay_" + "a".repeat(32); const token = result.createAttemptResultToken(ref);
  assert.ok(result.validAttemptResultToken(ref, token)); assert.ok(!result.validOrderResultToken(ref, token));
  assert.ok(!result.validAttemptResultToken("pay_" + "b".repeat(32), token));
  assert.equal((await statusRoute.GET(new Request(`https://shop.example.invalid/status?attempt=pay_${"b".repeat(32)}&token=${token}`))).status, 404);
  assert.equal((await cron.GET(new Request("https://shop.example.invalid/cron"))).status, 401);
  assert.equal((await cron.GET(new Request("https://shop.example.invalid/cron", { headers: { authorization: "Bearer qa-cron-secret" } }))).status, 200);
  assert.equal(db.productWrites, 0);
  for (const secret of [env.MONO_ACQUIRING_TOKEN, env.TELEGRAM_BOT_TOKEN, data.customerEmail, "PRIVATE_TRANSPORT", "PRIVATE_BODY", "pay.monobank.ua/"]) assert.ok(!logs.join("\n").includes(secret));
  console.log("PASS 1.7.4A: all 15 acceptance categories; exactly one initial Telegram message TOTAL; outbox retry/UNKNOWN/crash/rollback; early/lost/delayed/concurrent events; resubmission; numbering/COD/history; operational and capability guards. All external effects mocked; real PostgreSQL concurrency remains a release prerequisite.");
}
verify().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => { globalThis.fetch = originalFetch; console.warn = originalWarn; });
