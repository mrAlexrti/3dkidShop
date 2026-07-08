"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Search, X, ChevronDown } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import { useLangStore } from "@/store/lang-store";

export type FilterCategory = {
  id: string;
  name: string;
  slug: string;
  children: { id: string; name: string; slug: string }[];
};

export function CatalogFilters({ categories }: { categories: FilterCategory[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const { t } = useLangStore();

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
    startTransition(() => router.push(`${pathname}?${current.toString()}`));
  }

  function handleCategoryClick(slug: string | null) {
    updateParams({ category: slug });
  }

  const chipBase =
    "rounded-full px-4 py-2 text-sm font-semibold transition-all active:scale-95";

  return (
    <div className="glass mb-8 space-y-4 rounded-3xl p-4 shadow-soft md:p-5">
      {/* ── Поиск ─────────────────────────────────────────── */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          updateParams({ q: search || null });
        }}
        className="flex gap-2"
      >
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-pink-400"
            size={20}
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t.catalog.search}
            className="h-12 w-full rounded-full border-2 border-pink-100 bg-white pl-12 pr-10 text-sm font-medium outline-none transition-colors placeholder:text-ink/40 focus:border-pink-300 md:h-14 md:text-base"
          />
          {search && (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                updateParams({ q: null });
              }}
              className="absolute right-3 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full bg-pink-100 text-pink-500 transition-colors hover:bg-pink-200"
              aria-label={t.catalog.clear}
            >
              <X size={14} />
            </button>
          )}
        </div>
        <button
          type="submit"
          className="h-12 shrink-0 rounded-full bg-pink-500 px-6 text-sm font-bold text-white shadow-glass transition-all hover:bg-pink-600 active:scale-95 md:h-14 md:px-8 md:text-base"
        >
          {t.catalog.find}
        </button>
      </form>

      {/* ── Категории + сортировка ────────────────────────── */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => handleCategoryClick(null)}
            className={cn(
              chipBase,
              !activeCategory
                ? "bg-pink-500 text-white shadow-glass"
                : "bg-white text-ink/70 hover:bg-pink-50"
            )}
          >
            {t.catalog.all}
          </button>
          {categories.map((c) => {
            const active =
              activeCategory === c.slug || c.children.some((ch) => ch.slug === activeCategory);
            return (
              <button
                key={c.id}
                onClick={() => handleCategoryClick(c.slug)}
                className={cn(
                  chipBase,
                  "flex items-center gap-1",
                  active
                    ? "bg-pink-500 text-white shadow-glass"
                    : "bg-white text-ink/70 hover:bg-pink-50"
                )}
              >
                {c.name}
                {c.children.length > 0 && (
                  <ChevronDown size={14} className={cn(active && "rotate-180", "transition-transform")} />
                )}
              </button>
            );
          })}
        </div>

        {/* стилизованный dropdown сортировки */}
        <div className="relative shrink-0">
          <select
            value={activeSort}
            onChange={(e) => updateParams({ sort: e.target.value })}
            aria-label={t.catalog.sortLabel}
            className="h-11 cursor-pointer appearance-none rounded-full border-2 border-pink-100 bg-white pl-4 pr-10 text-sm font-semibold text-ink/80 outline-none transition-colors hover:border-pink-200 focus:border-pink-300"
          >
            {sortOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <ChevronDown
            size={16}
            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-pink-400"
          />
        </div>
      </div>

      {/* ── Подкатегории активной категории ───────────────── */}
      {subcats.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-t border-pink-100/70 pt-3">
          <span className="text-xs font-semibold uppercase tracking-wide text-ink/40">
            {t.catalog.subcategories}:
          </span>
          {subcats.map((ch) => (
            <button
              key={ch.id}
              onClick={() => handleCategoryClick(ch.slug)}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-semibold transition-all active:scale-95",
                activeCategory === ch.slug
                  ? "bg-pink-500 text-white"
                  : "bg-pink-50 text-pink-600 hover:bg-pink-100"
              )}
            >
              {ch.name}
            </button>
          ))}
        </div>
      )}

      {isPending && <span className="block text-xs text-ink/40">{t.catalog.updating}</span>}
    </div>
  );
}
