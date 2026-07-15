import type { Locale } from "@/lib/i18n";

export type LocalizedProduct = {
  name: string;
  nameEn?: string | null;
  description: string;
  descriptionEn?: string | null;
};

export function getProductName(product: Pick<LocalizedProduct, "name" | "nameEn">, locale: Locale | "uk") {
  if (locale === "en") return product.nameEn?.trim() || product.name;
  return product.name;
}

export function getProductDescription(
  product: Pick<LocalizedProduct, "description" | "descriptionEn">,
  locale: Locale | "uk",
) {
  if (locale === "en") return product.descriptionEn?.trim() || product.description;
  return product.description;
}

export function getProductNameField(locale: Locale | "uk") {
  return locale === "en" ? "nameEn" : "name";
}
