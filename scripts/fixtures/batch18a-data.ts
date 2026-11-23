import { configurationInputSchema } from "../../src/lib/product-configuration-admin";
import type { ProductConfiguration } from "../../src/lib/product-configuration";

export const ids = { pink: "c1111111111111111111111111", blue: "c2222222222222222222222222", small: "c3333333333333333333333333", medium: "c4444444444444444444444444", large: "c5555555555555555555555555" };
export const input = configurationInputSchema.parse({ mode: "COLOR_SIZE", values: [
  { key: "pink", kind: "COLOR", labelUa: "Рожевий", labelEn: "Pink" },
  { key: "blue", kind: "COLOR", labelUa: "Блакитний", labelEn: "Blue" },
  { key: "small", kind: "SIZE", labelUa: "Малий", labelEn: "Small" },
  { key: "medium", kind: "SIZE", labelUa: "Середній", labelEn: "Medium" },
  { key: "large", kind: "SIZE", labelUa: "Великий", labelEn: "Large" },
], combinations: [
  { color: "pink", size: "small", price: "199", isAvailable: true },
  { color: "pink", size: "medium", price: "249", isAvailable: true },
  { color: "blue", size: "medium", price: "279", isAvailable: true },
  { color: "blue", size: "large", price: "349", isAvailable: false },
] });
export const configuration: ProductConfiguration = { mode: input.mode,
  values: input.values.map((v) => ({ id: ids[v.key as keyof typeof ids], optionId: v.kind, kind: v.kind, labelUa: v.labelUa, labelEn: v.labelEn, noteUa: null, noteEn: null, retired: false })),
  combinations: input.combinations.map((v, i) => ({ id: `c${String(i + 6).repeat(24)}`, price: v.price, isAvailable: v.isAvailable, retired: false,
    values: { COLOR: ids[v.color as keyof typeof ids], SIZE: ids[v.size as keyof typeof ids] } })),
};
export const url = (name: string) => `https://res.cloudinary.com/fixture/${name}`;
export const photos = [
  { id: "universal", url: url("universal.webp"), alt: "Universal", colorValueId: null },
  { id: "pink1", url: url("pink1.webp"), alt: "Pink one", colorValueId: ids.pink },
  { id: "pink2", url: url("pink2.webp"), alt: "Pink two", colorValueId: ids.pink },
  { id: "blue1", url: url("blue.gif"), alt: "Blue GIF", colorValueId: ids.blue },
];
