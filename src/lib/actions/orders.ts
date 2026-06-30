"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import type { OrderStatus } from "@prisma/client";

export async function updateOrderStatus(id: string, status: OrderStatus) {
  await prisma.order.update({ where: { id }, data: { status } });
  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${id}`);
}
