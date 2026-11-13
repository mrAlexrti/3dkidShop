// Actual services/routes with fail-closed in-memory DB and Telegram API boundaries.
// Never load .env, PrismaClient, live provider configuration, or customer records.
import assert from "node:assert/strict";
import * as crypto from "node:crypto";
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import type { Order } from "@prisma/client";
import { sourceModule } from "./source-module";
import { PaymentMemory, type Row } from "./payment-memory";
import * as statuses from "../src/lib/status";
import * as stages from "../src/lib/order-status";
import * as events from "../src/lib/notifications/events";
import * as callbacks from "../src/lib/notifications/telegram-actions";
import * as variants from "../src/lib/product-variants";
import * as money from "../src/lib/payments/money";
import { translations } from "../src/lib/i18n";

const originalFetch = globalThis.fetch;
const forbidden = () => { throw new Error("UNEXPECTED_EXTERNAL_EFFECT"); };
globalThis.fetch = async () => forbidden();
const db = new PaymentMemory();
const fixture = (): Row => ({ id: "qa-order", number: "3DK-QA", status: "PENDING", paymentMethod: "card_online", total: "199.00",
  paymentProvider: "mono", paymentMode: "live", paymentStatus: "PAID", paidAt: new Date("2026-01-01"),
  paymentInvoiceId: "qa-invoice", paymentProviderStatus: "success", paymentModifiedAt: new Date("2026-01-01"),
  paymentExpiresAt: null, paymentNextCheckAt: null, paymentErrorCode: null,
  novaPoshtaTtn: "00000000000000", novaPoshtaStatus: "handed to carrier", novaPoshtaStatusCode: null, novaPoshtaDeliveredAt: null,
  customerName: "QA", customerEmail: "qa@example.invalid", customerPhone: "+380000000000", city: "QA city", shippingAddress: "QA address", items: [],
});
function reset(patch: Row = {}) { db.orders = [{ ...fixture(), ...patch }]; db.events = []; }
const notifications = { emitOrderEvents: async (before: Order, after: Order) => { db.events.push(...events.notificationEvents(before, after)); return false; } };
let conflict: "none" | "cancel" | "complete" | "always" | "payment" = "none";
let updates = 0;
const database = { order: { ...db.order, updateMany: async (args: { where: Row; data: Row }) => {
  updates++; assert.deepEqual(Object.keys(args.data), ["status"], "Work action may write only operational state");
  if (conflict === "cancel" || conflict === "complete") { db.orders[0].status = conflict === "cancel" ? "CANCELLED" : "COMPLETED"; conflict = "none"; return { count: 0 }; }
  if (conflict === "always") return { count: 0 };
  if (conflict === "payment") { db.orders[0].paymentStatus = "REFUNDED"; conflict = "none"; }
  return db.order.updateMany(args);
} } };
const work = sourceModule<typeof import("../src/lib/orders/take-into-work")>("src/lib/orders/take-into-work.ts", {
  "@/lib/prisma": { prisma: database }, "@/lib/status": statuses, "@/lib/notifications/orders": notifications,
});
let authorized = true;
const action = sourceModule<typeof import("../src/lib/actions/orders")>("src/lib/actions/orders.ts", {
  "@/lib/prisma": { prisma: db }, "@/lib/orders/take-into-work": work, "@/lib/status": statuses,
  "@/lib/order-status": stages, "next/cache": { revalidatePath: () => {} },
  "@/lib/actions/require-admin": { requireAdmin: async () => { if (!authorized) throw new Error("UNAUTHORIZED"); } },
  "@/lib/notifications/orders": notifications, "@/lib/payments/transitions": { cancelPendingPayment: forbidden, paymentSnapshotWhere: (order: Order) => ({ id: order.id, status: order.status }) },
});
const env: Record<string, string> = { TELEGRAM_WEBHOOK_SECRET: "qa_webhook_secret", TELEGRAM_ADMIN_CHAT_ID: "12345", TELEGRAM_BOT_TOKEN: "qa_bot_token", SITE_URL: "https://shop.example.invalid" };
const serverEnv = { readServerEnv: (name: string) => env[name] ?? "" };
const apiCalls: { method: string; body: Record<string, unknown> }[] = [];
const sender = sourceModule<typeof import("../src/lib/notifications/telegram")>("src/lib/notifications/telegram.ts", { "@/lib/server-env": serverEnv });
const webhook = sourceModule<typeof import("../src/app/api/telegram/webhook/route")>("src/app/api/telegram/webhook/route.ts", {
  "node:crypto": crypto, "next/server": { NextResponse }, "next/cache": { revalidatePath: () => {} }, zod: { z },
  "@/lib/server-env": serverEnv, "@/lib/notifications/telegram-actions": callbacks, "@/lib/notifications/telegram": sender,
  "@/lib/orders/take-into-work": work, "@/lib/i18n": { translations },
});
const callback = () => ({ update_id: 1, callback_query: { id: "qa-query", from: { id: 12345, is_bot: false }, message: { chat: { id: 12345, type: "private" } }, data: callbacks.orderWorkCallback("qa-order") } });
const post = (body: unknown = callback(), secret: string | null = "qa_webhook_secret") => webhook.POST(new Request("https://shop.example.invalid/api/telegram/webhook", {
  method: "POST", body: typeof body === "string" ? body : JSON.stringify(body), headers: secret == null ? {} : { "X-Telegram-Bot-Api-Secret-Token": secret },
}));
const templates = sourceModule<typeof import("../src/lib/notifications/templates")>("src/lib/notifications/templates.ts", {
  "@/lib/product-variants": variants, "@/lib/payments/order-result": { getOrderResultPath: (number: string) => `/result/${number}` },
  "@/lib/i18n": { translations }, "@/lib/status": statuses, "@/lib/server-env": serverEnv, "./telegram-actions": callbacks,
});

