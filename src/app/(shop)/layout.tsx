import { prisma } from "@/lib/prisma";
import { Header, type NavCategory } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { CartDrawer } from "@/components/cart/cart-drawer";

// Навигация строится из БД: категории верхнего уровня (parentId = null) + их подкатегории.
async function getNavCategories(): Promise<NavCategory[]> {
  const cats = await prisma.category.findMany({
    where: { parentId: null },
    orderBy: { order: "asc" },
    include: {
      children: {
        orderBy: { order: "asc" },
        select: { id: true, name: true, slug: true },
      },
    },
  });

  return cats.map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    children: c.children.map((ch) => ({ id: ch.id, name: ch.name, slug: ch.slug })),
  }));
}

export default async function ShopLayout({ children }: { children: React.ReactNode }) {
  const categories = await getNavCategories();

  return (
    <>
      <Header categories={categories} />
      {/*
        Высота хедера:
        - розовый Hero: 150px (mobile) / 180px (desktop)
        - полоса категорий (только desktop): ~48px
      */}
      <main className="pt-[150px] md:pt-[228px]">{children}</main>
      <Footer />
      <CartDrawer />
    </>
  );
}
