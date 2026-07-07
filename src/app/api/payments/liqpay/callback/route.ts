import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { notifyOrderStatusChanged } from "@/lib/notifications/orders";
import { getOrderStatusAfterPaymentReceived } from "@/lib/order-status";
import {
  isLiqPayConfigured,
  isPaidLiqPayStatus,
  isValidLiqPaySignature,
  parseLiqPayCallback,
} from "@/lib/payments/liqpay";

export async function POST(req: Request) {
  if (!isLiqPayConfigured()) {
    return NextResponse.json({ success: false, error: "LiqPay is not configured." }, { status: 500 });
  }

  const formData = await req.formData();
  const data = String(formData.get("data") ?? "");
  const signature = String(formData.get("signature") ?? "");

  if (!data || !signature || !isValidLiqPaySignature(data, signature)) {
    return NextResponse.json({ success: false, error: "Invalid LiqPay signature." }, { status: 401 });
  }

  const payload = parseLiqPayCallback(data);
  const orderNumber = payload.order_id;

  if (!orderNumber) {
    return NextResponse.json({ success: false, error: "Missing LiqPay order_id." }, { status: 400 });
  }

  const order = await prisma.order.findUnique({
    where: { number: orderNumber },
    include: { items: true },
  });

  if (!order) {
    return NextResponse.json({ success: false, error: "Order not found." }, { status: 404 });
  }

  if (isPaidLiqPayStatus(payload.status)) {
    const previousStatus = order.status;
    const updatedOrder = await prisma.order.update({
      where: { id: order.id },
      data: {
        paidAt: order.paidAt ?? new Date(),
        status: getOrderStatusAfterPaymentReceived(order.status, Boolean(order.novaPoshtaDeliveredAt)),
      },
      include: { items: true },
    });

    await notifyOrderStatusChanged({
      order: updatedOrder,
      previousStatus,
      nextStatus: updatedOrder.status,
      source: "LiqPay",
    });

    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ success: true });
}