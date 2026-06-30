"use server";

import { prisma } from "@/lib/prisma";
import { checkoutSchema } from "@/lib/validations/checkout";
import type { CartItem } from "@/types";

export type CreateOrderResult = { success: true; orderNumber: string } | { success: false; error: string };

export async function createOrder(
  data: unknown,
  items: CartItem[]
): Promise<CreateOrderResult> {
  const parsed = checkoutSchema.safeParse(data);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Некорректные данные" };
  }
  if (!items || items.length === 0) {
    return { success: false, error: "Корзина пуста" };
  }

  const subtotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const shippingCost = subtotal >= 30 ? 0 : 4.5;
  const total = subtotal + shippingCost;
  const orderNumber = `ST-${Date.now().toString().slice(-8)}`;

  await prisma.order.create({
    data: {
      number: orderNumber,
      customerName: parsed.data.customerName,
      customerEmail: parsed.data.customerEmail,
      customerPhone: parsed.data.customerPhone,
      shippingAddress: parsed.data.shippingAddress,
      city: parsed.data.city,
      postalCode: parsed.data.postalCode,
      comment: parsed.data.comment,
      paymentMethod: parsed.data.paymentMethod,
      subtotal,
      shippingCost,
      total,
      items: {
        create: items.map((i) => ({
          productId: i.productId,
          productName: i.name,
          optionsJson: i.options ? JSON.stringify(i.options) : null,
          price: i.price,
          quantity: i.quantity,
        })),
      },
    },
  });

  return { success: true, orderNumber };
}
