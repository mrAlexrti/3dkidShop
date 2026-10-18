"use client";

import Link from "next/link";
import { ChevronDown } from "lucide-react";
import type { CategoryTreeNode } from "@/lib/categories";
import { getCategoryName } from "@/lib/category-name";
import { useLangStore } from "@/store/lang-store";

export function CategoryNav({ categories }: { categories: CategoryTreeNode[] }) {
  const { locale, t } = useLangStore();
  return (
    <nav className="sf-shell sf-categories" aria-label={t.nav.categories}>
      <Link href="/catalog">{t.nav.all}</Link>
      {categories.map((category) => (
        <div className="sf-category-group" key={category.id}>
          <Link href={`/catalog?category=${encodeURIComponent(category.slug)}`}>{getCategoryName(category, locale)}</Link>
          {category.children.length > 0 && (
            <details onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.currentTarget.open = false;
                event.currentTarget.querySelector("summary")?.focus();
              }
            }}>
              <summary aria-label={`${t.catalog.subcategories}: ${getCategoryName(category, locale)}`}><ChevronDown size={16} aria-hidden="true" /></summary>
              <div className="sf-subcategories">
                {category.children.map((child) => (
                  <Link key={child.id} href={`/catalog?category=${encodeURIComponent(child.slug)}`} onClick={(event) => {
                    event.currentTarget.closest("details")?.removeAttribute("open");
                  }}>{getCategoryName(child, locale)}</Link>
                ))}
              </div>
            </details>
          )}
        </div>
      ))}
    </nav>
  );
}
