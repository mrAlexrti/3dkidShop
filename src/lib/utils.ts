import { type ClassValue, clsx } from "clsx";
import type { Locale } from "./i18n";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function formatPrice(
  value: number | string,
  currency: "UAH" | "USD" = "UAH",
  locale?: Locale
): string {
  const amount = typeof value === "string" ? Number.parseFloat(value) : value;
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  const hasFraction = !Number.isInteger(safeAmount);

  const language = locale === "ua" ? "uk-UA" : locale === "en" ? "en-GB" : currency === "UAH" ? "uk-UA" : "en-US";
  return new Intl.NumberFormat(language, {
    style: "currency",
    currency,
    currencyDisplay: locale ? "narrowSymbol" : "symbol",
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(safeAmount);
}
