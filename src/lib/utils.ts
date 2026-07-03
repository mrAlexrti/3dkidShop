import { type ClassValue, clsx } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

// UAH = гривна, USD = доллар
// Курс — статичный для демо, в проде подтягивать с API
const USD_RATE = 41.5;

export function formatPrice(
  value: number | string,
  currency: "UAH" | "USD" = "UAH"
): string {
  const n = typeof value === "string" ? parseFloat(value) : value;

  // Цены хранятся в EUR в БД, конвертируем на лету
  const converted = currency === "UAH" ? n * USD_RATE : n;

  return new Intl.NumberFormat(currency === "UAH" ? "uk-UA" : "en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(converted);
}
