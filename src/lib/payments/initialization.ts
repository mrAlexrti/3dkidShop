import type { Order } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { paymentSnapshotWhere } from "@/lib/payments/transitions";
import { INVOICE_INITIALIZING, INVOICE_UNCERTAIN, INVOICE_INVALIDATED } from "@/lib/payments/initialization-state";
import { queryMonoInvoice, invalidateUnpaidMonoInvoice, logMonoInitializationError } from "@/lib/payments/mono";
import { moneyMinorUnits } from "@/lib/payments/money";

// A single conditional DELETE, not a read followed by unconditional deletion.
// Existing FK onDelete:Cascade removes only this provisional order's items.
export async function removeRejectedProvisionalOrder(order: Order) {
  if (order.paymentErrorCode !== INVOICE_INITIALIZING || order.paymentInvoiceId || order.paidAt || order.novaPoshtaTtn) return false;
  const result = await prisma.order.deleteMany({ where: {
    ...paymentSnapshotWhere(order), status: "PENDING", paymentInvoiceId: null, paidAt: null, novaPoshtaTtn: null,
    paymentStatus: "PENDING", paymentProviderStatus: null, paymentModifiedAt: null, paymentErrorCode: INVOICE_INITIALIZING,
    paymentExpiresAt: order.paymentExpiresAt, paymentNextCheckAt: order.paymentNextCheckAt,
    novaPoshtaCreatedAt: null, novaPoshtaDeliveredAt: null, novaPoshtaSyncedAt: null,
  } });
  return result.count === 1;
}

export async function markInitializationUncertain(number: string, invoiceId?: string) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const order = await prisma.order.findUnique({ where: { number } });
    if (!order || order.paymentProvider !== "mono" || order.paymentErrorCode === INVOICE_INVALIDATED) return order;
    if (invoiceId && order.paymentInvoiceId && order.paymentInvoiceId !== invoiceId) return null;
    const knownId = order.paymentInvoiceId || invoiceId || null;
    const changed = await prisma.order.updateMany({ where: paymentSnapshotWhere(order), data: {
      paymentInvoiceId: knownId,
      paymentStatus: !order.paidAt && ["PENDING", "UNKNOWN"].includes(order.paymentStatus ?? "") ? "UNKNOWN" : order.paymentStatus,
      paymentErrorCode: INVOICE_UNCERTAIN, paymentNextCheckAt: knownId ? new Date(Date.now() + 300000) : null,
    } });
    if (changed.count === 1) return { ...order, paymentInvoiceId: knownId };
  }
  throw new Error("INITIALIZATION_REVIEW_REQUIRED");
}

export async function recoverUnacceptedInvoice(number: string, invoiceId?: string) {
  const order = await markInitializationUncertain(number, invoiceId) ?? (invoiceId ? await markInitializationUncertain(number) : null);
  if (!invoiceId || !order || order.paymentErrorCode === INVOICE_INVALIDATED || order.paidAt || order.novaPoshtaTtn ||
      !["PENDING", "CANCELLED"].includes(order.status) || ["PAID", "REFUNDED"].includes(order.paymentStatus ?? "")) return;
  try {
    const snapshot = await queryMonoInvoice(invoiceId);
    if (snapshot.invoiceId !== invoiceId || snapshot.reference !== order.number || snapshot.amount !== moneyMinorUnits(order.total.toString()) || snapshot.ccy !== 980 ||
        snapshot.status !== "created" || (snapshot.finalAmount !== undefined && snapshot.finalAmount !== 0) || snapshot.cancelList?.length) return;
    const current = await prisma.order.findUnique({ where: { number } });
    if (!current || current.paymentInvoiceId !== order.paymentInvoiceId || current.paidAt || current.novaPoshtaTtn || !["PENDING", "CANCELLED"].includes(current.status) ||
        ["PAID", "REFUNDED"].includes(current.paymentStatus ?? "")) return;
    // Provider contract: remove invalidates only an invoice that has not been paid.
    // It is never a refund/cancel API, and no payment/hold/processing state is removed.
    await invalidateUnpaidMonoInvoice(invoiceId);
    // A conflicting already-bound invoice is preserved; only the newly returned,
    // independently verified unpaid duplicate is invalidated in that case.
    if (current.paymentInvoiceId !== invoiceId) return;
    await prisma.order.updateMany({ where: paymentSnapshotWhere(current), data: {
      paymentStatus: "CANCELLED", paymentErrorCode: INVOICE_INVALIDATED, paymentNextCheckAt: null,
    } });
  } catch (error) { logMonoInitializationError(error, number); }
}
