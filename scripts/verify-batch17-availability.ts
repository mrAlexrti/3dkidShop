import assert from "node:assert/strict";
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import { z } from "zod";
import * as variants from "../src/lib/product-variants";
import { translations } from "../src/lib/i18n";
import { sourceModule } from "./source-module";
import type { Prisma } from "@prisma/client";

const blocked = () => { throw new Error("UNEXPECTED_EFFECT"); };
let admin = true; let data: Record<string, unknown> = {}; let creates = 0;
const action = sourceModule<typeof import("../src/lib/actions/products")>("src/lib/actions/products.ts", {
  zod: { z }, "next/cache": { revalidatePath: () => {} }, "@/lib/actions/require-admin": { requireAdmin: async () => { if (!admin) throw new Error("UNAUTHORIZED"); } },
  "@/lib/product-media": { optionalHoverGifUrl: z.string().optional(), updateMainProductImage: async () => {} },
  "@/lib/product-variants": variants, "@/lib/product-size-admin": { syncProductSizes: async () => {} },
  "@/lib/prisma": { prisma: { $transaction: async (callback: (tx: unknown) => Promise<void>) => callback({ product: {
    create: async (input: Prisma.ProductCreateArgs) => { data = input.data; creates++; return { id: "qa" }; },
    update: async (input: Prisma.ProductUpdateArgs) => { data = input.data; },
  } }) } },
});
function form(active: boolean, orderable: boolean) {
  const value = new FormData();
  for (const [key, field] of Object.entries({ name: "QA product", nameEn: "QA product", slug: "qa-product", description: "QA description", descriptionEn: "QA description", price: "10", oldPrice: "", categoryId: "qa-category", imageUrl: "https://example.invalid/image.webp", hoverGifUrl: "", stock: "999999" })) value.set(key, field);
  if (active) value.set("isActive", "on"); if (orderable) value.set("isOrderable", "on");
  return value;
}
async function verify() {
  for (const active of [false, true]) for (const orderable of [false, true]) {
    await action.createProduct(form(active, orderable)); assert.equal(data.isActive, active); assert.equal(data.isOrderable, orderable); assert.equal("stock" in data, false);
    await action.updateProduct("qa", form(active, orderable)); assert.equal(data.isActive, active); assert.equal(data.isOrderable, orderable); assert.equal("stock" in data, false);
  }
  admin = false; const before = creates; await assert.rejects(action.createProduct(form(true, true))); assert.equal(creates, before);
  for (const locale of ["ua", "en"] as const) {
    const t = translations[locale];
    const { ProductForm } = sourceModule<typeof import("../src/components/admin/product-form")>("src/components/admin/product-form.tsx", {
      react: React, "react/jsx-runtime": jsxRuntime, "next/navigation": { useRouter: () => ({ push: blocked }) }, sonner: { toast: { success: blocked, error: blocked } },
      "@/components/ui/button": { Button: (props: React.ButtonHTMLAttributes<HTMLButtonElement>) => React.createElement("button", props) },
      "@/store/lang-store": { useLangStore: () => ({ t, locale }) }, "@/components/admin/media-url-field": { MediaUrlField: () => null }, "@/components/admin/size-editor": { SizeEditor: () => null },
    });
    for (const orderable of [false, true]) {
      const html = renderToStaticMarkup(React.createElement(ProductForm, { categories: [], action: async () => {}, defaults: { isActive: true, isOrderable: orderable } }));
      assert.ok(html.includes(t.admin.product.isOrderable));
      const checkbox = html.match(/<input\b[^>]*name="isOrderable"[^>]*>/)?.[0] ?? "";
      assert.ok(checkbox.includes('type="checkbox"')); assert.equal(checkbox.includes("checked"), orderable);
      assert.ok(html.includes('name="isActive"')); assert.ok(!html.includes('name="stock"'));
    }
  }
  console.log("PASS print-on-demand Admin: independent publication/orderability combinations, checkbox UA/EN, numeric stock absent, forged legacy stock ignored, create/update boolean persistence, Admin auth. Actual source; mocked DB/effects.");
}
verify().catch((error) => { console.error(error); process.exitCode = 1; });
