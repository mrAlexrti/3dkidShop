import { prisma } from "@/lib/prisma";
import type { Locale } from "@/lib/i18n";
import { getProductName, getProductNameField } from "@/lib/product-content";

export const SUGGESTION_LIMIT = 6;
export const MIN_SEARCH_LENGTH = 2;
export const MAX_SEARCH_LENGTH = 80;

export async function findProductSuggestions(query: string, locale: Locale) {
  const q = query.trim();
  if (q.length < MIN_SEARCH_LENGTH || q.length > MAX_SEARCH_LENGTH) return [];
  const products = await prisma.product.findMany({
    where: { isActive: true, OR: [
      { name: { contains: q, mode: "insensitive" } },
      { nameEn: { contains: q, mode: "insensitive" } },
    ] },
    orderBy: [{ [getProductNameField(locale)]: "asc" }, { id: "asc" }],
    take: SUGGESTION_LIMIT,
    select: {
      id: true, slug: true, name: true, nameEn: true,
      images: { orderBy: [{ order: "asc" }, { id: "asc" }], take: 1, select: { url: true } },
    },
  });
  return products.map((product) => ({
    id: product.id, slug: product.slug, name: getProductName(product, locale),
    image: product.images[0]?.url ?? "/images/placeholder.svg",
  }));
}
