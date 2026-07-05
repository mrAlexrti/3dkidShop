import { type ClassValue, clsx } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function formatPrice(
  value: number | string,
  currency: "UAH" | "USD" = "UAH"
): string {
  const amount = typeof value === "string" ? Number.parseFloat(value) : value;
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  const hasFraction = !Number.isInteger(safeAmount);

  return new Intl.NumberFormat(currency === "UAH" ? "uk-UA" : "en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(safeAmount);
}