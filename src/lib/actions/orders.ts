"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import type { OrderStatus } from "@prisma/client";
import { requireAdmin } from "@/lib/actions/require-admin";

export async function updateOrderStatus(id: string, status: OrderStatus) {
  await requireAdmin();

  await prisma.order.update({ where: { id }, data: { status } });
  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${id}`);
}
