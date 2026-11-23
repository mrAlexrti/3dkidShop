// REVIEW-ONLY executable contract. No application imports this module.
// Passing this model does NOT prove that the future Stage 1B bridge is implemented.
import type { CartItem } from "../../src/types";
import { requestedSizeId, normalizeCartItems } from "../../src/lib/cart-items";
import { moneyMinorUnits } from "../../src/lib/payments/money";

export type Selection = { version: 2; variantId: string; values: { COLOR: string; SIZE?: string } };
export type Wire = CartItem & { selection?: Selection };
export type Mode = "SIMPLE" | "SIZE" | "COLOR" | "COLOR_SIZE";
export type Variant = { id: string; productId: string; color?: string; size?: string; price: string; available: boolean; retired: boolean };
const validId = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9_]{1,128}$/.test(value);
export function selection(raw: unknown): Selection {
  if (!raw || typeof raw !== "object") throw new Error("INVALID_SELECTION");
  const s = raw as Record<string, unknown>;
  if (s.version !== 2 || !validId(s.variantId) || Object.keys(s).some((key) => !["version", "variantId", "values"].includes(key))) throw new Error("INVALID_SELECTION");
  if (!s.values || typeof s.values !== "object" || Array.isArray(s.values)) throw new Error("INVALID_SELECTION");
  const values = s.values as Record<string, unknown>;
  if (!validId(values.COLOR) || (values.SIZE !== undefined && !validId(values.SIZE)) || Object.keys(values).some((key) => !["COLOR", "SIZE"].includes(key))) throw new Error("INVALID_SELECTION");
  return { version: 2, variantId: s.variantId, values: { COLOR: values.COLOR, ...(values.SIZE !== undefined ? { SIZE: values.SIZE as string } : {}) } };
}
export function identityLines(items: Wire[]) {
  return items.map((item) => {
    if (item.selection !== undefined) {
      if (item.variant || item.options) throw new Error("AMBIGUOUS_SELECTION");
      const s = selection(item.selection);
      return { productId: item.productId, selectionVersion: 2, variantId: s.variantId,
        values: { COLOR: s.values.COLOR, SIZE: s.values.SIZE ?? null }, quantity: item.quantity };
    }
    const size = requestedSizeId(item);
    if (size === "INVALID_SIZE") throw new Error("INVALID_SIZE");
    return { productId: item.productId, size: size ?? null, quantity: item.quantity };
  }).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}
export function combinationKey(mode: Mode, values: { color?: string; size?: string }) {
  const needsColor = mode.includes("COLOR"), needsSize = mode.includes("SIZE");
  if ((needsColor ? !validId(values.color) : values.color !== undefined) || (needsSize ? !validId(values.size) : values.size !== undefined)) throw new Error("DIMENSION_MISMATCH");
  return [needsColor ? `COLOR=${values.color}` : "", needsSize ? `SIZE=${values.size}` : ""].filter(Boolean).join(";");
}
export function quote(product: { id: string; mode: Mode; price: string; active: boolean; orderable: boolean; variants: Variant[] }, wire: Wire) {
  if (!product.active || !product.orderable || product.id !== wire.productId) throw new Error("UNAVAILABLE");
  const legacySize = requestedSizeId(wire);
  if (product.mode === "SIMPLE") {
    if (wire.selection || legacySize) throw new Error("UNEXPECTED_SELECTION");
    const price = moneyMinorUnits(product.price);
    if (price === null || price <= 0) throw new Error("INVALID_PRICE");
    return price;
  }
  let v: Variant | undefined;
  if (product.mode === "SIZE") {
    if (wire.selection || !legacySize) throw new Error("MISSING_SIZE");
    v = product.variants.find((row) => row.size === legacySize && row.color === undefined);
  } else {
    if (wire.variant || !wire.selection) throw new Error("MISSING_COLOR");
    const s = selection(wire.selection);
    combinationKey(product.mode, { color: s.values.COLOR, size: s.values.SIZE });
    v = product.variants.find((row) => row.id === s.variantId && row.color === s.values.COLOR && row.size === s.values.SIZE);
  }
  if (!v || v.productId !== product.id || !v.available || v.retired) throw new Error("UNAVAILABLE_VARIANT");
  const price = moneyMinorUnits(v.price);
  if (price === null || price <= 0) throw new Error("INVALID_PRICE");
  return price;
}
export const minimumPrice = (rows: Variant[]) => {
  const prices = rows.filter((row) => row.available && !row.retired).map((row) => moneyMinorUnits(row.price));
  if (prices.some((price) => price === null || price <= 0)) throw new Error("INVALID_PRICE");
  return prices.length ? Math.min(...prices as number[]) : null;
};
export function importLegacy(storage: Pick<Storage, "getItem" | "setItem">) {
  const existing = storage.getItem("stikr-cart-v2");
  if (existing !== null) return JSON.parse(existing); // corrupt target -> recovery, not reimport
  const source = storage.getItem("stikr-cart");
  const old = source === null ? { state: { items: [] } } : JSON.parse(source);
  if (old?.state?.items?.some((item: Wire) => item?.selection !== undefined)) throw new Error("UNKNOWN_LEGACY_SELECTION");
  const raw=old?.state?.items;
  if (!Array.isArray(raw)) throw new Error("LEGACY_CART_REQUIRES_REVIEW");
  const items=normalizeCartItems(raw);
  const expected=raw.reduce((total:number,item:CartItem)=>total+(item?.quantity??NaN),0);
  if (!Number.isSafeInteger(expected) || items.reduce((total,item)=>total+item.quantity,0)!==expected) throw new Error("LEGACY_CART_REQUIRES_REVIEW");
  const revision=old?.state?.checkoutRevision;
  const target = { version: 2, importedLegacy: true, state: { items, checkoutRevision: typeof revision==="number"&&Number.isSafeInteger(revision)&&revision>=0?revision:0 } };
  storage.setItem("stikr-cart-v2", JSON.stringify(target));
  return target;
}
export function snapshotLabel(json: string, locale: "ua" | "en") {
  try {
    const s = JSON.parse(json);
    if (s.version !== 2 || !Array.isArray(s.dimensions) || s.dimensions.length < 1 || s.dimensions.length > 2) return "";
    if (s.dimensions.some((d: { kind: string; labelUa: unknown }) => !["COLOR", "SIZE"].includes(d.kind) || typeof d.labelUa !== "string")) return "";
    return s.dimensions.map((d: { labelUa: string; labelEn?: string }) => locale === "en" ? d.labelEn?.trim() || d.labelUa : d.labelUa).join(", ");
  } catch { return ""; }
}
