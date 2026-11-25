import { getSizeVariants } from "@/lib/product-variants";
import { productOffer, publicConfiguration } from "@/lib/product-configuration";
import { publicProductInclude } from "@/lib/catalog-products";
import { prisma } from "@/lib/prisma";
import { notFound, permanentRedirect } from "next/navigation";
import { cache } from "react";
import type { Metadata } from "next";
import { ProductGallery } from "@/components/product/product-gallery";
import { ProductSelectionProvider } from "@/components/product/product-selection";
import { ProductMaterials } from "@/components/product/product-materials";
import { ProductDescription } from "@/components/product/product-description";
import { ProductOptions } from "@/components/product/product-options";
import { FavoriteButton } from "@/components/product/favorite-button";
import { RelatedProducts } from "@/components/product/related-products";
import { AnimatedSection } from "@/components/shared/animated-section";
import { getLocale } from "@/lib/i18n-server";
import { getCategoryName } from "@/lib/category-name";
import { getProductDescription, getProductName } from "@/lib/product-content";
import { translations } from "@/lib/i18n";
import { getStorefrontContent } from "@/lib/site-settings";
import { breadcrumb, pageSeo, resolveSeo } from "@/lib/seo";
import { catalogPath, productPath } from "@/lib/seo-config";
import { productSeoImages, productStructuredData } from "@/lib/product-seo";
import { JsonLd } from "@/components/seo/json-ld";

const getProduct = cache(async (rawSlug: string) => {
  let slug: string;
  try {
    slug = decodeURIComponent(rawSlug);
  } catch {
    notFound();
  }
  const include = { ...publicProductInclude, attributes: true, category: true };
  const product = await prisma.$transaction(async (tx) => {
    const exact = await tx.product.findUnique({ where: { slug }, include });
    if (exact) return exact.isActive ? exact : null;
    const matches = await tx.product.findMany({ where: { slug: { equals: slug, mode: "insensitive" }, isActive: true }, include, take: 2 });
    return matches.length === 1 ? matches[0] : null;
  }, { isolationLevel: "RepeatableRead" });
  if (!product) notFound();
  if (product.slug !== slug) permanentRedirect(productPath(product.slug));
  const configuration = publicConfiguration(product);
  const images = product.images.filter(image => !image.colorValueId || configuration.values.some(value => value.kind === "COLOR" && value.id === image.colorValueId));
  return { product, configuration, images };
});

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const [{ product, images }, locale, content] = await Promise.all([getProduct(slug), getLocale(), getStorefrontContent()]);
  const name = getProductName(product, locale);
  const description = getProductDescription(product, locale).replace(/\s+/g, " ").trim() || translations[locale].seo.productDescription(name);
  const seo = resolveSeo(content, locale);
  return pageSeo({ seo, path: productPath(product.slug), title: name, description: [...description].slice(0, 160).join(""),
    locale, image: productSeoImages(images, name)[0] ?? null });
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [{ product, configuration, images }, locale, content] = await Promise.all([getProduct(slug), getLocale(), getStorefrontContent()]);
  const productName = getProductName(product, locale);
  const productDescription = getProductDescription(product, locale);
  const t = translations[locale];
  const categoryName = getCategoryName(product.category, locale);

  const related = await prisma.$transaction((tx) => tx.product.findMany({
    where: {
      categoryId: product.categoryId,
      id: { not: product.id },
      isActive: true,
    },
    include: publicProductInclude,
    take: 4,
  }), { isolationLevel: "RepeatableRead" });

  return (
    <div className="sf-product-page container-shop py-10">
      <JsonLd data={productStructuredData(product, images, productName, productDescription || t.seo.productDescription(productName), resolveSeo(content, locale).name, locale)} />
      <JsonLd data={breadcrumb([{ name: t.seo.home, path: "/" }, { name: t.catalog.title, path: "/catalog" },
        { name: categoryName, path: catalogPath(product.category.slug) }, { name: productName, path: productPath(product.slug) }])} />
      <ProductSelectionProvider key={product.id} images={images}>
      <div className="grid gap-10 md:grid-cols-2">
        <AnimatedSection>
          <ProductGallery images={images} name={productName} />
        </AnimatedSection>

        <AnimatedSection delay={0.1}>
          <p className="text-xs uppercase tracking-wide text-pink-600">
            {categoryName}
          </p>
          <div className="mt-2 flex items-start justify-between gap-3">
            <h1 className="font-display text-3xl text-ink">{productName}</h1>
            <FavoriteButton productId={product.id} productName={productName} />
          </div>

          <ProductDescription text={productDescription} />
          <ProductMaterials product={product} locale={locale} />

          <ProductOptions
            productId={product.id}
            name={productName}
            slug={product.slug}
            basePrice={Number(product.price)}
            image={images[0]?.url ?? "/images/placeholder.svg"}
            isOrderable={product.isOrderable}
            variants={(product.optionMode ?? "LEGACY") === "LEGACY" ? getSizeVariants(product.options) : []}
            configuration={configuration}
          />

          {product.attributes.length > 0 && (
            <div className="mt-8 border-t border-pink-100 pt-6">
              <h3 className="mb-3 text-sm font-semibold">{t.product.characteristics}</h3>
              <dl className="sf-characteristics space-y-2 text-sm">
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
      </ProductSelectionProvider>
      <RelatedProducts
        title={t.product.related}
        products={related.map((p) => ({
          id: p.id,
          slug: p.slug,
          name: p.name,
          nameEn: p.nameEn,
          hoverGifUrl: p.hoverGifUrl,
          price: productOffer(p).price,
          image: p.images[0]?.url ?? "/images/placeholder.svg",
          images: p.images.map(({ id, url, alt }) => ({ id, url, alt })),
          isNew: p.isNew,
          hasOptions: productOffer(p).hasOptions,
          hasColorOptions: productOffer(p).hasColorOptions,
          isOrderable: productOffer(p).isOrderable,
        }))}
      />
    </div>
  );
}
