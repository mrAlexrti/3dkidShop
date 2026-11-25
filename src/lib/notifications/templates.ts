import { orderSizeLabel } from "@/lib/product-variants";
import { getOrderResultPath } from "@/lib/payments/order-result";
import { translations, type Locale } from "@/lib/i18n";
import { normalizedStatuses, type StatusSnapshot } from "@/lib/status";
import { readServerEnv } from "@/lib/server-env";
import type { NotificationEvent, NotificationChannel } from "./events";
import { orderWorkCallback, codOrderCallback } from "./telegram-actions";
import { isCodActionEligible, isGenuineCod } from "@/lib/orders/cod-eligibility";
import { formatManagerDateTime } from "@/lib/date-time";
import type { TelegramInlineKeyboard } from "./telegram";
import { formatOrderReference } from "@/lib/order-reference";
import { DELIVERY_LABELS } from "@/lib/validations/checkout";
import { renderBrandedEmail, type EmailTone } from "./branded-email";

type Money = number | string | { toString(): string };
export type OrderForNotification = StatusSnapshot & {
  id: string; number: string | null; customerName: string; customerEmail?: string | null;
  checkoutAcceptance?: string;
  createdAt?: Date; acceptedAt?: Date | null;
  customerPhone: string; shippingAddress: string; city: string; total: Money;
  novaPoshtaCity?: string | null; novaPoshtaBranch?: string | null; shippingCost?: Money; deliveryMethod?: string | null;
  paymentMode?: string | null;
  items: { productName: string; optionsJson: string | null; quantity: number; price: Money }[];
};
const toneByStage: Record<string, EmailTone | undefined> = {
  PAID: "positive", COMPLETED: "positive", DELIVERED: "positive",
  PENDING: "attention", ARRIVED: "attention", RETURNED: "attention",
  CANCELLED: "negative", FAILED: "negative",
};
function siteUrl() {
  return (readServerEnv("NEXT_PUBLIC_SITE_URL") || readServerEnv("SITE_URL") || readServerEnv("NEXTAUTH_URL") || "https://www.3dkid.shop").replace(/\/$/, "");
}

