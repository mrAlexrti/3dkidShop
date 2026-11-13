"use server";
import { getSizeVariants, snapshotSize } from "@/lib/product-variants";
import { requestedSizeId } from "@/lib/cart-items";
import { getOnlinePaymentConfig } from "@/lib/payments/online-payment";
import { getOrderResultPath } from "@/lib/payments/order-result";


import { translations, type Locale } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { getCheckoutSchema } from "@/lib/validations/checkout";
import type { CartItem } from "@/types";
import { DELIVERY_LABELS, PAYMENT_LABELS } from "@/lib/validations/checkout";
import { notifyOrderCreated } from "@/lib/notifications/orders";
import { getInitialOrderStatus } from "@/lib/order-status";
import { createMonoInvoice, MONO_VALIDITY_SECONDS, type HostedCheckout } from "@/lib/payments/mono";
import { attachPaymentInvoice, cancelPendingPayment } from "@/lib/payments/transitions";
import { moneyMinorUnits, moneyDecimal } from "@/lib/payments/money";
import { createOrderNumber, isOrderNumberCollision } from "@/lib/order-number";
import { Prisma } from "@prisma/client";

export type CreateOrderResult =
  | { success: true; orderNumber: string; emailSent: boolean; resultUrl: string; payment?: HostedCheckout }
  | { success: false; error: string };

type PricedOrderItem = {
  productId: string;
  productName: string;
  optionsJson: string | null;
  price: string;
  quantity: number;
};

class CheckoutInputError extends Error {}

async function priceOrderItems(tx: Prisma.TransactionClient, items: CartItem[], errors: (typeof translations)[Locale]["checkout"]["errors"]) {
  const rawProductIds = items.map((item) => item.productId);
  const productIds = [...new Set(rawProductIds.filter(Boolean))];

  if (productIds.length !== new Set(rawProductIds).size) {
    return { success: false as const, error: errors.products };
  }

  // Actual PostgreSQL shared row locks coordinate acceptance with Admin updates.
  // Concurrent manufacture orders can share these locks. No product is mutated.
  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Product" WHERE "id" IN (${Prisma.join(productIds)}) ORDER BY "id" FOR SHARE`);
  const products = await tx.product.findMany({
    where: { id: { in: productIds }, isActive: true, isOrderable: true },
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

  for (const item of items) {
    // OrderItem.quantity is a PostgreSQL Int. This is representability, not inventory.
    if (!Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 2147483647) {
      return { success: false as const, error: errors.quantity };
    }
  }

  const pricedItems: PricedOrderItem[] = [];
  let subtotalMinor = 0;

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
    const storedSize = size ? product.options.flatMap((option) => option.values).find((value) => value.id === size.id) : undefined;
    const priceMinor = moneyMinorUnits((storedSize?.price ?? product.price).toString());
    if (priceMinor === null || priceMinor <= 0) return { success: false as const, error: errors.unavailable };
    subtotalMinor += priceMinor * item.quantity;
    if (!Number.isSafeInteger(subtotalMinor) || subtotalMinor > 9999999999) return { success: false as const, error: errors.quantity };
    pricedItems.push({
      productId: product.id,
      productName: product.name,
      optionsJson: size ? snapshotSize(size) : null,
      price: moneyDecimal(priceMinor),
      quantity: item.quantity,
    });
  }

  return { success: true as const, items: pricedItems, subtotalMinor };
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

  const onlineConfig = d.paymentMethod === "card_online" ? getOnlinePaymentConfig() : null;
  if (d.paymentMethod === "card_online" && !onlineConfig) {
    return {
      success: false,
      error: errors.payment,
    };
  }

  let shippingAddress = `${DELIVERY_LABELS[d.deliveryType]}: ${d.npCityName}`;
  if (d.deliveryType === "np_warehouse" && d.npWarehouseAddress) {
    shippingAddress += `, ${d.npWarehouseAddress}`;
  } else if (d.deliveryType === "np_parcel_locker" && d.npWarehouseAddress) {
    shippingAddress += `, поштомат: ${d.npWarehouseAddress}`;
  } else if (d.deliveryType === "np_courier" && d.npCourierAddress) {
    shippingAddress += `, ${d.npCourierAddress}`;
  }

  let orderNumber = "";
  let resultUrl = "";
  let order;
  // A number collision rolls back order acceptance before a fresh-number retry.
  for (let attempt = 0; attempt < 5; attempt++) {
    orderNumber = createOrderNumber();
    resultUrl = getOrderResultPath(orderNumber);
    try {
      order = await prisma.$transaction(async (tx) => {
        const priced = await priceOrderItems(tx, items, errors);
        if (!priced.success) throw new CheckoutInputError(priced.error);
        const subtotal = moneyDecimal(priced.subtotalMinor);
        return tx.order.create({
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
            ...(onlineConfig ? {
              paymentProvider: onlineConfig.provider, paymentMode: onlineConfig.mode, paymentStatus: "PENDING",
              // Initialization recovery includes a grace period for in-flight setup.
              paymentExpiresAt: new Date(Date.now() + (MONO_VALIDITY_SECONDS + 120) * 1000),
              paymentNextCheckAt: new Date(Date.now() + 300000),
            } : {}),
            status: getInitialOrderStatus(),
            subtotal,
            shippingCost: "0.00",
            total: subtotal,
            items: {
              create: priced.items.map((item) => ({
                productId: item.productId,
                productName: item.productName,
                optionsJson: item.optionsJson,
                price: item.price,
                quantity: item.quantity,
              })),
            },
          }, include: { items: true },
        });
      });
      break;
    } catch (error) {
      if (error instanceof CheckoutInputError) return { success: false, error: error.message };
      if (isOrderNumberCollision(error) && attempt < 4) continue;
      throw error;
    }
  }
  if (!order) return { success: false, error: errors.invalid };
  const emailSent = order ? await notifyOrderCreated(order, locale) : false;
  if (onlineConfig) {
    try {
      const invoice = await createMonoInvoice({ number: orderNumber, amount: moneyMinorUnits(order.total.toString())!, email: order.customerEmail, resultPath: resultUrl });
      const attached = await attachPaymentInvoice(orderNumber, invoice.invoiceId, new Date(Date.now() + MONO_VALIDITY_SECONDS * 1000));
      if (!attached) throw new Error("INVOICE_STATE_CHANGED");
      return { success: true, orderNumber, resultUrl, emailSent, payment: { provider: "mono", pageUrl: invoice.pageUrl } };
    } catch {
      // Includes ambiguous network failures: do not pretend no external invoice
      // could exist, or retry invoice creation. A late success is manual review.
      try { await cancelPendingPayment(orderNumber, "INVOICE_CREATE_UNCERTAIN"); }
      catch { console.warn("Payment initialization needs scheduled reconciliation."); }
      return { success: false, error: errors.payment };
    }
  }
  return { success: true, orderNumber, resultUrl, emailSent };
}
