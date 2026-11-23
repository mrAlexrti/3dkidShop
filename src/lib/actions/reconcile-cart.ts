"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSizeVariants } from "@/lib/product-variants";
import { MAX_CART_LINES } from "@/lib/cart-limits";
import type { CartProduct } from "@/lib/cart-reconciliation";
import { combinationSelectionSchema, publicConfiguration, nativeMode, usableCombination } from "@/lib/product-configuration";

const idsSchema = z.array(z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/)).min(1).max(MAX_CART_LINES);

// Public, read-only projection: never return inactive products or Admin/private fields.
export async function lookupCartProducts(input: unknown): Promise<CartProduct[]> {
  const request = Array.isArray(input) ? null : z.object({ version: z.literal(2), lines: z.array(z.object({ productId: idsSchema.element, sizeId: z.string().regex(/^[a-zA-Z0-9_]{1,128}$/).optional(), selection: combinationSelectionSchema.optional() }).strict()).min(1).max(MAX_CART_LINES) }).strict().parse(input);
  const ids = request ? request.lines.map((line) => line.productId) : idsSchema.parse(input);
  const variantIds = request?.lines.flatMap((line) => line.selection ? [line.selection.variantId] : []) ?? [];
  const sizeIds = request?.lines.flatMap((line) => line.sizeId ? [line.sizeId] : []) ?? [];
  const products = await prisma.$transaction((tx) => tx.product.findMany({
    where: { id: { in: [...new Set(ids)] }, isActive: true },
    select: { id: true, name: true, nameEn: true, slug: true, price: true, isOrderable: true, optionMode: true,
      images: { select: { url: true, colorValueId: true }, orderBy: [{ order: "asc" }, { id: "asc" }], take: 10 },
      options: { select: { id: true, kind: true, name: true, values: { select: { id: true, value: true, valueEn: true, price: true, note: true, noteEn: true, retiredAt: true } } } },
      variants: { where: request ? { OR: [{ id: { in: variantIds } }, { selections: { some: { valueId: { in: sizeIds } } } }] } : {}, include: { selections: true } },
    },
  }), { isolationLevel: "RepeatableRead" });
  return products.map((product) => {
    const configuration = publicConfiguration(product);
    const sizes = nativeMode(configuration.mode) ? configuration.combinations.filter((row) => usableCombination(configuration, row) && !row.values.COLOR).flatMap((row) => {
      const value = configuration.values.find((v) => v.id === row.values.SIZE);
      return value ? [{ id: value.id, labelUa: value.labelUa, labelEn: value.labelEn, price: Number(row.price), noteUa: value.noteUa, noteEn: value.noteEn }] : [];
    }) : getSizeVariants(product.options);
    return { id: product.id, name: product.name, nameEn: product.nameEn, slug: product.slug, price: Number(product.price),
      isOrderable: product.isOrderable && (request !== null || !["COLOR", "COLOR_SIZE"].includes(configuration.mode)) && (request !== null || configuration.mode !== "SIZE" || sizes.length > 0),
      image: product.images[0]?.url || "/images/placeholder.svg", images: product.images, variants: sizes, ...(request ? { optionMode: configuration.mode, configuration } : {}) };
  });
}
