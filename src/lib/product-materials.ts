import { z } from "zod";

export const MATERIALS_LIMIT = 12000;
export const MOTIF_LIMIT = 8;
const segmenter = new Intl.Segmenter("uk", { granularity: "grapheme" });
export const motifSchema = z.string().trim().max(128).refine((value) =>
  value.length <= 128 && !/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u.test(value) &&
  Array.from(segmenter.segment(value)).length <= MOTIF_LIMIT);
export const materialsFields = {
  materials: z.preprocess((v) => v === "" ? null : v, z.string().max(MATERIALS_LIMIT).nullable().optional()),
  materialsEn: z.preprocess((v) => v === "" ? null : v, z.string().max(MATERIALS_LIMIT).nullable().optional()),
  materialsDivider: z.preprocess((v) => v === "" ? null : v, motifSchema.nullable().optional()),
};
export function localizedMaterials(product: { materials?: string | null; materialsEn?: string | null }, locale: string) {
  return (locale === "en" && product.materialsEn?.trim() ? product.materialsEn : product.materials) ?? "";
}
export function dividerCount(width: number, motifWidth: number, spacedWidth: number) {
  if (![width, motifWidth, spacedWidth].every(Number.isFinite) || width <= 0 || motifWidth <= 0 || spacedWidth < motifWidth) return 0;
  const gap = spacedWidth - motifWidth;
  return Math.max(0, Math.min(128, Math.floor((width - 1 + gap) / spacedWidth)));
}
