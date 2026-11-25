"use server";
import { availabilityVariantInclude } from "@/lib/product-query";
import { getSizeVariants, snapshotSize } from "@/lib/product-variants";
import { requestedSizeId } from "@/lib/cart-items";
import { cartTotalMinor } from "@/lib/cart-limits";
import { getOnlinePaymentConfig } from "@/lib/payments/online-payment";
import { getOrderResultPath, getAttemptResultPath } from "@/lib/payments/order-result";
import { createHmac, randomUUID } from "node:crypto";
import { checkoutIdentity } from "@/lib/payments/checkout-identity";
import { verifiedPaymentRetry, type PaymentRetrySource } from "@/lib/payments/retry";


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
import { nativeMode, productConfiguration, selectedCombination, snapshotCombination, combinationSelectionSchema } from "@/lib/product-configuration";
import { flushVariantConstraints } from "@/lib/variant-transaction";
import { activeCustomerSession, customerSession, favoritesVersion, lockCustomer } from "@/lib/customer/session";
import { customerPost, customerSecret } from "@/lib/customer/security";
import { cartLineInput, cartProof } from "@/lib/customer/cart-contract";
import { consumeCart, matchesCart, readCart } from "@/lib/customer/cart";
import { colorGallery } from "@/lib/gallery";
import { canReplaceCartPayment, findRelatedCartPayments, matchesPaymentPlan, reconcileCartPayment, type CartPayment } from "@/lib/payments/cart-checkout";

export type CreateOrderResult =
  | { success: true; orderNumber: string | null; emailSent: boolean; resultUrl: string; payment?: HostedCheckout }
  | { success: false; error: string; pendingPaymentUrl?: string };

type PricedOrderItem = {
  productVariantId?: string;
  productId: string;
  productName: string;
  productImageUrl: string | null;
  optionsJson: string | null;
  price: string;
  quantity: number;
};

class CheckoutInputError extends Error {}
class PendingPaymentError extends Error {
  constructor(readonly reference: string) { super("PAYMENT_CHANGED_DURING_CHECKOUT"); }
}

