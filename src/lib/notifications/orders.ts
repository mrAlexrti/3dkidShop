import { sendEmail } from "./email";
import { sendTelegramMessage } from "./telegram";
import { getNotificationSettings } from "./settings";
import { notificationEvents, type NotificationChannel } from "./events";
import { renderNotification, type OrderForNotification } from "./templates";
import type { Locale } from "@/lib/i18n";
import { isUnacceptedOnlineOrder } from "@/lib/payments/initialization-state";

// Only the winner of a persisted transition calls this dispatcher.
export async function emitOrderEvents(before: OrderForNotification | null, order: OrderForNotification, locale: Locale = "ua", onlyChannel?: NotificationChannel) {
  if (order.paymentMode === "sandbox") return false;
  // Initial new Mono acceptance is exclusively dispatched from its durable row.
  if (!before && order.checkoutAcceptance === "ACCEPTED" && order.paymentProvider === "mono") return false;
  if (isUnacceptedOnlineOrder(order) || (before && isUnacceptedOnlineOrder(before))) return false;
  const events = notificationEvents(before, order);
  if (events.length === 0) return false;
  let emailSent = false;
  try {
    const settings = await getNotificationSettings();
    for (const event of events) {
      const results = await Promise.allSettled((["telegram", "email"] as const).map(async (channel) => {
        if ((onlyChannel && onlyChannel !== channel) || !settings[channel][event] || (channel === "email" && !order.customerEmail)) return false;
        const message = renderNotification(event, order, channel === "telegram" ? "ua" : locale, channel);
        const result = channel === "telegram"
          ? await sendTelegramMessage(message.telegram, message.telegramKeyboard)
          : await sendEmail({ to: order.customerEmail, subject: message.subject, html: message.html });
        return channel === "email" && result.sent;
      }));
      emailSent ||= results.some((result) => result.status === "fulfilled" && result.value);
    }
  } catch {
    console.warn("Order notification skipped: settings or template unavailable.");
  }
  return emailSent;
}

export async function notifyOrderCreated(order: OrderForNotification, locale: Locale = "ua") {
  return emitOrderEvents(null, order, locale);
}

export async function sendCustomerOrderEmail(order: OrderForNotification, locale: Locale = "ua") {
  return emitOrderEvents(null, order, locale, "email");
}
