import * as React from "react";
import { MaterialsDivider } from "./materials-divider";
import { ProductDescription } from "./product-description";
import { translations, type Locale } from "@/lib/i18n";
import { localizedMaterials } from "@/lib/product-materials";

export function ProductMaterials({ product, locale }: { product: { materials?: string | null; materialsEn?: string | null; materialsDivider?: string | null }; locale: Locale }) {
  const text = localizedMaterials(product, locale);
  if (!text.trim()) return null;
  return <section data-materials><MaterialsDivider motif={product.materialsDivider} /><h2 className="text-sm font-bold">{translations[locale].materials.heading}</h2><ProductDescription text={text} /></section>;
}
