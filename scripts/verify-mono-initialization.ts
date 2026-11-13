// Actual checkout/Mono/acceptance sources, isolated DB + Bot/email boundaries.
// No .env loading, PrismaClient, merchant token retrieval or real HTTP.
import assert from "node:assert/strict";
import * as crypto from "node:crypto";
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import { Prisma, type Order } from "@prisma/client";
import { sourceModule } from "./source-module";
import { PaymentMemory, type Row } from "./payment-memory";
import * as money from "../src/lib/payments/money";
import * as numbering from "../src/lib/order-number";
import * as reference from "../src/lib/order-reference";
import * as flags from "../src/lib/payments/initialization-state";
import * as stages from "../src/lib/order-status";
import * as status from "../src/lib/status";
import * as events from "../src/lib/notifications/events";
import * as variants from "../src/lib/product-variants";
import * as cart from "../src/lib/cart-items";
import * as validation from "../src/lib/validations/checkout";
import * as callbacks from "../src/lib/notifications/telegram-actions";
import { translations } from "../src/lib/i18n";

const savedFetch = globalThis.fetch; const savedWarn = console.warn;
const logs: string[] = []; const allLogs: string[] = [];
console.warn = (...values) => { const entry = JSON.stringify(values); logs.push(entry); allLogs.push(entry); };
const forbidden = () => { throw new Error("UNEXPECTED_EXTERNAL_EFFECT"); };
const env: Record<string, string> = { MONO_ACQUIRING_TOKEN: "qa_mono_token_never_deployed", ONLINE_PAYMENT_MODE: "live", SITE_URL: "https://shop.example.invalid" };
const serverEnv = { readServerEnv: (name: string) => env[name] || "" };
const db = new PaymentMemory(); let sends = 0; let emails = 0; let creates = 0; let removes = 0; let queries = 0;
const notificationSnapshots: Row[] = [];
let createdMessages = 0; let paidMessages = 0;
let mode: number | "success" | "network" | "timeout" | "bad-json" | "bad-shape" | "bad-page" = "success";
let queryPatch: Row = {}; let removeFails = false; let onCreate: (() => Promise<void>) | undefined;
let trace: string[] = []; let requestBodies: Row[] = [];
const current = () => db.orders.at(-1)!;
const recordNotification = () => notificationSnapshots.push({ provider: current().paymentProvider, invoiceId: current().paymentInvoiceId, marker: current().paymentErrorCode });
const snapshot = () => ({ invoiceId: "qa-invoice", reference: current().number, amount: 19900, ccy: 980, status: "created", modifiedDate: "2026-01-01T00:00:00Z", ...queryPatch });
globalThis.fetch = async (input, init) => {
  assert.equal((init?.headers as Record<string, string>)["X-Token"], env.MONO_ACQUIRING_TOKEN);
  assert.equal(init?.redirect, "error"); assert.ok(init?.signal);
  const url = String(input);
  if (url.includes("/invoice/status?")) { queries++; return Response.json(snapshot()); }
  if (url.endsWith("/invoice/remove")) {
    removes++; assert.deepEqual(JSON.parse(String(init?.body)), { invoiceId: "qa-invoice" });
    return removeFails ? new Response("PRIVATE_UPSTREAM_RESPONSE", { status: 500 }) : new Response(null, { status: 200 });
  }
  assert.equal(url, "https://api.monobank.ua/api/merchant/invoice/create");
  creates++; trace.push("invoice-request");
  const body = JSON.parse(String(init?.body)); requestBodies.push(body);
  assert.equal(body.ccy, 980); assert.equal(body.amount, 19900); assert.equal(body.paymentType, "debit"); assert.equal(body.validity, 3600);
  assert.equal(body.webHookUrl, "https://shop.example.invalid/api/payments/mono/webhook");
  if (onCreate) await onCreate();
  if (mode === 201) return Response.json({ invoiceId: "qa-invoice", pageUrl: "https://pay.mbnk.biz/qa-invoice" }, { status: 201 });
  if (typeof mode === "number") return new Response("PRIVATE_UPSTREAM_RESPONSE", { status: mode });
  if (mode === "network") throw new Error("PRIVATE_TRANSPORT_ERROR");
  if (mode === "timeout") throw new DOMException("PRIVATE_TIMEOUT", "TimeoutError");
  if (mode === "bad-json") return new Response("PRIVATE_INVALID_JSON", { status: 200 });
  if (mode === "bad-shape") return Response.json({ secretDiagnostic: "PRIVATE_UPSTREAM_RESPONSE" });
  return Response.json({ invoiceId: "qa-invoice", pageUrl: mode === "bad-page" ? "https://evil.invalid/qa-invoice" : "https://pay.mbnk.biz/qa-invoice" });
};
const mono = sourceModule<typeof import("../src/lib/payments/mono")>("src/lib/payments/mono.ts", { "node:crypto": crypto, "@/lib/server-env": serverEnv, "@/lib/order-reference": reference });
const result = sourceModule<typeof import("../src/lib/payments/order-result")>("src/lib/payments/order-result.ts", { "node:crypto": crypto, "@/lib/server-env": { getAuthSecret: () => "qa_result_capability_secret" } });
const online = sourceModule<typeof import("../src/lib/payments/online-payment")>("src/lib/payments/online-payment.ts", { "@/lib/server-env": serverEnv, "@/lib/payments/mono": mono });
const templates = sourceModule<typeof import("../src/lib/notifications/templates")>("src/lib/notifications/templates.ts", {
  "@/lib/product-variants": variants, "@/lib/payments/order-result": result, "@/lib/i18n": { translations }, "@/lib/status": status,
  "@/lib/server-env": serverEnv, "./telegram-actions": callbacks, "@/lib/order-reference": reference,
});
const notifications = sourceModule<typeof import("../src/lib/notifications/orders")>("src/lib/notifications/orders.ts", {
  "@/lib/payments/initialization-state": flags, "./events": events, "./templates": templates,
  "./settings": { getNotificationSettings: async () => events.defaultNotificationSettings() },
  "./telegram": { sendTelegramMessage: async (text: string) => {
    recordNotification();
    sends++; trace.push("telegram");
    if (text.startsWith(translations.ua.notifications.events.ORDER_CREATED)) createdMessages++;
    else if (text.startsWith(translations.ua.notifications.events.PAYMENT_PAID)) paidMessages++;
    else forbidden();
    return { sent: true };
  } },
  "./email": { sendEmail: async () => { recordNotification(); emails++; trace.push("email"); return { sent: true }; } },
});
const lifecycle = sourceModule<typeof import("../src/lib/payments/transitions")>("src/lib/payments/transitions.ts", {
  "@/lib/prisma": { prisma: db }, "@/lib/payments/money": money, "@/lib/order-status": stages, "@/lib/notifications/orders": notifications, "@/lib/payments/initialization-state": flags,
});
const initialization = sourceModule<typeof import("../src/lib/payments/initialization")>("src/lib/payments/initialization.ts", {
  "@/lib/prisma": { prisma: db }, "@/lib/payments/transitions": lifecycle, "@/lib/payments/initialization-state": flags, "@/lib/payments/mono": mono, "@/lib/payments/money": money,
});
const reconciliation = sourceModule<typeof import("../src/lib/payments/reconciliation")>("src/lib/payments/reconciliation.ts", {
  "@/lib/prisma": { prisma: db }, "@/lib/payments/mono": mono, "@/lib/payments/mono-state": { monoEvidence: forbidden },
  "@/lib/payments/transitions": lifecycle, "@/lib/payments/initialization-state": flags, "@/lib/payments/initialization": initialization,
});
const action = sourceModule<typeof import("../src/lib/actions/create-order")>("src/lib/actions/create-order.ts", {
  "@/lib/prisma": { prisma: db }, "@/lib/i18n": { translations }, "@/lib/validations/checkout": validation,
  "@/lib/product-variants": variants, "@/lib/cart-items": cart, "@/lib/payments/online-payment": online,
  "@/lib/payments/order-result": result, "@/lib/payments/mono": mono, "@/lib/payments/transitions": lifecycle,
  "@/lib/payments/initialization": initialization, "@/lib/payments/initialization-state": flags,
  "@/lib/payments/money": money, "@/lib/order-number": numbering, "@/lib/notifications/orders": notifications, "@/lib/order-status": stages, "@prisma/client": { Prisma },
}).createOrder;
const checkout = { customerName: "Isolated", customerSurname: "QA", customerEmail: "qa@example.invalid", customerPhone: "+380000000000", deliveryType: "np_warehouse", npCityName: "QA city", npWarehouseRef: "manual", npWarehouseAddress: "QA address", paymentMethod: "card_online" };
const items = [{ id: "p1", productId: "p1", name: "Forged", slug: "p1", image: "/images/placeholder.svg", price: 0.01, quantity: 1 }];
function reset() {
  db.orders = []; db.products = [{ id: "p1", stock: 0, price: "199.00", name: "Server product", options: [], isActive: true, isOrderable: true }];
  mode = "success"; queryPatch = {}; removeFails = false; onCreate = undefined; sends = emails = creates = removes = queries = createdMessages = paidMessages = 0; trace = []; requestBodies = []; logs.length = 0;
}
const submit = (paymentMethod = "card_online") => action({ ...checkout, paymentMethod }, items, "ua");
const input = { number: "0001", amount: 19900, email: "qa@example.invalid", resultPath: "/checkout/success?qa" };

