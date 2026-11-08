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
  hoverGifUrl?: string | null;
  isNew?: boolean;
  hasOptions?: boolean;
  stock?: number;
};

export async function FeaturedProducts({ products }: {
  products: Product[];
}) {
  const t = await getT();
  const titleId = "home-catalog-title";
  return (
    <section className="sf-shell sf-home-panel" aria-labelledby={titleId}>
      <div className="sf-section-heading">
        <div>
          <h2 id={titleId}>{t.catalog.title}<span className="sf-decorative-star" aria-hidden="true">✦</span></h2>
        </div>
      </div>
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
      {products.length > 0 ? (
        <div className="sf-product-grid">
          {products.map((product) => <ProductCard key={product.id} {...product} presentation="home" />)}
        </div>
      ) : <p className="py-10 text-center">{t.catalog.empty}</p>}
    </section>
  );
}
