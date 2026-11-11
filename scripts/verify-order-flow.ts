// Development-only QA: real order transaction, mandatory rollback, no notification/payment calls.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { loadEnvConfig } from "@next/env";
import { PrismaClient, type Prisma } from "@prisma/client";
import * as validation from "../src/lib/validations/checkout";
import * as i18n from "../src/lib/i18n";
import * as orderStatus from "../src/lib/order-status";
import * as variants from "../src/lib/product-variants";
import * as cartItems from "../src/lib/cart-items";
import { sourceModule } from "./source-module";
import type { createOrder as OrderAction } from "../src/lib/actions/create-order";
import type { CartItem } from "../src/types";

loadEnvConfig(process.cwd());
const db = new PrismaClient();
const rollback = new Error("MANDATORY_ORDER_QA_ROLLBACK");
let transactions = 0;
let externalCalls = 0;
let paymentConfigured = true;
let simulateStockRace = false;
let expectedTotal = 0;
let expectedDelivery = "";
let expectedPayment: validation.CheckoutInput["paymentMethod"] = "cash_on_delivery";
let expectedItems: CartItem[] = [];
const fixtureNumbers: string[] = [];
const blocked = () => { externalCalls++; throw new Error("EXTERNAL_EFFECT_BLOCKED"); };
const action = sourceModule<{ createOrder: typeof OrderAction }>("src/lib/actions/create-order.ts", {
  "@/lib/i18n": i18n,
  "@/lib/validations/checkout": validation,
  "@/lib/order-status": orderStatus,
  "@/lib/product-variants": variants,
  "@/lib/cart-items": cartItems,
  "@/lib/notifications/orders": { notifyOrderCreated: blocked },
  "@/lib/payments/liqpay": { isLiqPayConfigured: () => paymentConfigured, createLiqPayCheckout: blocked },
  "@/lib/prisma": { prisma: {
    product: db.product,
    order: { findUnique: blocked }, // Must never reach the post-commit phase.
    $transaction: async (callback: (tx: Prisma.TransactionClient) => Promise<unknown>) => {
      transactions++;
      return db.$transaction(async (tx) => {
        if (simulateStockRace) {
          return callback({ ...tx, product: { ...tx.product, updateMany: async () => ({ count: 0 }) } } as unknown as Prisma.TransactionClient);
        }
        const before = await tx.product.findMany({ select: { id: true, stock: true }, orderBy: { id: "asc" } });
        await callback(tx);
        const order = await tx.order.findFirstOrThrow({ where: { customerEmail: "batch13-qa@example.invalid" }, include: { items: true }, orderBy: { createdAt: "desc" } });
        assert.equal(Number(order.subtotal), expectedTotal);
        assert.equal(Number(order.total), expectedTotal);
        assert.equal(Number(order.shippingCost), 0);
        assert.equal(order.status, orderStatus.getInitialOrderStatus(expectedPayment));
        assert.equal(order.deliveryMethod, expectedDelivery);
        assert.equal(order.customerName, "Batch QA");
        assert.equal(order.items.length, expectedItems.length);
        assert.equal(order.items.reduce((sum, line) => sum + Number(line.price) * line.quantity, 0), expectedTotal);
        for (const item of expectedItems) {
          const line = order.items.find((line) => line.productId === item.productId && (item.variant ? JSON.parse(line.optionsJson ?? "null")?.size?.id === item.variant.id : line.optionsJson === null));
          assert.ok(line, "The selected size must survive into the historical order snapshot.");
          assert.equal(line.quantity, item.quantity);
          if (item.variant) {
            const product = await tx.product.findUniqueOrThrow({ where: { id: item.productId }, include: { options: { include: { values: true } } } });
            const size = variants.getSizeVariants(product.options).find((size) => size.id === item.variant!.id)!;
            assert.equal(Number(line.price), size.price);
            assert.equal(variants.orderSizeLabel(line.optionsJson, "ua"), size.labelUa);
            assert.equal(variants.orderSizeLabel(line.optionsJson, "en"), size.labelEn);
          }
        }
        const after = await tx.product.findMany({ select: { id: true, stock: true }, orderBy: { id: "asc" } });
        for (let index = 0; index < before.length; index++) {
          assert.equal(after[index].stock, before[index].stock - expectedItems.filter((item) => item.productId === before[index].id).reduce((sum, item) => sum + item.quantity, 0));
        }
        if (expectedDelivery === "np_courier") assert.equal(order.novaPoshtaBranch, "QA street 1");
        else assert.equal(order.novaPoshtaBranch, "QA delivery point");
        fixtureNumbers.push(order.number);
        throw rollback; // Always before commit; the action cannot notify or construct a payment.
      }, { timeout: 20_000 });
    },
  } },
});

async function snapshot() {
  const [products, orders] = await Promise.all([
    db.product.findMany({ orderBy: { id: "asc" } }),
    db.order.findMany({ orderBy: { id: "asc" }, include: { items: { orderBy: { id: "asc" } } } }),
  ]);
  return { products: products.length, orders: orders.length, hash: createHash("sha256").update(JSON.stringify({ products, orders })).digest("hex") };
}

