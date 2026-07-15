import type { Locale } from "@/lib/i18n";

export type LocalizedCategory = {
  name: string;
  nameEn?: string | null;
};

export function getCategoryName(category: LocalizedCategory, locale: Locale | "uk") {
  if (locale === "en") return category.nameEn?.trim() || category.name;
  return category.name;
}
