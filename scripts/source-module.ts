// Load the actual server source with fail-closed dependency boundaries, without a test renderer.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInThisContext } from "node:vm";
import ts from "typescript";
import { createJSONStorage } from "zustand/middleware";
import * as configuration from "../src/lib/product-configuration";
import * as configurationAdmin from "../src/lib/product-configuration-admin";
import * as cartPersistence from "../src/lib/cart-persistence";
import * as cartProducts from "../src/lib/cart-products";
import * as cartContract from "../src/lib/customer/cart-contract";
import * as accountCart from "../src/lib/customer/cart";
import * as checkoutSession from "../src/lib/payments/checkout-session";
import * as productQuery from "../src/lib/product-query";
import { publicProductInclude } from "../src/lib/product-query";
import * as gallery from "../src/lib/gallery";
import * as variantHistory from "../src/lib/admin-variant-history";
import * as money from "../src/lib/payments/money";
import * as rollout from "../src/lib/variant-rollout";
import * as materials from "../src/lib/product-materials";
import * as confirmations from "../src/components/admin/confirm-button";
import { ProductMaterials } from "../src/components/product/product-materials";
import { initialConfigurationDraft } from "../src/components/admin/variant-editor";
import { ProductSelectionProvider } from "../src/components/product/product-selection";

export function sourceModule<T>(file: string, bindings: Record<string, unknown>): T {
  const filename = resolve(file);
  const compiled = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX },
    fileName: filename,
  }).outputText;
  const loaded = { exports: {} };
  // Explicit pure dependencies for pre-1.8 legacy fixtures. Native integration
  // tests provide real guards/queries explicitly; these defaults are NOT PG proof.
  const pure: Record<string, unknown> = { "@/lib/product-configuration": configuration,
    "@/lib/product-query": productQuery,
    "@/lib/gallery": gallery,
    "@/lib/customer/session": { customerSession: async () => null },
    "@/lib/customer/security": { customerPost: () => false },
    "@/lib/cart-products": cartProducts,
    "@/lib/customer/cart-contract": cartContract,
    "@/lib/customer/cart": accountCart,
    "@/lib/customer/cart-actions": { changeAccountCart: () => { throw new Error("Unexpected account cart mutation in guest fixture"); } },
    "@/lib/customer/guest-cart": { broadcastCart: () => {}, CART_SYNC_KEY: "fixture-cart-sync" },
    "@/lib/payments/checkout-session": checkoutSession,
    "@/lib/actions/require-admin": { requireAdmin: async () => {} },
    "./favorite-button": { FavoriteButton: () => null },
    "@/components/product/favorite-button": { FavoriteButton: () => null },
    "@/lib/product-materials": materials, "./confirm-button": confirmations,
    "@/components/product/product-materials": { ProductMaterials },
    "./materials-fields": { MaterialsFields: () => null },
    "./use-mobile-card-animation": { useMobileCardAnimation: () => false },
    "@/lib/admin-variant-history": variantHistory,
    "@/lib/payments/money": money,
    "@/lib/variant-rollout": rollout,
    "@/lib/product-configuration-admin": configurationAdmin, "@/lib/cart-persistence": cartPersistence,
    "@/lib/variant-transaction": { lockProductConfiguration: async () => {}, flushVariantConstraints: async () => {} },
    "./native-product-options": { NativeProductOptions: () => null }, "./variant-editor": { VariantEditor: () => null, initialConfigurationDraft },
    "@/components/product/product-selection": { ProductSelectionProvider },
  };
  const requireBound = (name: string) => {
    if (name === "zustand/middleware" && name in bindings) return { createJSONStorage, ...(bindings[name] as object) };
    if (name === "@/lib/prisma" && name in bindings) {
      const value = bindings[name] as { prisma: { $transaction?: unknown } };
      if (!value.prisma.$transaction) return { prisma: { ...value.prisma, $transaction: async (callback: (tx: unknown) => unknown) => callback(value.prisma) } };
    }
    if (!(name in bindings)) {
      if (name in pure) return pure[name];
      if (name === "@/lib/catalog-products" && "@/lib/prisma" in bindings) {
        const db = (bindings["@/lib/prisma"] as { prisma: { product: { findMany: (input: unknown) => Promise<unknown[]>; count: (input: unknown) => Promise<number> } } }).prisma;
        return { publicProductInclude, catalogProducts: async (input: { where: unknown; orderBy: unknown; page: number; pageSize: number }) => ({
          products: await db.product.findMany({ where: input.where, orderBy: input.orderBy, include: publicProductInclude, skip: (input.page - 1) * input.pageSize, take: input.pageSize }), total: await db.product.count({ where: input.where }),
        }) };
      }
      throw new Error(`Unbound QA dependency: ${name}`);
    }
    return bindings[name];
  };
  runInThisContext(`(function(require,module,exports){${compiled}\n})`, { filename })(requireBound, loaded, loaded.exports);
  return loaded.exports as T;
}
