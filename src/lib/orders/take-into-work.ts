import { prisma } from "@/lib/prisma";
import { normalizeOrderStage } from "@/lib/status";
import { emitOrderEvents } from "@/lib/notifications/orders";
import type { Locale } from "@/lib/i18n";

export type TakeIntoWorkResult = "taken" | "already_processing" | "terminal" | "not_found" | "conflict";

// Callers authenticate first: Admin session or verified owner Telegram callback.
// CAS changes exactly one operational column. Payment/carrier updates may run
// independently; a concurrent completion/cancellation makes this write lose.
export async function takeOrderIntoWork(id: string, locale: Locale = "ua"): Promise<TakeIntoWorkResult> {
  if (typeof id !== "string" || id !== id.trim() || !/^[A-Za-z0-9_-]{1,48}$/.test(id)) return "not_found";
  for (let attempt = 0; attempt < 4; attempt++) {
    const order = await prisma.order.findUnique({ where: { id }, include: { items: true } });
    if (!order) return "not_found";
    const stage = normalizeOrderStage(order.status);
    if (stage === "PROCESSING") return "already_processing";
    if (stage === "COMPLETED" || stage === "CANCELLED") return "terminal";
    if (!["PENDING", "AWAITING_PAYMENT", "PAID", "SHIPPED", "DELIVERED"].includes(order.status)) return "conflict";
    const changed = await prisma.order.updateMany({ where: { id, status: order.status }, data: { status: "PROCESSING" } });
    if (changed.count !== 1) continue;
    // Use identical financial/carrier snapshots so only ORDER_PROCESSING can emit.
    try { await emitOrderEvents(order, { ...order, status: "PROCESSING" }, locale); }
    catch { console.warn("Order taken into work; notification delivery unavailable."); }
    return "taken";
  }
  return "conflict";
}
