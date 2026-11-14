"use server";
import { getSizeVariants, snapshotSize } from "@/lib/product-variants";
import { requestedSizeId } from "@/lib/cart-items";
import { getOnlinePaymentConfig } from "@/lib/payments/online-payment";
import { getOrderResultPath, getAttemptResultPath } from "@/lib/payments/order-result";
import { randomUUID } from "node:crypto";
import { checkoutIdentity } from "@/lib/payments/checkout-identity";


import { translations, type Locale } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { getCheckoutSchema } from "@/lib/validations/checkout";
import type { CartItem } from "@/types";
import { DELIVERY_LABELS, PAYMENT_LABELS } from "@/lib/validations/checkout";
import { notifyOrderCreated } from "@/lib/notifications/orders";
import { getInitialOrderStatus } from "@/lib/order-status";
import { createMonoInvoice, MONO_VALIDITY_SECONDS, MonoError, logMonoInitializationError, type HostedCheckout } from "@/lib/payments/mono";
import { acceptPaymentInvoice } from "@/lib/payments/transitions";
import { recoverUnacceptedInvoice } from "@/lib/payments/initialization";
import { INVOICE_INITIALIZING } from "@/lib/payments/initialization-state";
import { moneyMinorUnits, moneyDecimal } from "@/lib/payments/money";
import { allocateOrderNumber, isOrderNumberCollision } from "@/lib/order-number";
import { Prisma } from "@prisma/client";

export type CreateOrderResult =
  | { success: true; orderNumber: string | null; emailSent: boolean; resultUrl: string; payment?: HostedCheckout }
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
  locale: Locale = "ua",
  retryKey?: string
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

  // A retry is replayed before current pricing/config availability is checked.
  // Its original server-priced snapshot remains immutable.
  let identity: ReturnType<typeof checkoutIdentity> | null = null;
  if (d.paymentMethod === "card_online") {
    try { identity = checkoutIdentity(retryKey ?? "", d, items); }
    catch { return { success: false, error: errors.invalid }; }
    const existing = await prisma.order.findUnique({ where: { checkoutKeyHash: identity.checkoutKeyHash } });
    if (existing) {
      if (existing.checkoutPayloadHash !== identity.checkoutPayloadHash || !existing.paymentReference) return { success: false, error: errors.invalid };
      return { success: true, orderNumber: existing.number, emailSent: false, resultUrl: getAttemptResultPath(existing.paymentReference),
        ...(!existing.paidAt && existing.status !== "CANCELLED" && existing.paymentStatus === "PENDING" && existing.paymentPageUrl && (!existing.paymentExpiresAt || existing.paymentExpiresAt.getTime() > Date.now())
          ? { payment: { provider: "mono" as const, pageUrl: existing.paymentPageUrl } } : {}) };
    }
  }

  const onlineConfig = d.paymentMethod === "card_online" ? getOnlinePaymentConfig() : null;
  if (d.paymentMethod === "card_online" && !onlineConfig) {
    logMonoInitializationError(new MonoError("MONO_NOT_CONFIGURED", { endpoint: "invoice/create" }));
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

  let orderNumber: string | null = null;
  const reference = onlineConfig ? `pay_${randomUUID().replaceAll("-", "")}` : null;
  let resultUrl = "";
  let order;
  // COD numbering and creation share a READ COMMITTED transaction. Online
  // attempts are unnumbered; their number is allocated in verified acceptance.
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      order = await prisma.$transaction(async (tx) => {
        const priced = await priceOrderItems(tx, items, errors);
        if (!priced.success) throw new CheckoutInputError(priced.error);
        orderNumber = onlineConfig ? null : await allocateOrderNumber(tx);
        resultUrl = reference ? getAttemptResultPath(reference) : getOrderResultPath(orderNumber!);
        const subtotal = moneyDecimal(priced.subtotalMinor);
        return tx.order.create({
          data: {
            number: orderNumber,
            checkoutAcceptance: onlineConfig ? "PROVISIONAL" : "ACCEPTED",
            acceptedAt: onlineConfig ? null : new Date(),
            paymentReference: reference,
            checkoutLocale: locale === "en" ? "en" : "ua",
            ...(identity ?? {}),
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
              paymentErrorCode: INVOICE_INITIALIZING,
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
      }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
      break;
    } catch (error) {
      if (error instanceof CheckoutInputError) return { success: false, error: error.message };
      if (identity && error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002" && Array.isArray(error.meta?.target) && error.meta.target.includes("checkoutKeyHash")) {
        return createOrder(data, items, locale, retryKey);
      }
      if (isOrderNumberCollision(error) && attempt < 4) continue;
      throw error;
    }
  }
  if (!order) return { success: false, error: errors.invalid };
  if (onlineConfig) {
    let invoiceId: string | undefined;
    let invoice;
    let accepted;
    try {
      invoice = await createMonoInvoice({ number: reference!, amount: moneyMinorUnits(order.total.toString())!, email: order.customerEmail, resultPath: resultUrl });
      invoiceId = invoice.invoiceId;
      accepted = await acceptPaymentInvoice(reference!, invoiceId, new Date(Date.now() + MONO_VALIDITY_SECONDS * 1000), invoice.pageUrl);
      if (!accepted) throw new MonoError("MONO_UNAVAILABLE", { category: "attachment", endpoint: "invoice/create" });
    } catch (error) {
      logMonoInitializationError(error);
      try {
        if (error instanceof MonoError && error.definiteRejection && !invoiceId) {
          await prisma.order.updateMany({ where: { id: order.id, checkoutAcceptance: "PROVISIONAL", paymentInvoiceId: null, paidAt: null, paymentStatus: "PENDING" }, data: { paymentStatus: "FAILED", paymentErrorCode: "INVOICE_CREATE_FAILED", checkoutAcceptance: "REVIEW", paymentNextCheckAt: null } });
        } else await recoverUnacceptedInvoice(reference!, invoiceId || (error instanceof MonoError ? error.invoiceId : undefined));
        const settled = await prisma.order.findUnique({ where: { id: order.id } });
        if (settled?.checkoutAcceptance === "ACCEPTED" && settled.paidAt) {
          return { success: true, orderNumber: settled.number, resultUrl, emailSent: false };
        }
      } catch { console.warn("Mono initialization recovery required"); }
      return { success: false, error: errors.payment };
    }
    return { success: true, orderNumber: accepted.order.number, resultUrl, emailSent: false,
      ...(!accepted.order.paidAt && accepted.order.status !== "CANCELLED" && accepted.order.paymentStatus === "PENDING" ? { payment: { provider: "mono" as const, pageUrl: invoice.pageUrl } } : {}) };
  }
  const emailSent = await notifyOrderCreated(order, locale);
  return { success: true, orderNumber, resultUrl, emailSent };
}
