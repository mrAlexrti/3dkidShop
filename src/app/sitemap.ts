import { prisma } from "@/lib/prisma";
import type { MetadataRoute } from "next";

const SITE_URL = "https://www.3dkid.shop";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const products = await prisma.product.findMany({
    where: { isActive: true },
    select: { slug: true, updatedAt: true },
  });

  return [
    { url: SITE_URL, lastModified: new Date() },
    { url: `${SITE_URL}/catalog`, lastModified: new Date() },
    ...products.map((p) => ({
      url: `${SITE_URL}/product/${p.slug}`,
      lastModified: p.updatedAt,
    })),
  ];
}