export function renderNotification(event: NotificationEvent, order: OrderForNotification, locale: Locale = "ua", channel: NotificationChannel = "email") {
  if (!order.number) throw new Error("UNNUMBERED_ORDER_NOTIFICATION");
  const { notifications: t, statuses: statusCopy, checkout } = translations[locale];
  const stages = normalizedStatuses(order);
  const labels = { order: statusCopy.order[stages.order], payment: statusCopy.payment[stages.payment], delivery: statusCopy.delivery[stages.delivery] };
  const title = t.events[event];
  const adminUrl = `${siteUrl()}/admin/orders/${encodeURIComponent(order.id)}`;
  const work = translations[locale].statuses.work;
  const telegramKeyboard: TelegramInlineKeyboard | undefined = channel === "telegram" && event === "ORDER_CREATED" ? {
    inline_keyboard: [
      ...(isGenuineCod(order)
        ? isCodActionEligible(order) ? [[
          { text: translations[locale].statuses.cod.confirm, callback_data: codOrderCallback(order.id, "confirm") },
          { text: translations[locale].statuses.cod.cancel, callback_data: codOrderCallback(order.id, "cancel") },
        ]] : []
        : [[{ text: work.take, callback_data: orderWorkCallback(order.id) }]]),
      [{ text: work.open, url: adminUrl }],
    ],
  } : undefined;
  const currency = new Intl.NumberFormat(locale === "en" ? "en-US" : "uk-UA", { style: "currency", currency: "UAH" });
  const money = (value: Money) => currency.format(Number(value.toString()));
  const total = money(order.total);
  const reference = formatOrderReference(order.number, locale);
  const items = order.items.map((item) => {
    const size = orderSizeLabel(item.optionsJson, locale);
    return { ...item, name: size ? `${item.productName} (${size})` : item.productName };
  });
  const context = [
    reference, `${t.total}: ${total}`,
    order.createdAt ? `${t.created}: ${formatManagerDateTime(order.createdAt, locale)}` : null,
    order.paymentProvider === "mono" && order.acceptedAt ? `${t.accepted}: ${formatManagerDateTime(order.acceptedAt, locale)}` : null,
    order.paymentProvider && order.paidAt ? `${t.paid}: ${formatManagerDateTime(order.paidAt, locale)}` : null,
    labels.order, channel === "telegram" && event === "ORDER_CREATED" && order.checkoutAcceptance === "ACCEPTED" && order.paymentProvider === "mono" && order.paymentStatus === "PAID" && order.paidAt ? `${translations[locale].statuses.fields.payment}: ${t.paymentReceived}` : labels.payment, labels.delivery,
    order.novaPoshtaTtn ? `${t.tracking}: ${order.novaPoshtaTtn}` : null,
  ].filter((line): line is string => Boolean(line));
  const message = {
    subject: `${title} · ${reference} · 3D kid`,
    telegram: [title, ...context, order.customerName, order.customerPhone, order.city, order.shippingAddress,
      ...items.map(({ name, quantity }) => `${name} × ${quantity}`)].join("\n").slice(0, 3600) + `\n${adminUrl}`,
    telegramKeyboard,
  };
  if (channel !== "email") return { ...message, html: "", text: "" };

  const { mail } = t;
  const heading = mail.headings[event.startsWith("PAYMENT_") ? "payment" : event.startsWith("DELIVERY_") ? "delivery" : "order"];
  const intro = event === "ORDER_CONFIRMED" ? title : mail.intro[event];
  const address = order.novaPoshtaBranch
    ? [order.novaPoshtaCity || order.city, order.novaPoshtaBranch].filter(Boolean).join(", ")
    : order.shippingAddress || order.novaPoshtaCity || order.city;
  const delivery = (Object.keys(DELIVERY_LABELS) as (keyof typeof DELIVERY_LABELS)[])
    .find(key => key === order.deliveryMethod || DELIVERY_LABELS[key] === order.deliveryMethod);
  const deliveryLabels = { np_warehouse: checkout.delivery.warehouse, np_parcel_locker: checkout.delivery.locker, np_courier: checkout.delivery.courier };
  const shippingCost = order.shippingCost;
  const details = [
    delivery ? { label: mail.deliveryMethod, value: deliveryLabels[delivery] } : null,
    address ? { label: mail.deliveryDetails, value: address } : null,
    shippingCost != null && Number(shippingCost.toString()) > 0 ? { label: mail.shippingCost, value: money(shippingCost) } : null,
    order.novaPoshtaTtn ? { label: t.tracking, value: order.novaPoshtaTtn } : null,
  ].filter(field => field !== null);
  return { ...message, ...renderBrandedEmail({
    locale, title: heading, intro: order.customerName ? `${mail.greeting(order.customerName)} ${intro}` : intro,
    summary: { reference, total: { label: t.total, value: total } },
    statuses: [
      { label: mail.orderStatus, value: labels.order, tone: toneByStage[stages.order] ?? "neutral" },
      { label: mail.paymentStatus, value: labels.payment, tone: toneByStage[stages.payment] ?? "neutral" },
      { label: mail.deliveryStatus, value: labels.delivery, tone: toneByStage[stages.delivery] ?? "neutral" },
    ],
    items: { title: t.items, productLabel: mail.product, quantityLabel: mail.quantity, priceLabel: mail.unitPrice,
      lines: items.map(({ name, quantity, price }) => ({ name, quantity, unitPrice: money(price) })) },
    details,
    // Keeps the session-independent, status-only result capability for guests and customers.
    action: { label: t.view, url: siteUrl() + getOrderResultPath(order.number) },
  }) };
}
