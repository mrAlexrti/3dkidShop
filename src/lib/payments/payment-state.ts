export type PaymentResultState = "confirmed" | "pending" | "paid" | "failed" | "unavailable";
export type PaymentOrderState = { paymentProvider: string | null; paymentStatus: string | null; paymentMethod?: string; status: string; paidAt: Date | null };

export function paymentResultState(order: PaymentOrderState): PaymentResultState {
  if (["REFUNDED", "FAILED", "CANCELLED"].includes(order.paymentStatus ?? "")) return "failed";
  if (order.paymentProvider) {
    if (order.paymentStatus === "PAID" && order.paidAt) return "paid";
    return order.status === "CANCELLED" ? "failed" : "pending";
  }
  // Legacy online orders lack the provider snapshot. Never infer paid from a return URL.
  if (order.status === "AWAITING_PAYMENT" || /онлайн|online|liqpay/i.test(order.paymentMethod ?? "")) return order.status === "CANCELLED" ? "failed" : "pending";
  return order.status === "CANCELLED" ? "failed" : "confirmed";
}
