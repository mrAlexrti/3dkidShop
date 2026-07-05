"use server";

import { prisma } from "@/lib/prisma";
import { checkoutSchema } from "@/lib/validations/checkout";
import type { CartItem } from "@/types";
import { DELIVERY_LABELS, PAYMENT_LABELS } from "@/lib/validations/checkout";
import { sendOrderConfirmationEmail } from "@/lib/email";
import {
  createLiqPayCheckout,
  getMissingLiqPayEnvNames,
  isLiqPayConfigured,
  type LiqPayCheckout,
} from "@/lib/payments/liqpay";

export type CreateOrderResult =
  | { success: true; orderNumber: string; emailSent: boolean; payment?: LiqPayCheckout }
  | { success: false; error: string };

type PricedOrderItem = {
  productId: string;
  productName: string;
  optionsJson: string | null;
  price: number;
  quantity: number;
};

async function priceOrderItems(items: CartItem[]) {
  const rawProductIds = items.map((item) => item.productId);
  const productIds = [...new Set(rawProductIds.filter(Boolean))];

  if (productIds.length !== new Set(rawProductIds).size) {
    return { success: false as const, error: "Некоректні товари в кошику" };
  }

  const products = await prisma.product.findMany({
    where: { id: { in: productIds }, isActive: true },
    include: {
      options: {
        include: { values: true },
      },
    },
  });
  const productById = new Map(products.map((product) => [product.id, product]));

  if (products.length !== productIds.length) {
    return { success: false as const, error: "Деякі товари більше недоступні" };
  }

  const quantityByProduct = new Map<string, number>();
  for (const item of items) {
    if (!Number.isInteger(item.quantity) || item.quantity < 1) {
      return { success: false as const, error: "Некоректна кількість товарів" };
    }
    quantityByProduct.set(item.productId, (quantityByProduct.get(item.productId) ?? 0) + item.quantity);
  }

  for (const [productId, quantity] of quantityByProduct) {
    const product = productById.get(productId);
    if (!product || product.stock < quantity) {
      return { success: false as const, error: "Недостатньо товару на складі" };
    }
  }

  const pricedItems: PricedOrderItem[] = [];
  let subtotal = 0;

  for (const item of items) {
    const product = productById.get(item.productId);
    if (!product) {
      return { success: false as const, error: "Товар не знайдено" };
    }

    const selectedOptions = item.options ?? {};
    const allowedOptionNames = new Set(product.options.map((option) => option.name));
    const hasUnknownOption = Object.keys(selectedOptions).some((name) => !allowedOptionNames.has(name));
    if (hasUnknownOption) {
      return { success: false as const, error: "Некоректні опції товару" };
    }

    const canonicalOptions: Record<string, string> = {};
    let price = Number(product.price);

    for (const option of product.options) {
      const selectedValue = selectedOptions[option.name];
      if (!selectedValue) {
        return { success: false as const, error: "Оберіть опції товару перед оформленням" };
      }

      const value = option.values.find((optionValue) => optionValue.value === selectedValue);
      if (!value) {
        return { success: false as const, error: "Некоректні опції товару" };
      }

      canonicalOptions[option.name] = value.value;
      price += Number(value.priceModifier);
    }

    subtotal += price * item.quantity;
    pricedItems.push({
      productId: product.id,
      productName: product.name,
      optionsJson: Object.keys(canonicalOptions).length > 0 ? JSON.stringify(canonicalOptions) : null,
      price,
      quantity: item.quantity,
    });
  }

  return { success: true as const, items: pricedItems, subtotal, quantityByProduct };
}

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

  if (d.paymentMethod === "card_online" && !isLiqPayConfigured()) {
    const missingEnv = getMissingLiqPayEnvNames();
    return {
      success: false,
      error: `Онлайн-оплата тимчасово недоступна. Runtime не бачить: ${missingEnv.join(", ") || "LiqPay env"}.`,
    };
  }

  const priced = await priceOrderItems(items);
  if (!priced.success) return { success: false, error: priced.error };

  let shippingAddress = `${DELIVERY_LABELS[d.deliveryType]}: ${d.npCityName}`;
  if (d.deliveryType === "np_warehouse" && d.npWarehouseAddress) {
    shippingAddress += `, ${d.npWarehouseAddress}`;
  } else if (d.deliveryType === "np_parcel_locker" && d.npWarehouseAddress) {
    shippingAddress += `, поштомат: ${d.npWarehouseAddress}`;
  } else if (d.deliveryType === "np_courier" && d.npCourierAddress) {
    shippingAddress += `, ${d.npCourierAddress}`;
  }

  const subtotal = priced.subtotal;
  const shippingCost = 0;
  const total = subtotal + shippingCost;
  const orderNumber = `3DK-${Date.now().toString().slice(-8)}`;

  try {
    await prisma.$transaction(async (tx) => {
      for (const [productId, quantity] of priced.quantityByProduct.entries()) {
        const update = await tx.product.updateMany({
          where: { id: productId, isActive: true, stock: { gte: quantity } },
          data: { stock: { decrement: quantity } },
        });

        if (update.count !== 1) {
          throw new Error("OUT_OF_STOCK");
        }
      }

      await tx.order.create({
        data: {
          number: orderNumber,
          customerName: `${d.customerName} ${d.customerSurname}`,
          customerFirstName: d.customerName,
          customerLastName: d.customerSurname,
          customerEmail: d.customerEmail,
          customerPhone: d.customerPhone,
          shippingAddress,
          deliveryMethod: d.deliveryType,
          city: d.npCityName,
          postalCode: d.npWarehouseRef ?? d.npCityRef ?? "—",
          novaPoshtaCity: d.npCityName,
          novaPoshtaCityRef: d.npCityRef,
          novaPoshtaBranch: d.npWarehouseAddress ?? d.npCourierAddress ?? null,
          novaPoshtaBranchRef: d.npWarehouseRef,
          comment: d.comment,
          paymentMethod: PAYMENT_LABELS[d.paymentMethod],
          subtotal,
          shippingCost,
          total,
          items: {
            create: priced.items.map((item) => ({
              productId: item.productId,
              productName: item.productName,
              optionsJson: item.optionsJson,
              price: item.price,
              quantity: item.quantity,
            })),
          },
        },
      });
    });
  } catch (error) {
    if (error instanceof Error && error.message === "OUT_OF_STOCK") {
      return { success: false, error: "Недостатньо товару на складі" };
    }
    throw error;
  }

  const order = await prisma.order.findUnique({
    where: { number: orderNumber },
    include: { items: true },
  });

  if (d.paymentMethod === "card_online") {
    return {
      success: true,
      orderNumber,
      emailSent: false,
      payment: createLiqPayCheckout({
        orderNumber,
        amount: total,
      }),
    };
  }

  const emailSent = order ? await sendOrderConfirmationEmail(order) : false;

  return { success: true, orderNumber, emailSent };
}