async function verify() {
  const before = await snapshot();
  const products = await db.product.findMany({ where: { isActive: true, stock: { gt: 0 } }, include: { options: { include: { values: true } } } });
  assert.ok(products.length, "A stocked development product is required.");
  const product = products.find((item) => variants.hasConfiguredSizes(item.options))!;
  assert.ok(product, "An intentional configured-size fixture is required.");
  const sizes = variants.getSizeVariants(product.options);
  const makeItem = (record: typeof product, size?: variants.SizeVariant): CartItem => ({ id: variants.productLineId(record.id, size?.id), productId: record.id, name: "Untrusted client name", slug: record.slug, price: 0.01, quantity: 1, image: "/images/placeholder.svg", ...(size ? { variant: { id: size.id, labelUa: "Forged label", labelEn: "Forged label" } } : {}) });
  const item = makeItem(product, sizes[0]);
  const data: validation.CheckoutInput = {
    customerName: "Batch", customerSurname: "QA", customerEmail: "batch13-qa@example.invalid", customerPhone: "+380000000000",
    deliveryType: "np_warehouse", npCityName: "QA city", npCityRef: "manual", npWarehouseRef: "manual", npWarehouseAddress: "QA delivery point",
    paymentMethod: "cash_on_delivery", comment: "Batch 1.4 rollback-only QA; never committed",
  };
  for (const locale of ["ua", "en"] as const) {
    for (const invalid of [
      { customerName: "  " }, { customerSurname: "" }, { customerEmail: "invalid" },
      { customerPhone: "" }, { customerPhone: "abcdefghij" }, { customerPhone: "123" },
      { npCityName: "" }, { npWarehouseRef: "" }, { npWarehouseAddress: " " },
      { deliveryType: "np_parcel_locker", npWarehouseRef: "" },
      { deliveryType: "np_courier", npCourierAddress: "" },
      { paymentMethod: "invalid" },
    ]) {
      const parsed = validation.getCheckoutSchema(locale).safeParse({ ...data, ...invalid });
      assert.equal(parsed.success, false);
      const result = await action.createOrder({ ...data, ...invalid }, [item], locale);
      assert.equal(result.success, false);
      if (!result.success) assert.ok(Object.values(i18n.translations[locale].checkout.validation).includes(result.error as never));
    }
    for (const invalidItems of [[], [{ ...item, productId: "missing-product-qa" }], [{ ...item, quantity: 0 }], [{ ...item, quantity: 1.5 }], [{ ...item, quantity: product.stock + 1 }], [{ ...item, variant: { id: "nonexistent-size", labelUa: "Invalid", labelEn: "Invalid" } }], [makeItem(product)], [{ ...item, quantity: product.stock }, { ...makeItem(product, sizes[1]), quantity: 1 }]]) {
      assert.equal((await action.createOrder(data, invalidItems, locale)).success, false);
    }
    const simple = products.find((record) => !variants.hasConfiguredSizes(record.options))!;
    assert.equal((await action.createOrder(data, [{ ...makeItem(simple), variant: item.variant }], locale)).success, false, "A size belonging to a different product must be rejected.");
  }
  assert.equal(transactions, 0, "Invalid input must never mutate stock/orders.");
  paymentConfigured = false;
  const unavailable = await action.createOrder({ ...data, paymentMethod: "card_online" }, [item], "en");
  assert.deepEqual(unavailable, { success: false, error: i18n.translations.en.checkout.errors.payment });
  paymentConfigured = true;
  expectedItems = [item]; expectedTotal = sizes[0].price!;
  for (const [delivery, payment] of [["np_warehouse", "cash_on_delivery"], ["np_parcel_locker", "pay_on_pickup"], ["np_courier", "card_online"]] as const) {
    expectedDelivery = delivery; expectedPayment = payment;
    await assert.rejects(action.createOrder({ ...data, deliveryType: delivery, paymentMethod: payment, npCourierAddress: "QA street 1", ...(delivery === "np_courier" ? { npWarehouseRef: "", npWarehouseAddress: "" } : {}) }, [item], "en"), (error) => error === rollback);
  }
  expectedDelivery = "np_warehouse"; expectedPayment = "cash_on_delivery";
  let simpleChecks = 0; let sizeChecks = 0;
  for (const record of products) {
    const configured = variants.getSizeVariants(record.options);
    for (const size of configured.length ? configured : [undefined]) {
      expectedItems = [makeItem(record, size)]; expectedTotal = size?.price ?? Number(record.price);
      await assert.rejects(action.createOrder(data, expectedItems, "en"), (error) => error === rollback);
      if (size) sizeChecks++; else simpleChecks++;
    }
  }
  assert.equal(simpleChecks, 8); assert.equal(sizeChecks, 6);
  expectedItems = [makeItem(product, sizes[0]), makeItem(product, sizes[1])];
  expectedTotal = sizes[0].price! + sizes[1].price!;
  await assert.rejects(action.createOrder(data, expectedItems, "en"), (error) => error === rollback);
  simulateStockRace = true;
  assert.deepEqual(await action.createOrder(data, [item], "en"), { success: false, error: i18n.translations.en.checkout.errors.stock });
  const after = await snapshot();
  assert.deepEqual(after, before, "Product/order records and stock must remain byte-for-byte unchanged.");
  assert.equal(externalCalls, 0);
  console.log(JSON.stringify({ result: "PASS", productsBeforeAfter: [before.products, after.products], ordersBeforeAfter: [before.orders, after.orders], rolledBackOrderNumbers: fixtureNumbers, simpleChecks, sizeChecks, checks: "UA/EN validation; nonexistent/missing/cross-product size rejection; forged client price/label ignored; all 8 base prices and 6 explicit size prices; selected-size snapshots; two sizes share product stock; three delivery/payment paths; concurrent-stock guard; mandatory rollback", externalCalls }, null, 2));
}
verify().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => db.$disconnect());
