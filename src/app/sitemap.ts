import { prisma } from "@/lib/prisma";
import type { MetadataRoute } from "next";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const products = await prisma.product.findMany({ select: { slug: true, updatedAt: true } });

  return [
    { url: "https://stikr.shop", lastModified: new Date() },
    { url: "https://stikr.shop/catalog", lastModified: new Date() },
    ...products.map((p) => ({
      url: `https://stikr.shop/product/${p.slug}`,
      lastModified: p.updatedAt,
    })),
  ];
}