async function verify() {
  assert.equal(stages.getInitialOrderStatus(), "PENDING");
  for (const current of ["PENDING", "PROCESSING", "AWAITING_PAYMENT", "PAID", "SHIPPED", "DELIVERED", "COMPLETED", "CANCELLED"] as const) {
    assert.equal(stages.getOrderStatusAfterPaymentReceived(current, false), current === "DELIVERED" ? "COMPLETED" : current);
    assert.equal(stages.getOrderStatusAfterTtnCreated(current), current);
    for (const [delivered, paid] of [[false, false], [false, true], [true, false], [true, true]]) {
      assert.equal(stages.getOrderStatusAfterNovaPoshtaSync({ currentStatus: current, isDelivered: delivered, isPaid: paid }),
        !["CANCELLED", "COMPLETED"].includes(current) && delivered && paid ? "COMPLETED" : current);
    }
  }
  for (const legacy of ["AWAITING_PAYMENT", "PAID", "SHIPPED", "DELIVERED"]) {
    assert.equal(statuses.normalizeOrderStage(legacy), "NEW");
    for (const locale of ["ua", "en"] as const) assert.ok(stages.getOrderStatusLabel(legacy, locale));
  }
  for (const status of ["PENDING", "AWAITING_PAYMENT", "PAID", "SHIPPED", "DELIVERED"]) {
    reset({ status }); const before = structuredClone(db.orders[0]);
    assert.equal(await work.takeOrderIntoWork("qa-order"), "taken");
    assert.deepEqual({ ...db.orders[0] }, { ...before, status: "PROCESSING" });
    assert.deepEqual(db.events.slice(), ["ORDER_PROCESSING"]);
    assert.equal(await work.takeOrderIntoWork("qa-order"), "already_processing");
    assert.deepEqual(db.events.slice(), ["ORDER_PROCESSING"]);
  }
  for (const status of ["COMPLETED", "CANCELLED"]) {
    reset({ status }); const before = structuredClone(db.orders[0]);
    assert.equal(await action.takeOrderIntoWorkAction("qa-order"), "terminal");
    for (const next of ["PENDING", "CANCELLED", "COMPLETED"] as const) if (next !== status) await assert.rejects(action.updateOrderStatus("qa-order", next));
    assert.deepEqual({ ...db.orders[0] }, before); assert.deepEqual(db.events.slice(), []);
  }
  reset(); assert.equal(await work.takeOrderIntoWork("missing"), "not_found"); assert.equal(await work.takeOrderIntoWork("../bad"), "not_found");
  authorized = false; await assert.rejects(action.takeOrderIntoWorkAction("qa-order")); assert.equal(db.orders[0].status, "PENDING"); authorized = true;
  for (const race of ["cancel", "complete", "always", "payment"] as const) {
    reset(); conflict = race; updates = 0;
    const result = await work.takeOrderIntoWork("qa-order");
    assert.equal(result, race === "always" ? "conflict" : race === "payment" ? "taken" : "terminal");
    if (race === "payment") assert.equal(db.orders[0].paymentStatus, "REFUNDED", "Concurrent payment must survive");
    if (race === "always") assert.equal(updates, 4);
  }
  conflict = "none";

  // All requests below reach only this exact fake Bot API transport.
  globalThis.fetch = async (input, init) => {
    const url = String(input); assert.ok(url.startsWith("https://api.telegram.org/botqa_bot_token/"));
    const method = url.split("/").at(-1)!; assert.ok(["sendMessage", "answerCallbackQuery"].includes(method), "No setWebhook or other API allowed");
    apiCalls.push({ method, body: JSON.parse(String(init?.body)) }); return Response.json({ ok: true, result: true });
  };
  reset(); await sender.sendTelegramMessage("Plain text"); assert.equal(apiCalls.at(-1)!.body.reply_markup, undefined);
  assert.equal(templates.renderNotification("ORDER_CREATED", fixture() as never).subject.startsWith("Нове замовлення"), true);
  assert.equal(templates.renderNotification("ORDER_CREATED", fixture() as never, "en").subject.startsWith("New order"), true);
  const rendered = templates.renderNotification("ORDER_CREATED", fixture() as never, "ua", "telegram");
  assert.deepEqual(rendered.telegramKeyboard, { inline_keyboard: [[{ text: "Взяти в роботу", callback_data: "ow1:qa-order" }], [{ text: "Відкрити замовлення", url: "https://shop.example.invalid/admin/orders/qa-order" }]] });
  assert.equal(templates.renderNotification("ORDER_PROCESSING", fixture() as never, "ua", "telegram").telegramKeyboard, undefined);
  assert.ok(Buffer.byteLength(callbacks.orderWorkCallback("a".repeat(48))) < 64);
  assert.throws(() => callbacks.orderWorkCallback("a".repeat(49)));
  let settings = events.defaultNotificationSettings();
  const dispatcher = sourceModule<typeof import("../src/lib/notifications/orders")>("src/lib/notifications/orders.ts", {
    "./telegram": sender, "./email": { sendEmail: async () => ({ sent: true }) }, "./settings": { getNotificationSettings: async () => settings },
    "./events": events, "./templates": templates,
  });
  await dispatcher.notifyOrderCreated(fixture() as never);
  assert.deepEqual(apiCalls.at(-1)!.body.reply_markup, rendered.telegramKeyboard);
  const sent = apiCalls.length; settings.telegram.ORDER_CREATED = false;
  await dispatcher.notifyOrderCreated(fixture() as never); assert.equal(apiCalls.length, sent, "Disabled created Telegram event must not send keyboard");
  settings = events.defaultNotificationSettings(); settings.telegram.ORDER_PROCESSING = false;
  await dispatcher.emitOrderEvents(fixture() as never, { ...fixture(), status: "PROCESSING" } as never);
  assert.equal(apiCalls.length, sent, "Processing toggle stays independent");

  reset(); const baseline = structuredClone(db.orders[0]); const requestsBefore = apiCalls.length;
  for (const bad of [null, "wrong", "qa_webhook_secrex", "x".repeat(300)]) assert.equal((await post(callback(), bad)).status, 401);
  for (const key of ["TELEGRAM_WEBHOOK_SECRET", "TELEGRAM_ADMIN_CHAT_ID", "TELEGRAM_BOT_TOKEN"]) {
    const value = env[key]; env[key] = ""; assert.equal((await post()).status, 503); env[key] = value;
  }
  const privateChat = env.TELEGRAM_ADMIN_CHAT_ID; env.TELEGRAM_ADMIN_CHAT_ID = "-12345"; assert.equal((await post()).status, 503); env.TELEGRAM_ADMIN_CHAT_ID = privateChat;
  for (const bad of ["{", "null", "[]", "{}", JSON.stringify({ update_id: 1, callback_query: {} })]) assert.equal((await post(bad)).status, 400);
  assert.equal((await post("x".repeat(32769))).status, 413);
  const wrongChat = callback(); wrongChat.callback_query.message.chat.id = 67890; assert.equal((await post(wrongChat)).status, 403);
  const wrongUser = callback(); wrongUser.callback_query.from.id = 67890; assert.equal((await post(wrongUser)).status, 403);
  const group = callback(); group.callback_query.message.chat.type = "group"; assert.equal((await post(group)).status, 400);
  const bot = callback(); bot.callback_query.from.is_bot = true; assert.equal((await post(bot)).status, 400);
  assert.equal(apiCalls.length, requestsBefore); assert.deepEqual({ ...db.orders[0] }, baseline);
  for (const data of ["refund:qa-order", "ow1:../qa", "ow1:", "ow1:qa-order\n", "ow1:" + "a".repeat(49)]) {
    const unknown = callback(); unknown.callback_query.data = data; assert.equal((await post(unknown)).status, 200);
  }
  assert.deepEqual({ ...db.orders[0] }, baseline); assert.deepEqual(db.events.slice(), []);
  assert.equal((await post({ update_id: 2, message: {} })).status, 200);
  // Cross-channel concurrency invokes the same real CAS service.
  const results = await Promise.all([action.takeOrderIntoWorkAction("qa-order"), post(), post()]);
  assert.ok(["taken", "already_processing"].includes(results[0]));
  assert.equal((results[1] as Response).status, 200); assert.equal((results[2] as Response).status, 200);
  assert.deepEqual({ ...db.orders[0] }, { ...baseline, status: "PROCESSING" }); assert.deepEqual(db.events.slice(), ["ORDER_PROCESSING"]);
  assert.equal((await post()).status, 200); assert.equal(apiCalls.at(-1)!.body.text, "Замовлення вже в роботі");
  for (const status of ["CANCELLED", "COMPLETED"]) {
    reset({ status }); const before = structuredClone(db.orders[0]); assert.equal((await post()).status, 200);
    assert.deepEqual({ ...db.orders[0] }, before); assert.deepEqual(db.events.slice(), []); assert.equal(apiCalls.at(-1)!.body.text, "Замовлення вже завершено або скасовано");
  }
  reset(); assert.equal((await post()).status, 200); assert.equal(apiCalls.at(-1)!.body.text, "Замовлення взято в роботу");
  const eventCount = db.events.length;
  globalThis.fetch = async () => Response.json({ ok: false }, { status: 200 });
  assert.equal((await sender.sendTelegramMessage("Failure fixture")).sent, false);
  assert.equal((await post()).status, 200); assert.equal(db.events.length, eventCount, "Callback answer failure cannot repeat transition");

  // Verify payment provider evidence still updates only financial state until
  // both delivery and payment support the existing final-completion rule.
  const financialUpdate = db.order.updateMany;
  db.order.updateMany = async (args) => {
    if (args.data.status !== undefined) assert.equal(args.data.status, "COMPLETED", "Provider evidence must not write legacy/unchanged operational statuses");
    return financialUpdate(args);
  };
  const payment = sourceModule<typeof import("../src/lib/payments/transitions")>("src/lib/payments/transitions.ts", {
    "@/lib/prisma": { prisma: db }, "@/lib/payments/money": money, "@/lib/order-status": stages, "@/lib/notifications/orders": notifications,
  });
  for (const stage of ["PAID", "FAILED", "CANCELLED", "REFUNDED"] as const) {
    reset({ paidAt: null, paymentStatus: "PENDING", paymentModifiedAt: null, novaPoshtaTtn: null });
    assert.equal(await payment.applyPaymentEvidence({ provider: "mono", invoiceId: "qa-invoice", reference: "3DK-QA", amount: 19900, currency: 980,
      modifiedAt: new Date("2026-02-01"), status: stage, providerStatus: stage.toLowerCase(), errorCode: null }), "applied");
    assert.equal(db.orders[0].status, "PENDING"); assert.ok(!db.events.includes("ORDER_PROCESSING"));
    if (stage === "PAID") assert.ok(db.orders[0].paidAt);
  }
  reset({ paidAt: null, paymentStatus: "PENDING", paymentModifiedAt: null, novaPoshtaDeliveredAt: new Date("2026-01-02") });
  await payment.applyPaymentEvidence({ provider: "mono", invoiceId: "qa-invoice", reference: "3DK-QA", amount: 19900, currency: 980,
    modifiedAt: new Date("2026-02-01"), status: "PAID", providerStatus: "success", errorCode: null });
  assert.equal(db.orders[0].status, "COMPLETED");

  // Actual quick-action component: present only for normalized NEW, both locales.
  for (const locale of ["ua", "en"] as const) {
    const button = sourceModule<typeof import("../src/components/admin/take-order-into-work-button")>("src/components/admin/take-order-into-work-button.tsx", {
      react: React, "react/jsx-runtime": jsxRuntime, "next/navigation": { useRouter: () => ({ refresh: forbidden }) },
      sonner: { toast: { success: forbidden, message: forbidden, error: forbidden } },
      "@/components/ui/button": { Button: (props: React.ButtonHTMLAttributes<HTMLButtonElement>) => React.createElement("button", props) },
      "@/store/lang-store": { useLangStore: () => ({ locale, t: translations[locale] }) }, "@/lib/status": statuses,
      "@/lib/actions/orders": { takeOrderIntoWorkAction: forbidden },
    });
    for (const status of ["PENDING", "AWAITING_PAYMENT", "PAID", "SHIPPED", "DELIVERED", "PROCESSING", "COMPLETED", "CANCELLED"]) {
      const html = renderToStaticMarkup(React.createElement(button.TakeOrderIntoWorkButton, { orderId: "qa-order", status }));
      assert.equal(html.includes(translations[locale].statuses.work.take), statuses.normalizeOrderStage(status) === "NEW");
    }
  }
  assert.equal(db.productWrites, 0);
  console.log("PASS Batch 1.7.2: independent lifecycle matrix; shared Admin/Telegram CAS; cross-channel idempotency/concurrency/terminal guards; financial/carrier snapshots preserved; final completion; historical enums; localized button/title; notification toggles/keyboard/Admin URL; bounded secret/private-owner callbacks; unknown/malformed/replayed updates; mocked Bot API/plain text/failures. No real DB/provider/notifications.");
}
verify().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => { globalThis.fetch = originalFetch; });
