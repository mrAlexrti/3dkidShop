import type { Locale } from "@/lib/i18n";

export function formatOrderReference(number: string, locale: Locale = "ua") {
  return `${locale === "en" ? "Order #" : "Замовлення №"}${number}`;
}
