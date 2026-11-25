import type { CustomerCartPurchase, Order, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { activeCustomerSession, lockCustomer } from "@/lib/customer/session";
import { purchaseLines } from "@/lib/customer/cart-contract";
import { INVOICE_INITIALIZING, INVOICE_INVALIDATED, INVOICE_UNCERTAIN } from "./initialization-state";
import { invalidateUnpaidMonoInvoice, MonoError, queryMonoInvoice, validHostedPage } from "./mono";
import { monoEvidence } from "./mono-state";
import { moneyMinorUnits } from "./money";
import { applyPaymentEvidence } from "./transitions";

export type PurchasePlan = ReturnType<typeof purchaseLines.parse>;
export type CartPayment = Order & { cartPurchase: CustomerCartPurchase | null };
type Resolution = { kind: "terminal" | "settled" | "reusable" | "processing" | "retry"; order: CartPayment };
type Intent = "status" | "reuse" | "replace";
const include = { cartPurchase: true } as const;
// Covers the 15-second create timeout and time for a late handoff transaction.
const HANDOFF_GRACE_MS = 45000;
const RECONCILE_LEASE_MS = 60000;
const RETRY_MS = 10000;
const RATE_LIMIT_RETRY_MS = 30000;

export async function findRelatedCartPayments(tx: Prisma.TransactionClient, customerId: string, current: PurchasePlan) {
  const orders = await tx.order.findMany({
    where: { customerId, paymentProvider: "mono", paymentReference: { not: null },
      checkoutAcceptance: { in: ["PROVISIONAL", "REVIEW"] }, cartPurchase: { is: { supersededByOrderId: null } } },
    include, orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  const lines = new Map(current.map((line) => [line.generation, line]));
  return orders.filter((order) => purchaseLines.parse(order.cartPurchase!.lines).some((line) => {
    const candidate = lines.get(line.generation);
    return candidate && candidate.removed < line.removed + line.quantity && line.removed < candidate.removed + candidate.quantity;
  }));
}

export function matchesPaymentPlan(order: CartPayment, current: PurchasePlan) {
  if (!order.cartPurchase) return false;
  const prior = purchaseLines.parse(order.cartPurchase.lines);
  const byGeneration = new Map(current.map((line) => [line.generation, line]));
  return prior.length === current.length && prior.every((line) => {
    const live = byGeneration.get(line.generation);
    return live?.quantity === line.quantity && live.removed === line.removed;
  });
}

export function canReplaceCartPayment(order: CartPayment, now = new Date()) {
  if (order.cartPurchase?.reconcileUntil && order.cartPurchase.reconcileUntil > now) return false;
  if (order.paymentStatus === "REFUNDED" && order.paymentProviderStatus === "reversed") return true;
  if (order.paidAt || order.paymentStatus === "PAID" || order.checkoutAcceptance === "ACCEPTED") return false;
  if (order.paymentStatus === "CANCELLED" && order.paymentErrorCode === INVOICE_INVALIDATED) return true;
  if (order.paymentModifiedAt && order.paymentProviderStatus === "expired" && order.paymentStatus === "CANCELLED") return true;
  // Status lookup needs an invoice ID. A lost create response without an ID or
  // a persisted handoff can be fenced off without asserting provider expiry.
  return !!order.cartPurchase && !order.paymentInvoiceId && !order.paymentPageUrl && (
    (order.checkoutAcceptance === "REVIEW" && [INVOICE_UNCERTAIN, "INVOICE_CREATE_FAILED"].includes(order.paymentErrorCode ?? ""))
    || (order.paymentErrorCode === INVOICE_INITIALIZING && now.getTime() >= order.createdAt.getTime() + HANDOFF_GRACE_MS)
  );
}

export async function reconcileCartPayment(order: CartPayment, intent: Intent, binding: string): Promise<Resolution> {
  const result = (kind: Resolution["kind"], current = order): Resolution => ({ kind, order: current });
  if (order.checkoutAcceptance === "ACCEPTED" || order.cartPurchase?.supersededByOrderId) return result("settled");
  if (canReplaceCartPayment(order)) return result("terminal");
  if (order.paidAt) return result("settled");
  if (!order.customerId || !order.cartPurchase || !order.paymentInvoiceId || !order.paymentReference) return result("processing");
  const now = new Date();
  const fence = new Date(now.getTime() + RECONCILE_LEASE_MS);
  const acquired = await prisma.$transaction(async (tx) => {
    if (!await lockCustomer(tx, order.customerId!) || !await activeCustomerSession(tx, order.customerId!, binding)) return false;
    const updated = await tx.customerCartPurchase.updateMany({
      where: { orderId: order.id, supersededByOrderId: null, OR: [{ reconcileUntil: null }, { reconcileUntil: { lte: now } }] },
      data: { reconcileUntil: fence },
    });
    return updated.count === 1;
  });
  if (!acquired) return result("processing");
  let delay = 0;
  const reload = () => prisma.order.findUniqueOrThrow({ where: { id: order.id }, include });
  try {
    const invoiceId = order.paymentInvoiceId;
    const reference = order.paymentReference;
    const amount = moneyMinorUnits(order.total.toString());
    async function verify() {
      const snapshot = await queryMonoInvoice(invoiceId);
      if (snapshot.invoiceId !== invoiceId || snapshot.reference !== reference || snapshot.amount !== amount || snapshot.ccy !== 980) throw new Error("MONO_CART_PAYMENT_MISMATCH");
      const outcome = await applyPaymentEvidence(monoEvidence(snapshot), { authoritativeSnapshot: true });
      if (["conflict", "unbound", "not_found", "mismatch"].includes(outcome)) throw new Error("MONO_CART_RECONCILIATION_RETRY");
      return snapshot;
    }

    const snapshot = await verify();
    let current = await reload();
    if (current.checkoutAcceptance === "ACCEPTED" || current.cartPurchase?.supersededByOrderId) return result("settled", current);
    // Ignore our own lease when checking the freshly recorded provider outcome.
    const withoutLease = (row: CartPayment) => ({ ...row, cartPurchase: row.cartPurchase && { ...row.cartPurchase, reconcileUntil: null } });
    if (canReplaceCartPayment(withoutLease(current))) return result("terminal", current);
    if (current.paidAt) return result("settled", current);
    // A failed charge alone doesn't prove that the hosted invoice stopped
    // accepting another payment. Ask Mono to deactivate it before replacing.
    const failed = snapshot.status === "failure" && current.paymentProviderStatus === "failure";
    const created = snapshot.status === "created" && current.paymentProviderStatus === "created";
    if ((!created && !failed) || snapshot.cancelList?.length ||
        (snapshot.finalAmount !== undefined && snapshot.finalAmount !== 0 && snapshot.finalAmount !== snapshot.amount)) {
      delay = RETRY_MS;
      return result("processing", current);
    }
    if (intent !== "replace" && created) {
      if (validHostedPage(current.paymentPageUrl, invoiceId) && (!current.paymentExpiresAt || current.paymentExpiresAt > new Date())) return result("reusable", current);
    }
    if (intent === "status") return result("processing", current);

    try { await invalidateUnpaidMonoInvoice(invoiceId); }
    catch (error) {
      // A payment can finish between status and removal. A merchant rejection
      // may be followed by a status read, never by a second remove in this call.
      if (error instanceof MonoError && error.httpStatus === 429) throw error;
      await verify();
      current = await reload();
      if (current.checkoutAcceptance === "ACCEPTED") return result("settled", current);
      if (canReplaceCartPayment(withoutLease(current))) return result("terminal", current);
      if (current.paidAt) return result("settled", current);
      throw error;
    }
    // Mono's empty HTTP 200 is affirmative proof of unpaid invalidation.
    // Serialize the local write with paid acceptance and a replacement order.
    current = await prisma.$transaction(async (tx) => {
      await lockCustomer(tx, order.customerId!);
      const fresh = await tx.order.findUniqueOrThrow({ where: { id: order.id }, include });
      if (fresh.paidAt || fresh.checkoutAcceptance === "ACCEPTED" || fresh.paymentInvoiceId !== invoiceId ||
          fresh.cartPurchase?.reconcileUntil?.getTime() !== fence.getTime()) return fresh;
      await tx.order.updateMany({ where: { id: fresh.id, paidAt: null, paymentInvoiceId: invoiceId,
        checkoutAcceptance: fresh.checkoutAcceptance, paymentModifiedAt: fresh.paymentModifiedAt },
        data: { paymentStatus: "CANCELLED", paymentErrorCode: INVOICE_INVALIDATED, paymentNextCheckAt: null } });
      return tx.order.findUniqueOrThrow({ where: { id: order.id }, include });
    });
    if (current.paidAt || current.checkoutAcceptance === "ACCEPTED") return result("settled", current);
    return result(canReplaceCartPayment(withoutLease(current)) ? "terminal" : "retry", current);
  } catch (error) {
    delay = error instanceof MonoError && error.httpStatus === 429 ? RATE_LIMIT_RETRY_MS : RETRY_MS;
    return result("retry");
  } finally {
    await prisma.customerCartPurchase.updateMany({
      where: { orderId: order.id, reconcileUntil: fence },
      data: { reconcileUntil: delay ? new Date(Date.now() + delay) : null },
    });
  }
}
