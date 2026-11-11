// Read-only legacy inventory. Bulk activation is disabled pending product-by-product review.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { loadEnvConfig } from "@next/env";
import { PrismaClient, Prisma } from "@prisma/client";
import { getProductOptionLabel } from "../src/lib/product-content";
loadEnvConfig(process.cwd());
const db = new PrismaClient();
async function inventory() {
  const rows = await Promise.all([
    db.product.findMany({ orderBy: { id: "asc" } }), db.productImage.findMany({ orderBy: { id: "asc" } }),
    db.order.findMany({ orderBy: { id: "asc" }, include: { items: { orderBy: { id: "asc" } } } }), db.category.findMany({ orderBy: { id: "asc" } }),
    db.productOptionValue.findMany({ orderBy: { id: "asc" }, select: { id: true, optionId: true, value: true, priceModifier: true } }),
    db.productOption.findMany({ orderBy: { id: "asc" } }),
  ]);
  return { products: rows[0].length, images: rows[1].length, orders: rows[2].length, categories: rows[3].length, values: rows[4].length, options: rows[5].length, hash: createHash("sha256").update(JSON.stringify(rows)).digest("hex") };
}
async function main() {
  assert.ok(!process.argv.includes("--apply"), "Bulk legacy size conversion is disabled. Review the per-product cleanup plan first.");
  const before = await inventory();
  const pending = await db.productOptionValue.findMany({ where: { price: null }, include: { option: { include: { product: true } } } });
  pending.sort((left, right) => left.option.product.name.localeCompare(right.option.product.name, "uk") || left.optionId.localeCompare(right.optionId) || new Prisma.Decimal(left.priceModifier).comparedTo(right.priceModifier) || left.id.localeCompare(right.id));
  const plan = pending.map((value) => {
    const translated = getProductOptionLabel(value.value, "en");
    return {
      product: value.option.product.name, productId: value.option.product.id, optionId: value.optionId, optionValueId: value.id,
      sizeValue: value.value, productPrice: value.option.product.price.toFixed(2), priceModifier: value.priceModifier.toFixed(2),
      classification: "legacy-unreviewed", activationProposed: false,
      hypotheticalLegacyTotal: new Prisma.Decimal(value.option.product.price).plus(value.priceModifier).toFixed(2),
      suggestedEnglishLabel: value.valueEn == null && translated !== value.value ? translated : null,
    };
  });
  console.log(JSON.stringify({ mode: "READ_ONLY_LEGACY_REVIEW", before, pending: pending.length, plan }, null, 2));
  for (const value of pending) {
    assert.ok(["Розмір", "Size"].includes(value.option.name), "Unexpected option group: review before conversion.");
    assert.ok(new Prisma.Decimal(value.option.product.price).plus(value.priceModifier).gt(0));
  }
  assert.deepEqual(await inventory(), before, "Read-only planning must not alter the protected inventory.");
  console.log("PASS READ_ONLY: legacy data retained. Proposed arithmetic is for review only, not an activation decision.");
}
main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => db.$disconnect());
