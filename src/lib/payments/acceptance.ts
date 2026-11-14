import type { Prisma } from "@prisma/client";

export const INITIALIZATION_MARKERS = ["INVOICE_INITIALIZING", "INVOICE_CREATE_UNCERTAIN", "INVOICE_INITIALIZATION_INVALIDATED"];
type AcceptanceSnapshot = { checkoutAcceptance?: string; number?: string | null; paymentProvider?: string | null; paymentErrorCode?: string | null };

// Missing lifecycle belongs only to pre-expansion fixtures/legacy snapshots.
export function isOperationalOrder<T extends AcceptanceSnapshot>(order: T): order is T & { number: string } {
  if (order.checkoutAcceptance === "PROVISIONAL" || order.checkoutAcceptance === "REVIEW") return false;
  if (order.number === null) return false;
  if (order.checkoutAcceptance === "ACCEPTED") return true;
  return !(order.paymentProvider === "mono" && INITIALIZATION_MARKERS.includes(order.paymentErrorCode ?? ""));
}

export const operationalOrderWhere: Prisma.OrderWhereInput = {
  number: { not: null },
  OR: [
    { checkoutAcceptance: "ACCEPTED" },
    { checkoutAcceptance: "LEGACY", OR: [
      { paymentProvider: null }, { paymentProvider: { not: "mono" } },
      { paymentErrorCode: null }, { paymentErrorCode: { notIn: INITIALIZATION_MARKERS } },
    ] },
  ],
};

export function paymentReference(order: { paymentReference?: string | null; number: string | null }) {
  const reference = order.paymentReference ?? order.number;
  if (!reference) throw new Error("PAYMENT_REFERENCE_MISSING");
  return reference;
}

// Null fallback is deliberately legacy-only: a new reference can never select
// an unrelated order through its final business number.
export function paymentReferenceWhere(reference: string): Prisma.OrderWhereInput {
  return { OR: [{ paymentReference: reference }, { paymentReference: null, number: reference }] };
}
