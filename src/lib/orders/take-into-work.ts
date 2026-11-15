import { prisma } from "@/lib/prisma";
import { isOperationalOrder } from "@/lib/payments/acceptance";
import { normalizeOrderStage } from "@/lib/status";
import { emitOrderEvents } from "@/lib/notifications/orders";
import type { Locale } from "@/lib/i18n";
import { isCodActionEligible, isGenuineCod, codActionSnapshotWhere } from "./cod-eligibility";
import { isCashOnDelivery } from "@/lib/payments/payment-method";

export type TakeIntoWorkResult = "taken" | "already_processing" | "terminal" | "not_found" | "conflict";
export type CodActionResult = { result: TakeIntoWorkResult | "cancelled" | "ineligible"; status?: string };

// Callers authenticate first: Admin session or verified owner Telegram callback.
// CAS changes exactly one operational column. Payment/carrier updates may run
// independently; a concurrent completion/cancellation makes this write lose.
export async function takeOrderIntoWork(id: string, locale: Locale = "ua"): Promise<TakeIntoWorkResult> {
  const { result } = await changeOperationalStatus(id, "PROCESSING", locale, false);
  return result === "cancelled" || result === "ineligible" ? "conflict" : result;
}

// Webhook authenticates before calling. Acknowledgement runs after the CAS and
// before notification transports, so Telegram feedback does not wait for email.
export async function actOnCodOrder(id: string, action: "confirm" | "cancel", locale: Locale = "ua", acknowledge?: (result: CodActionResult) => Promise<void>) {
  return changeOperationalStatus(id, action === "confirm" ? "PROCESSING" : "CANCELLED", locale, true, acknowledge);
}

export async function actOnTelegramWork(id: string, acknowledge: (result: CodActionResult) => Promise<void>) {
  return changeOperationalStatus(id, "PROCESSING", "ua", false, acknowledge, true);
}

async function changeOperationalStatus(id: string, target: "PROCESSING" | "CANCELLED", locale: Locale, codOnly: boolean, acknowledge?: (result: CodActionResult) => Promise<void>, telegram = false): Promise<CodActionResult> {
  const finish = async (result: CodActionResult) => {
    try { await acknowledge?.(result); } catch { console.warn("Telegram acknowledgement unavailable."); }
    return result;
  };
  if (typeof id !== "string" || id !== id.trim() || !/^[A-Za-z0-9_-]{1,48}$/.test(id)) return finish({ result: "not_found" });
  for (let attempt = 0; attempt < 4; attempt++) {
    const order = await prisma.order.findUnique({ where: { id }, include: { items: true } });
    if (!order || !isOperationalOrder(order)) return finish({ result: "not_found" });
    const strictCod = codOnly || (telegram && isCashOnDelivery(order.paymentMethod));
    if (strictCod && !isGenuineCod(order)) return finish({ result: "not_found" });
    if (strictCod && !isCodActionEligible(order)) return finish({ result: "ineligible", status: order.status });
    const stage = normalizeOrderStage(order.status);
    if (stage === "PROCESSING") return finish({ result: "already_processing", status: order.status });
    if (stage === "COMPLETED" || stage === "CANCELLED") return finish({ result: "terminal", status: order.status });
    if (!["PENDING", "AWAITING_PAYMENT", "PAID", "SHIPPED", "DELIVERED"].includes(order.status)) return finish({ result: "conflict", status: order.status });
    const changed = await prisma.order.updateMany({ where: { id, status: order.status, checkoutAcceptance: order.checkoutAcceptance, number: order.number, ...(strictCod ? codActionSnapshotWhere(order) : {}) }, data: { status: target } });
    if (changed.count !== 1) continue;
    // Identical financial/carrier snapshots emit only the operational event.
    const result = await finish({ result: target === "PROCESSING" ? "taken" : "cancelled", status: target });
    try { await emitOrderEvents(order, { ...order, status: target }, locale); }
    catch { console.warn("Order status updated; notification delivery unavailable."); }
    return result;
  }
  return finish({ result: "conflict" });
}
