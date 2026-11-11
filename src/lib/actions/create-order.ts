"use server";
import { getSizeVariants, snapshotSize } from "@/lib/product-variants";
import { requestedSizeId } from "@/lib/cart-items";


import { translations, type Locale } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { getCheckoutSchema } from "@/lib/validations/checkout";
import type { CartItem } from "@/types";
import { DELIVERY_LABELS, PAYMENT_LABELS } from "@/lib/validations/checkout";
import { notifyOrderCreated } from "@/lib/notifications/orders";
import { getInitialOrderStatus } from "@/lib/order-status";
import {
  createLiqPayCheckout,
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

async function priceOrderItems(items: CartItem[], errors: (typeof translations)[Locale]["checkout"]["errors"]) {
  const rawProductIds = items.map((item) => item.productId);
  const productIds = [...new Set(rawProductIds.filter(Boolean))];

  if (productIds.length !== new Set(rawProductIds).size) {
    return { success: false as const, error: errors.products };
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
    return { success: false as const, error: errors.unavailable };
  }

  const quantityByProduct = new Map<string, number>();
  for (const item of items) {
    if (!Number.isInteger(item.quantity) || item.quantity < 1) {
      return { success: false as const, error: errors.quantity };
    }
    quantityByProduct.set(item.productId, (quantityByProduct.get(item.productId) ?? 0) + item.quantity);
  }

  for (const [productId, quantity] of quantityByProduct) {
    const product = productById.get(productId);
    if (!product || product.stock < quantity) {
      return { success: false as const, error: errors.stock };
    }
  }

  const pricedItems: PricedOrderItem[] = [];
  let subtotal = 0;

  for (const item of items) {
    const product = productById.get(item.productId);
    if (!product) {
      return { success: false as const, error: errors.notFound };
    }

    const variants = getSizeVariants(product.options);
    const sizeId = requestedSizeId(item);
    const size = variants.find((value) => value.id === sizeId);
    if (variants.length && !sizeId) return { success: false as const, error: errors.chooseOptions };
    if (sizeId && (!size || size.price == null)) return { success: false as const, error: errors.options };
    const price = size?.price ?? Number(product.price);
    subtotal += price * item.quantity;
    pricedItems.push({
      productId: product.id,
      productName: product.name,
      optionsJson: size ? snapshotSize(size) : null,
      price,
      quantity: item.quantity,
    });
  }

  return { success: true as const, items: pricedItems, subtotal, quantityByProduct };
}

export async function createOrder(
  data: unknown,
  items: CartItem[],
  locale: Locale = "ua"
): Promise<CreateOrderResult> {
  const errors = translations[locale === "en" ? "en" : "ua"].checkout.errors;
  const parsed = getCheckoutSchema(locale === "en" ? "en" : "ua").safeParse(data);
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? errors.invalid;
    return { success: false, error: msg };
  }
  if (!items || items.length === 0) {
    return { success: false, error: errors.empty };
  }
  if (!Array.isArray(items) || items.length > 100 || items.some((item) => !item || typeof item.productId !== "string" || !item.productId)) {
    return { success: false, error: errors.products };
  }

  const d = parsed.data;

  if (d.paymentMethod === "card_online" && !isLiqPayConfigured()) {
    return {
      success: false,
      error: errors.payment,
    };
  }

  const priced = await priceOrderItems(items, errors);
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
          novaPoshtaBranch: (d.deliveryType === "np_courier" ? d.npCourierAddress : d.npWarehouseAddress) || null,
          novaPoshtaBranchRef: d.npWarehouseRef,
          comment: d.comment,
          paymentMethod: PAYMENT_LABELS[d.paymentMethod],
          status: getInitialOrderStatus(d.paymentMethod),
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
      return { success: false, error: errors.stock };
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
      emailSent: order ? await notifyOrderCreated(order) : false,
      payment: createLiqPayCheckout({
        orderNumber,
        amount: total,
      }),
    };
  }

  const emailSent = order ? await notifyOrderCreated(order) : false;

  return { success: true, orderNumber, emailSent };
}
