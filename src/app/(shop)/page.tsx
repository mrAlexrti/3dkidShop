import { prisma } from "@/lib/prisma";
import { Categories } from "@/components/home/categories";
import { FeaturedProducts } from "@/components/home/featured-products";
import { Benefits } from "@/components/home/benefits";

export const revalidate = 60;

async function getHomeData() {
  const [categories, featured, newest] = await Promise.all([
    // Только категории верхнего уровня — для карточек на главной.
    prisma.category.findMany({ where: { parentId: null }, orderBy: { order: "asc" }, take: 8 }),
    prisma.product.findMany({
      where: { isFeatured: true, isActive: true },
      include: { images: true, _count: { select: { options: true } } },
      take: 8,
    }),
    prisma.product.findMany({
      where: { isNew: true, isActive: true },
      include: { images: true, _count: { select: { options: true } } },
      take: 4,
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return { categories, featured, newest };
}

export default async function HomePage() {
  const { categories, featured, newest } = await getHomeData();

  const mapProduct = (product: (typeof featured)[number]) => ({
    id: product.id,
    slug: product.slug,
    name: product.name,
    price: Number(product.price),
    oldPrice: product.oldPrice ? Number(product.oldPrice) : null,
    image: product.images[0]?.url ?? "/images/placeholder.svg",
    isNew: product.isNew,
    hasOptions: product._count.options > 0,
    stock: product.stock,
  });

  return (
    <>
      <Categories categories={categories} />
      <FeaturedProducts products={featured.map(mapProduct)} variant="featured" />
      <FeaturedProducts products={newest.map(mapProduct)} variant="newest" />
      <Benefits />
    </>
  );
}
