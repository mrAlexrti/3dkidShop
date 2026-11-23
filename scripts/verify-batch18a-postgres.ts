// Actual actions, configuration/gallery writers, DB triggers and cart lookup.
// Runs only in the private cluster created by rehearse-batch18a-color-images.mjs.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient, type Prisma } from "@prisma/client";
import { z } from "zod";
import { sourceModule } from "./source-module";
import * as configAdmin from "../src/lib/product-configuration-admin";
import * as config from "../src/lib/product-configuration";
import * as gallery from "../src/lib/product-gallery-admin";
import * as galleryDomain from "../src/lib/gallery";
import * as validation from "../src/lib/admin-form-validation";
import * as sizes from "../src/lib/product-size-admin";
import * as variants from "../src/lib/product-variants";
import * as media from "../src/lib/product-media";
import * as slug from "../src/lib/product-slug";
import * as guards from "../src/lib/variant-transaction";
import * as money from "../src/lib/payments/money";
import * as materials from "../src/lib/product-materials";
import { reconcileCart } from "../src/lib/cart-reconciliation";
import { input, url } from "./fixtures/batch18a-data";
import type { CartItem } from "../src/types";

async function main() {
  const connection = process.env.BATCH18A_QA_DATABASE_URL!;
  assert.equal(new URL(connection).hostname, "127.0.0.1");
  assert.match(new URL(connection).pathname, /^\/batch18_review_[a-f0-9]+$/);
  assert.equal(readFileSync(resolve(process.env.BATCH18A_QA_DIRECTORY!, "qa-marker"), "utf8"), process.env.BATCH18A_QA_MARKER);
  assert.equal(process.env.DATABASE_URL, connection);
  const db = new PrismaClient({ datasources: { db: { url: connection } } });
  globalThis.fetch = async () => { throw new Error("EXTERNAL_EFFECT_FORBIDDEN"); };
  let attached: string[] = [], queued = 0;
  const bindings = {
    zod: { z }, "@/lib/prisma": { prisma: db }, "@/lib/product-configuration-admin": configAdmin,
    "@/lib/product-gallery-admin": gallery, "@/lib/gallery": galleryDomain,
    "@/lib/admin-form-validation": validation, "@/lib/product-size-admin": sizes,
    "@/lib/product-variants": variants, "@/lib/product-media": media, "@/lib/product-slug": slug,
    "@/lib/variant-transaction": guards, "@/lib/payments/money": money, "@/lib/product-materials": materials,
    "@/lib/variant-rollout": { nativeVariantWritesEnabled: () => true },
    "@/lib/actions/require-admin": { requireAdmin: async () => {} }, "next/cache": { revalidatePath: () => {} },
    "@/lib/media-cleanup-after": { scheduleProductMediaCleanup: () => {} },
    "@/lib/media-lifecycle-policy": { RetiredMediaError: class extends Error {} },
    "@/lib/media-lifecycle": {
      lockMediaWrites: async (tx: Prisma.TransactionClient) => { await tx.$executeRaw`SELECT pg_advisory_xact_lock(175501,1)`; },
      assertMediaAttachable: async (_tx: unknown, urls: (string | null | undefined)[]) => { attached = urls.filter((v): v is string => Boolean(v)); },
      enqueueSupersededMedia: async () => { queued++; }, MEDIA_TRANSACTION_OPTIONS: { timeout: 30000 },
    },
  };
  const actions = sourceModule<typeof import("../src/lib/actions/products")>("src/lib/actions/products.ts", bindings);
  const lookup = sourceModule<typeof import("../src/lib/actions/reconcile-cart")>("src/lib/actions/reconcile-cart.ts", { ...bindings, "@/lib/product-configuration": config, "@/lib/cart-limits": await import("../src/lib/cart-limits") });
  const include = { images: { orderBy: [{ order: "asc" }, { id: "asc" }] }, options: { include: { values: true } }, variants: { include: { selections: true } } } satisfies Prisma.ProductInclude;
  const load = () => db.product.findUniqueOrThrow({ where: { slug: "color-photo-fixture" }, include });
  function form(configuration: configAdmin.ConfigurationInput, images: unknown[], revision = 0, snapshot?: string) {
    const result = new FormData();
    for (const [key, value] of Object.entries({ name: "Синтетичний товар", nameEn: "Synthetic product", slug: "color-photo-fixture", description: "Synthetic description", descriptionEn: "Synthetic description", price: "1", oldPrice: "", categoryId: "qa_category", isOrderable: "on", isActive: "on", hoverGifUrl: "", variantRevision: String(revision), configuration: JSON.stringify(configuration), images: JSON.stringify(images), ...(snapshot ? { imagesSnapshot: snapshot } : {}) })) result.set(key, value);
    return result;
  }
  const persistent = (product: Awaited<ReturnType<typeof load>>) => {
    const dto = config.productConfiguration(product);
    return configAdmin.configurationInputSchema.parse({ mode: dto.mode,
      values: dto.values.map((v) => ({ key: v.id, id: v.id, kind: v.kind, labelUa: v.labelUa, labelEn: v.labelEn ?? "", retired: v.retired })),
      combinations: dto.combinations.map((r) => ({ id: r.id, color: r.values.COLOR, size: r.values.SIZE, price: r.price, isAvailable: r.isAvailable, retired: r.retired })),
    });
  };
  try {
    const [identity] = await db.$queryRaw<{ name: string }[]>`SELECT current_user::text AS name`;
    assert.equal(identity.name, "app_3dkid_fixture", "Application actions must run as the restricted login, never the migration owner");
    const originalHistory = await db.orderItem.findMany();
    assert.equal(await actions.createProduct(form(input, [{ url: url("universal.webp") }, { url: url("pink.webp"), colorKey: "pink" }, { url: url("pink2.webp"), colorKey: "pink" }, { url: url("blue.gif"), colorKey: "blue" }])), undefined);
    let product = await load();
    const pink = product.options.flatMap((g) => g.values).find((v) => v.value === "Рожевий")!;
    const blue = product.options.flatMap((g) => g.values).find((v) => v.value === "Блакитний")!;
    assert.deepEqual(product.images.map((v) => v.colorValueId), [null, pink.id, pink.id, blue.id]);
    assert.ok(attached.includes(url("blue.gif")));
    console.log("PASS actual createProduct: new colors + images resolve draft keys to permanent IDs in one transaction; four sparse variants, no regenerated IDs.");
    const initialIds = product.images.map((v) => v.id), variantIds = product.variants.map((v) => v.id).sort();
    const save = form(persistent(product), product.images, product.variantRevision, galleryDomain.gallerySnapshot(product.images));
    assert.equal(await actions.updateProduct(product.id, save), undefined);
    product = await load();
    assert.deepEqual(product.images.map((v) => v.id), initialIds); assert.deepEqual(product.variants.map((v) => v.id).sort(), variantIds);
    assert.deepEqual(product.images.map((v) => v.colorValueId), [null, pink.id, pink.id, blue.id]);
    const renamed = persistent(product); renamed.values.find((v) => v.id === pink.id)!.labelUa = "Перейменований";
    assert.equal(await actions.updateProduct(product.id, form(renamed, [product.images[0], product.images[2], product.images[1], product.images[3]], product.variantRevision, galleryDomain.gallerySnapshot(product.images))), undefined);
    product = await load(); assert.equal(product.images[1].id, initialIds[2]);
    assert.equal(galleryDomain.colorGallery(product.images, pink.id)[0].id, initialIds[2]);
    console.log("PASS repeated save, rename and color-primary reorder preserve photo/value/variant identity and links.");
    const row = config.publicConfiguration(product).combinations.find((r) => r.values.COLOR === blue.id && r.isAvailable)!;
    const line: CartItem = { id: `${product.id}:variant:${row.id}`, productId: product.id, name: "Forged", slug: "forged", price: 279, quantity: 1, image: "https://evil.invalid/arbitrary.webp", selection: { version: 2, variantId: row.id, values: { COLOR: blue.id, SIZE: row.values.SIZE } } };
    let projected = await lookup.lookupCartProducts({ version: 2, lines: [{ productId: product.id, selection: line.selection }] });
    let cart = reconcileCart([line], projected, "ua");
    assert.deepEqual(cart.issues, Object.create(null)); assert.equal(cart.items[0].image, url("blue.gif"));
    const forged = { ...line, selection: { ...line.selection!, values: { ...line.selection!.values, COLOR: pink.id } } };
    assert.equal(reconcileCart([forged], projected, "en").issues[line.id], "variantUnavailable");
    // Remove blue-specific media and verify both storefront and server cart fallback.
    assert.equal(await actions.updateProduct(product.id, form(persistent(product), product.images.filter((v) => v.colorValueId !== blue.id), product.variantRevision, galleryDomain.gallerySnapshot(product.images))), undefined);
    product = await load(); projected = await lookup.lookupCartProducts({ version: 2, lines: [{ productId: product.id, selection: line.selection }] });
    cart = reconcileCart([line], projected, "en"); assert.equal(cart.items[0].image, url("universal.webp"));
    console.log("PASS authoritative DB cart lookup selects Blue GIF, rejects forged selection/URL and falls back to universal after color-photo removal.");
    // Concurrent tabs use the same revision and gallery snapshot; exactly one wins.
    const parallel = () => form(persistent(product), product.images, product.variantRevision, galleryDomain.gallerySnapshot(product.images));
    const outcomes = await Promise.all([actions.updateProduct(product.id, parallel()), actions.updateProduct(product.id, parallel())]);
    assert.equal(outcomes.filter((v) => v === undefined).length, 1); assert.equal(outcomes.filter((v) => v?.fieldErrors?.configuration === "stale").length, 1);
    product = await load();
    // A child-only edit also advances revision and invalidates an open admin tab.
    const stale = parallel(); const before = product.variantRevision;
    await db.productImage.update({ where: { id: product.images[0].id }, data: { alt: "Other tab" } });
    assert.ok((await load()).variantRevision > before);
    assert.equal((await actions.updateProduct(product.id, stale))?.fieldErrors?.configuration, "stale");
    product = await load();
    const wrongSnapshot = form(persistent(product), product.images, product.variantRevision, "stale");
    assert.equal((await actions.updateProduct(product.id, wrongSnapshot))?.fieldErrors?.images, "galleryOwnership");
    console.log("PASS two concurrent admin tabs, child-only image revision changes and gallery snapshots reject stale saves atomically.");
    const small = product.options.filter((g) => g.kind === "SIZE").flatMap((g) => g.values)[0];
    const foreign = await db.product.create({ data: { name: "Foreign", slug: "foreign", description: "Foreign", price: 1, categoryId: "qa_category" } });
    for (const data of [{ colorValueId: small.id }, { colorValueId: "missing" }]) await assert.rejects(db.productImage.update({ where: { id: product.images[0].id }, data }), /B18A_IMAGE_COLOR_OWNER_OR_KIND/);
    await assert.rejects(db.productImage.create({ data: { productId: foreign.id, url: url("foreign.webp"), colorValueId: pink.id } }), /B18A_IMAGE_COLOR_OWNER_OR_KIND/);
    await assert.rejects(db.productOption.update({ where: { id: pink.optionId }, data: { kind: "SIZE" } }), /B18_IMMUTABLE_KIND/);
    await assert.rejects(db.productOptionValue.update({ where: { id: pink.id }, data: { optionId: small.optionId } }), /B18_IMMUTABLE_VALUE_OWNER/);
    await assert.rejects(db.productImage.update({ where: { id: product.images[0].id }, data: { productId: foreign.id } }), /B18_IMMUTABLE_PRODUCT_OWNER/);
    await assert.rejects(db.productImage.update({ where: { id: product.images[0].id }, data: { id: "new_identity" } }), /B18_IMMUTABLE_ID/);
    const beforeFailure = await load();
    const invalid = form(persistent(product), product.images.map((v, i) => i === 0 ? { ...v, colorValueId: small.id } : v), product.variantRevision, galleryDomain.gallerySnapshot(product.images));
    assert.equal((await actions.updateProduct(product.id, invalid))?.fieldErrors?.images, "galleryColor");
    assert.deepEqual(await load(), beforeFailure);
    const badCreate = form(input, [{ url: url("bad.webp"), colorKey: "small" }]); badCreate.set("slug", "bad-create");
    assert.equal((await actions.createProduct(badCreate))?.fieldErrors?.images, "galleryColor");
    assert.equal(await db.product.count({ where: { slug: "bad-create" } }), 0);
    console.log("PASS DB rejects SIZE, foreign/missing color, owner/kind/identity mutation; failed create/update rolls back configuration and media writes.");
    // Reproduce the scoped-first audit case through actual actions and cart lookup.
    const colorConfiguration = persistent(product);
    const orderedImages = [...product.images.filter((v) => v.colorValueId), ...product.images.filter((v) => !v.colorValueId)];
    assert.equal(await actions.updateProduct(product.id, form(colorConfiguration, orderedImages, product.variantRevision, galleryDomain.gallerySnapshot(product.images))), undefined);
    product = await load();
    const mediaIdentity = product.images.map(({ id, url, colorValueId }) => ({ id, url, colorValueId }));
    const pinkRow = config.publicConfiguration(product).combinations.find((r) => r.values.COLOR === pink.id && r.isAvailable)!;
    const pinkLine: CartItem = { ...line, id: `${product.id}:variant:${pinkRow.id}`, price: Number(pinkRow.price), selection: { version: 2, variantId: pinkRow.id, values: { COLOR: pink.id, SIZE: pinkRow.values.SIZE } } };
    const retiredPink = structuredClone(colorConfiguration);
    retiredPink.values.filter((v) => v.id === pink.id).forEach((v) => v.retired = true);
    retiredPink.combinations.filter((r) => r.color === pink.id).forEach((r) => r.retired = true);
    assert.equal(await actions.updateProduct(product.id, form(retiredPink, product.images, product.variantRevision, galleryDomain.gallerySnapshot(product.images))), undefined);
    product = await load();
    projected = await lookup.lookupCartProducts({ version: 2, lines: [{ productId: product.id, selection: pinkLine.selection }] });
    const retiredCart = reconcileCart([pinkLine], projected, "ua");
    assert.equal(retiredCart.issues[pinkLine.id], "variantUnavailable"); assert.equal(retiredCart.items[0].image, url("universal.webp"));
    assert.deepEqual(product.images.map(({ id, url, colorValueId }) => ({ id, url, colorValueId })), mediaIdentity);
    assert.equal(await actions.updateProduct(product.id, form(colorConfiguration, product.images, product.variantRevision, galleryDomain.gallerySnapshot(product.images))), undefined);
    product = await load();
    projected = await lookup.lookupCartProducts({ version: 2, lines: [{ productId: product.id, selection: pinkLine.selection }] });
    const restoredCart = reconcileCart(retiredCart.items, projected, "en");
    assert.equal(restoredCart.issues[pinkLine.id], undefined); assert.equal(restoredCart.items[0].image, url("pink2.webp"));
    assert.deepEqual(restoredCart.items[0].selection, pinkLine.selection);
    assert.deepEqual(product.images.map(({ id, url, colorValueId }) => ({ id, url, colorValueId })), mediaIdentity);
    // Retire all color configuration: old photo links remain, including omitted history values.
    const retired = persistent(product); retired.mode = "SIMPLE"; retired.values.forEach((v) => v.retired = true); retired.combinations.forEach((r) => r.retired = true);
    assert.equal(await actions.updateProduct(product.id, form(retired, product.images, product.variantRevision, galleryDomain.gallerySnapshot(product.images))), undefined);
    product = await load();
    const simpleLine: CartItem = { ...pinkLine, id: product.id, price: Number(product.price), selection: undefined };
    projected = await lookup.lookupCartProducts({ version: 2, lines: [{ productId: product.id }] });
    const simpleCart = reconcileCart([simpleLine], projected, "en");
    assert.equal(simpleCart.issues[simpleLine.id], undefined); assert.equal(simpleCart.items[0].image, url("universal.webp"));
    assert.deepEqual(product.images.map(({ id, url, colorValueId }) => ({ id, url, colorValueId })), mediaIdentity);
    console.log("PASS persisted retirement/restoration and SIMPLE conversion use universal fallback, restore scoped primary, and preserve photo URLs/IDs/color IDs and cart selection identity.");
    const omitted = persistent(product); omitted.values = []; omitted.combinations = [];
    assert.equal(await actions.updateProduct(product.id, form(omitted, product.images, product.variantRevision, galleryDomain.gallerySnapshot(product.images))), undefined);
    product = await load(); assert.equal(product.images.find((v) => v.id === initialIds[2])?.colorValueId, pink.id);
    assert.equal(await actions.archiveProduct(product.id), undefined);
    assert.equal((await load()).images.length, 3); assert.equal((await load()).isActive, false);
    const archiveCart = await lookup.lookupCartProducts({ version: 2, lines: [{ productId: product.id, selection: line.selection }] }); assert.deepEqual(archiveCart, []);
    // Whole-product cascade must work with the deferred value FK.
    assert.equal(await actions.deleteProduct(product.id), undefined); assert.equal(await db.product.count({ where: { id: product.id } }), 0);
    assert.deepEqual(await db.orderItem.findMany(), originalHistory);
    // Keep one linked product for the runner's rollback refusal test.
    const keep = form(input, [{ url: url("universal.webp") }, { url: url("keep.webp"), colorKey: "pink" }]); keep.set("slug", "keep-link");
    assert.equal(await actions.createProduct(keep), undefined);
    assert.ok(queued > 0);
    console.log("PASS retirement/history-page omission and archive retain links; product cascade succeeds; historical synthetic order is byte-for-byte unchanged; no media cleanup/provider effects.");
  } finally { await db.$disconnect(); }
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
