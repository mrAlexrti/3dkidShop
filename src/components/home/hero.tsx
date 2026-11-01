import { getLocale } from "@/lib/i18n-server";
import { translations } from "@/lib/i18n";
import { getCategoryTree } from "@/lib/categories";
import { heroAssets } from "@/lib/hero-assets";
import { HeroDoodle } from "@/components/home/hero-doodle";
import { CategoryNav } from "@/components/layout/category-nav";
import { getStorefrontContent } from "@/lib/site-settings";
import { resolveHeroCopy, safeContentUrl } from "@/lib/site-content";
import { HeroImage } from "@/components/home/hero-image";

export async function Hero() {
  const [locale, categories, content] = await Promise.all([getLocale(), getCategoryTree(), getStorefrontContent()]);
  const t = translations[locale];
  const copy = resolveHeroCopy(content, locale);
  return (
    <section className="sf-shell sf-hero" aria-labelledby="hero-title">
      <div className="sf-hero-copy">
        <h1 id="hero-title">{copy.title}</h1>
        {copy.subtitle && <p>{copy.subtitle}</p>}
      </div>
      <div className="sf-hero-gallery" role="group" aria-label={t.home.hero.gallery}>
        <HeroDoodle side="left" />
        {heroAssets.map((asset, index) => (
          <figure className={`sf-hero-card sf-hero-card--${index + 1}`} key={asset.id}>
            <HeroImage key={content[asset.key]} src={safeContentUrl(content[asset.key]) ?? asset.src} fallback={asset.src}
              alt={safeContentUrl(content[asset.key]) ? `${t.home.hero.image} ${index + 1}` : t.home.hero[asset.id]} priority={index === 1} />
          </figure>
        ))}
        <HeroDoodle side="right" />
      </div>
      <CategoryNav categories={categories} home />
    </section>
  );
}
