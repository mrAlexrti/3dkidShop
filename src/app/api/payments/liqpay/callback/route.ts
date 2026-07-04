import { NextResponse } from "next/server";
import { OrderStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sendOrderConfirmationEmail } from "@/lib/email";
import {
  isFailedLiqPayStatus,
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
    const shouldSendEmail = order.status !== OrderStatus.PAID;
    const updatedOrder = await prisma.order.update({
      where: { id: order.id },
      data: { status: OrderStatus.PAID },
      include: { items: true },
    });

    if (shouldSendEmail) {
      await sendOrderConfirmationEmail(updatedOrder);
    }

    return NextResponse.json({ success: true });
  }

  if (isFailedLiqPayStatus(payload.status) && order.status === OrderStatus.PENDING) {
    await prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: order.id },
        data: { status: OrderStatus.CANCELLED },
      });

      for (const item of order.items) {
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { increment: item.quantity } },
        });
      }
    });
  }

  return NextResponse.json({ success: true });
}
