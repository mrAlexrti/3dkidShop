import { z } from "zod";
import { hasConfiguredSizes, startingPrice } from "./product-variants";
import { moneyMinorUnits } from "./payments/money";

export const optionModes = ["LEGACY", "SIMPLE", "SIZE", "COLOR", "COLOR_SIZE"] as const;
export type OptionMode = typeof optionModes[number];
export type OptionKind = "COLOR" | "SIZE";
export type OptionValue = { id: string; optionId: string; kind: OptionKind; labelUa: string; labelEn: string | null; noteUa: string | null; noteEn: string | null; retired: boolean };
export type Combination = { id: string; values: { COLOR?: string; SIZE?: string }; price: string; isAvailable: boolean; manufacturable?: boolean; retired: boolean };
export type ProductConfiguration = { mode: OptionMode; values: OptionValue[]; combinations: Combination[] };
const id = z.string().regex(/^[a-zA-Z0-9_]{1,128}$/);
export const combinationSelectionSchema = z.object({ version: z.literal(2), variantId: id,
  values: z.object({ COLOR: id, SIZE: id.optional() }).strict(),
}).strict();
export type CombinationSelection = z.infer<typeof combinationSelectionSchema>;
export const nativeMode = (mode?: string) => mode !== undefined && mode !== "LEGACY";
export const needsColor = (mode: OptionMode) => mode === "COLOR" || mode === "COLOR_SIZE";
export const needsSize = (mode: OptionMode) => mode === "SIZE" || mode === "COLOR_SIZE";
export function combinationKey(values: { COLOR?: string; SIZE?: string }) {
  if (!values.COLOR && !values.SIZE || Object.values(values).some((value) => value !== undefined && !id.safeParse(value).success)) throw new Error("INVALID_COMBINATION");
  return [values.COLOR ? `COLOR=${values.COLOR}` : "", values.SIZE ? `SIZE=${values.SIZE}` : ""].filter(Boolean).join(";");
}
export function matchesMode(mode: OptionMode, values: { COLOR?: string; SIZE?: string }) {
  return Boolean(values.COLOR) === needsColor(mode) && Boolean(values.SIZE) === needsSize(mode) && mode !== "SIMPLE" && mode !== "LEGACY";
}
export function usableCombination(config: ProductConfiguration, row: Combination) {
  return !row.retired && row.isAvailable && row.manufacturable !== false && matchesMode(config.mode, row.values) &&
    Object.entries(row.values).every(([kind, valueId]) => config.values.some((value) => value.id === valueId && value.kind === kind && !value.retired)) &&
    (moneyMinorUnits(row.price) ?? 0) > 0;
}
export function selectedCombination(config: ProductConfiguration, sizeId?: string, input?: unknown) {
  let rows: Combination[];
  if (config.mode === "SIZE") rows = input === undefined && sizeId ? config.combinations.filter((row) => row.values.SIZE === sizeId && !row.values.COLOR) : [];
  else {
    const parsed = combinationSelectionSchema.safeParse(input);
    rows = !sizeId && parsed.success ? config.combinations.filter((row) => row.id === parsed.data.variantId &&
      row.values.COLOR === parsed.data.values.COLOR && row.values.SIZE === parsed.data.values.SIZE) : [];
  }
  return rows.length === 1 && usableCombination(config, rows[0]) ? rows[0] : null;
}

type Price = number | string | { toString(): string };
export type ConfigurationProduct = { optionMode?: OptionMode; price: Price; isActive?: boolean; isOrderable?: boolean; oldPrice?: Price | null;
  options: { id?: string; kind?: OptionKind | null; name: string; values: { id?: string; value?: string; valueEn?: string | null; price?: Price | null; note?: string | null; noteEn?: string | null; retiredAt?: unknown }[] }[];
  variants?: { id: string; price: Price; isAvailable: boolean; retiredAt?: unknown; filamentGroups?: { id: string }[]; selections: { optionId: string; valueId: string }[] }[];
};
export function productConfiguration(product: ConfigurationProduct): ProductConfiguration {
  const mode = product.optionMode ?? "LEGACY";
  if (!nativeMode(mode)) return { mode, values: [], combinations: [] };
  const values = product.options.flatMap((group) => group.kind ? group.values.flatMap((v): OptionValue[] => v.id && v.value ? [{ id: v.id, optionId: group.id!, kind: group.kind!, labelUa: v.value, labelEn: v.valueEn ?? null, noteUa: v.note ?? null, noteEn: v.noteEn ?? null, retired: Boolean(v.retiredAt) }] : []) : []);
  const combinations = (product.variants ?? []).map((row) => {
    const choices: Combination["values"] = {};
    for (const selection of row.selections) {
      const group = product.options.find((option) => option.id === selection.optionId);
      if (group?.kind) choices[group.kind] = selection.valueId;
    }
    return { id: row.id, price: row.price.toString(), isAvailable: row.isAvailable, ...(row.filamentGroups?.length ? { manufacturable: false } : {}), retired: Boolean(row.retiredAt), values: choices };
  });
  return { mode, values, combinations };
}
export function publicConfiguration(product: ConfigurationProduct): ProductConfiguration {
  const config = productConfiguration(product);
  const combinations = config.combinations.filter((row) => !row.retired).map(({ manufacturable, ...row }) => ({ ...row, isAvailable: row.isAvailable && manufacturable !== false }));
  const ids = new Set(combinations.flatMap((row) => Object.values(row.values)));
  return { ...config, combinations, values: config.values.filter((v) => !v.retired && ids.has(v.id)) };
}
export function productOffer(product: ConfigurationProduct) {
  const config = productConfiguration(product);
  const legacy = config.mode === "LEGACY";
  const available = config.combinations.filter((row) => usableCombination(config, row));
  const price = legacy ? startingPrice(product.price, product.options) : config.mode === "SIMPLE" ? Number(product.price) :
    available.length ? Math.min(...available.map((row) => Number(row.price))) : null;
  return { price, hasColorOptions: needsColor(config.mode), hasOptions: legacy ? hasConfiguredSizes(product.options) : config.mode !== "SIMPLE",
    isOrderable: product.isActive !== false && Boolean(product.isOrderable) && price !== null && price > 0,
    oldPrice: legacy || config.mode === "SIMPLE" ? product.oldPrice == null ? null : Number(product.oldPrice) : null };
}
export function snapshotCombination(config: ProductConfiguration, row: Combination) {
  return JSON.stringify({ version: 2, variantId: row.id, dimensions: (["COLOR", "SIZE"] as const).flatMap((kind) => {
    const value = config.values.find((entry) => entry.kind === kind && entry.id === row.values[kind]);
    return value ? [{ kind, optionId: value.optionId, valueId: value.id, labelUa: value.labelUa, labelEn: value.labelEn, noteUa: value.noteUa, noteEn: value.noteEn }] : [];
  }) });
}
