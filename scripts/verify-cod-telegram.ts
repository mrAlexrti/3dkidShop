// Actual webhook/workflow/template sources with fake auth, DB and transports.
// No .env, PrismaClient, carrier/provider calls or real notifications.
import assert from "node:assert/strict";
import * as crypto from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { sourceModule } from "./source-module";
import { PaymentMemory, type Row } from "./payment-memory";
import * as acceptance from "../src/lib/payments/acceptance";
import * as eligibility from "../src/lib/orders/cod-eligibility";
import * as methods from "../src/lib/payments/payment-method";
import * as status from "../src/lib/status";
import * as events from "../src/lib/notifications/events";
import * as callbacks from "../src/lib/notifications/telegram-actions";
import { translations } from "../src/lib/i18n";

const savedFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error("EXTERNAL_EFFECT_FORBIDDEN"); };
const db = new PaymentMemory();
let reads = 0; let writes = 0; let race: Row | undefined;
const sequence: string[] = [];
const fixture = (): Row => ({ id: "qa-cod", number: "0001", checkoutAcceptance: "ACCEPTED", status: "PENDING",
  paymentMethod: "Накладений платіж", paymentProvider: null, paymentInvoiceId: null, paymentStatus: "PENDING", paidAt: null,
  acceptedAt: new Date("2026-11-15T20:30:00Z"), createdAt: new Date("2026-11-15T20:30:00Z"),
  novaPoshtaTtn: null, novaPoshtaTtnRef: null, novaPoshtaCreatedAt: null, novaPoshtaSyncedAt: null, novaPoshtaDeliveredAt: null,
  novaPoshtaStatus: null, novaPoshtaStatusCode: null, novaPoshtaCodStatus: null, novaPoshtaCodStatusCode: null,
  novaPoshtaCityRef: "qa-city", novaPoshtaBranchRef: "qa-branch", novaPoshtaCodAmount: "199.00", items: [],
});
function reset(patch: Row = {}) { db.orders = [{ ...fixture(), ...patch }]; db.events = []; sequence.length = 0; race = undefined; writes = 0; }
const work = sourceModule<typeof import("../src/lib/orders/take-into-work")>("src/lib/orders/take-into-work.ts", {
  "./cod-eligibility": eligibility, "@/lib/payments/payment-method": methods, "@/lib/payments/acceptance": acceptance, "@/lib/status": status,
  "@/lib/prisma": { prisma: { order: {
    findUnique: async (args: { where: Row }) => { reads++; return db.order.findUnique(args); },
    updateMany: async (args: { where: Row; data: Row }) => {
      assert.deepEqual(Object.keys(args.data), ["status"]);
      if (race) { Object.assign(db.orders[0], race); race = undefined; }
      const changed = await db.order.updateMany(args); writes += changed.count; return changed;
    },
  } } },
  "@/lib/notifications/orders": { emitOrderEvents: async (before: never, after: never) => {
    sequence.push("notify"); db.events.push(...events.notificationEvents(before, after)); return false;
  } },
});
const env: Record<string, string> = { TELEGRAM_WEBHOOK_SECRET: "qa-secret", TELEGRAM_ADMIN_CHAT_ID: "12345", TELEGRAM_BOT_TOKEN: "qa-bot" };
const answers: string[] = [];
const route = sourceModule<typeof import("../src/app/api/telegram/webhook/route")>("src/app/api/telegram/webhook/route.ts", {
  "node:crypto": crypto, "next/server": { NextResponse }, "next/cache": { revalidatePath: () => {} }, zod: { z },
  "@/lib/i18n": { translations }, "@/lib/notifications/telegram-actions": callbacks, "@/lib/orders/take-into-work": work,
  "@/lib/server-env": { readServerEnv: (name: string) => env[name] ?? "" },
  "@/lib/notifications/telegram": { answerTelegramCallback: async (_id: string, text: string) => { sequence.push("answer"); answers.push(text); return { sent: true }; } },
});
const callback = (action: "confirm" | "cancel") => ({ update_id: 1, callback_query: { id: "qa-query", data: callbacks.codOrderCallback("qa-cod", action), from: { id: 12345, is_bot: false }, message: { chat: { id: 12345, type: "private" } } } });
const post = (body: unknown, secret = "qa-secret") => route.POST(new Request("https://qa.invalid/api/telegram/webhook", { method: "POST", headers: { "X-Telegram-Bot-Api-Secret-Token": secret }, body: JSON.stringify(body) }));

