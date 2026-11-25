import type { Prisma } from "@prisma/client";
import { availabilityVariantInclude } from "@/lib/product-query";
import { getSizeVariants } from "@/lib/product-variants";
import type { CartProduct } from "@/lib/cart-reconciliation";
import { publicConfiguration, nativeMode, usableCombination, type CombinationSelection } from "@/lib/product-configuration";

export type CartSelection = { productId: string; sizeId?: string; selection?: CombinationSelection };

export async function readCartProducts(tx: Prisma.TransactionClient, lines: CartSelection[], legacy = false): Promise<CartProduct[]> {
  if (!lines.length) return [];
  const ids = [...new Set(lines.map((line) => line.productId))];
  const variantIds = lines.flatMap((line) => line.selection ? [line.selection.variantId] : []);
  const sizeIds = lines.flatMap((line) => line.sizeId ? [line.sizeId] : []);
  const products = await tx.product.findMany({
    where: { id: { in: ids }, isActive: true },
    select: { id: true, name: true, nameEn: true, slug: true, price: true, isOrderable: true, optionMode: true,
      images: { select: { url: true, colorValueId: true }, orderBy: [{ order: "asc" }, { id: "asc" }], take: 10 },
      options: { select: { id: true, kind: true, name: true, values: { select: { id: true, value: true, valueEn: true, price: true, note: true, noteEn: true, retiredAt: true } } } },
      variants: { where: !legacy ? { OR: [{ id: { in: variantIds } }, { selections: { some: { valueId: { in: sizeIds } } } }] } : {}, include: availabilityVariantInclude },
    },
  });
  return products.map((product) => {
    const configuration = publicConfiguration(product);
    const sizes = nativeMode(configuration.mode) ? configuration.combinations.filter((row) => usableCombination(configuration, row) && !row.values.COLOR).flatMap((row) => {
      const value = configuration.values.find((v) => v.id === row.values.SIZE);
      return value ? [{ id: value.id, labelUa: value.labelUa, labelEn: value.labelEn, price: Number(row.price), noteUa: value.noteUa, noteEn: value.noteEn }] : [];
    }) : getSizeVariants(product.options);
    return { id: product.id, name: product.name, nameEn: product.nameEn, slug: product.slug, price: Number(product.price),
      isOrderable: product.isOrderable && (!legacy || !["COLOR", "COLOR_SIZE"].includes(configuration.mode)) && (!legacy || configuration.mode !== "SIZE" || sizes.length > 0),
      image: product.images[0]?.url || "/images/placeholder.svg", images: product.images, variants: sizes, ...(!legacy ? { optionMode: configuration.mode, configuration } : {}) };
  });
}
