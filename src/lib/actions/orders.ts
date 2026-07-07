"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import type { OrderStatus } from "@prisma/client";
import { requireAdmin } from "@/lib/actions/require-admin";
import { notifyOrderStatusChanged } from "@/lib/notifications/orders";

export async function updateOrderStatus(id: string, status: OrderStatus) {
  await requireAdmin();

  const order = await prisma.order.findUnique({ where: { id }, include: { items: true } });
  if (!order) return;

  const updatedOrder = await prisma.order.update({ where: { id }, data: { status }, include: { items: true } });

  await notifyOrderStatusChanged({
    order: updatedOrder,
    previousStatus: order.status,
    nextStatus: updatedOrder.status,
    source: "Адмінка",
  });

  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${id}`);
}