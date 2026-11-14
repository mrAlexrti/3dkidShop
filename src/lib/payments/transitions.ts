import { Prisma, type Order, type OrderItem } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { PaymentStage } from "@/lib/status";
import { moneyMinorUnits } from "@/lib/payments/money";
import { getOrderStatusAfterPaymentReceived } from "@/lib/order-status";
import { emitOrderEvents } from "@/lib/notifications/orders";
import { INVOICE_INITIALIZING, isUnacceptedOnlineOrder } from "@/lib/payments/initialization-state";
import { paymentReferenceWhere } from "./acceptance";
import { allocateOrderNumber, isOrderNumberCollision } from "@/lib/order-number";
import { enqueueAcceptanceNotifications } from "@/lib/notifications/outbox";

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
    checkoutAcceptance: order.checkoutAcceptance, number: order.number,
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
  if (transition.before.checkoutAcceptance !== "ACCEPTED" && transition.after.checkoutAcceptance === "ACCEPTED") return;
  if (isUnacceptedOnlineOrder(transition.before) || isUnacceptedOnlineOrder(transition.after)) return;
  try { await emitOrderEvents(transition.before, transition.after); }
  catch { console.warn("Payment saved; notification delivery unavailable."); }
}

export async function applyPaymentEvidence(evidence: PaymentEvidence, options: { authenticatedInvoiceBinding?: boolean; authoritativeSnapshot?: boolean } = {}): Promise<Outcome> {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const result = await prisma.$transaction(async (tx): Promise<{ outcome: Outcome; transition?: Transition }> => {
        const order = await tx.order.findFirst({ where: paymentReferenceWhere(evidence.reference), include: { items: true } });
        if (!order) return { outcome: "not_found" };
        if (order.paymentProvider !== evidence.provider || !["sandbox", "live"].includes(order.paymentMode ?? "") ||
            evidence.currency !== 980 || moneyMinorUnits(order.total.toString()) !== evidence.amount ||
            (order.paymentInvoiceId && order.paymentInvoiceId !== evidence.invoiceId)) return { outcome: "mismatch" };
        // A signature/reference alone cannot bind a new invoice. The caller must
        // additionally query that invoice with this merchant's token first.
        if (!order.paymentInvoiceId && !options.authenticatedInvoiceBinding) return { outcome: "unbound" };
        const previousTime = order.paymentModifiedAt?.getTime();
        if (previousTime !== undefined && evidence.modifiedAt.getTime() < previousTime) {
          // Even out-of-order financial success is an audit fact. Do not revive a
          // newer refund/cancellation, but never silently lose evidence of money.
          if (evidence.status === "PAID" && !order.paidAt) {
            const changed = await tx.order.updateMany({ where: paymentSnapshotWhere(order), data: {
              paidAt: evidence.modifiedAt, paymentErrorCode: "LATE_PAYMENT_REVIEW",
              paymentNextCheckAt: new Date(Date.now() + 300000),
              ...(["PROVISIONAL", "REVIEW"].includes(order.checkoutAcceptance) ? { checkoutAcceptance: "REVIEW" as const } : {}),
            } });
            if (changed.count !== 1) return { outcome: "conflict" };
          }
          return { outcome: "stale" };
        }
        if (previousTime === evidence.modifiedAt.getTime()) {
          if (order.checkoutAcceptance === "PROVISIONAL" && ["FAILED", "CANCELLED"].includes(order.paymentStatus ?? "") && terminalReviewDue(order)) {
            await tx.order.updateMany({ where: paymentSnapshotWhere(order), data: { checkoutAcceptance: "REVIEW", paymentNextCheckAt: null } });
          }
          if (order.paymentProviderStatus === evidence.providerStatus && order.paymentStatus === evidence.status) return { outcome: "duplicate" };
          if (!options.authoritativeSnapshot) {
            if (evidence.status === "PAID" && !order.paidAt) {
              const changed = await tx.order.updateMany({ where: paymentSnapshotWhere(order), data: {
                paidAt: evidence.modifiedAt, paymentErrorCode: "LATE_PAYMENT_REVIEW", paymentNextCheckAt: new Date(Date.now() + 300000),
                ...(["PROVISIONAL", "REVIEW"].includes(order.checkoutAcceptance) ? { checkoutAcceptance: "REVIEW" as const } : {}),
              } });
              if (changed.count !== 1) return { outcome: "conflict" };
            }
            return { outcome: "conflict" };
          }
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
          if (order.checkoutAcceptance === "PROVISIONAL" || order.checkoutAcceptance === "REVIEW") {
            if (order.status === "PENDING" && !order.novaPoshtaTtn && !order.novaPoshtaDeliveredAt && order.paymentStatus !== "REFUNDED") {
              data.number = order.number ?? await allocateOrderNumber(tx);
              data.checkoutAcceptance = "ACCEPTED";
              data.acceptedAt = new Date();
            } else { data.checkoutAcceptance = "REVIEW"; data.paymentErrorCode = "LATE_PAYMENT_REVIEW"; }
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
        // Historical initialization markers retain their compatibility semantics.
        if ((!order.checkoutAcceptance || order.checkoutAcceptance === "LEGACY") && isUnacceptedOnlineOrder(order)) data.paymentErrorCode = order.paymentErrorCode;
        if (["PROVISIONAL", "REVIEW"].includes(order.checkoutAcceptance) && !order.paidAt && ["FAILED", "CANCELLED"].includes(evidence.status)) {
          data.paymentNextCheckAt = terminalReviewDue(order) ? null : new Date(Date.now() + 3600000);
          if (terminalReviewDue(order)) data.checkoutAcceptance = "REVIEW";
        }
        if (["PROVISIONAL", "REVIEW"].includes(order.checkoutAcceptance) && evidence.status === "REFUNDED") {
          data.checkoutAcceptance = "REVIEW";
          data.paymentErrorCode = "REFUND_BEFORE_ACCEPTANCE";
        }
        // Payment processing has no Product writes. Refunds preserve historical paidAt.
        const changed = await tx.order.updateMany({ where: paymentSnapshotWhere(order), data });
        if (changed.count !== 1) return { outcome: "conflict" };
        const after = await tx.order.findUniqueOrThrow({ where: { id: order.id }, include: { items: true } });
        if (order.checkoutAcceptance !== "ACCEPTED" && after.checkoutAcceptance === "ACCEPTED") {
          await enqueueAcceptanceNotifications(tx, after, after.checkoutLocale === "en" ? "en" : "ua");
        }
        return { outcome: "applied", transition: { before: order, after } };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
      if (result.outcome === "conflict" && attempt < 3) continue;
      await dispatch(result.transition ?? null);
      return result.outcome;
    } catch (error) {
      if (attempt < 3 && (isOrderNumberCollision(error) || (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034"))) continue;
      throw error;
    }
  }
  return "conflict";
}

function terminalReviewDue(order: Order) {
  return Date.now() > (order.paymentExpiresAt ?? order.createdAt).getTime() + 7 * 86400000;
}

// Provider/setup failures change financial state only. Operational cancellation
// requires the explicit Admin action; no payment result implicitly takes work.
// Financial truth that already won is never overwritten by a local cancellation.
export async function cancelPendingPayment(number: string, reason: "INVOICE_CREATE_FAILED" | "INVOICE_CREATE_UNCERTAIN" | "INITIALIZATION_EXPIRED" | "ADMIN_CANCELLED") {
  for (let attempt = 0; attempt < 4; attempt++) {
    const result = await prisma.$transaction(async (tx): Promise<{ retry?: boolean; transition?: Transition }> => {
      const order = await tx.order.findFirst({ where: paymentReferenceWhere(number), include: { items: true } });
      if (!order || order.paymentProvider !== "mono" || order.paidAt || order.paymentStatus === "REFUNDED") return {};
      if (order.status === "COMPLETED") return {};
      if (order.status === "CANCELLED" && order.paymentStatus === "CANCELLED") return {};
      if (reason === "INVOICE_CREATE_UNCERTAIN" && order.paymentStatus === "UNKNOWN" && order.paymentErrorCode === reason) return {};
      if (reason === "INITIALIZATION_EXPIRED" && (order.paymentInvoiceId || !order.paymentExpiresAt || order.paymentExpiresAt.getTime() > Date.now())) return {};
      const changed = await tx.order.updateMany({ where: paymentSnapshotWhere(order), data: {
        paymentStatus: reason === "INVOICE_CREATE_UNCERTAIN" ? "UNKNOWN" : "CANCELLED", ...(reason === "ADMIN_CANCELLED" ? { status: "CANCELLED" } : {}),
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

export async function acceptPaymentInvoice(number: string, invoiceId: string, expiresAt: Date, pageUrl?: string): Promise<{ order: FullOrder; notify: boolean } | null> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const result = await prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({ where: paymentReferenceWhere(number), include: { items: true } });
      // This function now binds a handoff only. New business acceptance belongs
      // exclusively to verified PAID evidence, including PAID before attachment.
      if (order && ["PROVISIONAL", "REVIEW", "ACCEPTED"].includes(order.checkoutAcceptance)) {
        if (order.paymentProvider !== "mono" || (order.paymentInvoiceId && order.paymentInvoiceId !== invoiceId)) return null;
        const changed = await tx.order.updateMany({ where: paymentSnapshotWhere(order), data: {
          paymentInvoiceId: invoiceId, paymentExpiresAt: expiresAt,
          ...(pageUrl ? { paymentPageUrl: pageUrl } : {}),
          ...(!order.paidAt && order.paymentStatus === "PENDING" ? { paymentErrorCode: order.paymentErrorCode === INVOICE_INITIALIZING ? null : order.paymentErrorCode, paymentNextCheckAt: new Date(Date.now() + 300000) } : {}),
        } });
        if (changed.count !== 1) return "retry" as const;
        return { order: await tx.order.findUniqueOrThrow({ where: { id: order.id }, include: { items: true } }), notify: false };
      }
      if (!order || order.paymentProvider !== "mono" || order.status === "CANCELLED" || ["FAILED", "CANCELLED", "REFUNDED", "UNKNOWN"].includes(order.paymentStatus ?? "") ||
          (order.status === "COMPLETED" && !order.paidAt) ||
          (order.paymentProviderStatus != null && !["created", "processing", "success"].includes(order.paymentProviderStatus)) ||
          (order.paymentInvoiceId && order.paymentInvoiceId !== invoiceId)) return null;
      const provisional = order.paymentErrorCode === INVOICE_INITIALIZING;
      if (isUnacceptedOnlineOrder(order) && !provisional) return null; // No automatic uncertain-attempt retry.
      if (order.paymentInvoiceId === invoiceId && !provisional) return { order, notify: false };
      const changed = await tx.order.updateMany({ where: paymentSnapshotWhere(order), data: {
        paymentInvoiceId: invoiceId, paymentExpiresAt: expiresAt, paymentErrorCode: provisional ? null : order.paymentErrorCode,
        paymentNextCheckAt: order.paidAt ? null : new Date(Date.now() + 300000),
      } });
      if (changed.count !== 1) return "retry" as const;
      return { order: await tx.order.findUniqueOrThrow({ where: { id: order.id }, include: { items: true } }), notify: provisional };
    });
    if (result !== "retry") return result;
  }
  return null;
}

// Compatibility helper; the checkout uses the claimed snapshot/notification flag.
export async function attachPaymentInvoice(number: string, invoiceId: string, expiresAt: Date): Promise<boolean> {
  return Boolean(await acceptPaymentInvoice(number, invoiceId, expiresAt));
}
