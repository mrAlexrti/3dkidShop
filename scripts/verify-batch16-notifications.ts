// All external boundaries fail closed. Never load .env or a real Prisma client.
import assert from "node:assert/strict";
import * as acceptance from "../src/lib/payments/acceptance";
import { NextResponse } from "next/server";
import type { Order, Prisma } from "@prisma/client";
import * as status from "../src/lib/status";
import * as events from "../src/lib/notifications/events";
import * as templates from "../src/lib/notifications/templates";
import * as reference from "../src/lib/order-reference";
import * as initializationState from "../src/lib/payments/initialization-state";
import * as orderStatus from "../src/lib/order-status";
import { translations } from "../src/lib/i18n";
import { sourceModule } from "./source-module";
import * as paymentMethods from "../src/lib/payments/payment-method";
import * as paymentMoney from "../src/lib/payments/money";
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";

const originalFetch = globalThis.fetch;
const originalSecret = process.env.AUTH_SECRET;
globalThis.fetch = async () => { throw new Error("EXTERNAL_CALL_BLOCKED"); };
process.env.AUTH_SECRET = "isolated-batch16-result-secret";
const fixture = (): templates.OrderForNotification => ({
  id: "isolated", number: "3DK-isolated", status: "PROCESSING", paymentStatus: null,
  paymentProvider: null, paymentMode: null, paidAt: null, novaPoshtaTtn: null,
  novaPoshtaStatus: null, novaPoshtaStatusCode: null, novaPoshtaDeliveredAt: null,
  customerName: "<QA & Customer>", customerPhone: "+380000000000", customerEmail: "qa@example.invalid",
  shippingAddress: "QA address", city: "QA city", total: 199,
  items: [{ productName: "<QA item>", quantity: 1, price: 199, optionsJson: null }],
});

