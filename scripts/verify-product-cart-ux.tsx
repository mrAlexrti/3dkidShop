// Batch 1.7.5: actual source, isolated storage/Prisma fixtures. No provider or DB calls.
import assert from "node:assert/strict";
import * as React from "react";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { z } from "zod";
import { sourceModule } from "./source-module";
import * as limits from "../src/lib/cart-limits";
import * as cartItems from "../src/lib/cart-items";
import { CART_STORAGE_KEY, GUEST_CART_DRAFT_KEY, GUEST_CART_RECEIPT_PREFIX, migratedCart } from "../src/lib/cart-persistence";
import * as reconciliation from "../src/lib/cart-reconciliation";
import * as variants from "../src/lib/product-variants";
import * as media from "../src/lib/product-media";
import * as slugs from "../src/lib/product-slug";
import * as adminValidation from "../src/lib/admin-form-validation";
import * as galleryAdmin from "../src/lib/product-gallery-admin";
import * as galleryHelpers from "../src/lib/gallery";
import * as content from "../src/lib/product-content";
import { translations } from "../src/lib/i18n";
import { ProductDescription } from "../src/components/product/product-description";
import type { CartItem } from "../src/types";
import type { useCartStore as Store } from "../src/store/cart-store";
import type { Prisma } from "@prisma/client";
import * as checkoutValidation from "../src/lib/validations/checkout";
import * as utils from "../src/lib/utils";
import * as icons from "lucide-react";
import type { CheckoutInput } from "../src/lib/validations/checkout";

const blocked = () => { throw new Error("EXTERNAL_EFFECT_FORBIDDEN"); };
globalThis.fetch = blocked;
const storageValues = new Map<string, string>();
const storage = createJSONStorage(() => ({ getItem: (key) => storageValues.get(key) ?? null,
  setItem: (key, value) => { storageValues.set(key, value); }, removeItem: (key) => { storageValues.delete(key); } }));
type Product = reconciliation.CartProduct;
const item: CartItem = { id: "p1", productId: "p1", name: "Old", slug: "old", image: "/old.webp", price: 10, quantity: 2 };
const product: Product = { id: "p1", name: "Дракон", nameEn: "Dragon", slug: "dragon", image: "/dragon.webp", price: 10, isOrderable: true, variants: [] };
let products = [product];
let lookup: (ids: string[]) => Promise<Product[]> = async () => structuredClone(products);
const { useCartStore } = sourceModule<{ useCartStore: typeof Store }>("src/store/cart-store.ts", {
  zustand: { create }, "zustand/middleware": { persist: (config: Parameters<typeof persist>[0], options: Parameters<typeof persist>[1]) => persist(config, { ...options, storage }) },
  "@/lib/cart-items": cartItems, "@/lib/cart-limits": limits, "@/lib/cart-reconciliation": reconciliation,
  "@/lib/actions/reconcile-cart": { lookupCartProducts: (ids: string[]) => lookup(ids) },
});
const cart = () => useCartStore.getState();
function reset(lines: CartItem[] = [item]) {
  cart().clear(); products = [structuredClone(product)]; lookup = async () => structuredClone(products);
  for (const line of lines) cart().addItem(line);
}
let passed = 0;
function pass(name: string) { passed++; console.log(`PASS ${name}`); }

