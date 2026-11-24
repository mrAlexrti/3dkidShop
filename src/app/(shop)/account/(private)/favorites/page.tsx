import { Heart } from "lucide-react";
import { AccountEmpty, AccountIntro } from "@/components/account/account-surface";
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
  return <section className="ac-favorites">
    <AccountIntro title={t.favorites} description={t.favoritesHint} />
    {products.length ? <ProductGrid products={products} /> : <div className="ac-panel">
      <AccountEmpty title={t.emptyFavorites} description={t.emptyFavoritesHint} cta={t.continueShopping} icon={<Heart size={26} />} />
    </div>}
  </section>;
}
