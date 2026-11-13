import type { PaymentStage } from "@/lib/status";
import type { MonoSnapshot } from "@/lib/payments/mono";
import type { PaymentEvidence } from "@/lib/payments/transitions";

export function monoEvidence(snapshot: MonoSnapshot): PaymentEvidence {
  let status: PaymentStage;
  let errorCode: string | null = null;
  switch (snapshot.status) {
    case "created": case "processing": status = "PENDING"; break;
    case "hold": status = "PENDING"; errorCode = "UNEXPECTED_HOLD"; break;
    case "success": status = "PAID"; break;
    case "failure": status = snapshot.errCode === "8002" ? "CANCELLED" : "FAILED"; errorCode = snapshot.errCode ? `PROVIDER_${snapshot.errCode}` : "PAYMENT_FAILED"; break;
    case "expired": status = "CANCELLED"; errorCode = "INVOICE_EXPIRED"; break;
    case "reversed": status = "REFUNDED"; break;
    default: status = "UNKNOWN"; errorCode = "UNKNOWN_PROVIDER_STATUS";
  }
  // A cancellation request is not a completed refund. Partial/inconsistent financial
  // snapshots require review; never announce full refund/paid from partial evidence.
  if ((snapshot.status === "success" && snapshot.finalAmount !== undefined && snapshot.finalAmount !== snapshot.amount) ||
      (snapshot.status === "reversed" && snapshot.finalAmount !== undefined && snapshot.finalAmount !== 0) ||
      (snapshot.status === "success" && snapshot.finalAmount === undefined && snapshot.cancelList?.some((entry) => entry.status === "success"))) {
    status = "UNKNOWN"; errorCode = "REFUND_RECONCILIATION_REQUIRED";
  }
  return {
    provider: "mono", invoiceId: snapshot.invoiceId, reference: snapshot.reference, amount: snapshot.amount, currency: snapshot.ccy,
    modifiedAt: new Date(snapshot.modifiedDate), status, providerStatus: snapshot.status, errorCode,
    ...(snapshot.createdDate ? { expiresAt: new Date(Date.parse(snapshot.createdDate) + 3600000) } : {}),
  };
}
