import { formatPrice } from "@/lib/utils";

type MoneyLike = number | string | { toString(): string };

type OrderForEmail = {
  number: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  shippingAddress: string;
  paymentMethod: string;
  total: MoneyLike;
  items: {
    productName: string;
    optionsJson: string | null;
    quantity: number;
    price: MoneyLike;
  }[];
};

type SendEmailResult =
  | { sent: true }
  | { sent: false; reason: "not_configured" | "request_failed" };

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getEmailConfig() {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();

  if (!apiKey || !from) return null;

  return {
    apiKey,
    from,
    adminEmail: process.env.ADMIN_EMAIL?.trim(),
  };
}

async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string | string[];
  subject: string;
  html: string;
}): Promise<SendEmailResult> {
  const config = getEmailConfig();
  if (!config) return { sent: false, reason: "not_configured" };

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: config.from,
      to,
      subject,
      html,
    }),
  });

  if (!response.ok) {
    console.error("Failed to send email", await response.text().catch(() => ""));
    return { sent: false, reason: "request_failed" };
  }

  return { sent: true };
}

function renderOrderEmail(order: OrderForEmail) {
  const rows = order.items
    .map((item) => {
      const options = item.optionsJson ? Object.values(JSON.parse(item.optionsJson)).join(", ") : "";
      const lineTotal = Number(item.price.toString()) * item.quantity;

      return `
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #ffe2ea;">
            <strong>${escapeHtml(item.productName)}</strong>
            ${options ? `<div style="color:#7a6d72;font-size:13px;">${escapeHtml(options)}</div>` : ""}
          </td>
          <td style="padding:8px 0;border-bottom:1px solid #ffe2ea;text-align:center;">${item.quantity}</td>
          <td style="padding:8px 0;border-bottom:1px solid #ffe2ea;text-align:right;">${formatPrice(lineTotal)}</td>
        </tr>
      `;
    })
    .join("");

  return `
    <div style="font-family:Arial,sans-serif;color:#221a1d;line-height:1.5;">
      <h1 style="color:#ff4d81;">Дякуємо за замовлення!</h1>
      <p>Ваше замовлення <strong>${escapeHtml(order.number)}</strong> прийнято.</p>
      <table style="width:100%;border-collapse:collapse;margin:20px 0;">
        <thead>
          <tr>
            <th style="text-align:left;padding-bottom:8px;">Товар</th>
            <th style="text-align:center;padding-bottom:8px;">К-сть</th>
            <th style="text-align:right;padding-bottom:8px;">Сума</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <p><strong>До оплати:</strong> ${formatPrice(Number(order.total.toString()))}</p>
      <p><strong>Оплата:</strong> ${escapeHtml(order.paymentMethod)}</p>
      <p><strong>Доставка:</strong> ${escapeHtml(order.shippingAddress)}</p>
      <p><strong>Телефон:</strong> ${escapeHtml(order.customerPhone)}</p>
      <p style="color:#7a6d72;">Ми зв'яжемося з вами щодо відправки.</p>
    </div>
  `;
}

export async function sendOrderConfirmationEmail(order: OrderForEmail) {
  const customerResult = await sendEmail({
    to: order.customerEmail,
    subject: `Замовлення ${order.number} — 3D Kid`,
    html: renderOrderEmail(order),
  });

  const config = getEmailConfig();
  if (config?.adminEmail) {
    await sendEmail({
      to: config.adminEmail,
      subject: `Нове замовлення ${order.number}`,
      html: renderOrderEmail(order),
    });
  }

  return customerResult.sent;
}
