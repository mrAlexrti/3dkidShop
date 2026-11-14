export type PaymentResultState = "confirmed" | "pending" | "paid" | "failed" | "cancelled" | "expired" | "unknown" | "review" | "unavailable";
export type PaymentOrderState = { checkoutAcceptance?: string; paymentProvider: string | null; paymentStatus: string | null; paymentMethod?: string; status: string; paidAt: Date | null; paymentProviderStatus?: string | null; paymentErrorCode?: string | null };

export function paymentResultState(order: PaymentOrderState): PaymentResultState {
  if (["PROVISIONAL", "REVIEW"].includes(order.checkoutAcceptance ?? "") && order.paidAt) return "review";
  if (order.paymentStatus === "CANCELLED") return order.paymentProviderStatus === "expired" ? "expired" : "cancelled";
  if (["REFUNDED", "FAILED"].includes(order.paymentStatus ?? "")) return "failed";
  if (order.paymentProvider) {
    if (order.paymentErrorCode === "LATE_PAYMENT_REVIEW" && order.paidAt) return "review";
    if (order.paymentErrorCode === "REFUND_RECONCILIATION_REQUIRED" || order.paymentStatus === "UNKNOWN") return "unknown";
    if (order.paymentStatus === "PAID" && order.paidAt) return "paid";
    if (order.paymentStatus && order.paymentStatus !== "PENDING") return "unknown";
    return order.status === "CANCELLED" ? "failed" : "pending";
  }
  // Legacy online orders lack the provider snapshot. Never infer paid from a return URL.
  if (order.status === "AWAITING_PAYMENT" || /онлайн|online|liqpay/i.test(order.paymentMethod ?? "")) return order.status === "CANCELLED" ? "failed" : "pending";
  return order.status === "CANCELLED" ? "failed" : "confirmed";
}
