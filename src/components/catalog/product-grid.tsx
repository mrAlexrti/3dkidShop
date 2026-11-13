"use client";

import { ProductCard } from "@/components/product/product-card";
import { useLangStore } from "@/store/lang-store";

type GridProduct = {
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
  isOrderable: boolean;
};

export function ProductGrid({ products }: { products: GridProduct[] }) {
  const { t } = useLangStore();

  if (products.length === 0) {
    return <p className="sf-catalog-empty" role="status">{t.catalog.empty}</p>;
  }

  return (
    <div className="sf-product-grid">
      {products.map((p) => (
        <ProductCard key={p.id} {...p} />
      ))}
    </div>
  );
}
