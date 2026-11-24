import type { Prisma } from "@prisma/client";
// Project only failed groups, so an empty relation means manufacture is possible.
export const availabilityVariantInclude = {
  selections: true,
  filamentGroups: {
    where: { alternatives: { none: { filament: { isAvailable: true } } } },
    select: { id: true },
  },
} satisfies Prisma.ProductVariantInclude;

export const adminAvailabilityVariantInclude = {
  ...availabilityVariantInclude,
  filamentGroups: {
    orderBy: { position: "asc" },
    select: { id: true, position: true, _count: { select: { alternatives: true } },
      alternatives: { where: { filament: { isAvailable: true } }, select: { filamentId: true }, take: 1 } },
  },
} satisfies Prisma.ProductVariantInclude;

export function variantFilamentSummary(groups: { position: number; _count: { alternatives: number }; alternatives: unknown[] }[]) {
  return {
    groups: groups.length,
    alternatives: groups.reduce((count, group) => count + group._count.alternatives, 0),
    blocked: groups.filter((group) => !group.alternatives.length).map((group) => group.position + 1),
  };
}

export const publicProductInclude = {
  images: { orderBy: [{ order: "asc" }, { id: "asc" }], take: 10 },
  options: { include: { values: { where: { OR: [{ retiredAt: null }, { option: { product: { optionMode: "LEGACY" } } }] } } } },
  variants: { where: { retiredAt: null }, include: availabilityVariantInclude },
} satisfies Prisma.ProductInclude;
