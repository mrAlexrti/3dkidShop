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
  const statusLabel = getOrderStatusLabel(order.status);
  const note = paymentNote(order);
  const orderUrl = `${siteUrl()}/checkout/success?order=${encodeURIComponent(order.number)}`;
  const brandPink = "#f94f8e";
  const softPink = "#fff0f6";
  const ink = "#24191f";
  const muted = "#7b6f75";

  const rows = order.items
    .map((item) => {
      const options = safeOptions(item.optionsJson);
      const itemPrice = numberFromMoney(item.price);
      const lineTotal = itemPrice * item.quantity;

      return `
        <tr>
          <td style="padding:16px 0;border-bottom:1px solid #f8dbe5;">
            <div style="font-size:15px;font-weight:700;color:${ink};">✔ ${escapeHtml(item.productName)}</div>
            ${options ? `<div style="margin-top:4px;font-size:13px;color:${muted};">${escapeHtml(options)}</div>` : ""}
          </td>
          <td style="padding:16px 8px;border-bottom:1px solid #f8dbe5;text-align:center;color:${muted};white-space:nowrap;">${item.quantity} шт.</td>
          <td style="padding:16px 0;border-bottom:1px solid #f8dbe5;text-align:right;color:${ink};white-space:nowrap;">${formatPrice(lineTotal)}</td>
        </tr>
      `;
    })
    .join("");

  return `
<!doctype html>
<html lang="uk">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Замовлення ${escapeHtml(order.number)} — 3D Kid</title>
  </head>
  <body style="margin:0;padding:0;background:#fff7fb;font-family:Arial,'Helvetica Neue',Helvetica,sans-serif;color:${ink};">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">
      Дякуємо за ваше замовлення ${escapeHtml(order.number)} у 3D Kid.
    </div>

    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#fff7fb;padding:28px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:680px;background:#ffffff;border-radius:28px;overflow:hidden;box-shadow:0 18px 48px rgba(249,79,142,0.14);">
            <tr>
              <td style="background:${brandPink};padding:28px 28px 36px;text-align:center;">
                <div style="display:inline-block;padding:10px 18px;border-radius:999px;background:rgba(255,255,255,0.18);color:#fff;font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;">
                  3D Kid
                </div>
                <h1 style="margin:22px 0 8px;color:#fff;font-size:30px;line-height:1.2;font-weight:800;">
                  Дякуємо за ваше замовлення ❤️
                </h1>
                <p style="margin:0;color:#ffe8f1;font-size:16px;">
                  Ми вже отримали його та готуємо до обробки.
                </p>
              </td>
            </tr>

            <tr>
              <td style="padding:30px 28px 8px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td style="padding:18px;border-radius:22px;background:${softPink};">
                      <div style="font-size:13px;color:${muted};text-transform:uppercase;letter-spacing:0.08em;font-weight:700;">Замовлення</div>
                      <div style="margin-top:6px;font-size:26px;font-weight:800;color:${ink};">№ ${escapeHtml(order.number)}</div>
                      <div style="margin-top:8px;font-size:14px;color:${muted};">${escapeHtml(formatDate(order.createdAt))}</div>
                    </td>
                    <td width="16"></td>
                    <td style="padding:18px;border-radius:22px;background:#f7fbff;text-align:right;">
                      <div style="font-size:13px;color:${muted};text-transform:uppercase;letter-spacing:0.08em;font-weight:700;">Сума</div>
                      <div style="margin-top:6px;font-size:28px;font-weight:900;color:${brandPink};">${formatPrice(numberFromMoney(order.total))}</div>
                      <div style="margin-top:8px;font-size:14px;color:${muted};">${escapeHtml(statusLabel)}</div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <tr>
              <td style="padding:22px 28px 0;">
                <h2 style="margin:0 0 12px;font-size:20px;color:${ink};">Товари</h2>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
                  <tbody>${rows}</tbody>
                </table>
              </td>
            </tr>

            <tr>
              <td style="padding:26px 28px 0;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#fff;border:1px solid #f8dbe5;border-radius:22px;">
                  <tr>
                    <td style="padding:18px 20px;">
                      <div style="font-size:14px;color:${muted};">Клієнт</div>
                      <div style="margin-top:4px;font-weight:700;color:${ink};">${escapeHtml(order.customerName)}</div>
                    </td>
                    <td style="padding:18px 20px;text-align:right;">
                      <div style="font-size:14px;color:${muted};">Телефон</div>
                      <div style="margin-top:4px;font-weight:700;color:${ink};">${escapeHtml(order.customerPhone)}</div>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:0 20px 18px;">
                      <div style="font-size:14px;color:${muted};">Оплата</div>
                      <div style="margin-top:4px;font-weight:700;color:${ink};">${escapeHtml(order.paymentMethod)}</div>
                    </td>
                    <td style="padding:0 20px 18px;text-align:right;">
                      <div style="font-size:14px;color:${muted};">Доставка</div>
                      <div style="margin-top:4px;font-weight:700;color:${ink};">${escapeHtml(deliveryLabel(order))}</div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <tr>
              <td style="padding:18px 28px 0;">
                <div style="padding:18px 20px;border-radius:22px;background:#fafafa;color:${ink};font-size:15px;line-height:1.6;">
                  <div><strong>Місто:</strong> ${escapeHtml(order.city)}</div>
                  <div><strong>Відділення / поштомат:</strong> ${escapeHtml(order.novaPoshtaBranch || order.shippingAddress)}</div>
                  ${order.comment ? `<div><strong>Коментар:</strong> ${escapeHtml(order.comment)}</div>` : ""}
                  ${note ? `<div style="margin-top:10px;color:${brandPink};"><strong>${escapeHtml(note)}</strong></div>` : ""}
                </div>
              </td>
            </tr>

            <tr>
              <td align="center" style="padding:30px 28px 12px;">
                <a href="${orderUrl}" style="display:inline-block;background:${brandPink};color:#ffffff;text-decoration:none;border-radius:999px;padding:15px 28px;font-size:16px;font-weight:800;box-shadow:0 10px 24px rgba(249,79,142,0.28);">
                  Переглянути замовлення
                </a>
              </td>
            </tr>

            <tr>
              <td style="padding:18px 28px 30px;text-align:center;color:${muted};font-size:14px;line-height:1.6;">
                <div style="height:1px;background:#f8dbe5;margin:0 0 18px;"></div>
                <div style="font-weight:700;color:${ink};">3D Kid</div>
                <div>Магазин 3D-друкованих товарів для українського ринку</div>
                <div style="margin-top:8px;">
                  <a href="${siteUrl()}" style="color:${brandPink};text-decoration:none;font-weight:700;">www.3dkid.shop</a>
                  <span style="color:#d8b8c3;"> • </span>
                  <a href="mailto:hello@3dkid.shop" style="color:${brandPink};text-decoration:none;font-weight:700;">hello@3dkid.shop</a>
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
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