async function verify() {
  const base = fixture();
  assert.deepEqual(status.normalizedStatuses(base), { order: "PROCESSING", payment: "PENDING", delivery: "NOT_CREATED" });
  for (const legacy of ["SHIPPED", "DELIVERED", "PAID"]) {
    const snapshot = { ...base, status: legacy };
    assert.equal(status.normalizeOrderStage(legacy), "NEW", "Legacy payment/shipping enum does not prove manual work.");
    assert.equal(status.normalizeDeliveryStage(snapshot), "NOT_CREATED", "Legacy enum alone is not a delivery fact.");
    assert.equal(status.normalizePaymentStage(snapshot), "PENDING", "Legacy enum alone is not a payment fact.");
  }
  assert.equal(status.normalizePaymentStage({ ...base, status: "COMPLETED" }), "PENDING");
  assert.equal(status.normalizePaymentStage({ ...base, paymentStatus: "UNKNOWN_PROVIDER_VALUE", paidAt: new Date() }), "UNKNOWN");
  assert.equal(status.normalizePaymentStage({ ...base, paymentProvider: "liqpay", paymentStatus: "PAID" }), "UNKNOWN");
  assert.equal(status.normalizePaymentStage({ ...base, paymentMethod: "Картка онлайн", paidAt: new Date(), status: "PAID" }), "PENDING");
  assert.equal(status.normalizePaymentStage({ ...base, paidAt: new Date(), paymentStatus: "REFUNDED" }), "REFUNDED");
  assert.equal(orderStatus.getOrderStatusAfterTtnCreated("PROCESSING"), "PROCESSING");

  assert.deepEqual(events.notificationEvents(null, base), ["ORDER_CREATED", "PAYMENT_PENDING"]);
  assert.deepEqual(events.notificationEvents(base, base), []);
  const ttn = { ...base, novaPoshtaTtn: "00000000000000" };
  assert.deepEqual(events.notificationEvents(base, ttn), ["DELIVERY_TTN_CREATED"]);
  let previous = ttn;
  for (const [text, stage] of [["handed to carrier", "SHIPPED"], ["in transit", "IN_TRANSIT"], ["ready for pickup", "ARRIVED"], ["delivered", "DELIVERED"], ["returned to sender", "RETURNED"]] as const) {
    const next = { ...ttn, novaPoshtaStatus: text };
    assert.deepEqual(events.notificationEvents(previous, next), [`DELIVERY_${stage}`]);
    assert.deepEqual(events.notificationEvents(next, { ...next, novaPoshtaStatus: `  ${text.toUpperCase()}  ` }), []);
    previous = next;
  }
  for (const text of ["not delivered", "undelivered", "will be delivered", "not received", "unknown", "return requested", "refused", "constructor", "__proto__", "toString"]) {
    const unknown = { ...ttn, novaPoshtaStatus: text, novaPoshtaStatusCode: "unmapped" };
    assert.equal(status.normalizeDeliveryStage(unknown), "UNKNOWN");
    assert.deepEqual(events.notificationEvents(ttn, unknown), []);
    for (const locale of ["ua", "en"] as const) assert.equal(status.statusLabels(unknown, locale).delivery, translations[locale].statuses.delivery.UNKNOWN);
  }
  for (const text of ["constructor", "__proto__", "toString"]) assert.equal(orderStatus.getOrderStatusLabel(text, "en"), translations.en.statuses.order.NEW);

  // Render the actual Admin detail page in each locale. Provider values may
  // appear only inside explicitly labeled, collapsed carrier diagnostics.
  const summary = sourceModule<typeof import("../src/components/admin/order-status-summary")>("src/components/admin/order-status-summary.tsx", {
    "react/jsx-runtime": jsxRuntime, "@/lib/i18n": { translations }, "@/lib/status": status,
  });
  for (const locale of ["ua", "en"] as const) {
    const raw = { ...ttn, items: ttn.items.map((item, index) => ({ ...item, id: `isolated-item-${index}` })), deliveryMethod: "np_warehouse", subtotal: 199, shippingCost: 0, novaPoshtaStatus: "RAW_PROVIDER_UNKNOWN", novaPoshtaStatusCode: "RAW_CODE_UNKNOWN", novaPoshtaCodStatus: "RAW_COD_UNKNOWN" };
    const detail = sourceModule<{ default(args: { params: Promise<{ id: string }> }): Promise<React.ReactElement> }>("src/app/admin/orders/[id]/page.tsx", {
      "react/jsx-runtime": jsxRuntime, "@/lib/i18n": { translations }, "@/lib/status": status,
      "@/lib/order-reference": reference,
      "next/link": { default: (props: React.AnchorHTMLAttributes<HTMLAnchorElement>) => React.createElement("a", props), __esModule: true },
      "next/navigation": { notFound: () => { throw new Error("UNEXPECTED_NOT_FOUND"); } },
      "@/components/admin/create-ttn-button": { CreateTtnButton: () => null },
      "@/components/admin/order-status-select": { OrderStatusSelect: () => null },
      "@/components/admin/take-order-into-work-button": { TakeOrderIntoWorkButton: () => null },
      "@/components/admin/order-status-summary": summary,
      "@/lib/payments/acceptance": acceptance, "@/lib/prisma": { prisma: { order: { findUnique: async () => raw } } },
      "@/lib/utils": { formatPrice: (value: number) => String(value) },
      "@/lib/product-variants": { orderSizeLabel: () => "" },
      "@/lib/i18n-server": { getLocale: async () => locale },
    });
    const html = renderToStaticMarkup(await detail.default({ params: Promise.resolve({ id: base.id }) }));
    const diagnostics = html.match(/<details\b[^>]*>[\s\S]*?<\/details>/)?.[0];
    assert.ok(diagnostics); assert.ok(!diagnostics.includes(" open"));
    assert.ok(diagnostics.includes(translations[locale].statuses.providerDetails));
    const primary = html.replace(diagnostics, "");
    assert.ok(primary.includes(translations[locale].statuses.delivery.UNKNOWN));
    for (const value of [raw.novaPoshtaStatus, raw.novaPoshtaStatusCode, raw.novaPoshtaCodStatus]) {
      assert.ok(diagnostics.includes(value)); assert.ok(!primary.includes(value));
    }
  }
  for (const payment of ["PENDING", "PAID", "FAILED", "CANCELLED", "REFUNDED"] as const) {
    const before = { ...base, paymentProvider: "liqpay", paymentStatus: "UNKNOWN" };
    const after = { ...before, paymentStatus: payment, paidAt: payment === "PAID" ? new Date() : null };
    assert.deepEqual(events.notificationEvents(before, after), [`PAYMENT_${payment}`]);
    assert.deepEqual(events.notificationEvents(after, after), []);
  }
  assert.deepEqual(events.notificationEvents(base, { ...base, status: "CANCELLED" }), ["ORDER_CANCELLED"]);
  assert.deepEqual(events.notificationEvents(base, { ...base, status: "COMPLETED" }), ["ORDER_COMPLETED"]);
  assert.deepEqual(events.notificationEvents({ ...base, status: "PENDING" }, base), ["ORDER_PROCESSING"]);

  let settings = events.defaultNotificationSettings();
  let settingsReads = 0; let settingsUnavailable = false;
  const deliveries: string[] = [];
  const dispatcher = sourceModule<typeof import("../src/lib/notifications/orders")>("src/lib/notifications/orders.ts", {
    "@/lib/payments/initialization-state": initializationState,
    "./email": { sendEmail: async ({ html }: { html: string }) => { assert.match(html, /&lt;QA/); deliveries.push("email"); return { sent: true }; } },
    "./telegram": { sendTelegramMessage: async (message: string) => { assert.ok(!message.includes("token=")); deliveries.push("telegram"); return { sent: true }; } },
    "./settings": { getNotificationSettings: async () => { settingsReads++; if (settingsUnavailable) throw new Error("QA_FAILURE"); return settings; } },
    "./events": events, "./templates": templates,
  });
  assert.equal(await dispatcher.notifyOrderCreated(base, "en"), true);
  assert.deepEqual(deliveries.sort(), ["email", "telegram"]);
  for (const channel of ["telegram", "email"] as const) {
    settings = events.defaultNotificationSettings(); settings[channel].ORDER_CREATED = false; deliveries.length = 0;
    await dispatcher.notifyOrderCreated(base);
    assert.deepEqual(deliveries, [channel === "email" ? "telegram" : "email"]);
  }
  for (const event of events.CONFIGURABLE_EVENTS) {
    assert.equal(typeof settings.telegram[event], "boolean"); assert.equal(typeof settings.email[event], "boolean");
  }
  const scenario = (event: events.NotificationEvent): [templates.OrderForNotification | null, templates.OrderForNotification] => {
    if (event === "ORDER_CREATED") return [null, base];
    if (event.startsWith("ORDER_")) return [{ ...base, status: "PENDING" }, { ...base, status: event.slice(6) }];
    if (event.startsWith("PAYMENT_")) return [{ ...base, paymentStatus: "UNKNOWN" }, { ...base, paymentStatus: event.slice(8), paidAt: event === "PAYMENT_PAID" ? new Date() : null }];
    const text: Record<string, string> = { DELIVERY_SHIPPED: "handed to carrier", DELIVERY_IN_TRANSIT: "in transit", DELIVERY_ARRIVED: "ready for pickup", DELIVERY_DELIVERED: "delivered", DELIVERY_RETURNED: "returned to sender" };
    return event === "DELIVERY_TTN_CREATED" ? [base, ttn] : [ttn, { ...ttn, novaPoshtaStatus: text[event] }];
  };
  for (const event of events.CONFIGURABLE_EVENTS) {
    for (const channel of ["telegram", "email"] as const) {
      settings = events.defaultNotificationSettings();
      for (const target of ["telegram", "email"] as const) for (const key of events.NOTIFICATION_EVENTS) settings[target][key] = false;
      settings[channel][event] = true; deliveries.length = 0;
      await dispatcher.emitOrderEvents(...scenario(event)); assert.deepEqual(deliveries, [channel], `${event}/${channel} enabled`);
      settings[channel][event] = false; deliveries.length = 0;
      await dispatcher.emitOrderEvents(...scenario(event)); assert.deepEqual(deliveries, [], `${event}/${channel} disabled`);
    }
  }
  assert.throws(() => events.parseNotificationSettings('{"email":{},"telegram":{"ORDER_CREATED":"false"}}'));
  assert.deepEqual(events.parseNotificationSettings(), events.defaultNotificationSettings());
  const disabled = events.defaultNotificationSettings(); disabled.email.ORDER_CREATED = false;
  assert.equal(events.parseNotificationSettings(JSON.stringify(disabled)).email.ORDER_CREATED, false);
  settingsUnavailable = true; deliveries.length = 0;
  await dispatcher.notifyOrderCreated(base); assert.deepEqual(deliveries, []); settingsUnavailable = false;
  const reads = settingsReads;
  await dispatcher.notifyOrderCreated({ ...base, paymentMode: "sandbox" });
  assert.equal(settingsReads, reads); assert.deepEqual(deliveries, []);
  const email = templates.renderNotification("PAYMENT_PAID", base, "en");
  assert.ok(email.subject.startsWith(translations.en.notifications.events.PAYMENT_PAID));
  assert.match(email.html, /lang="en"/); assert.match(email.html, /&lt;QA &amp; Customer&gt;/);
  assert.ok(!email.html.includes("<QA item>"));
  assert.ok(templates.renderNotification("DELIVERY_ARRIVED", base).subject.startsWith(translations.ua.notifications.events.DELIVERY_ARRIVED));

  // Settings action: authorization before write, independent channels, unchecked
  // boxes persist false; unrelated content keys can never be overwritten.
  let authorized = false; let settingWrites = 0; let savedValue = "";
  const action = sourceModule<typeof import("../src/lib/actions/notification-settings")>("src/lib/actions/notification-settings.ts", {
    "next/cache": { revalidatePath: () => {} }, "./require-admin": { requireAdmin: async () => { if (!authorized) throw new Error("UNAUTHORIZED"); } },
    "@/lib/notifications/events": events,
    "@/lib/payments/acceptance": acceptance, "@/lib/prisma": { prisma: { siteContent: { upsert: async ({ where, update }: Prisma.SiteContentUpsertArgs) => {
      assert.equal(where.key, events.NOTIFICATION_SETTINGS_KEY); savedValue = String(update.value); settingWrites++;
    } } } },
  });
  const form = new FormData(); form.set("telegram.PAYMENT_PAID", "on"); form.set("hero_title_ua", "must be ignored");
  await assert.rejects(action.updateNotificationSettings(form)); assert.equal(settingWrites, 0);
  authorized = true; await action.updateNotificationSettings(form);
  const saved = events.parseNotificationSettings(savedValue);
  assert.equal(saved.telegram.PAYMENT_PAID, true); assert.equal(saved.email.PAYMENT_PAID, false);
  assert.equal(saved.telegram.ORDER_CREATED, false); assert.equal(saved.email.ORDER_CREATED, false);

  // Admin same-status saves and racing saves notify once, payment/delivery facts
  // are never written through the order-stage selector.
  let order = { ...base, status: "PENDING" }; let changes = 0; let writes = 0;
  const orderDb = { order: {
    findUnique: async () => ({ ...order }),
    updateMany: async ({ where, data }: Prisma.OrderUpdateManyArgs) => {
      if (where?.status !== order.status) return { count: 0 };
      assert.deepEqual(Object.keys(data), ["status"]); order = { ...order, status: data.status as string }; writes++; return { count: 1 };
    },
  } };
  const work = sourceModule<typeof import("../src/lib/orders/take-into-work")>("src/lib/orders/take-into-work.ts", {
    "@/lib/payments/acceptance": acceptance, "@/lib/prisma": { prisma: orderDb }, "@/lib/status": status,
    "@/lib/notifications/orders": { emitOrderEvents: async () => { changes++; } },
  });
  const orderAction = sourceModule<typeof import("../src/lib/actions/orders")>("src/lib/actions/orders.ts", {
    "@/lib/orders/take-into-work": work, "@/lib/status": status,
    "@/lib/payments/transitions": { cancelPendingPayment: () => { throw new Error("UNEXPECTED_MONO_CALL"); }, paymentSnapshotWhere: () => { throw new Error("UNEXPECTED_MONO_CALL"); } },
    "next/cache": { revalidatePath: () => {} }, "@/lib/actions/require-admin": { requireAdmin: async () => {} },
    "@/lib/order-status": orderStatus, "@/lib/notifications/orders": { emitOrderEvents: async () => { changes++; } },
    "@/lib/payments/acceptance": acceptance, "@/lib/prisma": { prisma: orderDb },
  });
  await orderAction.updateOrderStatus(base.id, "PENDING"); assert.equal(writes, 0);
  const raced = await Promise.allSettled([orderAction.updateOrderStatus(base.id, "PROCESSING"), orderAction.updateOrderStatus(base.id, "PROCESSING")]);
  assert.equal(raced.filter((result) => result.status === "fulfilled").length, 2);
  assert.equal(writes, 1); assert.equal(changes, 1);
  await assert.rejects(orderAction.updateOrderStatus(base.id, "PAID"));

  // Two overlapping cron snapshots: one persistent transition and one batch.
  const cronOrder = { ...base, novaPoshtaTtn: ttn.novaPoshtaTtn, novaPoshtaSyncedAt: null } as unknown as Order;
  let cronEvents = 0; let cronWrites = 0;
  const cron = sourceModule<{ GET(req: Request): Promise<Response> }>("src/app/api/cron/novaposhta/route.ts", {
    "@/lib/payments/payment-method": paymentMethods, "@/lib/payments/money": paymentMoney,
    "next/server": { NextResponse }, "@/lib/status": status, "@/lib/order-status": orderStatus,
    "@/lib/server-env": { readServerEnv: (key: string) => key === "CRON_SECRET" ? "isolated" : "" },
    "@/lib/notifications/orders": { emitOrderEvents: async (before: Order, after: Order) => { cronEvents += events.notificationEvents(before, after).length; } },
    "@/lib/novaposhta": { getNovaPoshtaDocumentStatuses: async () => ({ success: true, statuses: [{ ttn: ttn.novaPoshtaTtn, status: "ready for pickup", statusCode: "", codStatus: "not paid", codStatusCode: "", codAmount: null, deliveredAt: null }] }) },
    "@/lib/payments/acceptance": acceptance, "@/lib/prisma": { prisma: { order: {
      findMany: async () => [{ ...cronOrder }],
      updateMany: async ({ where, data }: Prisma.OrderUpdateManyArgs) => {
        if (!Object.entries(where ?? {}).every(([key, value]) => JSON.stringify(cronOrder[key as keyof Order]) === JSON.stringify(value))) return { count: 0 };
        Object.assign(cronOrder, data); cronWrites++; return { count: 1 };
      },
    } } },
  });
  const req = () => new Request("http://localhost/cron", { headers: { authorization: "Bearer isolated" } });
  assert.equal((await cron.GET(new Request("http://localhost/cron"))).status, 401);
  await Promise.all([cron.GET(req()), cron.GET(req())]);
  assert.equal(cronWrites, 1); assert.equal(cronEvents, 1);
  await cron.GET(req()); assert.equal(cronEvents, 1);

  // TTN creation emits delivery only, retains order/payment stages, and a
  // repeated request for an existing TTN neither creates nor notifies again.
  const shipmentOrder = { ...base, status: "PENDING", novaPoshtaTtn: null } as unknown as Order;
  let shipmentCreates = 0; let shipmentNotifications = 0; let admin = false;
  const ttnRoute = sourceModule<{ POST(req: Request, context: { params: Promise<{ id: string }> }): Promise<Response> }>("src/app/api/admin/orders/[id]/create-ttn/route.ts", {
    "next/server": { NextResponse }, "@/lib/auth": { auth: async () => ({ user: { role: admin ? "ADMIN" : "MANAGER" } }) },
    "@/lib/notifications/orders": { emitOrderEvents: async (before: Order, after: Order) => {
      assert.deepEqual(events.notificationEvents(before, after), ["DELIVERY_TTN_CREATED"]); shipmentNotifications++;
    } },
    "@/lib/novaposhta": { createNovaPoshtaWaybill: async () => { shipmentCreates++; return { success: true, ttn: ttn.novaPoshtaTtn, ref: "isolated-ref" }; } },
    "@/lib/payments/acceptance": acceptance, "@/lib/prisma": { prisma: { order: {
      findUnique: async () => ({ ...shipmentOrder }),
      updateMany: async ({ where, data }: Prisma.OrderUpdateManyArgs) => {
        if (shipmentOrder.novaPoshtaTtn !== where?.novaPoshtaTtn) return { count: 0 };
        assert.equal(data.status, undefined); assert.equal(data.paymentStatus, undefined);
        Object.assign(shipmentOrder, data); return { count: 1 };
      },
    } } },
  });
  const createShipment = () => ttnRoute.POST(new Request("http://localhost/ttn", { method: "POST" }), { params: Promise.resolve({ id: base.id }) });
  assert.equal((await createShipment()).status, 401); assert.equal(shipmentCreates, 0);
  admin = true;
  assert.equal((await createShipment()).status, 200); assert.equal(shipmentOrder.status, "PENDING");
  assert.equal((await createShipment()).status, 200); assert.equal(shipmentCreates, 1); assert.equal(shipmentNotifications, 1);
  shipmentOrder.novaPoshtaTtn = null;
  const racedShipments = await Promise.all([createShipment(), createShipment()]);
  assert.deepEqual(racedShipments.map((response) => response.status).sort(), [200, 409]);
  assert.equal(shipmentNotifications, 2, "Only the winning TTN persistence emits, including overlapping requests.");
  assert.equal(shipmentCreates, 3, "External TTN creation locking remains a documented limitation; both mocked requests can reach the carrier.");
  console.log("PASS Batch 1.6: status compatibility; semantic transitions; unknown/negative provider values; locale/escaping; independent toggles; fail-closed settings; sandbox; authorized settings persistence; Admin and cron concurrency. No real DB/network/notifications.");
}

verify().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => {
  globalThis.fetch = originalFetch;
  if (originalSecret === undefined) delete process.env.AUTH_SECRET; else process.env.AUTH_SECRET = originalSecret;
});
