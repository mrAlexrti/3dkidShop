// Display eligibility is deliberately narrower than a failed result label (which
// can also represent a refund). The server re-verifies Mono before permitting a retry.
export function canStartNewPayment(order: {
  checkoutAcceptance?: string; paymentMethod?: string; paymentProvider?: string | null;
  paymentStatus?: string | null; paymentProviderStatus?: string | null;
  paymentErrorCode?: string | null; paymentInvoiceId?: string | null;
  paidAt?: Date | null; number?: string | null; status?: string;
  novaPoshtaTtn?: string | null; novaPoshtaDeliveredAt?: Date | null;
}) {
  return order.checkoutAcceptance === "PROVISIONAL" && order.number === null &&
    order.paymentProvider === "mono" &&
    order.status === "PENDING" && !order.paidAt && !order.novaPoshtaTtn && !order.novaPoshtaDeliveredAt &&
    !!order.paymentInvoiceId && ["FAILED", "CANCELLED"].includes(order.paymentStatus ?? "") &&
    ["failure", "expired"].includes(order.paymentProviderStatus ?? "") &&
    /^(PAYMENT_FAILED|INVOICE_EXPIRED|PROVIDER_[A-Za-z0-9_-]+)$/.test(order.paymentErrorCode ?? "");
}
