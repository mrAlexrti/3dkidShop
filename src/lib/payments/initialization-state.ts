export const INVOICE_INITIALIZING = "INVOICE_INITIALIZING";
export const INVOICE_UNCERTAIN = "INVOICE_CREATE_UNCERTAIN";
export const INVOICE_INVALIDATED = "INVOICE_INITIALIZATION_INVALIDATED";

// NULL remains the accepted/legacy compatibility state. No historical backfill.
export function isUnacceptedOnlineOrder(order: { checkoutAcceptance?: string; paymentProvider?: string | null; paymentErrorCode?: string | null }) {
  if (order.checkoutAcceptance === "PROVISIONAL" || order.checkoutAcceptance === "REVIEW") return true;
  if (order.checkoutAcceptance === "ACCEPTED") return false;
  return order.paymentProvider === "mono" && [INVOICE_INITIALIZING, INVOICE_UNCERTAIN, INVOICE_INVALIDATED].includes(order.paymentErrorCode ?? "");
}
