"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { X, ChevronDown } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import { useLangStore } from "@/store/lang-store";
import { getCategoryName } from "@/lib/category-name";
import { ProductSearchInput } from "@/components/catalog/product-search-input";

export type FilterCategory = {
  id: string;
  name: string;
  nameEn: string;
  slug: string;
  children: { id: string; name: string; nameEn: string; slug: string }[];
};

export function CatalogFilters({ categories }: { categories: FilterCategory[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const { locale, t } = useLangStore();

  const [search, setSearch] = useState(searchParams.get("q") ?? "");
  useEffect(() => {
    setSearch(searchParams.get("q") ?? "");
  }, [searchParams]);

  const activeCategory = searchParams.get("category") ?? "";
  const activeSort = searchParams.get("sort") ?? "newest";

  // Активная родительская категория (сама выбрана или выбрана её подкатегория).
  const activeParent = categories.find(
    (c) => c.slug === activeCategory || c.children.some((ch) => ch.slug === activeCategory)
  );
  const subcats = activeParent?.children ?? [];

  const sortOptions = [
    { value: "newest", label: t.catalog.sort.newest },
    { value: "price_asc", label: t.catalog.sort.price_asc },
    { value: "price_desc", label: t.catalog.sort.price_desc },
    { value: "name", label: t.catalog.sort.name },
  ];

  function updateParams(updates: Record<string, string | null>) {
    const current = new URLSearchParams(searchParams.toString());
    Object.entries(updates).forEach(([key, value]) => {
      if (value !== null && value !== "") current.set(key, value);
      else current.delete(key);
    });
    current.delete("page");
    const query = current.toString();
    startTransition(() => router.push(query ? `${pathname}?${query}` : pathname));
  }

  function handleCategoryClick(slug: string | null) {
    updateParams({ category: slug });
  }

  return (
    <section className="sf-catalog-filters" aria-label={t.nav.categories} aria-busy={isPending}>
      <form role="search" onSubmit={(event) => {
        event.preventDefault();
        updateParams({ q: search || null });
      }}>
        <label htmlFor="catalog-product-search">{t.home.searchLabel}</label>
        <div className="sf-search-row">
          <div className="sf-search-field sf-catalog-search">
            <ProductSearchInput id="catalog-product-search" value={search} onValueChange={setSearch}
              placeholder={t.catalog.search} label={t.home.searchLabel} />
            {search && <button type="button" className="sf-search-clear" aria-label={t.catalog.clear}
              onClick={() => { setSearch(""); updateParams({ q: null }); }}>
              <X size={16} aria-hidden="true" />
            </button>}
          </div>
          <button type="submit" className="sf-pill">{t.catalog.find}</button>
        </div>
      </form>

      <div className="sf-filter-row">
        <div className="sf-filter-chips" role="group" aria-label={t.nav.categories}>
          <button type="button" onClick={() => handleCategoryClick(null)} aria-pressed={!activeCategory}
            className={cn("sf-pill", !activeCategory && "sf-filter-active")}>{t.catalog.all}</button>
          {categories.map((category) => {
            const active = category.slug === activeCategory || category.children.some((child) => child.slug === activeCategory);
            return <button key={category.id} type="button" onClick={() => handleCategoryClick(category.slug)}
              aria-pressed={active} className={cn("sf-pill", active && "sf-filter-active")}>
              {getCategoryName(category, locale)}
              {category.children.length > 0 && <ChevronDown size={14} aria-hidden="true" />}
            </button>;
          })}
        </div>
        <label className="sf-sort">
          <span>{t.catalog.sortLabel}</span>
          <select value={activeSort} onChange={(event) => updateParams({ sort: event.target.value })}>
            {sortOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
      </div>

      {subcats.length > 0 && <div className="sf-filter-chips sf-filter-subcategories" role="group" aria-label={t.catalog.subcategories}>
        <span>{t.catalog.subcategories}:</span>
        {subcats.map((child) => <button key={child.id} type="button" onClick={() => handleCategoryClick(child.slug)}
          aria-pressed={activeCategory === child.slug} className={cn("sf-pill", activeCategory === child.slug && "sf-filter-active")}>
          {getCategoryName(child, locale)}
        </button>)}
      </div>}
      <span className="sf-filter-status" role="status">{isPending ? t.catalog.updating : ""}</span>
    </section>
  );
}
