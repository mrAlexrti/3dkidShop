"use server";

import { prisma } from "@/lib/prisma";
import { checkoutSchema } from "@/lib/validations/checkout";
import type { CartItem } from "@/types";
import { DELIVERY_LABELS, PAYMENT_LABELS } from "@/lib/validations/checkout";

export type CreateOrderResult =
  | { success: true; orderNumber: string }
  | { success: false; error: string };

export async function createOrder(
  data: unknown,
  items: CartItem[]
): Promise<CreateOrderResult> {
  const parsed = checkoutSchema.safeParse(data);
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Некоректні дані";
    return { success: false, error: msg };
  }
  if (!items || items.length === 0) {
    return { success: false, error: "Кошик порожній" };
  }

  const d = parsed.data;

  // Формируем строку адреса доставки
  let shippingAddress = `${DELIVERY_LABELS[d.deliveryType]}: ${d.npCityName}`;
  if (d.deliveryType === "np_warehouse" && d.npWarehouseAddress) {
    shippingAddress += `, ${d.npWarehouseAddress}`;
  } else if (d.deliveryType === "np_parcel_locker" && d.npWarehouseAddress) {
    shippingAddress += `, поштомат: ${d.npWarehouseAddress}`;
  } else if (d.deliveryType === "np_courier" && d.npCourierAddress) {
    shippingAddress += `, ${d.npCourierAddress}`;
  }

  const subtotal = items.reduce((s, i) => s + i.price * i.quantity, 0);
  // Нова Пошта — стоимость доставки рассчитывается перевозчиком
  // Онлайн показываем "за тарифами НП"
  const shippingCost = 0;
  const total = subtotal + shippingCost;

  const orderNumber = `3DK-${Date.now().toString().slice(-8)}`;

  await prisma.order.create({
    data: {
      number:          orderNumber,
      customerName:    `${d.customerName} ${d.customerSurname}`,
      customerEmail:   d.customerEmail,
      customerPhone:   d.customerPhone,
      shippingAddress,
      city:            d.npCityName,
      postalCode:      d.npWarehouseRef ?? d.npCityRef ?? "—",
      comment:         d.comment,
      paymentMethod:   PAYMENT_LABELS[d.paymentMethod],
      subtotal,
      shippingCost,
      total,
      items: {
        create: items.map((i) => ({
          productId:   i.productId,
          productName: i.name,
          optionsJson: i.options ? JSON.stringify(i.options) : null,
          price:       i.price,
          quantity:    i.quantity,
        })),
      },
    },
  });

  return { success: true, orderNumber };
}