async function priceOrderItems(tx: Prisma.TransactionClient, items: CartItem[], errors: (typeof translations)[Locale]["checkout"]["errors"], requirePriceMatch: boolean) {
  const rawProductIds = items.map((item) => item.productId);
  const productIds = [...new Set(rawProductIds.filter(Boolean))];

  if (productIds.length !== new Set(rawProductIds).size) {
    return { success: false as const, error: errors.products };
  }

  // Actual PostgreSQL shared row locks coordinate acceptance with Admin updates.
  // Concurrent manufacture orders can share these locks. No product is mutated.
  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM public."Product" WHERE "id" IN (${Prisma.join(productIds)}) ORDER BY "id" FOR SHARE`);
  // Checkout and directory edits serialize on the referenced filament rows.
  await tx.$queryRaw(Prisma.sql`
    SELECT f."id" FROM public."Filament" f WHERE EXISTS (
      SELECT 1 FROM public."VariantFilamentAlternative" a
      JOIN public."VariantFilamentGroup" g ON g."id"=a."groupId"
      JOIN public."ProductVariant" v ON v."id"=g."variantId"
      WHERE a."filamentId"=f."id" AND v."retiredAt" IS NULL
        AND v."productId" IN (${Prisma.join(productIds)})
    ) ORDER BY f."id" FOR SHARE`);
  const products = await tx.product.findMany({
    where: { id: { in: productIds }, isActive: true, isOrderable: true },
    include: {
      images: { orderBy: [{ order: "asc" }, { id: "asc" }], select: { url: true, colorValueId: true } },
      variants: { include: availabilityVariantInclude },
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

    if (item.selection !== undefined && (item.variant || item.options || !combinationSelectionSchema.safeParse(item.selection).success)) return { success: false as const, error: errors.options };
    if (nativeMode(product.optionMode)) {
      const config = productConfiguration(product);
      const sizeId = requestedSizeId(item);
      const combination = config.mode === "SIMPLE" ? null : selectedCombination(config, sizeId, item.selection);
      if (config.mode === "SIMPLE" ? Boolean(sizeId || item.selection) : !combination) return { success: false as const, error: errors.options };
      const priceMinor = moneyMinorUnits(combination?.price ?? product.price.toString());
      if (priceMinor === null || priceMinor <= 0) return { success: false as const, error: errors.unavailable };
      if (requirePriceMatch && (!Number.isFinite(item.price) || Math.abs(item.price - priceMinor / 100) > 0.000001)) return { success: false as const, error: errors.priceChanged };
      subtotalMinor += priceMinor * item.quantity;
      if (!Number.isSafeInteger(subtotalMinor) || subtotalMinor > 9999999999) return { success: false as const, error: errors.quantity };
      pricedItems.push({ productId: product.id, productName: product.name, price: moneyDecimal(priceMinor), quantity: item.quantity,
        productImageUrl: colorGallery(product.images ?? [], combination?.values.COLOR)[0]?.url ?? null,
        optionsJson: combination ? snapshotCombination(config, combination) : null, ...(combination ? { productVariantId: combination.id } : {}) });
      continue;
    }
    if (item.selection) return { success: false as const, error: errors.options };

    const variants = getSizeVariants(product.options);
    const sizeId = requestedSizeId(item);
    const size = variants.find((value) => value.id === sizeId);
    if (variants.length && !sizeId) return { success: false as const, error: errors.chooseOptions };
    if (sizeId && (!size || size.price == null)) return { success: false as const, error: errors.options };
    const storedSize = size ? product.options.flatMap((option) => option.values).find((value) => value.id === size.id) : undefined;
    const priceMinor = moneyMinorUnits((storedSize?.price ?? product.price).toString());
    if (priceMinor === null || priceMinor <= 0) return { success: false as const, error: errors.unavailable };
    // New storefront clients ask to reject a quote changed since review. The price
    // is still calculated exclusively from locked server records. Legacy callers
    // retain authoritative repricing; existing Mono retries are replayed above it.
    if (requirePriceMatch && (!Number.isFinite(item.price) || Math.abs(item.price - priceMinor / 100) > 0.000001)) return { success: false as const, error: errors.priceChanged };
    subtotalMinor += priceMinor * item.quantity;
    if (!Number.isSafeInteger(subtotalMinor) || subtotalMinor > 9999999999) return { success: false as const, error: errors.quantity };
    pricedItems.push({
      productId: product.id,
      productName: product.name,
      productImageUrl: product.images?.[0]?.url ?? null,
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
  retryKey?: string,
  retrySource?: PaymentRetrySource,
  requirePriceMatch = false,
  accountCart?: unknown
): Promise<CreateOrderResult> {
  const errors = translations[locale === "en" ? "en" : "ua"].checkout.errors;
  const pendingPayment = (reference: string, error: string = errors.pendingPayment): CreateOrderResult => ({ success: false, error,
    pendingPaymentUrl: getAttemptResultPath(reference) });
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

  const d = { ...parsed.data, customerEmail: parsed.data.customerEmail || "" };
  const customer = await customerSession();
  const customerId = customer?.id ?? null;
  const proof = cartProof.safeParse(accountCart);
  if (customer ? !proof.success || proof.data.scope !== favoritesVersion(customer.binding) || !await customerPost() : accountCart !== undefined) {
    return { success: false, error: errors.invalid };
  }
  const revision = proof.success ? proof.data.revision : null;
  const cartCopy = translations[locale === "en" ? "en" : "ua"].cart.sync;
  const requestKey = retryKey ?? "initial";
  if (customer && !retrySource && retryKey !== undefined && !/^[a-f0-9-]{36,64}$/i.test(retryKey)) return { success: false, error: errors.invalid };
  const accountKey = (material: unknown) => createHmac("sha256", customerSecret()).update(JSON.stringify(material)).digest("hex");
  const rootKey = customer && revision !== null && !retrySource
    ? accountKey(["customer-cart-checkout:v2", customer.id, revision, requestKey, d, cartTotalMinor(items)])
    : retryKey;
  let key = rootKey;

  const knownResult = (order: CartPayment, reusable = false): CreateOrderResult => {
    if (!order.paymentReference) return order.number ? { success: true, orderNumber: order.number, emailSent: false, resultUrl: getOrderResultPath(order.number) } : { success: false, error: errors.invalid };
    return { success: true, orderNumber: order.number, emailSent: false, resultUrl: getAttemptResultPath(order.paymentReference),
      ...(reusable && order.paymentPageUrl ? { payment: { provider: "mono" as const, pageUrl: order.paymentPageUrl } } : {}) };
  };
  const unresolved = (reference: string, kind: "processing" | "retry") =>
    pendingPayment(reference, kind === "processing" ? errors.pendingPayment : errors.paymentVerification);

  // Replay an exact submission before validating present-day pricing. A
  // terminal invoice can have a deterministic successor with its own identity.
  let identity: ReturnType<typeof checkoutIdentity> | null = null;
  if (customer || d.paymentMethod === "card_online") {
    for (;;) {
      try { identity = checkoutIdentity(key ?? "", d, items); }
      catch { return { success: false, error: errors.invalid }; }
      const existing = await prisma.order.findUnique({ where: { checkoutKeyHash: identity.checkoutKeyHash }, include: { cartPurchase: true } });
      if (!existing) break;
      if ((existing.customerId ?? null) !== customerId || existing.checkoutPayloadHash !== identity.checkoutPayloadHash) return { success: false, error: errors.invalid };
      if (!customer) {
        if (!existing.paymentReference) return { success: false, error: errors.invalid };
        return knownResult(existing, !existing.paidAt && existing.status !== "CANCELLED" && existing.paymentStatus === "PENDING" &&
          (!existing.paymentExpiresAt || existing.paymentExpiresAt > new Date()));
      }
      if (!existing.cartPurchase || !existing.paymentReference) return knownResult(existing);
      const nextKey = accountKey(["customer-cart-redo", rootKey, existing.id]);
      if (existing.cartPurchase.supersededByOrderId) {
        // An old submission cannot cancel a different successor checkout.
        const successor = await prisma.order.findUnique({ where: { id: existing.cartPurchase.supersededByOrderId }, select: { checkoutKeyHash: true } });
        if (successor?.checkoutKeyHash !== checkoutIdentity(nextKey, d, items).checkoutKeyHash) return knownResult(existing);
      } else {
        const resolution = await reconcileCartPayment(existing, "reuse", customer.binding);
        if (resolution.kind === "settled" || resolution.kind === "reusable") return knownResult(resolution.order, resolution.kind === "reusable");
        if (resolution.kind !== "terminal") return unresolved(existing.paymentReference, resolution.kind);
      }
      key = nextKey;
    }
  }

  const onlineConfig = d.paymentMethod === "card_online" ? getOnlinePaymentConfig() : null;
  if (d.paymentMethod === "card_online" && retrySource) {
    try { if (await verifiedPaymentRetry(retrySource, customerId) !== key) return { success: false, error: errors.payment }; }
    catch { return { success: false, error: errors.payment }; }
  }
  if (d.paymentMethod === "card_online" && !onlineConfig) {
    logMonoInitializationError(new MonoError("MONO_NOT_CONFIGURED", { endpoint: "invoice/create" }));
    return {
      success: false,
      error: errors.payment,
    };
  }

  if (customer) {
    const cart = await readCart(prisma, customer.id);
    if (cart.revision !== revision || !matchesCart(cart.lines, items.map(cartLineInput))) return { success: false, error: cartCopy.conflict };
    const related = (await findRelatedCartPayments(prisma, customer.id, cart.lines)).filter((order) => !canReplaceCartPayment(order));
    // Reject a stale or invalid quote before removing an invoice the customer
    // can still pay. The reservation transaction prices the new order again.
    const quote = related.length ? await prisma.$transaction((tx) => priceOrderItems(tx, items, errors, true)) : null;
    if (quote && !quote.success) return { success: false, error: quote.error };
    for (const prior of related.slice(0, 3)) {
      const sameCheckout = d.paymentMethod === "card_online" && prior.checkoutPayloadHash === identity?.checkoutPayloadHash
        && quote?.subtotalMinor === moneyMinorUnits(prior.total.toString()) && matchesPaymentPlan(prior, cart.lines);
      const resolved = await reconcileCartPayment(prior, sameCheckout ? "reuse" : "replace", customer.binding);
      if (resolved.kind === "terminal") continue;
      if (resolved.kind === "reusable") return knownResult(resolved.order, true);
      if (resolved.kind === "settled") {
        if (resolved.order.checkoutAcceptance === "ACCEPTED") return pendingPayment(prior.paymentReference!, cartCopy.conflict);
        // A competing checkout already superseded this attempt. Inspect the
        // current plan again inside the locked reservation transaction.
        if (resolved.order.cartPurchase?.supersededByOrderId) continue;
        return pendingPayment(prior.paymentReference!, errors.paymentReview);
      }
      return unresolved(prior.paymentReference!, resolved.kind);
    }
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
        if (customer && (!await lockCustomer(tx, customer.id) || !await activeCustomerSession(tx, customer.id, customer.binding))) throw new CheckoutInputError(errors.invalid);
        const cart = customer ? await readCart(tx, customer.id) : null;
        if (cart && (cart.revision !== revision || !matchesCart(cart.lines, items.map(cartLineInput)))) {
          // A concurrent identical submission can be replayed after it commits.
          if (identity && await tx.order.findUnique({ where: { checkoutKeyHash: identity.checkoutKeyHash }, select: { id: true } })) throw new CheckoutInputError("CHECKOUT_REPLAY");
          throw new CheckoutInputError(translations[locale === "en" ? "en" : "ua"].cart.sync.conflict);
        }
        const predecessors = customer && cart ? await findRelatedCartPayments(tx, customer.id, cart.lines) : [];
        const open = predecessors.find((prior) => !canReplaceCartPayment(prior));
        if (open?.checkoutKeyHash === identity?.checkoutKeyHash && open) throw new CheckoutInputError("CHECKOUT_REPLAY");
        if (open?.paymentReference) throw new PendingPaymentError(open.paymentReference);
        const priced = await priceOrderItems(tx, items, errors, requirePriceMatch || !!customer);
        if (!priced.success) throw new CheckoutInputError(priced.error);
        orderNumber = onlineConfig ? null : await allocateOrderNumber(tx);
        resultUrl = reference ? getAttemptResultPath(reference) : getOrderResultPath(orderNumber!);
        const subtotal = moneyDecimal(priced.subtotalMinor);
        const created = await tx.order.create({
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
            customerEmail: d.customerEmail || null,
            customerId,
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
                ...(item.productVariantId ? { productVariantId: item.productVariantId } : {}),
                productName: item.productName,
                productImageUrl: item.productImageUrl,
                optionsJson: item.optionsJson,
                price: item.price,
                quantity: item.quantity,
              })),
            },
          }, include: { items: true },
        });
        await flushVariantConstraints(tx);
        if (customer && cart) {
          const plan = cart.lines.map(({ generation, removed, quantity }) => ({ generation, removed, quantity }));
          if (predecessors.length) await tx.customerCartPurchase.updateMany({
            where: { orderId: { in: predecessors.map((prior) => prior.id) }, supersededByOrderId: null },
            data: { supersededByOrderId: created.id, reconcileUntil: null },
          });
          if (onlineConfig) await tx.customerCartPurchase.create({ data: { orderId: created.id, lines: plan } });
          else await consumeCart(tx, customer.id, plan);
        }
        return created;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
      break;
    } catch (error) {
      if (error instanceof PendingPaymentError) return pendingPayment(error.reference);
      if (error instanceof CheckoutInputError) {
        if (error.message === "CHECKOUT_REPLAY") return createOrder(data, items, locale, retryKey, retrySource, requirePriceMatch, accountCart);
        return { success: false, error: error.message };
      }
      if (identity && error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002" && Array.isArray(error.meta?.target) && error.meta.target.includes("checkoutKeyHash")) {
        return createOrder(data, items, locale, retryKey, retrySource, requirePriceMatch, accountCart);
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
