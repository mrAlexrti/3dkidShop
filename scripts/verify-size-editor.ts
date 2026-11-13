// Existing React elements + a tiny hook-state harness; no renderer/test dependency.
// DB CRUD uses new temporary products only, inside a mandatory rollback transaction.
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import * as jsxRuntime from "react/jsx-runtime";
import type { ReactElement } from "react";
import { loadEnvConfig } from "@next/env";
import { PrismaClient, type Prisma } from "@prisma/client";
import { z } from "zod";
import { translations } from "../src/lib/i18n";
import * as variants from "../src/lib/product-variants";
import * as sizesAdmin from "../src/lib/product-size-admin";
import * as media from "../src/lib/product-media";
import type { SizeEditor as Editor } from "../src/components/admin/size-editor";
import type * as ProductActions from "../src/lib/actions/products";
import type { createOrder as OrderAction } from "../src/lib/actions/create-order";
import type { CartItem } from "../src/types";
import * as checkout from "../src/lib/validations/checkout";
import * as orderStatus from "../src/lib/order-status";
import * as cartItems from "../src/lib/cart-items";
import { sourceModule } from "./source-module";

type Element = ReactElement<Record<string, unknown>>;
function elements(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(elements);
  if (!value || typeof value !== "object" || !("props" in value)) return [];
  const element = value as Element;
  return [element, ...elements(element.props.children)];
}

function checkEditor() {
  for (const locale of ["ua", "en"] as const) {
    const text = translations[locale].admin.sizes;
    let state: unknown;
    const { SizeEditor } = sourceModule<{ SizeEditor: typeof Editor }>("src/components/admin/size-editor.tsx", {
      react: { useState: (initial: () => unknown) => {
        if (state === undefined) state = initial();
        return [state, (update: (previous: unknown) => unknown) => { state = update(state); }];
      } },
      "react/jsx-runtime": jsxRuntime, "@/store/lang-store": { useLangStore: () => ({ locale, t: translations[locale] }) },
    });
    const props = { defaults: [], legacySizes: [{ id: "legacy", labelUa: "Старий розмір", modifier: "50" }] };
    const render = () => elements(SizeEditor(props));
    const hidden = () => render().find((node) => node.type === "input" && node.props.name === "variants");
    const payload = () => JSON.parse(hidden()!.props.value as string) as variants.SizeInput[];
    const changeText = (label: string, value: string) => {
      const input = render().find((node) => node.type === "input" && node.props["aria-label"] === label);
      assert.ok(input, label); (input.props.onChange as (event: unknown) => void)({ target: { value } });
    };
    const button = (label: string) => {
      const node = render().find((element) => element.type === "button" && element.props.children === label);
      assert.ok(node, label); (node.props.onClick as () => void)();
    };
    const toggle = (checked: boolean) => {
      const input = render().find((node) => node.type === "input" && node.props.type === "checkbox");
      assert.ok(input); (input.props.onChange as (event: unknown) => void)({ target: { checked } });
    };
    assert.equal(hidden(), undefined, "Untouched legacy editors must send no size mutation.");
    assert.ok(!render().some((node) => node.props["aria-label"] === `${text.price} 1`));
    toggle(true);
    assert.equal(payload().length, 1); assert.equal(payload()[0].id, undefined, "Legacy ID must not become an active size.");
    changeText(`${text.labelUa} 1`, "Компактний"); changeText(`${text.labelEn} 1`, "Compact");
    changeText(`${text.price} 1`, "175.50"); changeText(`${text.noteUa} 1`, "Нотатка"); changeText(`${text.noteEn} 1`, "Note");
    assert.equal(variants.sizeInputSchema.parse(payload())[0].price, 175.5);
    button(text.add); changeText(`${text.labelUa} 2`, "Великий"); changeText(`${text.labelEn} 2`, "Large"); changeText(`${text.price} 2`, "240");
    assert.equal(payload().length, 2);
    button(text.remove); assert.equal(payload().length, 1);
    changeText(`${text.price} 1`, "260.25"); assert.equal(variants.sizeInputSchema.parse(payload())[0].price, 260.25);
    toggle(false); assert.deepEqual(payload(), [], "Disabling sizes is an explicit zero-size instruction.");
    toggle(true); button(text.remove); assert.deepEqual(payload(), []);
    assert.ok(render().some((node) => node.type === "p" && node.props.children === text.none));
    state = undefined;
    const configured = [{ id: "configured", labelUa: "Налаштований", labelEn: "Configured", price: 20, noteUa: null, noteEn: null }];
    assert.equal(elements(SizeEditor({ defaults: configured })).find((node) => node.type === "input" && node.props.type === "checkbox")?.props.checked, true);
    assert.equal(elements(SizeEditor({ defaults: configured })).some((node) => node.props.name === "variants"), false);
  }
  const legacyGroup = { name: "Розмір", values: [{ id: "legacy", value: "Маленький", price: null, priceModifier: 100 }] };
  assert.deepEqual(variants.getSizeVariants([legacyGroup]), []);
  assert.equal(variants.hasConfiguredSizes([legacyGroup]), false);
  assert.equal(variants.startingPrice(123, [legacyGroup]), 123);
  assert.equal(variants.getLegacySizes([legacyGroup]).length, 1);
  console.log("PASS editor UA/EN: explicit enable, add/edit/remove, independent labels/notes/full prices, disable/zero sizes, untouched save omitted, legacy records never activated automatically.");
}

