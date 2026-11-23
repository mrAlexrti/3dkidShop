import { productOffer } from "@/lib/product-configuration";
import { publicProductInclude } from "@/lib/catalog-products";
import { prisma } from "@/lib/prisma";
import { FeaturedProducts } from "@/components/home/featured-products";
import { Benefits } from "@/components/home/benefits";
import { Hero } from "@/components/home/hero";

export const revalidate = 60;

async function getHomeData() {
  return prisma.$transaction((tx) => tx.product.findMany({
    where: { isActive: true },
    include: publicProductInclude,
    take: 12,
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
  }), { isolationLevel: "RepeatableRead" });
}

export default async function HomePage() {
  const products = await getHomeData();

  const mapProduct = (product: (typeof products)[number]) => ({
    id: product.id,
    slug: product.slug,
    name: product.name,
    nameEn: product.nameEn,
    hoverGifUrl: product.hoverGifUrl,
    price: productOffer(product).price,
    oldPrice: productOffer(product).oldPrice,
    image: product.images[0]?.url ?? "/images/placeholder.svg",
    images: product.images.map(({ id, url, alt }) => ({ id, url, alt })),
    isNew: product.isNew,
    hasOptions: productOffer(product).hasOptions,
    hasColorOptions: productOffer(product).hasColorOptions,
    isOrderable: productOffer(product).isOrderable,
  });

  return (
    <>
      <Hero />
      <FeaturedProducts products={products.map(mapProduct)} />
      <Benefits />
    </>
  );
}
