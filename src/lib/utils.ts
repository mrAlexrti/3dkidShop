import { type ClassValue, clsx } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function formatPrice(value: number | string) {
  const n = typeof value === "string" ? parseFloat(value) : value;
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(n);
}
