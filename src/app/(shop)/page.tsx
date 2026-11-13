import { hasConfiguredSizes, startingPrice } from "@/lib/product-variants";
import { prisma } from "@/lib/prisma";
import { FeaturedProducts } from "@/components/home/featured-products";
import { Benefits } from "@/components/home/benefits";
import { Hero } from "@/components/home/hero";

export const revalidate = 60;

async function getHomeData() {
  return prisma.product.findMany({
    where: { isActive: true },
    include: { images: { orderBy: [{ order: "asc" }, { id: "asc" }], take: 1 }, options: { select: { name: true, values: { select: { price: true } } } } },
    take: 12,
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
  });
}

export default async function HomePage() {
  const products = await getHomeData();

  const mapProduct = (product: (typeof products)[number]) => ({
    id: product.id,
    slug: product.slug,
    name: product.name,
    nameEn: product.nameEn,
    hoverGifUrl: product.hoverGifUrl,
    price: startingPrice(product.price, product.options),
    oldPrice: product.oldPrice ? Number(product.oldPrice) : null,
    image: product.images[0]?.url ?? "/images/placeholder.svg",
    isNew: product.isNew,
    hasOptions: hasConfiguredSizes(product.options),
    isOrderable: product.isOrderable,
  });

  return (
    <>
      <Hero />
      <FeaturedProducts products={products.map(mapProduct)} />
      <Benefits />
    </>
  );
}