async function verify() {
  reset();
  onCreate = async () => { assert.equal(db.orders.length, 1); assert.equal(current().number, "0001"); assert.equal(sends + emails, 0); assert.equal(current().paymentErrorCode, flags.INVOICE_INITIALIZING); };
  const accepted = await submit(); assert.ok(accepted.success && accepted.payment?.pageUrl === "https://pay.mbnk.biz/qa-invoice");
  assert.equal(db.orders.length, 1); assert.equal(current().paymentInvoiceId, "qa-invoice"); assert.equal(current().paymentErrorCode, null); assert.equal(current().status, "PENDING");
  assert.equal(sends, 1); assert.equal(emails, 1); assert.ok(trace.indexOf("invoice-request") < trace.indexOf("telegram"));
  assert.equal((requestBodies[0].merchantPaymInfo as Row).reference, "0001"); assert.equal(current().total, "199.00");
  const claims = await Promise.all([lifecycle.acceptPaymentInvoice("0001", "qa-invoice", new Date()), lifecycle.acceptPaymentInvoice("0001", "qa-invoice", new Date())]);
  assert.ok(claims.every((claim) => claim?.notify === false));

  // Non-2xx responses never have their private body parsed/logged.
  for (const http of [400, 403, 404, 405, 429]) {
    reset(); mode = http;
    for (let retry = 0; retry < 3; retry++) { const response = await submit(); assert.equal(response.success, false); assert.equal(db.orders.length, 0); }
    assert.equal(creates, 3); assert.equal(sends + emails, 0); assert.equal(removes, 0);
    assert.ok(logs.some((line) => line.includes('"httpStatus":' + http) && line.includes('"http_rejection"')));
  }
  reset(); env.ONLINE_PAYMENT_MODE = "disabled"; assert.equal((await submit()).success, false); assert.equal(db.orders.length, 0); assert.equal(creates, 0); env.ONLINE_PAYMENT_MODE = "live";
  for (const patch of [{ amount: 0 }, { resultPath: "https://evil.invalid" }]) await assert.rejects(mono.createMonoInvoice({ ...input, ...patch }), (error: unknown) => error instanceof mono.MonoError && error.definiteRejection && error.category === "local_validation");
  const token = env.MONO_ACQUIRING_TOKEN; env.MONO_ACQUIRING_TOKEN = "";
  await assert.rejects(mono.createMonoInvoice(input), (error: unknown) => error instanceof mono.MonoError && error.definiteRejection && error.category === "configuration"); env.MONO_ACQUIRING_TOKEN = token;

  for (const failure of [500, 502, 408, 201, "network", "timeout", "bad-json", "bad-shape"] as const) {
    reset(); mode = failure; assert.equal((await submit()).success, false); assert.equal(db.orders.length, 1); assert.equal(current().paymentStatus, "UNKNOWN");
    assert.equal(current().paymentErrorCode, flags.INVOICE_UNCERTAIN); assert.equal(creates, 1); assert.equal(sends + emails, 0);
    await initialization.recoverUnacceptedInvoice("0001"); assert.equal(creates, 1); assert.equal(removes, 0); assert.equal(queries, 0);
    current().paymentExpiresAt = new Date(0); current().paymentNextCheckAt = new Date(0);
    await reconciliation.reconcilePendingPayments(); assert.equal(current().paymentStatus, "UNKNOWN"); assert.equal(current().paymentNextCheckAt, null);
    await assert.rejects(mono.createMonoInvoice({ ...input, amount: -1 }));
  }
  // Crashed initialization without an invoice is reviewable, never clock-inferred failure.
  reset(); onCreate = async () => { current().paymentErrorCode = flags.INVOICE_UNCERTAIN; }; mode = "network";
  await submit(); current().paymentErrorCode = flags.INVOICE_INITIALIZING; current().paymentStatus = "PENDING"; current().paymentExpiresAt = new Date(0); current().paymentNextCheckAt = new Date(0);
  await reconciliation.reconcilePendingPayments(); assert.equal(current().paymentStatus, "UNKNOWN"); assert.equal(current().paymentErrorCode, flags.INVOICE_UNCERTAIN);

  // Conditional cleanup refuses every observed financial/operational/carrier change.
  for (const change of [{ paidAt: new Date() }, { paymentInvoiceId: "other-invoice" }, { status: "PROCESSING" }, { novaPoshtaTtn: "00000000000000" }, { paymentModifiedAt: new Date() }, { paymentNextCheckAt: new Date(0) }]) {
    reset(); mode = 400; onCreate = async () => { Object.assign(current(), change); };
    assert.equal((await submit()).success, false); assert.equal(db.orders.length, 1); assert.equal(sends + emails, 0);
  }
  // A late verified webhook may establish PAID before create returns. It cannot
  // emit prematurely, and the create flow still claims exactly one acceptance.
  reset(); onCreate = async () => {
    await lifecycle.applyPaymentEvidence({ provider: "mono", invoiceId: "qa-invoice", reference: "0001", amount: 19900, currency: 980, modifiedAt: new Date(), status: "PAID", providerStatus: "success", errorCode: null }, { authenticatedInvoiceBinding: true });
    assert.equal(sends + emails, 0);
  };
  assert.equal((await submit()).success, true); assert.equal(current().paymentStatus, "PAID"); assert.equal(createdMessages, 1); assert.equal(paidMessages, 1); assert.equal(emails, 1);
  reset(); onCreate = async () => {
    await lifecycle.applyPaymentEvidence({ provider: "mono", invoiceId: "qa-invoice", reference: "0001", amount: 19900, currency: 980, modifiedAt: new Date(), status: "PENDING", providerStatus: "hold", errorCode: "UNEXPECTED_HOLD" }, { authenticatedInvoiceBinding: true });
  }; queryPatch = { status: "hold" };
  assert.equal((await submit()).success, false); assert.equal(sends + emails, 0); assert.equal(removes, 0);

  // Malformed hosted URL and failed attachment retain records and invalidate only
  // an identity/amount/currency-matched, definitely CREATED unpaid invoice.
  reset(); mode = "bad-page"; assert.equal((await submit()).success, false); assert.equal(removes, 1); assert.equal(db.orders.length, 1);
  assert.equal(current().paymentErrorCode, flags.INVOICE_INVALIDATED); assert.equal(sends + emails, 0);
  await initialization.recoverUnacceptedInvoice("0001", "qa-invoice"); assert.equal(removes, 1);
  for (const patch of [{ status: "success" }, { status: "processing" }, { status: "hold" }, { reference: "another" }, { amount: 19800 }, { ccy: 840 }, { invoiceId: "other" }]) {
    reset(); mode = "bad-page"; queryPatch = patch; await submit(); assert.equal(removes, 0); assert.equal(current().paymentErrorCode, flags.INVOICE_UNCERTAIN); assert.equal(sends + emails, 0);
  }
  reset(); onCreate = async () => { current().status = "CANCELLED"; }; await submit(); assert.equal(removes, 1); assert.equal(current().status, "CANCELLED");
  reset(); onCreate = async () => { current().paymentInvoiceId = "other-invoice"; }; await submit(); assert.equal(removes, 1); assert.equal(current().paymentInvoiceId, "other-invoice"); assert.equal(current().paymentStatus, "UNKNOWN");
  reset(); mode = "bad-page"; removeFails = true; await submit(); assert.equal(db.orders.length, 1); assert.equal(current().paymentErrorCode, flags.INVOICE_UNCERTAIN);

  reset(); const offline = await submit("cash_on_delivery"); assert.ok(offline.success && !offline.payment); assert.equal(creates, 0); assert.equal(sends, 1); assert.equal(emails, 1);
  assert.equal(current().number, "0001"); assert.equal(current().status, "PENDING");
  const second = await submit("cash_on_delivery"); assert.ok(second.success); assert.equal(current().number, "0002");
  reset(); db.orders = [{ id: "legacy", number: "3DK-20261113-ABCDEFGHJK" }]; await submit("cash_on_delivery"); assert.equal(current().number, "0001");
  reset(); db.orders = [{ id: "numeric", number: "9999" }, { id: "legacy", number: "3DK-99999999-ZZZZZZZZZZ" }]; await submit("cash_on_delivery"); assert.equal(current().number, "10000");
  reset(); const concurrent = await Promise.all(Array.from({ length: 40 }, () => submit("cash_on_delivery")));
  assert.ok(concurrent.every((response) => response.success)); assert.equal(new Set(db.orders.map((order) => order.number)).size, 40); assert.equal(current().number, "0040");
  assert.equal(sends, 40); assert.equal(db.productWrites, 0); assert.ok(db.numberLocks >= 40);
  for (const number of ["0001", "10000", "3DK-20261113-ABCDEFGHJK"]) {
    const token = result.createOrderResultToken(number); assert.ok(result.validOrderResultToken(number, token)); assert.ok(result.getOrderResultPath(number).includes(encodeURIComponent(number)));
    for (const locale of ["ua", "en"] as const) {
      const order = { ...current(), number } as unknown as Order & { items: [] };
      const notification = templates.renderNotification("ORDER_CREATED", order, locale, "telegram");
      assert.ok(notification.subject.includes(reference.formatOrderReference(number, locale))); assert.ok(notification.telegram.includes(reference.formatOrderReference(number, locale)));
    }
  }
  assert.equal(reference.formatOrderReference("0001"), "Замовлення №0001"); assert.equal(reference.formatOrderReference("0001", "en"), "Order #0001");
  // Real result component preserves both number formats, with no client payment authority.
  for (const locale of ["ua", "en"] as const) {
    const component = sourceModule<typeof import("../src/components/checkout/order-result")>("src/components/checkout/order-result.tsx", {
      react: React, "react/jsx-runtime": jsxRuntime, "lucide-react": { CheckCircle2: () => null, Clock3: () => null, CircleAlert: () => null },
      "@/components/ui/button": { Button: () => null }, "@/lib/order-reference": reference,
      "@/store/lang-store": { useLangStore: () => ({ locale, t: translations[locale] }) }, "next/link": { default: (props: object) => React.createElement("a", props), __esModule: true },
    });
    assert.ok(renderToStaticMarkup(React.createElement(component.OrderResult, { number: "0001", token: "qa", initialState: "pending" })).includes(reference.formatOrderReference("0001", locale)));
  }
  const diagnostics = allLogs.join("\n"); assert.ok(diagnostics.length);
  // Assertions outside the best-effort dispatcher cannot be swallowed by its
  // Promise.allSettled boundary: every observed online send must follow attachment.
  for (const observed of notificationSnapshots.filter((entry) => entry.provider === "mono")) {
    assert.equal(observed.invoiceId, "qa-invoice"); assert.equal(observed.marker, null);
  }
  for (const privateText of [env.MONO_ACQUIRING_TOKEN, "PRIVATE_UPSTREAM_RESPONSE", "PRIVATE_TRANSPORT_ERROR", checkout.customerEmail, "X-Token"]) assert.ok(!diagnostics.includes(privateText));
  console.log("PASS Mono initialization: acceptance after attach; exactly one Telegram/email; deterministic rejection cleanup/retries; unknown transport/5xx/invalid-200 review; no repeat create; conditional-delete races; early webhook; safe unpaid orphan invalidation/identity guards; safe diagnostics; COD; advisory-lock SQL contract/sequential widths/legacy numbers/40 concurrent orders; UA/EN presentation and old/new result capabilities. All DB, Mono, email and Telegram boundaries mocked.");
}
verify().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => { globalThis.fetch = savedFetch; console.warn = savedWarn; });
