// Real Prisma queries against rollback-only fixtures; no catalog is shipped to the client.
import assert from "node:assert/strict";
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import * as productContent from "../src/lib/product-content";
import type { findProductSuggestions as Search } from "../src/lib/product-search";
import { sourceModule } from "./source-module";

loadEnvConfig(process.cwd());
const db = new PrismaClient();
async function verify() {
  const before = [await db.product.count(), await db.order.count(), await db.productImage.count()];
  const rollback = new Error("MANDATORY_SEARCH_QA_ROLLBACK");
  await assert.rejects(db.$transaction(async (tx) => {
    const category = await tx.category.findFirstOrThrow();
    const prefix = `batch13-search-${Date.now()}`;
    for (let index = 0; index < 8; index++) {
      await tx.product.create({ data: {
        name: `Підказка QA ${prefix} ${index}`, nameEn: `Suggestion QA ${prefix} ${index}`,
        slug: `${prefix}-${index}`, description: "Rollback-only fixture", price: 1, stock: 1, categoryId: category.id, isActive: index !== 0,
        images: { create: [{ url: "https://example.invalid/second.webp", order: 2 }, { url: "https://example.invalid/first.webp", order: 1 }] },
      } });
    }
    const { findProductSuggestions } = sourceModule<{ findProductSuggestions: typeof Search }>("src/lib/product-search.ts", {
      "@/lib/prisma": { prisma: tx }, "@/lib/product-content": productContent,
    });
    for (const query of ["", "q", "  ", "x".repeat(81)]) assert.deepEqual(await findProductSuggestions(query, "en"), []);
    for (const locale of ["ua", "en"] as const) {
      const results = await findProductSuggestions(prefix.toUpperCase(), locale);
      assert.equal(results.length, 6);
      assert.equal(new Set(results.map((product) => product.id)).size, 6);
      assert.ok(results.every((product) => !product.slug.endsWith("-0")));
      for (const product of results) {
        assert.deepEqual(Object.keys(product).sort(), ["id", "image", "name", "slug"]);
        assert.equal(product.image, "https://example.invalid/first.webp");
        assert.ok(product.name.startsWith(locale === "ua" ? "Підказка" : "Suggestion"));
      }
    }
    assert.equal((await findProductSuggestions(`Підказка QA ${prefix} 1`, "en")).length, 1, "Searches Ukrainian names in English UI.");
    assert.equal((await findProductSuggestions(`Suggestion QA ${prefix} 1`, "ua")).length, 1, "Searches English names in Ukrainian UI.");
    throw rollback;
  }, { timeout: 20_000 }), (error) => error === rollback);
  assert.deepEqual([await db.product.count(), await db.order.count(), await db.productImage.count()], before);
  console.log("PASS product suggestions: active-only, both name fields, case-insensitive, localized, 6 limit, ordered first image, minimal payload; fixtures rolled back.");
}
verify().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => db.$disconnect());
