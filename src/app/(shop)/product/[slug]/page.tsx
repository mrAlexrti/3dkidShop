import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ProductGallery } from "@/components/product/product-gallery";
import { ProductOptions } from "@/components/product/product-options";
import { RelatedProducts } from "@/components/product/related-products";
import { AnimatedSection } from "@/components/shared/animated-section";
import { formatPrice } from "@/lib/utils";

async function getProduct(slug: string) {
  return prisma.product.findUnique({
    where: { slug },
    include: { images: true, options: { include: { values: true } }, attributes: true, category: true },
  });
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProduct(slug);
  if (!product) return {};
  return {
    title: product.name,
    description: product.description.slice(0, 160),
    openGraph: {
      images: product.images[0] ? [product.images[0].url] : [],
    },
  };
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = await getProduct(slug);
  if (!product) notFound();

  const related = await prisma.product.findMany({
    where: { categoryId: product.categoryId, id: { not: product.id }, isActive: true },
    include: { images: true },
    take: 4,
  });

  return (
    <div className="container-shop py-10">
      <div className="grid gap-10 md:grid-cols-2">
        <AnimatedSection>
          <ProductGallery images={product.images} name={product.name} />
        </AnimatedSection>

        <AnimatedSection delay={0.1}>
          <p className="text-xs uppercase tracking-wide text-pink-600">{product.category.name}</p>
          <h1 className="mt-2 font-display text-3xl text-ink">{product.name}</h1>
          <p className="mt-2 text-2xl font-semibold text-pink-600">{formatPrice(product.price)}</p>

          <p className="mt-5 text-sm leading-relaxed text-ink/70">{product.description}</p>

          <ProductOptions
            productId={product.id}
            name={product.name}
            slug={product.slug}
            basePrice={Number(product.price)}
            image={product.images[0]?.url ?? "/images/placeholder.svg"}
            options={product.options.map((o) => ({
              id: o.id,
              name: o.name,
              values: o.values.map((v) => ({ id: v.id, value: v.value, priceModifier: Number(v.priceModifier) })),
            }))}
          />

          {product.attributes.length > 0 && (
            <div className="mt-8 border-t border-pink-100 pt-6">
              <h3 className="mb-3 text-sm font-semibold">Характеристики</h3>
              <dl className="space-y-2 text-sm">
                {product.attributes.map((attr) => (
                  <div key={attr.id} className="flex justify-between border-b border-dashed border-ink/10 pb-2">
                    <dt className="text-ink/50">{attr.key}</dt>
                    <dd>{attr.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </AnimatedSection>
      </div>

      <RelatedProducts
        products={related.map((p) => ({
          id: p.id,
          slug: p.slug,
          name: p.name,
          price: Number(p.price),
          image: p.images[0]?.url ?? "/images/placeholder.svg",
          isNew: p.isNew,
        }))}
      />
    </div>
  );
}
