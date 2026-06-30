"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Search } from "lucide-react";
import { useState, useTransition } from "react";
import { cn } from "@/lib/utils";

type Category = { id: string; name: string; slug: string };

const SORT_OPTIONS = [
  { value: "newest", label: "Сначала новые" },
  { value: "price_asc", label: "Цена: по возрастанию" },
  { value: "price_desc", label: "Цена: по убыванию" },
  { value: "name", label: "По названию" },
];

export function CatalogFilters({ categories }: { categories: Category[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState(searchParams.get("q") ?? "");

  const activeCategory = searchParams.get("category") ?? "";
  const activeSort = searchParams.get("sort") ?? "newest";

  function updateParams(updates: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(updates).forEach(([key, value]) => {
      if (value) params.set(key, value);
      else params.delete(key);
    });
    params.delete("page");
    startTransition(() => router.push(`${pathname}?${params.toString()}`));
  }

  return (
    <div className="glass mb-8 flex flex-col gap-4 rounded-xl2 p-4 shadow-soft md:flex-row md:items-center md:justify-between">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          updateParams({ q: search || null });
        }}
        className="relative w-full md:max-w-xs"
      >
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/40" size={16} />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Поиск товаров..."
          className="w-full rounded-full border border-ink/10 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-pink-400"
        />
      </form>

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => updateParams({ category: null })}
          className={cn(
            "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
            !activeCategory ? "bg-pink-500 text-white" : "bg-white text-ink/70 hover:bg-pink-50"
          )}
        >
          Все
        </button>
        {categories.map((c) => (
          <button
            key={c.id}
            onClick={() => updateParams({ category: c.slug })}
            className={cn(
              "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
              activeCategory === c.slug ? "bg-pink-500 text-white" : "bg-white text-ink/70 hover:bg-pink-50"
            )}
          >
            {c.name}
          </button>
        ))}
      </div>

      <select
        value={activeSort}
        onChange={(e) => updateParams({ sort: e.target.value })}
        className="rounded-full border border-ink/10 bg-white px-3 py-2 text-sm outline-none focus:border-pink-400"
      >
        {SORT_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>

      {isPending && <span className="text-xs text-ink/40">Обновление...</span>}
    </div>
  );
}
