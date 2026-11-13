export const INVOICE_INITIALIZING = "INVOICE_INITIALIZING";
export const INVOICE_UNCERTAIN = "INVOICE_CREATE_UNCERTAIN";
export const INVOICE_INVALIDATED = "INVOICE_INITIALIZATION_INVALIDATED";

// NULL remains the accepted/legacy compatibility state. No historical backfill.
export function isUnacceptedOnlineOrder(order: { paymentProvider?: string | null; paymentErrorCode?: string | null }) {
  return order.paymentProvider === "mono" && [INVOICE_INITIALIZING, INVOICE_UNCERTAIN, INVOICE_INVALIDATED].includes(order.paymentErrorCode ?? "");
}
