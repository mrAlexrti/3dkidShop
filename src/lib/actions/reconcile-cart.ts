"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { MAX_CART_LINES } from "@/lib/cart-limits";
import { combinationSelectionSchema } from "@/lib/product-configuration";
import { readCartProducts } from "@/lib/cart-products";

const idsSchema = z.array(z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/)).min(1).max(MAX_CART_LINES);

// Public, read-only projection: never return inactive products or Admin/private fields.
export async function lookupCartProducts(input: unknown) {
  const request = Array.isArray(input) ? null : z.object({ version: z.literal(2), lines: z.array(z.object({ productId: idsSchema.element, sizeId: z.string().regex(/^[a-zA-Z0-9_]{1,128}$/).optional(), selection: combinationSelectionSchema.optional() }).strict()).min(1).max(MAX_CART_LINES) }).strict().parse(input);
  const lines = request?.lines ?? idsSchema.parse(input).map((productId) => ({ productId }));
  return prisma.$transaction((tx) => readCartProducts(tx, lines, !request), { isolationLevel: "RepeatableRead" });
}
