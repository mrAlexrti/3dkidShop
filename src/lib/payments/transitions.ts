import type { Order, OrderItem, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { PaymentStage } from "@/lib/status";
import { moneyMinorUnits } from "@/lib/payments/money";
import { getOrderStatusAfterPaymentReceived } from "@/lib/order-status";
import { emitOrderEvents } from "@/lib/notifications/orders";

export type PaymentEvidence = {
  provider: string; invoiceId: string; reference: string; amount: number; currency: number;
  modifiedAt: Date; status: PaymentStage; providerStatus: string; errorCode: string | null; expiresAt?: Date;
};
type FullOrder = Order & { items: OrderItem[] };
type Transition = { before: FullOrder; after: FullOrder };
type Outcome = "applied" | "duplicate" | "stale" | "conflict" | "not_found" | "mismatch" | "unbound";

export function paymentSnapshotWhere(order: Order): Prisma.OrderWhereInput {
  return {
    id: order.id, status: order.status, paymentProvider: order.paymentProvider, paymentMode: order.paymentMode,
    paymentStatus: order.paymentStatus, paidAt: order.paidAt, paymentInvoiceId: order.paymentInvoiceId,
    paymentModifiedAt: order.paymentModifiedAt,
    paymentErrorCode: order.paymentErrorCode, novaPoshtaTtn: order.novaPoshtaTtn, novaPoshtaDeliveredAt: order.novaPoshtaDeliveredAt,
  };
}

function unfulfilled(order: Order) {
  return !order.novaPoshtaTtn && !order.novaPoshtaDeliveredAt && !["SHIPPED", "DELIVERED", "COMPLETED"].includes(order.status);
}

async function dispatch(transition: Transition | null) {
  if (!transition) return;
  try { await emitOrderEvents(transition.before, transition.after); }
  catch { console.warn("Payment saved; notification delivery unavailable."); }
}

export async function applyPaymentEvidence(evidence: PaymentEvidence, options: { authenticatedInvoiceBinding?: boolean } = {}): Promise<Outcome> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const result = await prisma.$transaction(async (tx): Promise<{ outcome: Outcome; transition?: Transition }> => {
      const order = await tx.order.findUnique({ where: { number: evidence.reference }, include: { items: true } });
      if (!order) return { outcome: "not_found" };
      if (order.paymentProvider !== evidence.provider || !["sandbox", "live"].includes(order.paymentMode ?? "") ||
          evidence.currency !== 980 || moneyMinorUnits(order.total.toString()) !== evidence.amount ||
          (order.paymentInvoiceId && order.paymentInvoiceId !== evidence.invoiceId)) return { outcome: "mismatch" };
      // A signature/reference alone cannot bind a new invoice. The caller must
      // additionally query that invoice with this merchant's token first.
      if (!order.paymentInvoiceId && !options.authenticatedInvoiceBinding) return { outcome: "unbound" };
      const previousTime = order.paymentModifiedAt?.getTime();
      if (previousTime !== undefined && evidence.modifiedAt.getTime() < previousTime) return { outcome: "stale" };
      if (previousTime === evidence.modifiedAt.getTime()) {
        return { outcome: order.paymentProviderStatus === evidence.providerStatus && order.paymentStatus === evidence.status ? "duplicate" : "conflict" };
      }
      const data: Prisma.OrderUpdateManyMutationInput = {
        paymentInvoiceId: evidence.invoiceId, paymentProviderStatus: evidence.providerStatus,
        paymentModifiedAt: evidence.modifiedAt, paymentErrorCode: evidence.errorCode,
        paymentStatus: evidence.status,
        paymentNextCheckAt: evidence.status === "PENDING" || evidence.status === "UNKNOWN" ? new Date(Date.now() + 300000) : null,
        ...(evidence.expiresAt ? { paymentExpiresAt: evidence.expiresAt } : {}),
      };
      if (evidence.status === "PAID") {
        data.paidAt = order.paidAt ?? evidence.modifiedAt;
        if (order.status === "CANCELLED" || order.paymentStatus === "REFUNDED") {
          data.paymentErrorCode = "LATE_PAYMENT_REVIEW";
          if (order.paymentStatus === "REFUNDED") data.paymentStatus = "REFUNDED";
        } else {
          const nextStatus = getOrderStatusAfterPaymentReceived(order.status, Boolean(order.novaPoshtaDeliveredAt));
          if (nextStatus !== order.status) data.status = nextStatus;
        }
      } else if (evidence.status === "FAILED" || evidence.status === "CANCELLED") {
        if (order.paidAt) {
          data.paymentStatus = order.paymentStatus;
          data.paymentErrorCode = "INCONSISTENT_PAYMENT_STATE";
          data.paymentNextCheckAt = new Date(Date.now() + 300000);
        } else if (!unfulfilled(order)) data.paymentErrorCode = "FULFILLMENT_REVIEW_REQUIRED";
      } else if (order.paidAt && evidence.status !== "REFUNDED") {
        // Pending/unknown evidence must not undo a known financial fact.
        data.paymentStatus = order.paymentStatus;
        data.paymentErrorCode = evidence.errorCode ?? "INCONSISTENT_PAYMENT_STATE";
        data.paymentNextCheckAt = new Date(Date.now() + 300000);
      }
      // Payment processing has no Product writes. Refunds preserve historical paidAt.
      const changed = await tx.order.updateMany({ where: paymentSnapshotWhere(order), data });
      if (changed.count !== 1) return { outcome: "conflict" };
      const after = await tx.order.findUniqueOrThrow({ where: { id: order.id }, include: { items: true } });
      return { outcome: "applied", transition: { before: order, after } };
    });
    if (result.outcome === "conflict" && attempt < 3) continue;
    await dispatch(result.transition ?? null);
    return result.outcome;
  }
  return "conflict";
}

