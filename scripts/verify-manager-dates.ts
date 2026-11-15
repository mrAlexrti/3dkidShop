// Calendar/notification regressions with fail-closed dependencies and fake DB.
import assert from "node:assert/strict";
import * as crypto from "node:crypto";
import { sourceModule } from "./source-module";
import { PaymentMemory } from "./payment-memory";
import * as dates from "../src/lib/date-time";
import * as eligibility from "../src/lib/orders/cod-eligibility";
import * as callbacks from "../src/lib/notifications/telegram-actions";
import * as reference from "../src/lib/order-reference";
import * as variants from "../src/lib/product-variants";
import * as status from "../src/lib/status";
import * as events from "../src/lib/notifications/events";
import { translations } from "../src/lib/i18n";
import type { OrderForNotification } from "../src/lib/notifications/templates";

const savedFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error("NETWORK_FORBIDDEN"); };
const templates = sourceModule<typeof import("../src/lib/notifications/templates")>("src/lib/notifications/templates.ts", {
  "@/lib/date-time": dates, "@/lib/orders/cod-eligibility": eligibility, "./telegram-actions": callbacks,
  "@/lib/order-reference": reference, "@/lib/product-variants": variants, "@/lib/i18n": { translations }, "@/lib/status": status,
  "@/lib/server-env": { readServerEnv: () => "" }, "@/lib/payments/order-result": { getOrderResultPath: () => "/qa-result" },
});
const fixture = (): OrderForNotification => ({ id: "qa-order", number: "0001", checkoutAcceptance: "ACCEPTED", status: "PENDING",
  paymentMethod: "card_online", paymentProvider: "mono", paymentStatus: "PAID",
  createdAt: new Date("2026-11-15T20:30:00Z"), acceptedAt: new Date("2026-11-15T20:35:00Z"), paidAt: new Date("2026-11-15T20:34:00Z"),
  customerName: "QA", customerEmail: "qa@example.invalid", customerPhone: "+380000000000", shippingAddress: "QA", city: "QA", total: "199.00", items: [],
});
async function verify() {
  assert.equal(dates.MANAGER_TIME_ZONE, "Europe/Kyiv");
  assert.equal(dates.formatManagerDateTime(new Date("2026-11-15T20:30:00Z")), "15.11.2026, 22:30");
  assert.equal(dates.formatManagerDateTime(new Date("2026-11-15T20:30:00Z"), "en"), "15/11/2026, 22:30");
  assert.equal(dates.formatManagerDateTime(null), "—"); assert.equal(dates.formatManagerDateTime(new Date("invalid")), "—");
  for (const [instant, expected] of [
    ["2026-03-29T00:59:59Z", "29.03.2026, 02:59"], ["2026-03-29T01:00:00Z", "29.03.2026, 04:00"],
    ["2026-10-25T00:59:59Z", "25.10.2026, 03:59"], ["2026-10-25T01:00:00Z", "25.10.2026, 03:00"],
    ["2026-07-01T21:00:00Z", "02.07.2026, 00:00"],
  ]) assert.equal(dates.formatManagerDateTime(new Date(instant)), expected);
  for (const invalid of ["2026-02-30", "2026-13-01", "2026-1-01", "1999-12-31", "9999-01-01", "", "<script>"]) assert.equal(dates.kyivDayBoundary(invalid), null);
  // Both channels describe the stored creation instant separately from the
  // provider/acceptance instants; COD never gets an invented paid timestamp.
  for (const locale of ["ua", "en"] as const) for (const channel of ["telegram", "email"] as const) {
    const order = fixture(); const rendered = templates.renderNotification("ORDER_CREATED", order, locale, channel);
    const text = channel === "telegram" ? rendered.telegram : rendered.html;
    const t = translations[locale].notifications;
    for (const [label, value] of [[t.created, order.createdAt], [t.accepted, order.acceptedAt], [t.paid, order.paidAt]] as const) assert.ok(text.includes(`${label}: ${dates.formatManagerDateTime(value, locale)}`));
    const cod = { ...order, paymentMethod: "cash_on_delivery", paymentProvider: null, paymentStatus: "PENDING", paidAt: null };
    const codMessage = templates.renderNotification("ORDER_CREATED", cod, locale, channel);
    const codText = channel === "telegram" ? codMessage.telegram : codMessage.html;
    assert.ok(codText.includes(`${t.created}: ${dates.formatManagerDateTime(order.createdAt, locale)}`));
    assert.ok(!codText.includes(`${t.accepted}:`) && !codText.includes(`${t.paid}:`));
    if (channel === "telegram") {
      assert.match(JSON.stringify(codMessage.telegramKeyboard), /oc1:qa-order/); assert.match(JSON.stringify(codMessage.telegramKeyboard), /ox1:qa-order/);
      assert.doesNotMatch(JSON.stringify(rendered.telegramKeyboard), /oc1:|ox1:/);
    }
  }
  const db = new PaymentMemory(); const sent: unknown[] = [];
  const outbox = sourceModule<typeof import("../src/lib/notifications/outbox")>("src/lib/notifications/outbox.ts", {
    "node:crypto": crypto, "@/lib/prisma": { prisma: db }, "./templates": templates,
    "./settings": { getNotificationSettings: async () => events.defaultNotificationSettings() },
    "./telegram": { sendTelegramMessage: async (text: string, keyboard: unknown) => { sent.push({ text, keyboard }); return { sent: true }; } },
    "./email": { sendEmail: async (message: unknown) => { sent.push(message); return { sent: true }; } },
  });
  await outbox.enqueueAcceptanceNotifications(db as never, fixture(), "en");
  const frozen = structuredClone(db.notifications.map((row) => row.payload));
  assert.ok(JSON.stringify(frozen).includes("Створено: 15.11.2026, 22:30"));
  await outbox.recoverNotificationOutbox(new Date(Date.now() + 10000));
  await outbox.recoverNotificationOutbox(new Date(Date.now() + 10000));
  assert.deepEqual(db.notifications.map((row) => row.payload), frozen); assert.equal(sent.length, 2);
  // Preexisting outbox payload is delivered verbatim; templates are never used
  // to rewrite it, and a SENT historical row is never sent again.
  db.notifications = []; sent.length = 0;
  const oldPayload = { telegram: "Historical immutable body", keyboard: { inline_keyboard: [[{ text: "Old action", callback_data: "ow1:qa-order" }]] }, subject: "", html: "" };
  db.notifications.push({ id: "old", event: "ORDER_CREATED", channel: "telegram", state: "PENDING", payload: structuredClone(oldPayload), attemptCount: 0, nextAttemptAt: new Date() });
  await outbox.recoverNotificationOutbox(new Date(Date.now() + 10000)); await outbox.recoverNotificationOutbox(new Date(Date.now() + 10000));
  assert.deepEqual(sent, [{ text: oldPayload.telegram, keyboard: oldPayload.keyboard }]); assert.deepEqual(db.notifications[0].payload, oldPayload);
  console.log("PASS manager dates: exact UA/EN Kyiv formatting; DST jumps/rollover; created/accepted/paid semantics; COD/Mono keyboards; new outbox timestamps and immutable historical delivery; no resend. All effects mocked.");
}
verify().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => { globalThis.fetch = savedFetch; });
