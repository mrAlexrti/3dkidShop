import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { renderNotification, type OrderForNotification } from "./templates";
import { getNotificationSettings } from "./settings";
import { sendTelegramMessage, type TelegramInlineKeyboard } from "./telegram";
import { sendEmail } from "./email";
import type { DeliveryResult } from "./delivery";
import type { Locale } from "@/lib/i18n";

type Payload = { telegram: string; keyboard?: TelegramInlineKeyboard; to?: string; subject: string; html: string };

// Called only inside the financial-acceptance transaction. No external I/O.
// Initial PAID is part of ORDER_CREATED, never a second PAYMENT_PAID message.
export async function enqueueAcceptanceNotifications(tx: Prisma.TransactionClient, order: OrderForNotification, locale: Locale) {
  for (const channel of ["telegram", "email"] as const) {
    const message = renderNotification("ORDER_CREATED", order, channel === "telegram" ? "ua" : locale, channel);
    const payload: Payload = channel === "telegram"
      ? { telegram: message.telegram, ...(message.telegramKeyboard ? { keyboard: message.telegramKeyboard } : {}), subject: "", html: "" }
      : { telegram: "", to: order.customerEmail ?? "", subject: message.subject, html: message.html };
    const suppressed = order.paymentMode === "sandbox" || (channel === "email" && !order.customerEmail);
    await tx.orderNotification.create({ data: {
      orderId: order.id, event: "ORDER_CREATED", channel,
      payload: payload as unknown as Prisma.InputJsonValue,
      state: suppressed ? "SUPPRESSED" : "PENDING", nextAttemptAt: suppressed ? null : new Date(),
    } });
  }
}

export async function recoverNotificationOutbox(now = new Date()) {
  // An expired sender might have delivered before crashing. NEVER reclaim/send it.
  const expired = await prisma.orderNotification.updateMany({
    where: { state: "SENDING", leaseUntil: { lte: now } },
    data: { state: "UNKNOWN", nextAttemptAt: null, lastErrorCode: "SENDER_LEASE_EXPIRED" },
  });
  const due = await prisma.orderNotification.findMany({
    where: { state: { in: ["PENDING", "RETRY"] }, nextAttemptAt: { lte: now } },
    orderBy: [{ nextAttemptAt: "asc" }, { createdAt: "asc" }], take: 3,
  });
  let sent = 0; let unknown = expired.count; let retried = 0;
  for (const row of due) {
    const dispatchId = randomUUID();
    const claimed = await prisma.orderNotification.updateMany({
      where: { id: row.id, state: row.state, nextAttemptAt: row.nextAttemptAt, attemptCount: row.attemptCount },
      data: { state: "SENDING", dispatchId, leaseUntil: new Date(now.getTime() + 60000), nextAttemptAt: null, attemptCount: row.attemptCount + 1 },
    });
    if (claimed.count !== 1) continue;
    let result: DeliveryResult;
    let suppressed = false;
    // Failure before transport is definitely unsent. Once a send starts, thrown
    // errors have ambiguous delivery; do not guess from a timeout or HTTP 5xx.
    try {
      const settings = await getNotificationSettings();
      if (row.event !== "ORDER_CREATED" || (row.channel !== "telegram" && row.channel !== "email")) {
        result = { sent: false, reason: "INVALID_OUTBOX_EVENT", outcome: "permanent" };
      } else if (!settings[row.channel].ORDER_CREATED) {
        suppressed = true; result = { sent: false, reason: "CHANNEL_DISABLED", outcome: "permanent" };
      } else {
        const payload = row.payload as unknown as Payload;
        try {
          result = row.channel === "telegram"
            ? await sendTelegramMessage(payload.telegram, payload.keyboard)
            : await sendEmail({ to: payload.to, subject: payload.subject, html: payload.html });
        } catch { result = { sent: false, reason: "TRANSPORT_UNKNOWN", outcome: "unknown" }; }
      }
    } catch { result = { sent: false, reason: "SETTINGS_UNAVAILABLE", outcome: "retry" }; }
    const retry = !result.sent && result.outcome === "retry" && row.attemptCount < 7;
    const state = result.sent ? "SENT" : suppressed ? "SUPPRESSED" : retry ? "RETRY" : "UNKNOWN";
    const saved = await prisma.orderNotification.updateMany({
      where: { id: row.id, state: "SENDING", dispatchId },
      data: {
        state, leaseUntil: null,
        nextAttemptAt: retry ? new Date(now.getTime() + Math.min(3600000, 60000 * 2 ** row.attemptCount)) : null,
        sentAt: result.sent ? new Date() : null,
        providerMessageId: result.sent ? result.providerMessageId ?? null : null,
        lastErrorCode: result.sent ? null : result.reason,
      },
    });
    // A failed receipt write leaves SENDING and later UNKNOWN. Never re-send here.
    if (saved.count === 1) { if (state === "SENT") sent++; else if (state === "RETRY") retried++; else if (state === "UNKNOWN") unknown++; }
  }
  const unknownTotal = await prisma.orderNotification.count({ where: { state: "UNKNOWN" } });
  const dueRemaining = await prisma.orderNotification.count({ where: { state: { in: ["PENDING", "RETRY"] }, nextAttemptAt: { lte: now } } });
  return { sent, unknown, retried, unknownTotal, dueRemaining };
}
