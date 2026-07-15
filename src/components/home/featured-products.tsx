"use client";

import Link from "next/link";
import { AnimatedSection } from "@/components/shared/animated-section";
import { ProductGrid } from "@/components/catalog/product-grid";
import { Button } from "@/components/ui/button";
import { useLangStore } from "@/store/lang-store";
import { cn } from "@/lib/utils";

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

export function FeaturedProducts({
  products,
  variant = "featured",
}: {
  products: Product[];
  variant?: "featured" | "newest";
}) {
  const { t } = useLangStore();
  const title = variant === "newest" ? t.home.newArrivals : t.home.featured;
  const subtitle = variant === "featured" ? t.home.featuredDesc : null;

  return (
    <section
      className={cn(
        "container-shop",
        variant === "featured" ? "mt-10 md:mt-14" : "mt-20 md:mt-24"
      )}
    >
      <AnimatedSection className="flex items-end justify-between">
        <div>
          <h2 className="font-display text-3xl text-ink">{title}</h2>
          {subtitle && <p className="mt-2 text-ink/60">{subtitle}</p>}
        </div>
        <Link href="/catalog" className="hidden md:block">
          <Button variant="outline">{t.home.viewCatalog}</Button>
        </Link>
      </AnimatedSection>

      <div className="mt-8">
        <ProductGrid products={products} />
      </div>
    </section>
  );
}
