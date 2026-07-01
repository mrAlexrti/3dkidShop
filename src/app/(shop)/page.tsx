import { prisma } from "@/lib/prisma";
import { Hero } from "@/components/home/hero";
import { Categories } from "@/components/home/categories";
import { FeaturedProducts } from "@/components/home/featured-products";
import { Benefits } from "@/components/home/benefits";

export const revalidate = 60;

async function getHomeData() {
  const [categories, featured, newest, content] = await Promise.all([
    prisma.category.findMany({ orderBy: { order: "asc" }, take: 4 }),
    prisma.product.findMany({
      where: { isFeatured: true, isActive: true },
      include: { images: true },
      take: 8,
    }),
    prisma.product.findMany({
      where: { isNew: true, isActive: true },
      include: { images: true },
      take: 4,
      orderBy: { createdAt: "desc" },
    }),
    prisma.siteContent.findMany({ where: { key: { in: ["hero_title", "hero_subtitle"] } } }),
  ]);

  const contentMap = Object.fromEntries(content.map((c) => [c.key, c.value]));
  return { categories, featured, newest, contentMap };
}

export default async function HomePage() {
  const { categories, featured, newest, contentMap } = await getHomeData();

  const mapProduct = (p: (typeof featured)[number]) => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    price: Number(p.price),
    oldPrice: p.oldPrice ? Number(p.oldPrice) : null,
    image: p.images[0]?.url ?? "/images/placeholder.svg",
    isNew: p.isNew,
  });

  return (
    <>
      <Hero
        title={contentMap.hero_title ?? "Наклей немного радости"}
        subtitle={contentMap.hero_subtitle ?? "Стикеры, постеры и мерч, которые поднимают настроение"}
      />
      <Categories categories={categories} />
      <FeaturedProducts products={featured.map(mapProduct)} />
      <FeaturedProducts products={newest.map(mapProduct)} title="Новинки" />
      <Benefits />
    </>
  );
}
