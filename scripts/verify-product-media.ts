// Development DB checks use a temporary product inside a transaction that always rolls back.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { optionalHoverGifUrl, updateMainProductImage } from "../src/lib/product-media";

loadEnvConfig(process.cwd());
const db = new PrismaClient();

async function inventory() {
  const products = await db.product.findMany({ select: { id: true }, orderBy: { id: "asc" } });
  return {
    products: products.length,
    productIdsHash: createHash("sha256").update(JSON.stringify(products)).digest("hex"),
    orders: await db.order.count(),
    images: await db.productImage.count(),
    categories: await db.category.findMany({
      select: { id: true, name: true, nameEn: true, slug: true, order: true, parentId: true, _count: { select: { products: true } } },
      orderBy: [{ order: "asc" }, { name: "asc" }],
    }),
  };
}

async function verify() {
  for (const empty of [undefined, "", "   "]) assert.equal(optionalHoverGifUrl.parse(empty), null);
  assert.equal(optionalHoverGifUrl.parse(" https://example.com/turn.gif "), "https://example.com/turn.gif");
  for (const invalid of ["bad", "data:image/gif;base64,R0lGODlh", "javascript:alert(1)", "ftp://example.com/a.gif", "https://user:password@example.com/a.gif"]) {
    assert.equal(optionalHoverGifUrl.safeParse(invalid).success, false);
  }
  const before = await inventory();
  const category = before.categories[0];
  assert.ok(category, "A real category is required; this script never seeds categories.");
  const rollback = new Error("ROLLBACK_MEDIA_VERIFICATION");
  await assert.rejects(db.$transaction(async (tx) => {
    const product = await tx.product.create({ data: {
      name: "Перевірка медіа", nameEn: "Media verification", slug: `media-verification-${Date.now()}`,
      description: "Тимчасова перевірка", price: 1, isOrderable: false, isActive: false, categoryId: category.id,
      hoverGifUrl: optionalHoverGifUrl.parse(""),
      images: { create: [{ url: "https://example.com/main.webp", order: 0 }, { url: "https://example.com/gallery.webp", order: 1 }] },
    } });
    assert.equal(product.hoverGifUrl, null);
    await tx.product.update({ where: { id: product.id }, data: { hoverGifUrl: optionalHoverGifUrl.parse("https://example.com/a.gif") } });
    assert.equal((await tx.product.findUniqueOrThrow({ where: { id: product.id } })).hoverGifUrl, "https://example.com/a.gif");
    await tx.product.update({ where: { id: product.id }, data: { hoverGifUrl: optionalHoverGifUrl.parse("https://example.com/b.gif") } });
    assert.equal((await tx.product.findUniqueOrThrow({ where: { id: product.id } })).hoverGifUrl, "https://example.com/b.gif");
    await tx.product.update({ where: { id: product.id }, data: { hoverGifUrl: optionalHoverGifUrl.parse("") } });
    assert.equal((await tx.product.findUniqueOrThrow({ where: { id: product.id } })).hoverGifUrl, null);
    const original = await tx.productImage.findMany({ where: { productId: product.id }, orderBy: [{ order: "asc" }, { id: "asc" }] });
    await updateMainProductImage(tx, product.id, original[0].url);
    assert.deepEqual(await tx.productImage.findMany({ where: { productId: product.id }, orderBy: [{ order: "asc" }, { id: "asc" }] }), original);
    await updateMainProductImage(tx, product.id, "https://example.com/changed.webp");
    await updateMainProductImage(tx, product.id, "https://example.com/changed-again.webp");
    const images = await tx.productImage.findMany({ where: { productId: product.id }, orderBy: [{ order: "asc" }, { id: "asc" }] });
    assert.equal(images.length, 2);
    assert.equal(images[0].id, original[0].id);
    assert.equal(images[0].url, "https://example.com/changed-again.webp");
    assert.deepEqual(images[1], original[1]);
    throw rollback;
  }, { timeout: 30000 }), (error: unknown) => error === rollback);
  assert.deepEqual(await inventory(), before);
  console.log("PASS: URL validation, nullable GIF create/change/clear, stable main image ID, unchanged gallery, no duplicate images, complete transaction rollback.");
  console.log(JSON.stringify({ ...before, nullGifProducts: await db.product.count({ where: { hoverGifUrl: null } }) }, null, 2));
}

void verify().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => db.$disconnect());