async function verify() {
  assert.equal(utils.formatPrice(270), "270\u00a0₴");
  assert.equal(utils.formatPrice("1234.50", "UAH", "ua"), "1\u00a0234,50\u00a0₴");
  assert.equal(utils.formatPrice("1234.50", "UAH", "en"), "₴1,234.50");
  assert.equal(utils.formatPrice(-1.005, "UAH", "en"), "-₴1.01");
  assert.equal(utils.formatPrice(1234.5, "USD"), "$1,234.50");
  assert.equal(utils.formatPrice(Number.NaN), "0\u00a0₴");
  pass("stable UAH and USD display patterns preserve locale, grouping, sign and rounding");

  for (const version of [0, 1]) {
    const persisted = { ...item, id: "p1-small", quantity: 3, image: "https://oldstore.public.blob.vercel-storage.com/retired.webp", variant: { id: "small", labelUa: "S", labelEn: "Small" } };
    storageValues.set("stikr-cart-v2", JSON.stringify({ state: { items: [persisted], verification: "verified", verifiedRevision: 42, checkoutRevision: 42 }, version }));
    await useCartStore.persist.rehydrate();
    assert.deepEqual(cart().items, [{ ...persisted, image: reconciliation.CART_IMAGE_PLACEHOLDER }]);
    assert.equal(cart().verification, "idle"); assert.equal(cart().ready(), false);
    assert.equal(reconciliation.cartImageSource(persisted, cart()), reconciliation.CART_IMAGE_PLACEHOLDER);
  }
  pass("legacy/current hydration masks remote images and ignores persisted verification while preserving IDs, quantities and selected sizes");

  const source = JSON.stringify({ version: 2, state: { items: [item], checkoutRevision: 1 } });
  const batch = "c08cdb59-9f14-49af-b8d7-ba292a37fc40";
  const pending = JSON.stringify({ version: 2, state: { items: [item], checkoutRevision: 1, guestBatch: batch, transferPending: true } });
  const completed = JSON.stringify({ version: 2, state: { items: [], checkoutRevision: 2, guestBatch: batch, transferFinished: true } });
  const newer = JSON.stringify({ version: 2, state: { items: [{ ...item, quantity: 4 }], checkoutRevision: 3 } });
  const drafts = new Map<string, string>([
    [CART_STORAGE_KEY, source],
    [GUEST_CART_DRAFT_KEY, JSON.stringify({ source, pending })],
    [GUEST_CART_RECEIPT_PREFIX + batch, JSON.stringify({ pending, cart: completed })],
  ]);
  const guestStorage = { getItem: (key: string) => drafts.get(key) ?? null,
    setItem: (key: string, value: string) => { drafts.set(key, value); },
    removeItem: (key: string) => { drafts.delete(key); } };
  assert.equal(migratedCart(guestStorage), completed);
  guestStorage.setItem(CART_STORAGE_KEY, newer);
  assert.equal(migratedCart(guestStorage), newer, "A late draft or acknowledgment must leave a different guest version intact");
  pass("guest import overlays and late receipts apply only to their exact saved source");
  reset(); await useCartStore.persist.rehydrate(); assert.equal(cart().ready(), false);
  assert.equal(await cart().verifyCart("en"), true);
  assert.equal(cart().items[0].name, "Dragon"); assert.equal(cart().items[0].image, product.image);
  assert.equal(cart().items[0].quantity, 2); assert.equal(cart().items[0].id, item.id);
  assert.equal(JSON.parse(storageValues.get("stikr-cart-v2")!).state.items[0].image, reconciliation.CART_IMAGE_PLACEHOLDER);
  products[0].image = "/replacement.webp"; await cart().verifyCart("en", true);
  assert.equal(cart().items[0].image, "/replacement.webp");
  assert.equal(reconciliation.cartImageSource(cart().items[0], cart()), "/replacement.webp");
  assert.equal(cart().total(), 20); pass("unchanged persisted selection refreshes display and preserves identity/quantity");

  products[0].price = 15; assert.equal(await cart().verifyCart("ua", true), false);
  assert.equal(cart().items[0].price, 15); assert.equal(cart().total(), 30); assert.deepEqual(cart().priceChanges, [item.id]);
  assert.equal(cart().items[0].name, "Дракон");
  await useCartStore.persist.rehydrate(); assert.equal(cart().ready(), false); assert.deepEqual(cart().priceChanges, [item.id]);
  await cart().verifyCart("ua"); cart().reviewPrices(); assert.equal(cart().ready(), true);
  cart().updateQuantity(item.id, 3); assert.equal(cart().ready(), false); assert.equal(cart().total(), 45);
  pass("price changes require explicit review, including after rehydration; mutations invalidate readiness");

  for (const mode of ["deleted", "inactive", "non-orderable"] as const) {
    reset(); products = mode === "non-orderable" ? [{ ...product, isOrderable: false }] : [];
    assert.equal(await cart().verifyCart("en"), false); assert.equal(cart().items.length, 1);
    assert.equal(cart().issues[item.id], "unavailable"); assert.equal(cart().total(), 0);
    assert.equal(cart().items[0].image, mode === "non-orderable" ? product.image : reconciliation.CART_IMAGE_PLACEHOLDER);
    assert.equal(cart().items[0].quantity, item.quantity); assert.equal(cart().items[0].productId, item.productId);
    cart().removeItem(item.id); assert.equal(cart().items.length, 0);
    pass(`${mode} selection preserved, explained and blocked; stale price excluded`);
  }
  const small: variants.SizeVariant = { id: "small", labelUa: "Маленький", labelEn: "Small", price: 12, noteUa: null, noteEn: null };
  const large = { ...small, id: "large", labelUa: "Великий", labelEn: "Large", price: 20 };
  const line = (size: variants.SizeVariant): CartItem => ({ ...item, id: `p1-${size.id}`, price: size.price!, variant: size });
  reset([line(small), line(large)]); products[0].variants = [small, large];
  assert.equal(await cart().verifyCart("en"), true); assert.equal(cart().items.length, 2);
  cart().addItem(line(small)); assert.equal(cart().items[0].quantity, 4); assert.equal(cart().items[1].quantity, 2);
  products[0].variants = [{ ...large, price: 25 }];
  await cart().verifyCart("en"); assert.equal(cart().items.length, 2);
  assert.equal(cart().issues["p1-small"], "sizeUnavailable"); assert.equal(cart().items[0].variant?.id, "small");
  assert.equal(cart().items[1].price, 25); assert.deepEqual(cart().priceChanges, ["p1-large"]);
  pass("removed size is retained, independent sizes stay separate, same size merges, size price refreshes");
  const unresolved = cartItems.normalizeCartItems([{ ...item, options: { Розмір: "Маленький" } }]);
  assert.equal(unresolved[0].variant?.id, "LEGACY_UNRESOLVED");
  assert.equal(unresolved[0].variant?.labelUa, "Маленький");
  reset(unresolved); await cart().verifyCart("en");
  assert.equal(cart().issues[unresolved[0].id], "sizeUnavailable"); assert.equal(cart().ready(), false);
  pass("legacy size label without stable ID is retained as unresolved, never substituted with a simple product");

  reset(); lookup = async () => { throw new Error("offline"); };
  assert.equal(await cart().verifyCart("en"), false); assert.equal(cart().verification, "error");
  assert.deepEqual(cart().items, [{ ...item, image: reconciliation.CART_IMAGE_PLACEHOLDER }]); assert.equal(cart().ready(), false);
  lookup = async () => [product]; assert.equal(await cart().verifyCart("en"), true);
  lookup = async () => { throw new Error("offline-after-verification"); };
  await cart().verifyCart("en", true); assert.equal(cart().items[0].image, reconciliation.CART_IMAGE_PLACEHOLDER); assert.equal(cart().ready(), false);
  pass("transient failure retains selections and blocks checkout until retry");

  reset(); const responses: ((value: Product[]) => void)[] = [];
  let requests = 0; lookup = () => { requests++; return new Promise((resolve) => responses.push(resolve)); };
  const old = cart().verifyCart("en"); const dedup = cart().verifyCart("en"); assert.equal(old, dedup); assert.equal(requests, 1);
  cart().updateQuantity(item.id, 4); const fresh = cart().verifyCart("en");
  assert.equal(cart().items[0].image, reconciliation.CART_IMAGE_PLACEHOLDER);
  responses[1]([{ ...product, image: "/fresh.webp", price: 30 }]); await fresh;
  responses[0]([{ ...product, image: "/obsolete.webp", price: 1 }]); await old;
  assert.equal(cart().items[0].quantity, 4); assert.equal(cart().items[0].price, 30);
  assert.equal(cart().items[0].image, "/fresh.webp");
  cart().reviewPrices(); assert.equal(cart().ready(), true);
  pass("requests deduplicate; out-of-order response cannot overwrite newer cart edits");

  for (const quantity of [0, -1, 1.2, NaN, Infinity, limits.MAX_QUANTITY + 1]) {
    assert.deepEqual(cartItems.normalizeCartItems([{ ...item, quantity }]), []);
    cart().updateQuantity(item.id, quantity); assert.equal(cart().items[0].quantity, 4);
  }
  for (const corrupt of [{ ...item, productId: "../private" }, { ...item, price: Infinity }, { ...item, variant: { id: "" } }, { ...item, price: -1 }, { ...item, price: 0.001 }]) {
    assert.deepEqual(cartItems.normalizeCartItems([corrupt]), []);
  }
  assert.equal(limits.cartTotalMinor([{ price: .01, quantity: limits.MAX_QUANTITY }]), limits.MAX_QUANTITY);
  assert.equal(limits.cartTotalMinor([{ price: 99999999.99, quantity: 2 }]), null);
  reset([{ ...item, price: .01, quantity: limits.MAX_QUANTITY }]); cart().addItem({ ...item, price: .01, quantity: 1 });
  assert.equal(cart().items[0].quantity, limits.MAX_QUANTITY);
  reset(); products[0].price = 99999999.99; await cart().verifyCart("en");
  assert.equal(cart().ready(), false); cart().updateQuantity(item.id, 1); assert.equal(cart().items[0].quantity, 1);
  pass("invalid legacy values and Int overflow rejected; decimal total bounded; over-limit carts can be reduced");

  let query: Prisma.ProductFindManyArgs | undefined;
  const action = sourceModule<typeof import("../src/lib/actions/reconcile-cart")>("src/lib/actions/reconcile-cart.ts", {
    zod: { z }, "@/lib/cart-limits": limits, "@/lib/product-variants": variants,
    "@/lib/prisma": { prisma: { product: { findMany: async (args: Prisma.ProductFindManyArgs) => { query = args;
      return [{ ...product, price: "10.00", images: [], options: [] }]; } } } },
  });
  for (const invalid of [[], ["x".repeat(129)], ["../secret"], Array(101).fill("p1"), "p1", [null]]) await assert.rejects(action.lookupCartProducts(invalid));
  const publicProducts = await action.lookupCartProducts(["p1", "p1"]);
  assert.deepEqual(query?.where, { id: { in: ["p1"] }, isActive: true });
  assert.equal(query?.select?.description, undefined); assert.equal(query?.select?.stock, undefined);
  assert.equal(publicProducts[0].image, "/images/placeholder.svg");
  pass("public lookup is bounded, batched, read-only and excludes inactive/private data");

  // Exercise the real submit handler with deterministic hooks and delayed actions.
  // Only form registration/rendering is stubbed; the cart and handler are actual source.
  let orderCalls = 0; let releaseOrder: (() => void) | undefined; let releaseKey: (() => void) | undefined;
  const formData = { customerName: "QA", customerSurname: "Shopper", customerEmail: "qa@example.invalid", customerPhone: "+380000000000", deliveryType: "np_warehouse", npCityName: "QA", npWarehouseAddress: "QA", paymentMethod: "cash_on_delivery" } as CheckoutInput;
  const formStore = Object.assign(() => cart(), { getState: cart });
  const submitRef = { current: false };
  const checkoutForm = sourceModule<typeof import("../src/components/checkout/checkout-form")>("src/components/checkout/checkout-form.tsx", {
    "@/components/cart/cart-readiness": { CartAmount: "span" },
    react: { useMemo: (callback: () => unknown) => callback(), useState: (value: unknown) => [value, () => {}], useRef: () => submitRef },
    "react/jsx-runtime": jsx, "lucide-react": icons, "@/lib/utils": utils,
    "@/lib/validations/checkout": checkoutValidation, "@hookform/resolvers/zod": { zodResolver: () => ({}) },
    "react-hook-form": { useForm: () => ({ register: () => ({}), handleSubmit: (callback: unknown) => callback, setValue: () => {}, control: {}, formState: { errors: {} } }), useWatch: ({ name }: { name: string }) => name === "deliveryType" ? "np_warehouse" : "" },
    "@/components/ui/button": { Button: "button" }, "@/store/cart-store": { useCartStore: formStore, refreshAccountCart: async () => {} },
    "@/store/lang-store": { useLangStore: () => ({ t: translations.en, locale: "en" }) },
    "next/navigation": { useRouter: () => ({ push: () => {} }) }, sonner: { toast: { error: () => {}, success: () => {}, message: () => {} } },
    "./use-np-lookups": { useCitySearch: () => ({ cities: [], search: () => {}, clear: () => {} }), useWarehouses: () => ({ warehouses: [], search: () => {}, clear: () => {} }) },
    "@/lib/payments/checkout-session": { onlineCheckoutKey: () => new Promise<string>((resolve) => { releaseKey = () => resolve("qa-key"); }), checkoutRetrySource: () => undefined, rememberCheckoutResult: blocked },
    "@/lib/actions/create-order": { createOrder: (...args: unknown[]) => { orderCalls++; assert.equal(args[5], true);
      return new Promise((resolve) => { releaseOrder = () => resolve({ success: true, emailSent: false, resultUrl: "/checkout/success" }); }); } },
  });
  const submit = () => checkoutForm.CheckoutForm({ onlineCardEnabled: true }).props.onSubmit as (data: CheckoutInput) => Promise<void>;
  reset(); await submit()(formData); assert.equal(orderCalls, 0);
  await cart().verifyCart("en"); const handler = submit();
  const submission = handler(formData); await handler(formData); await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(orderCalls, 1); cart().updateQuantity(item.id, 3); releaseOrder!(); await submission;
  assert.equal(cart().items[0].quantity, 3, "COD result must not clear newer selections");
  reset(); await cart().verifyCart("en"); products[0].price = 20; await submit()(formData); assert.equal(orderCalls, 1);
  reset(); await cart().verifyCart("en"); const keyRace = submit()({ ...formData, paymentMethod: "card_online" });
  await new Promise<void>((resolve) => setImmediate(resolve)); cart().updateQuantity(item.id, 4); releaseKey!(); await keyRace;
  assert.equal(orderCalls, 1);
  pass("real checkout handler blocks unverified/changed quotes, suppresses double submit, protects async identity edits and newer COD carts");
  const guestState = cart();
  useCartStore.setState({ accountScope: "fixture", accountRevision: 5, ready: () => true,
    verifyCart: async () => {
      useCartStore.setState({ accountRevision: 6, items: [...guestState.items, { ...item, id: "other-device-item" }] });
      return true;
    } });
  await submit()(formData);
  assert.equal(orderCalls, 1, "The original click cannot order goods added on another device during verification");
  useCartStore.setState({ verifyCart: async () => true });
  for (const paymentMethod of ["cash_on_delivery", "card_online"] as const) {
    const calls: number = orderCalls;
    const start = submit()({ ...formData, paymentMethod });
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(orderCalls, calls + 1, "Account checkout does not wait for a browser-local checkout identity");
    releaseOrder!();
    await start;
  }
  useCartStore.setState(guestState);
  pass("account checkout requires explicit review when confirmation sees another device's change");

  assert.equal(slugs.generateProductSlug("  Їжачок Ґудзик — Жовтий 3D!  "), "yizhachok-gudzyk-zhovtyy-3d");
  assert.equal(slugs.generateProductSlug("М’який / Єнот & Щука"), "myakyy-yenot-shchuka");
  assert.equal(slugs.generateProductSlug("--- ☀ ---"), "");
  let state = { name: "", slug: "", manual: false };
  state = slugs.slugFromNameChange(state, "Дракон"); assert.equal(state.slug, "drakon");
  state = { ...state, slug: "custom-approved", manual: true };
  assert.equal(slugs.slugFromNameChange(state, "Новий").slug, "custom-approved");
  assert.equal(slugs.slugFromNameChange({ ...state, slug: "Historical_URL" }, "Новий").slug, "Historical_URL");
  for (const invalid of ["", "Foo", "a b", "a--b", "-a", "a-", "../a", "слон", "x".repeat(161)]) assert.equal(slugs.productSlugSchema.safeParse(invalid).success, false);
  pass("Ukrainian slug normalization; manual overrides and existing URLs remain stable; invalid custom slugs rejected");

  type Element = React.ReactElement<Record<string, unknown>>;
  function elements(value: unknown): Element[] {
    if (Array.isArray(value)) return value.flatMap(elements);
    if (!value || typeof value !== "object" || !("props" in value)) return [];
    const element = value as Element;
    return [element, ...elements(element.props.children)];
  }
  for (const existing of [false, true]) {
    const states: unknown[] = []; let cursor = 0;
    const { ProductForm } = sourceModule<typeof import("../src/components/admin/product-form")>("src/components/admin/product-form.tsx", {
      "@/components/admin/admin-form": { AdminForm: "form", AdminFieldError: "div", AdminSaveButton: "button" }, "@/components/admin/gallery-editor": { GalleryEditor: "div" },
      react: { Fragment: React.Fragment, useRef: (value: unknown) => ({ current: value }), useTransition: () => [false, () => {}], useState: (value: unknown) => {
        const index = cursor++; if (!(index in states)) states[index] = value;
        return [states[index], (update: unknown) => { states[index] = typeof update === "function" ? update(states[index]) : update; }];
      } }, "react/jsx-runtime": jsx, "@/lib/product-slug": slugs,
      "next/navigation": { useRouter: () => ({ push: blocked }) }, sonner: { toast: { error: blocked, success: blocked } },
      "@/store/lang-store": { useLangStore: () => ({ t: translations.en }) }, "@/components/ui/button": { Button: "button" },
      "@/components/admin/media-url-field": { MediaUrlField: "div" }, "@/components/admin/size-editor": { SizeEditor: "div" },
    });
    const renderForm = () => { cursor = 0; return elements(ProductForm({ categories: [], action: async () => {}, ...(existing ? { defaults: { name: "Old", slug: "Historical_URL" } } : {}) })); };
    const field = (name: string) => renderForm().find((element) => element.props.name === name)!;
    const change = (name: string, value: string) => (field(name).props.onChange as (event: unknown) => void)({ target: { value } });
    change("name", "Дракон"); assert.equal(field("slug").props.value, existing ? "Historical_URL" : "drakon");
    change("slug", "approved-custom"); change("name", "Єнот"); assert.equal(field("slug").props.value, "approved-custom");
    const regenerate = renderForm().find((element) => element.type === "button" && element.props.children === translations.en.admin.product.slugRegenerate)!;
    (regenerate.props.onClick as () => void)(); assert.equal(field("slug").props.value, "yenot");
    assert.equal(field("slug").props.id, "product-slug"); assert.ok(field("slug").props["aria-describedby"]);
  }
  pass("actual Admin name/slug handlers: automatic new slug, stable manual/existing slug, explicit regeneration and accessible field");

  let admin = true; let collision = false; let writes = 0;
  const actions = sourceModule<typeof import("../src/lib/actions/products")>("src/lib/actions/products.ts", {
    "@/lib/admin-form-validation": adminValidation, "@/lib/product-gallery-admin": galleryAdmin, "@/lib/gallery": galleryHelpers,
    "@/lib/media-lifecycle": { lockMediaWrites: async () => {}, assertMediaAttachable: async () => {}, enqueueSupersededMedia: async () => {} },
    "@/lib/media-lifecycle-policy": { RetiredMediaError: class extends Error {} },
    "@/lib/media-cleanup-after": { scheduleProductMediaCleanup: () => {} },
    zod: { z }, "@/lib/product-slug": slugs, "@/lib/product-media": media, "@/lib/product-variants": variants,
    "@/lib/product-size-admin": { syncProductSizes: async () => {} }, "next/cache": { revalidatePath: () => {} },
    "@/lib/actions/require-admin": { requireAdmin: async () => { if (!admin) throw new Error("UNAUTHORIZED"); } },
    "@/lib/prisma": { prisma: { product: { findUnique: async () => ({ slug: "Historical_URL" }) },
      $transaction: async (callback: (tx: unknown) => Promise<void>) => callback({ product: {
        findUnique: async () => ({ images: [], hoverGifUrl: null }),
        create: async () => { if (collision) throw { code: "P2002", meta: { target: ["slug"] } }; writes++; return { id: "p1" }; },
        update: async () => { if (collision) throw { code: "P2002", meta: { target: ["slug"] } }; writes++; },
      }, productImage: { findFirst: async () => ({ id: "i1", url: "https://res.cloudinary.com/qa/a.webp" }) } }) } },
  });
  const form = new FormData();
  for (const [key, value] of Object.entries({ name: "Дракон", nameEn: "Dragon", slug: "drakon", description: "Description", descriptionEn: "Description", price: "10", categoryId: "c1", imageUrl: "https://res.cloudinary.com/qa/a.webp", isActive: "on", isOrderable: "on" })) form.set(key, value);
  form.set("slug", "Bad Slug"); assert.deepEqual(await actions.createProduct(form), { error: "slugInvalid" }); assert.equal(writes, 0);
  form.set("slug", "drakon"); collision = true;
  assert.deepEqual(await actions.createProduct(form), { error: "slugDuplicate" });
  assert.deepEqual(await actions.updateProduct("p1", form), { error: "slugDuplicate" });
  collision = false; form.set("slug", "Historical_URL"); await actions.updateProduct("p1", form); assert.equal(writes, 1);
  admin = false; await assert.rejects(actions.updateProduct("p1", form)); assert.equal(writes, 1);
  pass("Admin slug errors are structured and safe, uniqueness races handled, historical slugs accepted only unchanged, auth preserved");

  for (const locale of ["ua", "en"] as const) {
    const text = content.getProductDescription({ description: "Перший\nрядок\n\nДругий <script>alert(1)</script>", descriptionEn: locale === "en" ? "First\nline\n\nSecond <script>alert(1)</script>" : null }, locale);
    const html = renderToStaticMarkup(<ProductDescription text={text} />);
    assert.equal((html.match(/<p /g) ?? []).length, 2); assert.ok(html.includes("whitespace-pre-line"));
    assert.ok(html.includes("&lt;script&gt;")); assert.ok(!html.includes("<script>"));
    assert.ok(translations[locale].cart.reconciliation.sizeUnavailable.length > 20);
    assert.ok(!translations[locale].admin.product.slugHelp.includes("???"));
  }
  assert.equal(content.getProductDescription({ description: "UA fallback", descriptionEn: " " }, "en"), "UA fallback");
  pass("UA/EN description paragraphs and single newlines preserved as escaped text with English fallback");

  for (const invalid of ["", "javascript:alert(1)", "https://evil.invalid/a.webp", "//evil.invalid/a.webp", "https://res.cloudinary.com.evil.invalid/a.webp"]) assert.equal(media.storefrontImage(invalid), "/images/placeholder.svg");
  for (const valid of ["/images/placeholder.svg", "https://res.cloudinary.com/qa/image/upload/f_auto,q_auto/image", "https://images.unsplash.com/photo-qa", "https://qa.supabase.co/a.webp"]) assert.equal(media.storefrontImage(valid), valid);
  let failed: unknown = null;
  const { ProductImage } = sourceModule<typeof import("../src/components/product/product-image")>("src/components/product/product-image.tsx", {
    react: { useState: () => [failed, (value: unknown) => { failed = value; }] }, "react/jsx-runtime": jsx,
    "next/image": { default: "img", __esModule: true }, "@/lib/product-media": media,
  });
  const props = { src: "https://res.cloudinary.com/qa/image.gif", alt: "Dragon", width: 100, height: 100 };
  let image = ProductImage(props); assert.equal(image.props.src, props.src);
  image.props.onError({}); image = ProductImage(props); assert.equal(image.props.src, "/images/placeholder.svg");
  assert.equal(image.props.alt, "Dragon");
  assert.equal(ProductImage({ ...props, src: "https://media.example.invalid/hover.gif", unoptimized: true }).props.src, "https://media.example.invalid/hover.gif");
  pass("valid Cloudinary/legacy media retained; empty, unsupported and load failures fall back; image alt preserved");

  console.log(`PASS Batch 1.7.5 isolated checks: ${passed} groups. No DB, network, payments, messages or shipments.`);
}
void verify().catch((error) => { console.error(error); process.exitCode = 1; });
