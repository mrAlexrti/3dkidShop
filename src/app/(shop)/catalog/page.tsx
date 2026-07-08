import { prisma } from "@/lib/prisma";
import { CatalogFilters, type FilterCategory } from "@/components/catalog/catalog-filters";
import { ProductGrid } from "@/components/catalog/product-grid";
import { Pagination } from "@/components/catalog/pagination";
import type { Metadata } from "next";
import type { Prisma } from "@prisma/client";
import { redirect } from "next/navigation";
import { getT } from "@/lib/i18n-server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return {
    title: t.catalog.title,
    description: "Всі товари 3D Kid: іграшки, брелоки, курси.",
  };
}

const PAGE_SIZE = 12;

type SearchParams = {
  category?: string;
  sort?: string;
  q?: string;
  page?: string;
};

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const t = await getT();
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);

  // Если выбрана родительская категория — показываем товары самой категории И её подкатегорий.
  let categoryIds: string[] | null = null;
  if (params.category && params.category !== "") {
    const selected = await prisma.category.findUnique({
      where: { slug: params.category },
      include: { children: { select: { id: true } } },
    });
    categoryIds = selected ? [selected.id, ...selected.children.map((c) => c.id)] : [];
  }

  // Строим where без лишних полей чтобы "Все" = пустой where
  const where: Prisma.ProductWhereInput = { isActive: true };
  if (categoryIds) {
    where.categoryId = { in: categoryIds };
  }
  if (params.q && params.q !== "") {
    where.name = { contains: params.q, mode: "insensitive" };
  }

  const orderBy: Prisma.ProductOrderByWithRelationInput =
    params.sort === "price_asc"  ? { price: "asc" }      :
    params.sort === "price_desc" ? { price: "desc" }     :
    params.sort === "name"       ? { name: "asc" }       :
                                   { createdAt: "desc" };

  const [products, total, categories] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy,
      include: { images: true, _count: { select: { options: true } } },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.product.count({ where }),
    prisma.category.findMany({
      where: { parentId: null },
      orderBy: { order: "asc" },
      include: {
        children: { orderBy: { order: "asc" }, select: { id: true, name: true, slug: true } },
      },
    }),
  ]);

  const filterCategories: FilterCategory[] = categories.map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    children: c.children.map((ch) => ({ id: ch.id, name: ch.name, slug: ch.slug })),
  }));

  const totalPages = Math.ceil(total / PAGE_SIZE);
  if (totalPages > 0 && page > totalPages) {
    const nextParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value) nextParams.set(key, value);
    });
    nextParams.set("page", String(totalPages));
    redirect(`/catalog?${nextParams.toString()}`);
  }

  return (
    <div className="container-shop py-10">
      <h1 className="font-display text-4xl text-ink md:text-5xl">{t.catalog.title}</h1>
      <p className="mt-2 text-ink/50">{total} {t.catalog.products}</p>

      <div className="mt-6">
        <CatalogFilters categories={filterCategories} />
      </div>

      <ProductGrid
        products={products.map((p) => ({
          id:       p.id,
          slug:     p.slug,
          name:     p.name,
          price:    Number(p.price),
          oldPrice: p.oldPrice ? Number(p.oldPrice) : null,
          image:    p.images[0]?.url ?? "/images/placeholder.svg",
          isNew:    p.isNew,
          hasOptions: p._count.options > 0,
          stock: p.stock,
        }))}
      />

      <Pagination
        currentPage={page}
        totalPages={totalPages}
        searchParams={params}
      />
    </div>
  );
}
