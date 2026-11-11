import { z } from "zod";
import type { Locale } from "@/lib/i18n";
import { getProductOptionLabel } from "@/lib/product-content";

export const sizeInputSchema = z.array(z.object({
  id: z.string().cuid().optional(),
  labelUa: z.string().trim().min(1).max(100),
  labelEn: z.string().trim().max(100).optional().default(""),
  price: z.coerce.number().finite().positive().max(99999999.99).refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 0.000001),
  noteUa: z.string().trim().max(500).optional().default(""),
  noteEn: z.string().trim().max(500).optional().default(""),
})).max(40).superRefine((sizes, ctx) => {
  const labels = sizes.map((size) => size.labelUa.toLocaleLowerCase());
  const ids = sizes.flatMap((size) => size.id ? [size.id] : []);
  if (new Set(labels).size !== labels.length || new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom", message: "Duplicate sizes" });
});
export type SizeInput = z.infer<typeof sizeInputSchema>[number];
export type SizeVariant = { id: string; labelUa: string; labelEn: string | null; price: number | null; noteUa: string | null; noteEn: string | null };
type PriceValue = { price?: number | string | { toString(): string } | null };
type PriceGroup = { name: string; values: PriceValue[] };
type OptionData = { name: string; values: (PriceValue & { id: string; value: string; valueEn?: string | null; priceModifier?: number | string | { toString(): string }; note?: string | null; noteEn?: string | null })[] };
export type LegacySize = { id: string; labelUa: string; modifier: string };

const isSizeGroup = (name: string) => ["Розмір", "Size"].includes(name);
const hasExplicitPrice = (value: PriceValue) => value.price != null && Number.isFinite(Number(value.price)) && Number(value.price) > 0;

export function getSizeVariants(options: OptionData[]): SizeVariant[] {
  return options.filter((option) => isSizeGroup(option.name)).flatMap((option) => option.values.filter(hasExplicitPrice).map((value) => {
    const price = value.price == null ? null : Number(value.price);
    return { id: value.id, labelUa: value.value, labelEn: value.valueEn ?? null, price: price !== null && Number.isFinite(price) && price > 0 ? price : null, noteUa: value.note ?? null, noteEn: value.noteEn ?? null };
  }));
}

export function getLegacySizes(options: OptionData[]): LegacySize[] {
  return options.filter((option) => isSizeGroup(option.name)).flatMap((option) => option.values.filter((value) => !hasExplicitPrice(value)).map((value) => ({ id: value.id, labelUa: value.value, modifier: value.priceModifier?.toString() ?? "0" })));
}

export function hasConfiguredSizes(options: PriceGroup[]) {
  return options.some((option) => isSizeGroup(option.name) && option.values.some(hasExplicitPrice));
}

export function sizeLabel(size: Pick<SizeVariant, "labelUa" | "labelEn">, locale: Locale) {
  return locale === "en" ? size.labelEn?.trim() || getProductOptionLabel(size.labelUa, locale) : size.labelUa;
}

export function productLineId(productId: string, variantId?: string) {
  return variantId ? `${productId}-${variantId}` : productId;
}

export function startingPrice(basePrice: number | { toString(): string }, options: PriceGroup[]) {
  const prices = options.filter((option) => isSizeGroup(option.name)).flatMap((option) => option.values.filter(hasExplicitPrice).map((value) => Number(value.price)));
  return prices.length ? Math.min(...prices) : Number(basePrice);
}

// Versioned immutable order snapshot, independent of future size edits/deletions.
export function snapshotSize(size: SizeVariant) {
  return JSON.stringify({ version: 1, size: { id: size.id, labelUa: size.labelUa, labelEn: size.labelEn, noteUa: size.noteUa, noteEn: size.noteEn } });
}
export function orderSizeLabel(json: string | null, locale: Locale = "ua") {
  if (!json) return "";
  try {
    const value = JSON.parse(json);
    if (value?.version === 1 && typeof value.size?.labelUa === "string") return sizeLabel(value.size, locale);
    // Historical flat option snapshots remain readable.
    return Object.values(value).filter((label): label is string => typeof label === "string").join(", ");
  } catch { return ""; }
}
