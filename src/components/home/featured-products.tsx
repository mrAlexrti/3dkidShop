import Link from "next/link";
import { Search } from "lucide-react";
import { ProductCard } from "@/components/product/product-card";
import { getT } from "@/lib/i18n-server";

type Product = {
  id: string;
  slug: string;
  name: string;
  nameEn?: string | null;
  price: number;
  oldPrice?: number | null;
  image: string;
  isNew?: boolean;
  hasOptions?: boolean;
  stock?: number;
};

export async function FeaturedProducts({ products, variant = "featured" }: {
  products: Product[];
  variant?: "featured" | "newest";
}) {
  const t = await getT();
  const featured = variant === "featured";
  const titleId = `home-${variant}-title`;
  return (
    <section className="sf-shell sf-home-panel" aria-labelledby={titleId}>
      <div className="sf-section-heading">
        <div>
          {featured && <span className="sf-eyebrow">{t.home.eyebrow}</span>}
          <h2 id={titleId}>{featured ? t.home.featured : t.home.newArrivals}</h2>
          {featured && <p>{t.home.description}</p>}
        </div>
        <Link className="sf-pill" href="/catalog">{t.home.viewCatalog}</Link>
      </div>
      {featured && (
        <form action="/catalog" method="get" role="search" className="sf-home-search">
          <label htmlFor="home-product-search">{t.home.searchLabel}</label>
          <div className="sf-search-row">
            <div className="sf-search-field">
              <Search size={22} aria-hidden="true" />
              <input id="home-product-search" name="q" type="search" placeholder={t.home.searchPlaceholder} />
            </div>
            <button type="submit" className="sf-pill">{t.catalog.find}</button>
          </div>
        </form>
      )}
      {products.length > 0 ? (
        <div className="sf-product-grid">
          {products.map((product) => <ProductCard key={product.id} {...product} presentation="home" />)}
        </div>
      ) : <p className="py-10 text-center">{t.catalog.empty}</p>}
    </section>
  );
}
