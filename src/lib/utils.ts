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
  // Server and browser ICU versions can disagree on UAH symbols and spacing.
  const digits = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(Math.abs(safeAmount));
  const sign = safeAmount < 0 || Object.is(safeAmount, -0) ? "-" : "";
  const symbol = currency === "UAH" ? "₴" : "$";
  const ukrainian = locale === "ua" || (locale === undefined && currency === "UAH");
  return ukrainian
    ? `${sign}${digits.replaceAll(",", "\u00a0").replace(".", ",")}\u00a0${symbol}`
    : `${sign}${symbol}${digits}`;
}
