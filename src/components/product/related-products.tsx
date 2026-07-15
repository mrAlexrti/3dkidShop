import { AnimatedSection } from "@/components/shared/animated-section";
import { ProductGrid } from "@/components/catalog/product-grid";

type Product = {
  id: string;
  slug: string;
  name: string;
  nameEn?: string | null;
  price: number;
  image: string;
  isNew?: boolean;
  hasOptions?: boolean;
  stock?: number;
};

export function RelatedProducts({ products, title }: { products: Product[]; title: string }) {
  if (products.length === 0) return null;
  return (
    <section className="container-shop mt-20">
      <AnimatedSection>
        <h2 className="font-display text-2xl">{title}</h2>
      </AnimatedSection>
      <div className="mt-6">
        <ProductGrid products={products} />
      </div>
    </section>
  );
}
