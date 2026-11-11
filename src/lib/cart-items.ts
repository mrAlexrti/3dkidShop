import type { CartItem } from "@/types";
import { productLineId } from "@/lib/product-variants";

export function requestedSizeId(item: Pick<CartItem, "id" | "productId" | "variant">): string | undefined {
  if (item.variant) return typeof item.variant.id === "string" ? item.variant.id : "INVALID_SIZE";
  if (typeof item.id !== "string" || typeof item.productId !== "string") return "INVALID_SIZE";
  const suffix = item.id.startsWith(`${item.productId}-`) ? item.id.slice(item.productId.length + 1) : "";
  return suffix ? (/^[a-zA-Z0-9_]+$/.test(suffix) ? suffix : "INVALID_SIZE") : undefined;
}

export function normalizeCartItems(input: unknown): CartItem[] {
  if (!Array.isArray(input)) return [];
  const merged = new Map<string, CartItem>();
  for (const raw of input) {
    if (!raw || typeof raw.productId !== "string" || !raw.productId || typeof raw.name !== "string" || typeof raw.slug !== "string" || typeof raw.image !== "string" || !Number.isFinite(raw.price) || raw.price < 0 || !Number.isSafeInteger(raw.quantity) || raw.quantity < 1) continue;
    const variantId = requestedSizeId(raw);
    if (variantId === "INVALID_SIZE") continue;
    const legacyLabel = raw.options && typeof raw.options === "object" ? Object.values(raw.options).find((value) => typeof value === "string") as string | undefined : undefined;
    const variant = variantId ? { id: variantId, labelUa: typeof raw.variant?.labelUa === "string" ? raw.variant.labelUa : legacyLabel ?? "", labelEn: typeof raw.variant?.labelEn === "string" ? raw.variant.labelEn : null } : undefined;
    const id = productLineId(raw.productId, variantId);
    const item: CartItem = { id, productId: raw.productId, name: raw.name, slug: raw.slug, image: raw.image, price: raw.price, quantity: raw.quantity, ...(variant ? { variant } : {}) };
    const previous = merged.get(id);
    const quantity = (previous?.quantity ?? 0) + item.quantity;
    if (Number.isSafeInteger(quantity)) merged.set(id, { ...item, quantity });
  }
  return [...merged.values()];
}
