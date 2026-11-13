"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import type { OrderStatus } from "@prisma/client";
import { requireAdmin } from "@/lib/actions/require-admin";
import { emitOrderEvents } from "@/lib/notifications/orders";
import { EDITABLE_ORDER_STATUSES } from "@/lib/order-status";
import { cancelPendingPayment, paymentSnapshotWhere } from "@/lib/payments/transitions";

export async function updateOrderStatus(id: string, status: OrderStatus) {
  await requireAdmin();
  if (!(EDITABLE_ORDER_STATUSES as readonly string[]).includes(status)) throw new Error("INVALID_ORDER_STAGE");

  const order = await prisma.order.findUnique({ where: { id }, include: { items: true } });
  if (!order || order.status === status) return;

  if (status === "CANCELLED" && order.paymentProvider === "mono" && !order.paidAt) {
    if (!await cancelPendingPayment(order.number, "ADMIN_CANCELLED")) throw new Error("ORDER_CHANGED_RELOAD");
    revalidatePath("/admin/orders");
    revalidatePath(`/admin/orders/${id}`);
    return;
  }

  const updated = await prisma.order.updateMany({ where: order.paymentProvider === "mono" ? paymentSnapshotWhere(order) : { id, status: order.status }, data: { status } });
  if (updated.count !== 1) throw new Error("ORDER_CHANGED_RELOAD");
  await emitOrderEvents(order, { ...order, status });

  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${id}`);
}
