import Link from "next/link";
import { AnimatedSection } from "@/components/shared/animated-section";
import { ProductGrid } from "@/components/catalog/product-grid";
import { Button } from "@/components/ui/button";

type Product = {
  id: string;
  slug: string;
  name: string;
  price: number;
  oldPrice?: number | null;
  image: string;
  isNew?: boolean;
};

export function FeaturedProducts({ products, title = "Популярные товары" }: { products: Product[]; title?: string }) {
  return (
    <section className="container-shop mt-24">
      <AnimatedSection className="flex items-end justify-between">
        <div>
          <h2 className="font-display text-3xl text-ink">{title}</h2>
          <p className="mt-2 text-ink/60">Выбор покупателей за последний месяц</p>
        </div>
        <Link href="/catalog" className="hidden md:block">
          <Button variant="outline">Весь каталог</Button>
        </Link>
      </AnimatedSection>

      <div className="mt-8">
        <ProductGrid products={products} />
      </div>
    </section>
  );
}