// Provider/setup failures change financial state only. Operational cancellation
// requires the explicit Admin action; no payment result implicitly takes work.
// Financial truth that already won is never overwritten by a local cancellation.
export async function cancelPendingPayment(number: string, reason: "INVOICE_CREATE_FAILED" | "INVOICE_CREATE_UNCERTAIN" | "INITIALIZATION_EXPIRED" | "ADMIN_CANCELLED") {
  for (let attempt = 0; attempt < 4; attempt++) {
    const result = await prisma.$transaction(async (tx): Promise<{ retry?: boolean; transition?: Transition }> => {
      const order = await tx.order.findUnique({ where: { number }, include: { items: true } });
      if (!order || order.paymentProvider !== "mono" || order.paidAt || order.paymentStatus === "REFUNDED") return {};
      if (order.status === "COMPLETED") return {};
      if (order.status === "CANCELLED" && order.paymentStatus === "CANCELLED") return {};
      if (reason === "INITIALIZATION_EXPIRED" && (order.paymentInvoiceId || !order.paymentExpiresAt || order.paymentExpiresAt.getTime() > Date.now())) return {};
      const changed = await tx.order.updateMany({ where: paymentSnapshotWhere(order), data: {
        paymentStatus: "CANCELLED", ...(reason === "ADMIN_CANCELLED" ? { status: "CANCELLED" } : {}),
        paymentErrorCode: unfulfilled(order) ? reason : "FULFILLMENT_REVIEW_REQUIRED", paymentNextCheckAt: null,
      } });
      if (changed.count !== 1) return { retry: true };
      const after = await tx.order.findUniqueOrThrow({ where: { id: order.id }, include: { items: true } });
      return { transition: { before: order, after } };
    });
    if (result.retry) continue;
    await dispatch(result.transition ?? null);
    return Boolean(result.transition);
  }
  throw new Error("PAYMENT_STATE_CHANGED");
}

export async function attachPaymentInvoice(number: string, invoiceId: string, expiresAt: Date): Promise<boolean> {
  const result = await prisma.order.updateMany({
    where: { number, paymentProvider: "mono", paymentInvoiceId: null, paymentModifiedAt: null, paymentStatus: "PENDING", status: { not: "CANCELLED" } },
    data: { paymentInvoiceId: invoiceId, paymentExpiresAt: expiresAt, paymentNextCheckAt: new Date(Date.now() + 300000) },
  });
  if (result.count === 1) return true;
  const current = await prisma.order.findUnique({ where: { number } });
  return current?.paymentInvoiceId === invoiceId && current.status !== "CANCELLED" && !["FAILED", "CANCELLED", "REFUNDED"].includes(current.paymentStatus ?? "");
}
