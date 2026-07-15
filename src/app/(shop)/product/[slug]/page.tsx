import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ProductGallery } from "@/components/product/product-gallery";
import { ProductOptions } from "@/components/product/product-options";
import { RelatedProducts } from "@/components/product/related-products";
import { AnimatedSection } from "@/components/shared/animated-section";
import { formatPrice } from "@/lib/utils";
import { getLocale } from "@/lib/i18n-server";
import { getCategoryName } from "@/lib/category-name";
import { getProductDescription, getProductName } from "@/lib/product-content";
import { translations } from "@/lib/i18n";

// slug в URL может прийти в закодированном виде (кириллица) — декодируем
async function getProduct(rawSlug: string) {
  let slug: string;
  try {
    slug = decodeURIComponent(rawSlug);
  } catch {
    return null;
  }
  
  // Сначала пробуем точное совпадение
  let product = await prisma.product.findFirst({
    where: { slug, isActive: true },
    include: {
      images: true,
      options: { include: { values: true } },
      attributes: true,
      category: true,
    },
  });

  // Если не нашли — пробуем case-insensitive поиск (подстраховка)
  if (!product) {
    product = await prisma.product.findFirst({
      where: {
        slug: {
          equals: slug,
          mode: "insensitive",
        },
        isActive: true,
      },
      include: {
        images: true,
        options: { include: { values: true } },
        attributes: true,
        category: true,
      },
    });
  }

  return product;
}

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const [product, locale] = await Promise.all([getProduct(slug), getLocale()]);
  if (!product) return { title: "Товар не найден" };
  const name = getProductName(product, locale);
  const description = getProductDescription(product, locale);
  return {
    title: name,
    description: description.slice(0, 160),
    openGraph: {
      images: product.images[0] ? [product.images[0].url] : [],
    },
  };
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [product, locale] = await Promise.all([getProduct(slug), getLocale()]);
  if (!product) notFound();
  const productName = getProductName(product, locale);
  const productDescription = getProductDescription(product, locale);
  const t = translations[locale];

  const related = await prisma.product.findMany({
    where: {
      categoryId: product.categoryId,
      id: { not: product.id },
      isActive: true,
    },
    include: { images: true, _count: { select: { options: true } } },
    take: 4,
  });

  return (
    <div className="container-shop py-10">
      <div className="grid gap-10 md:grid-cols-2">
        <AnimatedSection>
          <ProductGallery images={product.images} name={productName} />
        </AnimatedSection>

        <AnimatedSection delay={0.1}>
          <p className="text-xs uppercase tracking-wide text-pink-600">
            {getCategoryName(product.category, locale)}
          </p>
          <h1 className="mt-2 font-display text-3xl text-ink">{productName}</h1>
          <div className="mt-2 flex items-center gap-3">
            <p className="text-2xl font-semibold text-pink-600">
              {formatPrice(Number(product.price))}
            </p>
            {product.oldPrice && (
              <p className="text-lg text-ink/40 line-through">
                {formatPrice(Number(product.oldPrice))}
              </p>
            )}
          </div>

          <p className="mt-5 text-sm leading-relaxed text-ink/70">
            {productDescription}
          </p>

          <ProductOptions
            productId={product.id}
            name={productName}
            slug={product.slug}
            basePrice={Number(product.price)}
            image={product.images[0]?.url ?? "/images/placeholder.svg"}
            stock={product.stock}
            options={product.options.map((o) => ({
              id: o.id,
              name: o.name,
              values: o.values.map((v) => ({
                id: v.id,
                value: v.value,
                priceModifier: Number(v.priceModifier),
              })),
            }))}
          />

          {product.attributes.length > 0 && (
            <div className="mt-8 border-t border-pink-100 pt-6">
              <h3 className="mb-3 text-sm font-semibold">{t.product.characteristics}</h3>
              <dl className="space-y-2 text-sm">
                {product.attributes.map((attr) => (
                  <div
                    key={attr.id}
                    className="flex justify-between border-b border-dashed border-ink/10 pb-2"
                  >
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
        title={t.product.related}
        products={related.map((p) => ({
          id: p.id,
          slug: p.slug,
          name: p.name,
          nameEn: p.nameEn,
          price: Number(p.price),
          image: p.images[0]?.url ?? "/images/placeholder.svg",
          isNew: p.isNew,
          hasOptions: p._count.options > 0,
          stock: p.stock,
        }))}
      />
    </div>
  );
}
