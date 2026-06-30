import { prisma } from "@/lib/prisma";
import { CatalogFilters } from "@/components/catalog/catalog-filters";
import { ProductGrid } from "@/components/catalog/product-grid";
import { Pagination } from "@/components/catalog/pagination";
import type { Metadata } from "next";
import type { Prisma } from "@prisma/client";

export const metadata: Metadata = {
  title: "Каталог",
  description: "Все товары STIKR: стикеры, постеры, открытки и мерч.",
};

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
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);

  const where: Prisma.ProductWhereInput = { isActive: true };
  if (params.category) where.category = { slug: params.category };
  if (params.q) where.name = { contains: params.q, mode: "insensitive" };

  const orderBy: Prisma.ProductOrderByWithRelationInput =
    params.sort === "price_asc"
      ? { price: "asc" }
      : params.sort === "price_desc"
      ? { price: "desc" }
      : params.sort === "name"
      ? { name: "asc" }
      : { createdAt: "desc" };

  const [products, total, categories] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy,
      include: { images: true },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.product.count({ where }),
    prisma.category.findMany({ orderBy: { order: "asc" } }),
  ]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="container-shop py-10">
      <h1 className="font-display text-3xl">Каталог</h1>
      <p className="mt-2 text-ink/60">{total} товаров</p>

      <div className="mt-6">
        <CatalogFilters categories={categories} />
      </div>

      <ProductGrid
        products={products.map((p) => ({
          id: p.id,
          slug: p.slug,
          name: p.name,
          price: Number(p.price),
          oldPrice: p.oldPrice ? Number(p.oldPrice) : null,
          image: p.images[0]?.url ?? "/images/placeholder.svg",
          isNew: p.isNew,
        }))}
      />

      <Pagination currentPage={page} totalPages={totalPages} searchParams={params} />
    </div>
  );
}
