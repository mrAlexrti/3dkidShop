import { translations, type Locale } from "@/lib/i18n";

export type OrderStage = "NEW" | "CONFIRMED" | "PROCESSING" | "COMPLETED" | "CANCELLED";
export type PaymentStage = "PENDING" | "PAID" | "FAILED" | "CANCELLED" | "REFUNDED" | "UNKNOWN";
export type DeliveryStage = "NOT_CREATED" | "TTN_CREATED" | "SHIPPED" | "IN_TRANSIT" | "ARRIVED" | "DELIVERED" | "RETURNED" | "UNKNOWN";
export type StatusSnapshot = {
  status: string;
  paymentProvider?: string | null;
  paymentStatus?: string | null;
  paymentMethod?: string;
  paidAt?: Date | null;
  novaPoshtaTtn?: string | null;
  novaPoshtaStatus?: string | null;
  novaPoshtaStatusCode?: string | null;
  novaPoshtaDeliveredAt?: Date | null;
};

export function normalizeStatusText(value?: string | null) {
  return (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

// Batch 1.5.1 compatibility: exact positive text only, canonical code 9,
// no guessed COD numeric codes and no substring/negation matching.
const deliveredText = new Set(["отримано", "доставлено", "получено", "delivered", "received"]);
const codPaidText = new Set(["оплачено", "отримано", "получено", "перераховано", "зараховано", "paid", "received"]);
export function isNovaPoshtaDelivered(status: { status: string; statusCode: string }) {
  return normalizeStatusText(status.statusCode) === "9" || deliveredText.has(normalizeStatusText(status.status));
}
export function isNovaPoshtaCodPaid(status: { codStatus: string; codStatusCode: string }) {
  return codPaidText.has(normalizeStatusText(status.codStatus) || normalizeStatusText(status.codStatusCode));
}

// Nonterminal/return text aliases are deliberately exact. New provider codes must
// be verified before adding them; refusal/return requested does not mean returned.
const deliveryText: Record<string, DeliveryStage> = {
  "прийнято перевізником": "SHIPPED", "передано перевізнику": "SHIPPED", "handed to carrier": "SHIPPED",
  "у дорозі": "IN_TRANSIT", "in transit": "IN_TRANSIT",
  "готово до отримання": "ARRIVED", "ready for pickup": "ARRIVED",
  "повернуто відправнику": "RETURNED", "returned to sender": "RETURNED",
};

export function normalizeOrderStage(status: string): OrderStage {
  switch (status) {
    case "CANCELLED": return "CANCELLED";
    case "COMPLETED": return "COMPLETED";
    case "PROCESSING": return "PROCESSING";
    // Legacy financial/carrier enum values do not prove manual acceptance.
    // Preserve their raw values for diagnostics; never manufacture an in-work fact.
    default: return "NEW";
  }
}

export function normalizePaymentStage(order: StatusSnapshot): PaymentStage {
  const payment = order.paymentStatus;
  if (payment === "FAILED" || payment === "CANCELLED" || payment === "REFUNDED" || payment === "PENDING") return payment;
  // Online payment still needs the validated provider snapshot AND paidAt.
  if (order.paymentProvider) return payment === "PAID" && order.paidAt ? "PAID" : payment == null ? "PENDING" : "UNKNOWN";
  // Historical online flags predate validated callbacks. Keep them pending.
  if (order.status === "AWAITING_PAYMENT" || /онлайн|online|liqpay/i.test(order.paymentMethod ?? "")) return "PENDING";
  if (payment && payment !== "PAID") return "UNKNOWN";
  return order.paidAt ? "PAID" : "PENDING";
}

export function normalizeDeliveryStage(order: StatusSnapshot): DeliveryStage {
  // A return snapshot takes precedence over an earlier delivery timestamp.
  const text = normalizeStatusText(order.novaPoshtaStatus);
  const textStage = Object.hasOwn(deliveryText, text) ? deliveryText[text] : undefined;
  if (textStage === "RETURNED") return textStage;
  if (order.novaPoshtaDeliveredAt || isNovaPoshtaDelivered({ status: order.novaPoshtaStatus ?? "", statusCode: order.novaPoshtaStatusCode ?? "" })) return "DELIVERED";
  if (textStage) return textStage;
  if (!order.novaPoshtaTtn) return "NOT_CREATED";
  if (!order.novaPoshtaStatus && !order.novaPoshtaStatusCode) return "TTN_CREATED";
  return "UNKNOWN";
}

export function normalizedStatuses(order: StatusSnapshot) {
  return { order: normalizeOrderStage(order.status), payment: normalizePaymentStage(order), delivery: normalizeDeliveryStage(order) };
}
export function statusLabels(order: StatusSnapshot, locale: Locale = "ua") {
  const stages = normalizedStatuses(order);
  const labels = translations[locale].statuses;
  return { order: labels.order[stages.order], payment: labels.payment[stages.payment], delivery: labels.delivery[stages.delivery] };
}
