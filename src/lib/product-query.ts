import type { Prisma } from "@prisma/client";
// Project only failed groups, so an empty relation means manufacture is possible.
export const availabilityVariantInclude = {
  selections: true,
  filamentGroups: {
    where: { alternatives: { none: { filament: { isAvailable: true } } } },
    select: { id: true },
  },
} satisfies Prisma.ProductVariantInclude;

export const publicProductInclude = {
  images: { orderBy: [{ order: "asc" }, { id: "asc" }], take: 10 },
  options: { include: { values: { where: { OR: [{ retiredAt: null }, { option: { product: { optionMode: "LEGACY" } } }] } } } },
  variants: { where: { retiredAt: null }, include: availabilityVariantInclude },
} satisfies Prisma.ProductInclude;
