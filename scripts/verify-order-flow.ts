// Development-only QA: real order transaction, mandatory rollback, no notification/payment calls.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { loadEnvConfig } from "@next/env";
import { PrismaClient, type Prisma } from "@prisma/client";
import * as validation from "../src/lib/validations/checkout";
import * as i18n from "../src/lib/i18n";
import * as orderStatus from "../src/lib/order-status";
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
const fixtureNumbers: string[] = [];
const blocked = () => { externalCalls++; throw new Error("EXTERNAL_EFFECT_BLOCKED"); };
const action = sourceModule<{ createOrder: typeof OrderAction }>("src/lib/actions/create-order.ts", {
  "@/lib/i18n": i18n,
  "@/lib/validations/checkout": validation,
  "@/lib/order-status": orderStatus,
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
        assert.equal(order.items.length, 1);
        const line = order.items[0];
        assert.equal(Number(line.price) * line.quantity, expectedTotal);
        const after = await tx.product.findMany({ select: { id: true, stock: true }, orderBy: { id: "asc" } });
        for (let index = 0; index < before.length; index++) {
          assert.equal(after[index].stock, before[index].stock - (before[index].id === line.productId ? line.quantity : 0));
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
  const product = products.find((item) => item.options.length > 0 && item.options.every((option) => option.values.length)) ?? products[0];
  const options = Object.fromEntries(product.options.map((option) => [option.name, option.values[0].value]));
  expectedTotal = Number(product.price) + product.options.reduce((sum, option) => sum + Number(option.values[0].priceModifier), 0);
  const item: CartItem = { id: "qa-line", productId: product.id, name: "Untrusted client name", slug: product.slug, price: 0.01, quantity: 1, image: "/images/placeholder.svg", options };
  const data: validation.CheckoutInput = {
    customerName: "Batch", customerSurname: "QA", customerEmail: "batch13-qa@example.invalid", customerPhone: "+380000000000",
    deliveryType: "np_warehouse", npCityName: "QA city", npCityRef: "manual", npWarehouseRef: "manual", npWarehouseAddress: "QA delivery point",
    paymentMethod: "cash_on_delivery", comment: "Batch 1.3 rollback-only QA; never committed",
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
    for (const invalidItems of [[], [{ ...item, productId: "missing-product-qa" }], [{ ...item, quantity: 0 }], [{ ...item, quantity: 1.5 }], [{ ...item, quantity: product.stock + 1 }], [{ ...item, options: { ...options, unknown: "invalid" } }]]) {
      assert.equal((await action.createOrder(data, invalidItems, locale)).success, false);
    }
    if (product.options.length) assert.equal((await action.createOrder(data, [{ ...item, options: {} }], locale)).success, false);
  }
  assert.equal(transactions, 0, "Invalid input must never mutate stock/orders.");
  paymentConfigured = false;
  const unavailable = await action.createOrder({ ...data, paymentMethod: "card_online" }, [item], "en");
  assert.deepEqual(unavailable, { success: false, error: i18n.translations.en.checkout.errors.payment });
  paymentConfigured = true;
  for (const [delivery, payment] of [["np_warehouse", "cash_on_delivery"], ["np_parcel_locker", "pay_on_pickup"], ["np_courier", "card_online"]] as const) {
    expectedDelivery = delivery; expectedPayment = payment;
    await assert.rejects(action.createOrder({ ...data, deliveryType: delivery, paymentMethod: payment, npCourierAddress: "QA street 1", ...(delivery === "np_courier" ? { npWarehouseRef: "", npWarehouseAddress: "" } : {}) }, [item], "en"), (error) => error === rollback);
  }
  simulateStockRace = true;
  assert.deepEqual(await action.createOrder(data, [item], "en"), { success: false, error: i18n.translations.en.checkout.errors.stock });
  const after = await snapshot();
  assert.deepEqual(after, before, "Product/order records and stock must remain byte-for-byte unchanged.");
  assert.equal(externalCalls, 0);
  console.log(JSON.stringify({ result: "PASS", productsBeforeAfter: [before.products, after.products], ordersBeforeAfter: [before.orders, after.orders], rolledBackOrderNumbers: fixtureNumbers, optionsValidated: product.options.length, checks: "UA/EN required fields/email/phone; empty/unavailable/quantity/options/stock; authoritative DB price; three delivery/payment paths; totals/status/items/stock decrement; concurrent-stock guard; mandatory rollback", externalCalls }, null, 2));
}
verify().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => db.$disconnect());
