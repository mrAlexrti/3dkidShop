import { orderSizeLabel } from "@/lib/product-variants";
import { getOrderResultPath } from "@/lib/payments/order-result";
import { translations, type Locale } from "@/lib/i18n";
import { statusLabels, type StatusSnapshot } from "@/lib/status";
import { readServerEnv } from "@/lib/server-env";
import type { NotificationEvent, NotificationChannel } from "./events";
import { orderWorkCallback } from "./telegram-actions";
import type { TelegramInlineKeyboard } from "./telegram";
import { formatOrderReference } from "@/lib/order-reference";

type Money = number | string | { toString(): string };
export type OrderForNotification = StatusSnapshot & {
  id: string; number: string; customerName: string; customerEmail?: string | null;
  customerPhone: string; shippingAddress: string; city: string; total: Money;
  paymentMode?: string | null;
  items: { productName: string; optionsJson: string | null; quantity: number; price: Money }[];
};
const escape = (value: string) => value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]!));
function siteUrl() {
  return (readServerEnv("NEXT_PUBLIC_SITE_URL") || readServerEnv("SITE_URL") || readServerEnv("NEXTAUTH_URL") || "https://www.3dkid.shop").replace(/\/$/, "");
}

export function renderNotification(event: NotificationEvent, order: OrderForNotification, locale: Locale = "ua", channel: NotificationChannel = "email") {
  const t = translations[locale].notifications;
  const labels = statusLabels(order, locale);
  const title = t.events[event];
  const adminUrl = `${siteUrl()}/admin/orders/${encodeURIComponent(order.id)}`;
  const work = translations[locale].statuses.work;
  const telegramKeyboard: TelegramInlineKeyboard | undefined = channel === "telegram" && event === "ORDER_CREATED" ? {
    inline_keyboard: [[{ text: work.take, callback_data: orderWorkCallback(order.id) }], [{ text: work.open, url: adminUrl }]],
  } : undefined;
  const total = new Intl.NumberFormat(locale === "en" ? "en-US" : "uk-UA", { style: "currency", currency: "UAH" }).format(Number(order.total.toString()));
  const lines = order.items.map((item) => {
    const size = orderSizeLabel(item.optionsJson, locale);
    return `${item.productName}${size ? ` (${size})` : ""} × ${item.quantity}`;
  });
  const context = [
    formatOrderReference(order.number, locale), `${t.total}: ${total}`,
    labels.order, labels.payment, labels.delivery,
    order.novaPoshtaTtn ? `${t.tracking}: ${order.novaPoshtaTtn}` : null,
  ].filter((line): line is string => Boolean(line));
  return {
    subject: `${title} · ${formatOrderReference(order.number, locale)} · 3D Kid`,
    telegram: [title, ...context, order.customerName, order.customerPhone, order.city, order.shippingAddress, ...lines].join("\n").slice(0, 3600) + `\n${adminUrl}`,
    telegramKeyboard,
    // Result capabilities are generated only for customer email, never Telegram.
    html: channel !== "email" ? "" : `<!doctype html><html lang="${locale === "ua" ? "uk" : "en"}"><meta charset="utf-8"><body style="font-family:Arial,sans-serif;color:#24191f;background:#fff7fb;padding:24px"><main style="max-width:640px;margin:auto;background:white;border-radius:24px;padding:28px"><p style="color:#f94f8e;font-weight:bold">3D Kid</p><h1>${escape(title)}</h1><p>${escape(order.customerName)}</p>${context.map((line) => `<p>${escape(line)}</p>`).join("")}<h2>${escape(t.items)}</h2><ul>${lines.map((line) => `<li>${escape(line)}</li>`).join("")}</ul><p>${escape(order.city)}, ${escape(order.shippingAddress)}</p><a href="${escape(siteUrl() + getOrderResultPath(order.number))}" style="color:#d13070">${escape(t.view)}</a></main></body></html>`,
  };
}
