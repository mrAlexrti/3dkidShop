import type { CartItem } from "@/types";
import { productLineId } from "@/lib/product-variants";
import { MAX_CART_LINES, priceMinor, validQuantity, cartTotalMinor } from "@/lib/cart-limits";

export function requestedSizeId(item: Pick<CartItem, "id" | "productId" | "variant">): string | undefined {
  if (item.variant) return typeof item.variant.id === "string" && /^[a-zA-Z0-9_]{1,128}$/.test(item.variant.id) ? item.variant.id : "INVALID_SIZE";
  if (typeof item.id !== "string" || typeof item.productId !== "string") return "INVALID_SIZE";
  const suffix = item.id.startsWith(`${item.productId}-`) ? item.id.slice(item.productId.length + 1) : "";
  return suffix ? (/^[a-zA-Z0-9_]+$/.test(suffix) ? suffix : "INVALID_SIZE") : undefined;
}

export function normalizeCartItems(input: unknown): CartItem[] {
  if (!Array.isArray(input)) return [];
  const merged = new Map<string, CartItem>();
  for (const raw of input) {
    if (!raw || typeof raw.productId !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(raw.productId) || typeof raw.name !== "string" || typeof raw.slug !== "string" || typeof raw.image !== "string" || priceMinor(raw.price) === null || !validQuantity(raw.quantity)) continue;
    const selectedId = requestedSizeId(raw);
    if (selectedId === "INVALID_SIZE") continue;
    const legacyLabel = raw.options && typeof raw.options === "object" ? Object.values(raw.options).find((value) => typeof value === "string") as string | undefined : undefined;
    // An old display label cannot identify a current size safely. Retain that
    // selection as unresolved instead of converting it into a simple product.
    const variantId = selectedId ?? (legacyLabel ? "LEGACY_UNRESOLVED" : undefined);
    const variant = variantId ? { id: variantId, labelUa: typeof raw.variant?.labelUa === "string" ? raw.variant.labelUa : legacyLabel ?? "", labelEn: typeof raw.variant?.labelEn === "string" ? raw.variant.labelEn : null } : undefined;
    const id = productLineId(raw.productId, variantId);
    const item: CartItem = { id, productId: raw.productId, name: raw.name, slug: raw.slug, image: raw.image, price: raw.price, quantity: raw.quantity, ...(variant ? { variant } : {}) };
    const previous = merged.get(id);
    const quantity = (previous?.quantity ?? 0) + item.quantity;
    if ((merged.has(id) || merged.size < MAX_CART_LINES) && validQuantity(quantity)) merged.set(id, { ...item, quantity });
  }
  return [...merged.values()];
}

export function cartAfterAddition(before: CartItem[], item: CartItem): CartItem[] | null {
  const items = normalizeCartItems([...before, item]);
  const expected = before.reduce((sum, line) => sum + line.quantity, 0) + item.quantity;
  return items.reduce((sum, line) => sum + line.quantity, 0) === expected && cartTotalMinor(items) !== null ? items : null;
}
