import { ProductGrid } from "@/components/catalog/product-grid";
import { requireCustomer } from "@/lib/customer/pages";
import { getT } from "@/lib/i18n-server";
import { prisma } from "@/lib/prisma";
import { publicProductInclude } from "@/lib/product-query";
import { productOffer } from "@/lib/product-configuration";

export default async function CustomerFavorites() {
  const [customer, { account: t }] = await Promise.all([requireCustomer(), getT()]);
  const rows = await prisma.$transaction((tx) => tx.customerFavorite.findMany({
    where: { userId: customer.id, product: { isActive: true } },
    orderBy: [{ createdAt: "desc" }, { productId: "asc" }],
    select: { product: { include: publicProductInclude } },
  }), { isolationLevel: "RepeatableRead" });
  const products = rows.map(({ product: p }) => ({
    id: p.id, slug: p.slug, name: p.name, nameEn: p.nameEn, hoverGifUrl: p.hoverGifUrl, ...productOffer(p),
    image: p.images[0]?.url ?? "/images/placeholder.svg", images: p.images.map(({ id, url, alt }) => ({ id, url, alt })),
  }));
  return <section className="space-y-4"><h2 className="font-display text-xl">{t.favorites}</h2>
    {products.length ? <ProductGrid products={products} /> : <p role="status">{t.emptyFavorites}</p>}
  </section>;
}
