import Image from "next/image";
import { getT } from "@/lib/i18n-server";
import { getCategoryTree } from "@/lib/categories";
import { heroAssets } from "@/lib/hero-assets";
import { HeroDoodle } from "@/components/home/hero-doodle";
import { CategoryNav } from "@/components/layout/category-nav";

export async function Hero() {
  const [t, categories] = await Promise.all([getT(), getCategoryTree()]);
  return (
    <section className="sf-shell sf-hero" aria-labelledby="hero-title">
      <div className="sf-hero-copy">
        <Image className="sf-hero-logo" src="/hero/logo.png" width={282} height={314} sizes="78px" alt="3D Kid" />
        <h1 id="hero-title">{t.home.hero.title}<br /><span>{t.home.hero.titleAccent}</span></h1>
        <p>{t.home.hero.subtitle}</p>
      </div>
      <div className="sf-hero-gallery" role="group" aria-label={t.home.hero.gallery}>
        <HeroDoodle side="left" />
        {heroAssets.map((asset, index) => (
          <figure className={`sf-hero-card sf-hero-card--${index + 1}`} key={asset.id}>
            <Image src={asset.src} width={asset.width} height={asset.height} alt={t.home.hero[asset.id]} sizes="(max-width: 680px) 30vw, (max-width: 980px) 28vw, 280px" />
          </figure>
        ))}
        <HeroDoodle side="right" />
      </div>
      <CategoryNav categories={categories} />
    </section>
  );
}