async function verify() {
  for (const action of ["confirm", "cancel"] as const) {
    const payload = callbacks.codOrderCallback("a".repeat(48), action);
    assert.ok(Buffer.byteLength(payload) <= 64); assert.deepEqual(callbacks.parseCodOrderCallback(payload), { id: "a".repeat(48), action });
    for (const id of ["", "a".repeat(49), "../bad", "qa\n", "qa ", "замовлення"]) assert.throws(() => callbacks.codOrderCallback(id, action));
    for (const value of [payload + "\n", payload + " ", payload + "a", "oc1:", "oc1:../bad", "ox2:qa", null, {}, 123]) assert.equal(callbacks.parseCodOrderCallback(value), null);
    reset(); const before = structuredClone(db.orders[0]);
    assert.equal((await post(callback(action))).status, 200);
    const target = action === "confirm" ? "PROCESSING" : "CANCELLED";
    assert.deepEqual(db.orders[0], { ...before, status: target });
    assert.equal(writes, 1); assert.deepEqual(db.events, [action === "confirm" ? "ORDER_PROCESSING" : "ORDER_CANCELLED"]);
    assert.deepEqual(sequence, ["answer", "notify"], "Answer before potentially slow transports");
    assert.equal(answers.at(-1), action === "confirm" ? translations.ua.statuses.cod.confirmed : translations.ua.statuses.cod.cancelled);
    for (const repeat of [action, "confirm", "cancel"] as const) assert.equal((await post(callback(repeat))).status, 200);
    assert.equal(writes, 1); assert.equal(db.events.length, 1);
    assert.ok(answers.at(-1)!.includes(translations.ua.statuses.cod.states[target]));
  }
  // Every authorization failure must happen before the first read, not just write.
  for (const action of ["confirm", "cancel"] as const) {
    reset(); const before = reads;
    assert.equal((await post(callback(action), "forged")).status, 401);
    const wrongUser = callback(action); wrongUser.callback_query.from.id = 777; assert.equal((await post(wrongUser)).status, 403);
    const wrongChat = callback(action); wrongChat.callback_query.message.chat.id = 777; assert.equal((await post(wrongChat)).status, 403);
    const group = callback(action); group.callback_query.message.chat.type = "group"; assert.equal((await post(group)).status, 400);
    const bot = callback(action); bot.callback_query.from.is_bot = true; assert.equal((await post(bot)).status, 400);
    assert.equal(reads, before); assert.equal(writes, 0);
    for (const patch of [
      { status: "PROCESSING" }, { status: "SHIPPED" }, { status: "DELIVERED" }, { status: "COMPLETED" }, { status: "CANCELLED" },
      { status: "PAID" }, { status: "AWAITING_PAYMENT" }, { checkoutAcceptance: "PROVISIONAL" }, { checkoutAcceptance: "REVIEW" }, { number: null },
      { paymentMethod: "card_online" }, { paymentMethod: "not cod" }, { paymentProvider: "mono" }, { paymentProvider: "liqpay" }, { paymentInvoiceId: "qa-invoice" },
      { paidAt: new Date() }, { paymentStatus: "PAID" }, { paymentStatus: "REFUNDED" }, { paymentStatus: "UNKNOWN" },
      { novaPoshtaTtn: "qa-ttn" }, { novaPoshtaTtnRef: "qa-ref" }, { novaPoshtaCreatedAt: new Date() }, { novaPoshtaSyncedAt: new Date() },
      { novaPoshtaDeliveredAt: new Date() }, { novaPoshtaStatus: "in transit" }, { novaPoshtaStatusCode: "9" }, { novaPoshtaCodStatus: "paid" }, { novaPoshtaCodStatusCode: "paid" },
    ]) {
      reset(patch); const snapshot = structuredClone(db.orders[0]);
      assert.equal((await post(callback(action))).status, 200);
      assert.deepEqual(db.orders[0], snapshot); assert.equal(writes, 0); assert.equal(db.events.length, 0);
      if (patch.status) assert.ok(answers.at(-1)!.includes(translations.ua.statuses.cod.states[patch.status as keyof typeof translations.ua.statuses.cod.states]));
    }
    for (const patch of [{ novaPoshtaTtn: "racing-ttn" }, { paidAt: new Date() }, { paymentProvider: "mono" }, { paymentInvoiceId: "racing-invoice" }, { paymentMethod: "card_online" }, { checkoutAcceptance: "REVIEW" }, { status: "SHIPPED" }]) {
      reset(); const before = structuredClone(db.orders[0]); race = patch;
      assert.equal((await post(callback(action))).status, 200);
      assert.deepEqual(db.orders[0], { ...before, ...patch }); assert.equal(writes, 0); assert.equal(db.events.length, 0);
    }
  }
  for (const first of ["confirm", "cancel"] as const) {
    reset(); const before = structuredClone(db.orders[0]);
    await Promise.all([post(callback(first)), post(callback(first === "confirm" ? "cancel" : "confirm")), post(callback(first))]);
    assert.equal(writes, 1); assert.equal(db.events.length, 1);
    assert.ok(["PROCESSING", "CANCELLED"].includes(String(db.orders[0].status)));
    assert.deepEqual(db.orders[0], { ...before, status: db.orders[0].status });
  }
  reset(); await Promise.all([work.takeOrderIntoWork("qa-cod"), post(callback("cancel"))]);
  assert.equal(writes, 1); assert.equal(db.events.length, 1);
  // Old COD keyboards cannot bypass new guards; online ow1 remains functional.
  reset({ novaPoshtaTtn: "existing-ttn" }); const old = callback("confirm"); old.callback_query.data = callbacks.orderWorkCallback("qa-cod");
  await post(old); assert.equal(writes, 0); assert.ok(answers.at(-1)!.includes(translations.ua.statuses.cod.ineligible));
  reset({ paymentMethod: "card_online", paymentProvider: "mono", paymentInvoiceId: "qa-invoice", paymentStatus: "PAID", paidAt: new Date(), novaPoshtaTtn: "existing-ttn" });
  const online = structuredClone(db.orders[0]); await post(old);
  assert.deepEqual(db.orders[0], { ...online, status: "PROCESSING" }); assert.deepEqual(db.events, ["ORDER_PROCESSING"]);
  console.log("PASS COD Telegram: bounded payloads; owner/secret authorization before reads; operational-only writes; financial/carrier preservation; confirm/cancel/admin races; idempotency; eligibility/CAS/terminal/stale guards; historical ow1; prompt acknowledgement. All effects mocked.");
}
verify().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => { globalThis.fetch = savedFetch; });
