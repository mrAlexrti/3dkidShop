import { productOffer } from "@/lib/product-configuration";
import { catalogProducts } from "@/lib/catalog-products";
import { CatalogFilters, type FilterCategory } from "@/components/catalog/catalog-filters";
import { ProductGrid } from "@/components/catalog/product-grid";
import { Pagination } from "@/components/catalog/pagination";
import type { Metadata } from "next";
import type { Prisma } from "@prisma/client";
import { notFound, permanentRedirect, redirect } from "next/navigation";
import { cache } from "react";
import { getCategoryIdsForSlug, getCategoryTree } from "@/lib/categories";
import { getLocale } from "@/lib/i18n-server";
import { getProductNameField } from "@/lib/product-content";
import { getCategoryName } from "@/lib/category-name";
import { translations, type Locale } from "@/lib/i18n";
import { getStorefrontContent } from "@/lib/site-settings";
import { breadcrumb, pageSeo, resolveSeo } from "@/lib/seo";
import { catalogPath } from "@/lib/seo-config";
import { JsonLd } from "@/components/seo/json-ld";

const PAGE_SIZE = 12;

type CatalogProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const getCatalog = cache(async (category: string | undefined, q: string | undefined, sort: string | undefined, pageValue: string | undefined, locale: Locale) => {
  const page = Math.min(1000000, Math.max(1, parseInt(pageValue ?? "1", 10) || 1));
  const params = { category, q, sort, page: pageValue };
  const categoryTree = await getCategoryTree();
  const flattened = categoryTree.flatMap(node => [node, ...node.children]);
  const activeCategory = flattened.find(node => node.slug === category);
  if (category && !activeCategory) {
    const matches = flattened.filter(node => node.slug.toLowerCase() === category.toLowerCase());
    if (matches.length !== 1) notFound();
    const target = new URLSearchParams();
    for (const [key, value] of Object.entries({ ...params, category: matches[0].slug })) if (value) target.set(key, value);
    permanentRedirect(`/catalog?${target}`);
  }
  const categoryIds = getCategoryIdsForSlug(categoryTree, category);

  // Строим where без лишних полей чтобы "Все" = пустой where
  const where: Prisma.ProductWhereInput = { isActive: true };
  if (categoryIds) {
    where.categoryId = { in: categoryIds };
  }
  if (params.q && params.q !== "") {
    where.OR = [
      { name: { contains: params.q, mode: "insensitive" } },
      { nameEn: { contains: params.q, mode: "insensitive" } },
    ];
  }

  const orderBy: Prisma.ProductOrderByWithRelationInput =
    params.sort === "price_asc"  ? { price: "asc" }      :
    params.sort === "price_desc" ? { price: "desc" }     :
    params.sort === "name"       ? { [getProductNameField(locale)]: "asc" } :
                                   { createdAt: "desc" };

  const { products, total } = await catalogProducts({ where, orderBy, categoryIds, q: params.q, sort: params.sort, page, pageSize: PAGE_SIZE });

  const totalPages = Math.ceil(total / PAGE_SIZE);
  if (totalPages > 0 && page > totalPages) {
    const nextParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => { if (value) nextParams.set(key, value); });
    nextParams.set("page", String(totalPages));
    redirect(`/catalog?${nextParams.toString()}`);
  }
  if (page > 1 && !totalPages && !q) notFound();
  return { params, page, categoryTree, total, totalPages, products, activeCategory };
});

async function catalogRequest(searchParams: CatalogProps["searchParams"]) {
  const [params, locale] = await Promise.all([searchParams, getLocale()]);
  const single = (key: string) => {
    const value = params[key];
    return typeof value === "string" ? value : undefined;
  };
  if (Array.isArray(params.category)) notFound();
  return { locale, ...await getCatalog(single("category"), single("q"), single("sort"), single("page"), locale) };
}

export async function generateMetadata({ searchParams }: CatalogProps): Promise<Metadata> {
  const [{ locale, page, params, activeCategory, total }, content] = await Promise.all([catalogRequest(searchParams), getStorefrontContent()]);
  const t = translations[locale];
  const name = activeCategory ? getCategoryName(activeCategory, locale) : t.catalog.title;
  const filtered = Boolean(params.q || params.sort && params.sort !== "newest");
  return pageSeo({
    seo: resolveSeo(content, locale), locale, path: catalogPath(activeCategory?.slug, filtered ? 1 : page),
    title: page > 1 ? `${name} — ${t.seo.page(page)}` : name,
    description: activeCategory ? t.seo.categoryDescription(name) : t.seo.catalogDescription,
    noindex: filtered || Boolean(activeCategory && !total),
  });
}

export default async function CatalogPage({ searchParams }: CatalogProps) {
  const { locale, categoryTree, activeCategory, total, totalPages, products, page, params } = await catalogRequest(searchParams);
  const t = translations[locale];
  const filterCategories: FilterCategory[] = categoryTree.map((c) => ({
    id: c.id,
    name: c.name,
    nameEn: c.nameEn,
    slug: c.slug,
    children: c.children.map((ch) => ({
      id: ch.id,
      name: ch.name,
      nameEn: ch.nameEn,
      slug: ch.slug,
    })),
  }));

  return (
    <div className="sf-shell sf-home-panel sf-catalog">
      {activeCategory && <JsonLd data={breadcrumb([{ name: t.seo.home, path: "/" }, { name: t.catalog.title, path: "/catalog" },
        { name: getCategoryName(activeCategory, locale), path: catalogPath(activeCategory.slug) }])} />}
      <div className="sf-section-heading">
        <div>
          <h1>{t.catalog.title}</h1>
          {activeCategory && <p className="sf-catalog-category">{getCategoryName(activeCategory, locale)}</p>}
          <p role="status">{total} {t.catalog.products}</p>
        </div>
      </div>

      <CatalogFilters categories={filterCategories} />

      <ProductGrid
        products={products.map((p) => ({
          id:       p.id,
          slug:     p.slug,
          name:     p.name,
          nameEn:   p.nameEn,
          hoverGifUrl: p.hoverGifUrl,
          price:    productOffer(p).price,
          oldPrice: productOffer(p).oldPrice,
          image:    p.images[0]?.url ?? "/images/placeholder.svg",
          images: p.images.map(({ id, url, alt }) => ({ id, url, alt })),
          isNew:    p.isNew,
          hasOptions: productOffer(p).hasOptions,
          hasColorOptions: productOffer(p).hasColorOptions,
          isOrderable: productOffer(p).isOrderable,
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
