import type { OrderStatus } from "@prisma/client";
import { getOrderStatusLabel } from "@/lib/order-status";
import { formatPrice } from "@/lib/utils";
import { sendEmail } from "@/lib/notifications/email";
import { sendTelegramMessage } from "@/lib/notifications/telegram";

type MoneyLike = number | string | { toString(): string };

type OrderForNotification = {
  id: string;
  number: string;
  status: OrderStatus;
  customerName: string;
  customerEmail?: string | null;
  customerPhone: string;
  shippingAddress: string;
  deliveryMethod?: string | null;
  city: string;
  novaPoshtaBranch?: string | null;
  comment?: string | null;
  paymentMethod: string;
  paidAt?: Date | null;
  total: MoneyLike;
  createdAt: Date;
  novaPoshtaTtn?: string | null;
  items: {
    productName: string;
    optionsJson: string | null;
    quantity: number;
    price: MoneyLike;
  }[];
};

type StatusChangeSource = "LiqPay" | "Нова Пошта" | "Адмінка" | "Створення ТТН";

function readEnv(name: string) {
  const value = process.env[name]?.trim() ?? "";
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1).trim();
  }

  return value;
}

function getSiteUrl() {
  return (readEnv("NEXT_PUBLIC_SITE_URL") || readEnv("SITE_URL") || readEnv("NEXTAUTH_URL") || "https://www.3dkid.shop").replace(/\/$/, "");
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function numberFromMoney(value: MoneyLike) {
  const parsed = Number(typeof value === "object" ? value.toString() : value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("uk-UA", { dateStyle: "medium", timeStyle: "short" }).format(value);
}

function safeOptions(optionsJson: string | null) {
  if (!optionsJson) return "";

  try {
    return Object.values(JSON.parse(optionsJson)).join(", ");
  } catch {
    return "";
  }
}

function deliveryLabel(order: OrderForNotification) {
  if (order.deliveryMethod === "np_warehouse") return "Відділення Нової Пошти";
  if (order.deliveryMethod === "np_parcel_locker") return "Поштомат Нової Пошти";
  if (order.deliveryMethod === "np_courier") return "Курʼєр Нової Пошти";
  return order.deliveryMethod || order.shippingAddress;
}

function paymentNote(order: OrderForNotification) {
  const payment = order.paymentMethod.toLowerCase();
  if (payment.includes("карт") || payment.includes("online") || payment.includes("liqpay")) {
    return order.paidAt || order.status === "PAID" || order.status === "COMPLETED"
      ? "Оплату підтверджено."
      : "Оплата ще очікується. Якщо ви вже оплатили, статус оновиться після підтвердження LiqPay.";
  }

  if (payment.includes("наклад")) return "Оплата буде при отриманні у Новій Пошті.";
  return "";
}

function adminOrderUrl(order: OrderForNotification) {
  return `${getSiteUrl()}/admin/orders/${order.id}`;
}

function siteUrl() {
  return getSiteUrl();
}

function productLines(order: OrderForNotification) {
  return order.items
    .map((item) => {
      const options = safeOptions(item.optionsJson);
      const itemPrice = numberFromMoney(item.price);
      const lineTotal = itemPrice * item.quantity;
      return `• ${item.productName}${options ? ` (${options})` : ""} — ${item.quantity} × ${formatPrice(itemPrice)} = ${formatPrice(lineTotal)}`;
    })
    .join("\n");
}

function renderCustomerOrderEmail(order: OrderForNotification) {
  const rows = order.items
    .map((item) => {
      const options = safeOptions(item.optionsJson);
      const itemPrice = numberFromMoney(item.price);
      const lineTotal = itemPrice * item.quantity;

      return `
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #ffe2ea;">
            <strong>${escapeHtml(item.productName)}</strong>
            ${options ? `<div style="color:#7a6d72;font-size:13px;">${escapeHtml(options)}</div>` : ""}
          </td>
          <td style="padding:8px 0;border-bottom:1px solid #ffe2ea;text-align:center;">${item.quantity}</td>
          <td style="padding:8px 0;border-bottom:1px solid #ffe2ea;text-align:right;">${formatPrice(itemPrice)}</td>
          <td style="padding:8px 0;border-bottom:1px solid #ffe2ea;text-align:right;">${formatPrice(lineTotal)}</td>
        </tr>
      `;
    })
    .join("");

  const note = paymentNote(order);

  return `
    <div style="font-family:Arial,sans-serif;color:#221a1d;line-height:1.5;max-width:720px;margin:0 auto;">
      <h1 style="color:#ff4d81;">Дякуємо за замовлення!</h1>
      <p>Ваше замовлення <strong>${escapeHtml(order.number)}</strong> прийнято.</p>
      <p><strong>Дата:</strong> ${escapeHtml(formatDate(order.createdAt))}</p>
      <p><strong>Клієнт:</strong> ${escapeHtml(order.customerName)}</p>
      <table style="width:100%;border-collapse:collapse;margin:20px 0;">
        <thead>
          <tr>
            <th style="text-align:left;padding-bottom:8px;">Товар</th>
            <th style="text-align:center;padding-bottom:8px;">К-сть</th>
            <th style="text-align:right;padding-bottom:8px;">Ціна</th>
            <th style="text-align:right;padding-bottom:8px;">Сума</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <p><strong>Загальна сума:</strong> ${formatPrice(numberFromMoney(order.total))}</p>
      <p><strong>Спосіб оплати:</strong> ${escapeHtml(order.paymentMethod)}</p>
      <p><strong>Статус:</strong> ${escapeHtml(getOrderStatusLabel(order.status))}</p>
      ${note ? `<p><strong>Оплата:</strong> ${escapeHtml(note)}</p>` : ""}
      <p><strong>Доставка:</strong> ${escapeHtml(deliveryLabel(order))}</p>
      <p><strong>Місто:</strong> ${escapeHtml(order.city)}</p>
      <p><strong>Відділення / поштомат:</strong> ${escapeHtml(order.novaPoshtaBranch || order.shippingAddress)}</p>
      ${order.comment ? `<p><strong>Коментар:</strong> ${escapeHtml(order.comment)}</p>` : ""}
      <p><a href="${siteUrl()}" style="color:#ff4d81;">Перейти на сайт 3D Kid</a></p>
    </div>
  `;
}

function renderTelegramNewOrder(order: OrderForNotification) {
  return [
    "🆕 Нове замовлення",
    `№: ${order.number}`,
    `Дата: ${formatDate(order.createdAt)}`,
    `Клієнт: ${order.customerName}`,
    `Телефон: ${order.customerPhone}`,
    order.customerEmail ? `Email: ${order.customerEmail}` : null,
    `Сума: ${formatPrice(numberFromMoney(order.total))}`,
    `Оплата: ${order.paymentMethod}`,
    `Статус: ${getOrderStatusLabel(order.status)}`,
    `Доставка: ${deliveryLabel(order)}`,
    `Місто: ${order.city}`,
    `Відділення / поштомат: ${order.novaPoshtaBranch || order.shippingAddress}`,
    "Товари:",
    productLines(order),
    order.comment ? `Коментар: ${order.comment}` : null,
    `Адмінка: ${adminOrderUrl(order)}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function renderTelegramStatusChanged({
  order,
  previousStatus,
  nextStatus,
  source,
}: {
  order: OrderForNotification;
  previousStatus: OrderStatus;
  nextStatus: OrderStatus;
  source: StatusChangeSource;
}) {
  return [
    "🔄 Статус замовлення змінено",
    `№: ${order.number}`,
    `Було: ${getOrderStatusLabel(previousStatus)}`,
    `Стало: ${getOrderStatusLabel(nextStatus)}`,
    `Джерело: ${source}`,
    order.novaPoshtaTtn ? `ТТН: ${order.novaPoshtaTtn}` : null,
    `Сума: ${formatPrice(numberFromMoney(order.total))}`,
    `Адмінка: ${adminOrderUrl(order)}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export async function sendCustomerOrderEmail(order: OrderForNotification) {
  if (!order.customerEmail) return false;

  const result = await sendEmail({
    to: order.customerEmail,
    subject: `Замовлення ${order.number} — 3D Kid`,
    html: renderCustomerOrderEmail(order),
  });

  return result.sent;
}

export async function notifyNewOrder(order: OrderForNotification) {
  await sendTelegramMessage(renderTelegramNewOrder(order));
}

export async function notifyOrderCreated(order: OrderForNotification) {
  const [emailResult] = await Promise.allSettled([
    sendCustomerOrderEmail(order),
    notifyNewOrder(order),
  ]);

  return emailResult.status === "fulfilled" ? emailResult.value : false;
}

export async function notifyOrderStatusChanged({
  order,
  previousStatus,
  nextStatus,
  source,
}: {
  order: OrderForNotification;
  previousStatus: OrderStatus;
  nextStatus: OrderStatus;
  source: StatusChangeSource;
}) {
  if (previousStatus === nextStatus) return;

  await sendTelegramMessage(renderTelegramStatusChanged({ order, previousStatus, nextStatus, source }));
}