import { prisma } from "@/lib/prisma";
import { queryMonoInvoice } from "@/lib/payments/mono";
import { monoEvidence } from "@/lib/payments/mono-state";
import { applyPaymentEvidence, cancelPendingPayment } from "@/lib/payments/transitions";

// Called by an authorized scheduler, never from a browser return. No schedule is
// created here. Claims expire after five minutes if this worker crashes.
export async function reconcilePendingPayments(now = new Date()) {
  const orders = await prisma.order.findMany({
    where: { paymentProvider: "mono", paymentNextCheckAt: { lte: now } },
    orderBy: [{ paymentNextCheckAt: "asc" }, { createdAt: "asc" }], take: 25,
  });
  let checked = 0; let updated = 0; let errors = 0;
  for (const order of orders) {
    const lease = new Date(now.getTime() + 300000);
    const claimed = await prisma.order.updateMany({
      where: { id: order.id, paymentProvider: "mono", paymentNextCheckAt: order.paymentNextCheckAt },
      data: { paymentNextCheckAt: lease },
    });
    if (claimed.count !== 1) continue;
    checked++;
    try {
      if (!order.paymentInvoiceId) {
        if (order.paymentExpiresAt && order.paymentExpiresAt <= now) {
          if (await cancelPendingPayment(order.number, "INITIALIZATION_EXPIRED")) updated++;
        }
        continue;
      }
      const snapshot = await queryMonoInvoice(order.paymentInvoiceId);
      if (snapshot.invoiceId !== order.paymentInvoiceId || snapshot.reference !== order.number) throw new Error("PAYMENT_MISMATCH");
      const outcome = await applyPaymentEvidence(monoEvidence(snapshot));
      if (outcome === "applied") updated++;
      if (["conflict", "mismatch", "not_found"].includes(outcome)) throw new Error("PAYMENT_RECONCILIATION_REQUIRED");
    } catch {
      errors++;
      // Do not overwrite a newer financial transition/error/schedule.
      await prisma.order.updateMany({
        where: { id: order.id, paymentModifiedAt: order.paymentModifiedAt, paymentNextCheckAt: lease, paymentInvoiceId: order.paymentInvoiceId },
        data: { paymentErrorCode: "RECONCILIATION_UNAVAILABLE", paymentNextCheckAt: new Date(now.getTime() + 600000) },
      });
    }
  }
  return { checked, updated, errors };
}
