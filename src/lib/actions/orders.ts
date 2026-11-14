"use server";

import { prisma } from "@/lib/prisma";
import { isOperationalOrder, paymentReference } from "@/lib/payments/acceptance";
import { revalidatePath } from "next/cache";
import type { OrderStatus } from "@prisma/client";
import { requireAdmin } from "@/lib/actions/require-admin";
import { emitOrderEvents } from "@/lib/notifications/orders";
import { EDITABLE_ORDER_STATUSES } from "@/lib/order-status";
import { cancelPendingPayment, paymentSnapshotWhere } from "@/lib/payments/transitions";
import { takeOrderIntoWork } from "@/lib/orders/take-into-work";
import { normalizeOrderStage } from "@/lib/status";
import type { Locale } from "@/lib/i18n";

export async function takeOrderIntoWorkAction(id: string, locale: Locale = "ua") {
  await requireAdmin();
  const result = await takeOrderIntoWork(id, locale === "en" ? "en" : "ua");
  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${id}`);
  return result;
}

export async function updateOrderStatus(id: string, status: OrderStatus) {
  await requireAdmin();
  if (!(EDITABLE_ORDER_STATUSES as readonly string[]).includes(status)) throw new Error("INVALID_ORDER_STAGE");
  if (status === "PROCESSING") {
    const result = await takeOrderIntoWork(id);
    if (result === "conflict" || result === "not_found") throw new Error("ORDER_CHANGED_RELOAD");
    revalidatePath("/admin/orders");
    revalidatePath(`/admin/orders/${id}`);
    return;
  }

  const order = await prisma.order.findUnique({ where: { id }, include: { items: true } });
  if (!order || !isOperationalOrder(order)) throw new Error("ORDER_NOT_ACCEPTED");
  if (order.status === status) return;
  if (order.status === "COMPLETED" || order.status === "CANCELLED") throw new Error("ORDER_IS_FINAL");
  if (status === "PENDING" && normalizeOrderStage(order.status) !== "NEW") throw new Error("INVALID_ORDER_STAGE_TRANSITION");

  if (status === "CANCELLED" && order.paymentProvider === "mono" && !order.paidAt) {
    if (!await cancelPendingPayment(paymentReference(order), "ADMIN_CANCELLED")) throw new Error("ORDER_CHANGED_RELOAD");
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
