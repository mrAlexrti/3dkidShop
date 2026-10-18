"use client";

import Image from "next/image";
import Link from "next/link";
import { useLangStore } from "@/store/lang-store";
import type { CategoryTreeNode } from "@/lib/categories";
import { getCategoryName } from "@/lib/category-name";

export function Footer({ categories }: { categories: CategoryTreeNode[] }) {
  const { locale, t } = useLangStore();
  return (
    <footer className="sf-shell sf-footer">
      <div className="sf-footer-brand">
        <Link href="/" className="sf-brand" aria-label={t.nav.home}>
          <Image src="/hero/logo.png" width={282} height={314} sizes="90px" alt="3D Kid" />
        </Link>
        <p>{t.footer.description}</p>
      </div>
      <nav aria-label={t.footer.catalogLabel}>
        <h2>{t.footer.shop}</h2>
        <Link href="/catalog">{t.nav.catalog}</Link>
        {categories.map((category) => (
          <Link key={category.id} href={`/catalog?category=${encodeURIComponent(category.slug)}`}>{getCategoryName(category, locale)}</Link>
        ))}
      </nav>
      <nav aria-label={t.footer.customers}>
        <h2>{t.footer.customers}</h2>
        <Link href="/cart">{t.nav.cart}</Link>
        <Link href="/checkout">{t.footer.delivery}</Link>
      </nav>
      <small>© {new Date().getFullYear()} 3D Kid. {t.footer.rights}</small>
    </footer>
  );
}
