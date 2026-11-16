"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSizeVariants } from "@/lib/product-variants";
import { MAX_CART_LINES } from "@/lib/cart-limits";
import type { CartProduct } from "@/lib/cart-reconciliation";

const idsSchema = z.array(z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/)).min(1).max(MAX_CART_LINES);

// Public, read-only projection: never return inactive products or Admin/private fields.
export async function lookupCartProducts(input: unknown): Promise<CartProduct[]> {
  const ids = idsSchema.parse(input);
  const products = await prisma.product.findMany({
    where: { id: { in: [...new Set(ids)] }, isActive: true },
    select: { id: true, name: true, nameEn: true, slug: true, price: true, isOrderable: true,
      images: { select: { url: true }, orderBy: [{ order: "asc" }, { id: "asc" }], take: 1 },
      options: { select: { name: true, values: { select: { id: true, value: true, valueEn: true, price: true, note: true, noteEn: true } } } },
    },
  });
  return products.map((product) => ({ id: product.id, name: product.name, nameEn: product.nameEn, slug: product.slug,
    price: Number(product.price), isOrderable: product.isOrderable, image: product.images[0]?.url || "/images/placeholder.svg", variants: getSizeVariants(product.options) }));
}
