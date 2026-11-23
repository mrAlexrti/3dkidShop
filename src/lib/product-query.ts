import type { Prisma } from "@prisma/client";
export const publicProductInclude = {
  images: { orderBy: [{ order: "asc" }, { id: "asc" }], take: 10 },
  options: { include: { values: { where: { OR: [{ retiredAt: null }, { option: { product: { optionMode: "LEGACY" } } }] } } } },
  variants: { where: { retiredAt: null }, include: { selections: true } },
} satisfies Prisma.ProductInclude;
