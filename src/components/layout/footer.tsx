"use client";

import Image from "next/image";
import Link from "next/link";
import { useLangStore } from "@/store/lang-store";
import type { CategoryTreeNode } from "@/lib/categories";
import { getCategoryName } from "@/lib/category-name";
import { safeContentUrl, type StorefrontContent } from "@/lib/site-content";
import { SocialIcon } from "@/components/layout/social-icon";

export function Footer({ categories, content }: { categories: CategoryTreeNode[]; content: StorefrontContent }) {
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
        {categories.map((category) => (
          <Link key={category.id} href={`/catalog?category=${encodeURIComponent(category.slug)}`}>{getCategoryName(category, locale)}</Link>
        ))}
      </nav>
      <nav aria-label={t.footer.customers}>
        <h2>{t.footer.customers}</h2>
        <button type="button" disabled className="sf-footer-account" title={t.nav.account}>{t.footer.account}</button>
        <Link href="/about">{t.footer.about}</Link>
        <Link href="/delivery-payment">{t.footer.delivery}</Link>
      </nav>
      <div className="sf-footer-social">
        <h2>{t.footer.follow}</h2>
        <div className="sf-social-icons">
          {(["instagram", "telegram", "tiktok", "youtube"] as const).map((network) => {
            const url = safeContentUrl(content[`social_${network}`]);
            const icon = <SocialIcon network={network} />;
            return url ? <a key={network} href={url} aria-label={t.footer.social[network]} target="_blank" rel="noopener noreferrer">{icon}</a>
              : <span key={network} role="img" aria-label={`${t.footer.social[network]} — ${t.footer.unconfigured}`} title={t.footer.unconfigured}>{icon}</span>;
          })}
        </div>
      </div>
      <small>© {new Date().getFullYear()} 3D Kid. {t.footer.rights}</small>
    </footer>
  );
}