loadEnvConfig(process.cwd());
const db = new PrismaClient();
async function inventory() {
  const rows = await Promise.all([
    db.product.findMany({ orderBy: { id: "asc" }, include: { images: { orderBy: { id: "asc" } }, options: { orderBy: { id: "asc" }, include: { values: { orderBy: { id: "asc" } } } } } }),
    db.order.findMany({ orderBy: { id: "asc" }, include: { items: { orderBy: { id: "asc" } } } }), db.category.findMany({ orderBy: { id: "asc" } }),
  ]);
  return { products: rows[0].length, orders: rows[1].length, categories: rows[2].length, hash: createHash("sha256").update(JSON.stringify(rows)).digest("hex") };
}

async function verify() {
  checkEditor();
  const before = await inventory();
  const rollback = new Error("ROLLBACK_SIZE_EDITOR_QA");
  await assert.rejects(db.$transaction(async (tx) => {
    const category = await tx.category.findFirstOrThrow();
    const slug = `size-editor-qa-${randomUUID()}`;
    const { createProduct, updateProduct } = sourceModule<typeof ProductActions>("src/lib/actions/products.ts", {
      zod: { z }, "next/cache": { revalidatePath: () => {} }, "@/lib/actions/require-admin": { requireAdmin: async () => {} },
      "@/lib/prisma": { prisma: { product: tx.product, $transaction: (callback: (client: typeof tx) => Promise<unknown>) => callback(tx) } },
      "@/lib/product-media": media, "@/lib/product-variants": variants, "@/lib/product-size-admin": sizesAdmin,
    });
    const form = (sizes?: unknown) => {
      const data = new FormData();
      for (const [key, value] of Object.entries({ name: "Тимчасовий товар", nameEn: "Temporary product", slug, description: "Тимчасовий опис", descriptionEn: "Temporary description", price: "123", isOrderable: "on", categoryId: category.id, imageUrl: "https://example.invalid/main.webp", hoverGifUrl: "", isActive: "on" })) data.set(key, value);
      if (sizes !== undefined) data.set("variants", JSON.stringify(sizes));
      return data;
    };
    await createProduct(form());
    const product = await tx.product.findUniqueOrThrow({ where: { slug } });
    const stoppedBeforeOrderWrite = new Error("STOP_BEFORE_ORDER_WRITE");
    let preparedOrder: Prisma.OrderCreateArgs | undefined;
    const getPreparedOrder = (): Prisma.OrderCreateArgs | undefined => preparedOrder;
    const blocked = () => { throw new Error("NO_ORDER_OR_EXTERNAL_EFFECTS_IN_SIZE_EDITOR_QA"); };
    const { createOrder } = sourceModule<{ createOrder: typeof OrderAction }>("src/lib/actions/create-order.ts", {
      "@/lib/i18n": { translations }, "@/lib/validations/checkout": checkout, "@/lib/order-status": orderStatus,
      "@/lib/product-variants": variants, "@/lib/cart-items": cartItems,
      "@/lib/notifications/orders": { notifyOrderCreated: blocked }, "@/lib/payments/liqpay": { createLiqPayCheckout: blocked },
      "@/lib/payments/online-payment": { getOnlinePaymentConfig: () => null },
      "@/lib/payments/order-result": { getOrderResultPath: () => "/checkout/success?isolated-qa" },
      "@/lib/prisma": { prisma: {
        product: tx.product, order: { findUnique: blocked },
        $transaction: (callback: (client: unknown) => Promise<unknown>) => callback({
          product: { updateMany: async (args: Prisma.ProductUpdateManyArgs) => { assert.equal(args.where?.id, product.id); return { count: 1 }; } },
          order: { create: async (args: Prisma.OrderCreateArgs) => { preparedOrder = args; throw stoppedBeforeOrderWrite; } },
        }),
      } },
    });
    const checkoutData = { customerName: "Size", customerSurname: "QA", customerEmail: "size-editor@example.invalid", customerPhone: "+380000000000", deliveryType: "np_warehouse", npCityName: "QA city", npWarehouseRef: "manual", npWarehouseAddress: "QA delivery point", paymentMethod: "cash_on_delivery" };
    const checkAuthoritativePrice = async (variant: CartItem["variant"], expectedPrice: number) => {
      preparedOrder = undefined;
      const item: CartItem = { id: variants.productLineId(product.id, variant?.id), productId: product.id, slug, name: "Untrusted name", image: "/images/placeholder.svg", quantity: 1, price: 0.01, options: { Розмір: "Untrusted size" }, ...(variant ? { variant } : {}) };
      await assert.rejects(createOrder(checkoutData, [item], "en"), (error) => error === stoppedBeforeOrderWrite);
      const written = getPreparedOrder();
      assert.ok(written);
      const data = written.data as { subtotal: number; total: number; items: { create: { price: number; optionsJson: string | null }[] } };
      assert.equal(data.subtotal, expectedPrice); assert.equal(data.total, expectedPrice); assert.equal(data.items.create[0].price, expectedPrice);
      assert.equal(Boolean(data.items.create[0].optionsJson), Boolean(variant));
      if (variant) assert.equal(variants.orderSizeLabel(data.items.create[0].optionsJson, "en"), "New");
    };
    const groups = () => tx.productOption.findMany({ where: { productId: product.id }, include: { values: { orderBy: { id: "asc" } } }, orderBy: { id: "asc" } });
    assert.deepEqual(await groups(), []);
    await updateProduct(product.id, form([{ labelUa: "Компактний", labelEn: "Compact", price: 175.5, noteUa: "Примітка", noteEn: "Note" }, { labelUa: "Великий", labelEn: "Large", price: 240 }]));
    const configured = variants.getSizeVariants(await groups());
    assert.equal(configured.length, 2);
    const compact = configured.find((size) => size.labelEn === "Compact")!;
    const historicalSnapshot = variants.snapshotSize(compact);
    assert.equal(compact.price, 175.5); assert.equal(compact.noteEn, "Note");
    await updateProduct(product.id, form([{ id: compact.id, labelUa: "Оновлений", labelEn: "Updated", price: 188.25, noteUa: "Нова примітка", noteEn: "Updated note" }]));
    const updated = variants.getSizeVariants(await groups());
    assert.equal(updated.length, 1); assert.equal(updated[0].id, compact.id); assert.equal(updated[0].price, 188.25);
    assert.equal(variants.orderSizeLabel(historicalSnapshot, "en"), "Compact");
    const unchanged = await groups();
    for (const invalid of [[{ labelUa: "Invalid", price: 0 }], [{ labelUa: "Invalid", price: -1 }], [{ labelUa: "Invalid", price: 1.234 }], [{ labelUa: "Same", price: 1 }, { labelUa: "same", price: 2 }]]) await assert.rejects(updateProduct(product.id, form(invalid)));
    assert.deepEqual(await groups(), unchanged);
    await updateProduct(product.id, form([]));
    assert.deepEqual(variants.getSizeVariants(await groups()), []);
    assert.equal(Number((await tx.product.findUniqueOrThrow({ where: { id: product.id } })).price), 123);
    const group = (await groups())[0];
    const legacy = await tx.productOptionValue.create({ data: { optionId: group.id, value: "Маленький", priceModifier: 50 } });
    await updateProduct(product.id, form());
    assert.deepEqual(await tx.productOptionValue.findUniqueOrThrow({ where: { id: legacy.id } }), legacy, "Saving other fields must preserve legacy data.");
    await updateProduct(product.id, form([{ labelUa: "Новий", labelEn: "New", price: 200 }]));
    assert.equal(variants.getSizeVariants(await groups()).length, 1);
    const selected = variants.getSizeVariants(await groups())[0];
    // Rollback-only fixture: even a stale nonzero modifier cannot alter the explicit price.
    await tx.productOptionValue.update({ where: { id: selected.id }, data: { priceModifier: 987.65 } });
    await checkAuthoritativePrice({ id: selected.id, labelUa: "Forged client label", labelEn: "Forged client label" }, 200);
    assert.deepEqual(await tx.productOptionValue.findUniqueOrThrow({ where: { id: legacy.id } }), legacy);
    await assert.rejects(updateProduct(product.id, form([{ id: legacy.id, labelUa: "Legacy", labelEn: "Legacy", price: 99 }])));
    await updateProduct(product.id, form([]));
    assert.deepEqual(await tx.productOptionValue.findUniqueOrThrow({ where: { id: legacy.id } }), legacy, "Disabling configured sizes must never delete legacy rows.");
    assert.equal(variants.hasConfiguredSizes(await groups()), false);
    assert.equal(variants.startingPrice(123, await groups()), 123);
    await checkAuthoritativePrice(undefined, 123);
    assert.equal((await tx.product.findUniqueOrThrow({ where: { id: product.id } })).isOrderable, true);
    throw rollback;
  }, { timeout: 60000 }), (error) => error === rollback);
  assert.deepEqual(await inventory(), before, "All pre-existing catalog/order/category/image/option data must remain unchanged after rollback.");
  console.log(JSON.stringify({ result: "PASS actual Admin create/edit/price/label/note/remove/zero-size actions and legacy preservation; all fixtures rolled back", beforeAfter: before }));
}
verify().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => db.$disconnect());
