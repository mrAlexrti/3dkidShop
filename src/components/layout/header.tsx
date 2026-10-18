"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ShoppingBag, X, Menu, UserRound } from "lucide-react";
import { useCartStore } from "@/store/cart-store";
import { useLangStore } from "@/store/lang-store";
import { LangSwitcher } from "@/components/layout/lang-switcher";
import { CategoryNav } from "@/components/layout/category-nav";
import type { CategoryTreeNode } from "@/lib/categories";
import { getCategoryName } from "@/lib/category-name";

export function Header({ categories }: { categories: CategoryTreeNode[] }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const count = useCartStore((s) => s.count());
  const openCart = useCartStore((s) => s.openCart);
  const { locale, t } = useLangStore();

  return (
    <>
      <a href="#main-content" className="sf-skip">{t.nav.skip}</a>
      <header className="sf-shell sf-header" onKeyDown={(event) => {
        if (event.key === "Escape" && mobileOpen) {
          setMobileOpen(false);
          document.getElementById("store-menu-toggle")?.focus();
        }
      }}>
        <Link href="/" className="sf-brand" aria-label={t.nav.home}>
          <Image src="/hero/logo.png" width={282} height={314} sizes="50px" alt="3D Kid" />
        </Link>
        <Link href="/catalog" className="sf-header-link">{t.nav.catalog}</Link>
        <div className="sf-controls">
          <LangSwitcher />
          <button type="button" className="sf-icon-button" disabled aria-label={t.nav.account} title={t.nav.account}>
            <UserRound size={21} aria-hidden="true" />
          </button>
          <button type="button" onClick={openCart} className="sf-icon-button" aria-label={`${t.nav.openCart} (${count})`}>
            <ShoppingBag size={21} aria-hidden="true" />
            <span className="sf-cart-count" aria-hidden="true">{count}</span>
          </button>
          <button id="store-menu-toggle" type="button" className="sf-icon-button sf-mobile-menu" onClick={() => setMobileOpen(!mobileOpen)} aria-label={mobileOpen ? t.nav.closeMenu : t.nav.menu} aria-expanded={mobileOpen} aria-controls="store-mobile-nav">
            {mobileOpen ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
          </button>
        </div>
        {mobileOpen && (
          <nav id="store-mobile-nav" className="sf-mobile-links" aria-label={t.nav.categories}>
            <Link href="/catalog" onClick={() => setMobileOpen(false)}>{t.nav.catalog}</Link>
            {categories.map((category) => (
              <div key={category.id}>
                <Link href={`/catalog?category=${encodeURIComponent(category.slug)}`} onClick={() => setMobileOpen(false)}>{getCategoryName(category, locale)}</Link>
                {category.children.map((child) => (
                  <Link className="sf-child-link" key={child.id} href={`/catalog?category=${encodeURIComponent(child.slug)}`} onClick={() => setMobileOpen(false)}>{getCategoryName(child, locale)}</Link>
                ))}
              </div>
            ))}
          </nav>
        )}
      </header>
      {pathname !== "/" && <CategoryNav categories={categories} />}
    </>
  );
}
