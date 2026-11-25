import { prisma } from "@/lib/prisma";
import type { MetadataRoute } from "next";
import { getCategoryTree } from "@/lib/categories";
import { catalogPath, productPath, siteOrigin } from "@/lib/seo-config";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [products, tree] = await Promise.all([prisma.product.findMany({
    where: { isActive: true },
    select: { slug: true, updatedAt: true, categoryId: true },
  }), getCategoryTree()]);
  const usedCategories = new Set(products.map(product => product.categoryId));
  const categories = tree.flatMap(parent => {
    const children = parent.children.filter(child => usedCategories.has(child.id));
    return usedCategories.has(parent.id) || children.length ? [parent, ...children] : [];
  });
  const entry = (pathname: string) => ({ url: new URL(pathname, siteOrigin).href });

  return [
    ...["/", "/catalog", "/about", "/delivery-payment"].map(entry),
    ...categories.map(category => entry(catalogPath(category.slug))),
    ...products.map((p) => ({
      ...entry(productPath(p.slug)),
      lastModified: p.updatedAt,
    })),
  ];
}
