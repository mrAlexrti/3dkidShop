import { productConfiguration, usableCombination, type ConfigurationProduct } from "@/lib/product-configuration";
import { getSizeVariants } from "@/lib/product-variants";
import { moneyMinorUnits } from "@/lib/payments/money";
import type { Locale } from "@/lib/i18n";
import { absoluteSeoImage, productPath, siteOrigin } from "@/lib/seo-config";

type Image = { url: string; alt: string | null; colorValueId?: string | null };
type SeoProduct = ConfigurationProduct & {
  id: string; slug: string; sku?: string | null; images: Image[];
  options: Parameters<typeof getSizeVariants>[0] & ConfigurationProduct["options"];
};

export function productSeoImages(images: Image[], name: string) {
  return images.flatMap(image => {
    const url = absoluteSeoImage(image.url);
    return url && url !== `${siteOrigin}/images/placeholder.svg` ? [{ url, alt: image.alt || name }] : [];
  });
}

export function productStructuredData(product: SeoProduct, images: Image[], name: string, description: string, brand: string, locale: Locale) {
  const url = new URL(productPath(product.slug), siteOrigin).href;
  const offer = (price: string | number, available: boolean) => {
    const amount = moneyMinorUnits(price);
    return {
      "@type": "Offer", url, availability: `https://schema.org/${available && amount ? "InStock" : "OutOfStock"}`,
      ...(amount ? { price: (amount / 100).toFixed(2), priceCurrency: "UAH" } : {}),
    };
  };
  const productImage = productSeoImages(images, name).map(item => item.url);
  const entity = { "@context": "https://schema.org", name, description, url, brand: { "@type": "Brand", name: brand },
    ...(product.sku ? { sku: product.sku } : {}), ...(productImage.length ? { image: productImage } : {}) };
  const config = productConfiguration(product);
  const selectable = config.mode === "LEGACY" ? getSizeVariants(product.options) : [];
  const variants = selectable.length ? selectable.map(variant => {
    const size = locale === "en" ? variant.labelEn || variant.labelUa : variant.labelUa;
    return { "@type": "Product", name: `${name} — ${size}`, size, ...(productImage.length ? { image: productImage } : {}),
      offers: offer(variant.price ?? "", Boolean(product.isOrderable)) };
  }) : config.combinations.filter(row => !row.retired).map(row => {
    const values = config.values.filter(value => row.values[value.kind] === value.id);
    const label = (value: typeof values[number]) => locale === "en" ? value.labelEn || value.labelUa : value.labelUa;
    const color = values.find(value => value.kind === "COLOR");
    const size = values.find(value => value.kind === "SIZE");
    const variantImages = color && images.some(image => image.colorValueId === color.id)
      ? productSeoImages(images.filter(image => image.colorValueId === color.id), name).map(image => image.url)
      : productSeoImages(images.filter(image => !image.colorValueId), name).map(image => image.url);
    const usable = usableCombination(config, row);
    return { "@type": "Product", name: [name, ...values.map(label)].join(" — "), ...(color ? { color: label(color) } : {}),
      ...(size ? { size: label(size) } : {}), ...(variantImages.length ? { image: variantImages } : {}),
      offers: offer(usable ? row.price : "", usable && Boolean(product.isOrderable)) };
  });
  if (variants.length) return { ...entity, "@type": "ProductGroup", productGroupID: product.id, hasVariant: variants,
    variesBy: [...new Set(variants.flatMap(variant => [
      "size" in variant ? "https://schema.org/size" : "", "color" in variant ? "https://schema.org/color" : "",
    ]))].filter(Boolean) };
  const hasNativeDimensions = config.mode !== "SIMPLE" && config.mode !== "LEGACY";
  return { ...entity, "@type": "Product", offers: offer(hasNativeDimensions ? "" : product.price.toString(), !hasNativeDimensions && Boolean(product.isOrderable)) };
}
