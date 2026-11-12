import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { emitOrderEvents } from "@/lib/notifications/orders";
import { getOrderStatusAfterPaymentReceived } from "@/lib/order-status";
import { getOnlinePaymentConfig } from "@/lib/payments/online-payment";
import { isPaidLiqPayStatus, isFailedLiqPayStatus, isValidLiqPaySignature, parseLiqPayCallback, matchesLiqPayPayment } from "@/lib/payments/liqpay";

const response = (status: number, error: string) => NextResponse.json({ success: false, error }, { status });
export async function POST(req: Request) {
  const config = getOnlinePaymentConfig();
  if (!config) return response(503, "Online payment is unavailable.");
  if (Number(req.headers.get("content-length")) > 100000) return response(413, "Callback too large.");
  let payload;
  try {
    const form = await req.formData();
    const data = form.get("data"); const signature = form.get("signature");
    if (typeof data !== "string" || typeof signature !== "string" || data.length > 65536 || !isValidLiqPaySignature(data, signature)) return response(401, "Invalid signature.");
    payload = parseLiqPayCallback(data);
  } catch { return response(400, "Invalid callback."); }
  if (typeof payload.order_id !== "string" || !/^[\w-]{1,100}$/.test(payload.order_id) || typeof payload.status !== "string") return response(400, "Invalid payment reference.");
  const order = await prisma.order.findUnique({ where: { number: payload.order_id }, include: { items: true } });
  if (!order) return response(404, "Order not found.");
  if (order.paymentProvider !== config.provider || order.paymentMode !== config.mode || !matchesLiqPayPayment(payload, order)) return response(400, "Payment does not match order.");
  const paid = isPaidLiqPayStatus(payload.status, order.paymentMode);
  const reversed = payload.status === "reversed";
  const failed = isFailedLiqPayStatus(payload.status);
  if (!paid && !failed) return NextResponse.json({ success: true });
  if (paid && (order.status === "CANCELLED" || order.paymentStatus === "REFUNDED")) return response(409, "Order requires manual reconciliation.");
  if ((paid && order.paymentStatus === "PAID") || (!paid && order.paymentStatus === "REFUNDED") || (!paid && !reversed && order.paidAt)) return NextResponse.json({ success: true });
  const nextPaymentStatus = paid ? "PAID" : reversed ? "REFUNDED" : ["cancelled", "canceled"].includes(payload.status) ? "CANCELLED" : "FAILED";
  if (order.paymentStatus === nextPaymentStatus) return NextResponse.json({ success: true });
  const nextStatus = paid ? getOrderStatusAfterPaymentReceived(order.status, Boolean(order.novaPoshtaDeliveredAt)) : order.status;
  // Compare-and-set prevents duplicate/concurrent callbacks from repeating the transition.
  const paidAt = paid ? new Date() : order.paidAt;
  const updated = await prisma.order.updateMany({
    where: { id: order.id, status: order.status, paymentProvider: config.provider, paymentMode: config.mode, paymentStatus: order.paymentStatus, paidAt: order.paidAt },
    data: { paymentStatus: nextPaymentStatus, ...(paid ? { paidAt, status: nextStatus } : {}) },
  });
  if (updated.count !== 1) {
    const current = await prisma.order.findUnique({ where: { id: order.id } });
    if (current?.paymentStatus === nextPaymentStatus) return NextResponse.json({ success: true });
    return response(409, "Payment state changed; retry callback.");
  }
  // Sandbox must never email/notify real recipients. Live acquiring remains disabled.
  if (order.paymentMode !== "sandbox") {
    const confirmed = { ...order, status: nextStatus, paidAt, paymentStatus: nextPaymentStatus };
    try {
      await emitOrderEvents(order, confirmed);
    } catch { console.error("Payment updated; notification delivery needs review."); }
  }
  return NextResponse.json({ success: true });
}
