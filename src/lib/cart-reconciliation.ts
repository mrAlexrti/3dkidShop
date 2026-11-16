import type { CartItem } from "@/types";
import { requestedSizeId } from "@/lib/cart-items";
import { getProductName } from "@/lib/product-content";
import type { Locale } from "@/lib/i18n";
import type { SizeVariant } from "@/lib/product-variants";
import { priceMinor } from "@/lib/cart-limits";

export type CartProduct = { id: string; name: string; nameEn: string | null; slug: string; image: string; price: number; isOrderable: boolean; variants: SizeVariant[] };
export type CartIssue = "unavailable" | "sizeUnavailable";
export const CART_IMAGE_PLACEHOLDER = "/images/placeholder.svg";

// Browser persistence and old page props are not an authoritative media source.
export function withoutCartImages(items: CartItem[]): CartItem[] {
  return items.map((item) => ({ ...item, image: CART_IMAGE_PLACEHOLDER }));
}

export function cartImageSource(item: Pick<CartItem, "image">, state: {
  verification: string; verifiedRevision: number | null; checkoutRevision: number;
}) {
  return state.verification === "verified" && state.verifiedRevision === state.checkoutRevision
    ? item.image : CART_IMAGE_PLACEHOLDER;
}
export function reconcileCart(items: CartItem[], products: CartProduct[], locale: Locale) {
  const byId = new Map(products.map((product) => [product.id, product]));
  const issues: Record<string, CartIssue> = Object.create(null);
  const changed: string[] = [];
  const refreshed = items.map((item) => {
    const product = byId.get(item.productId);
    // Inactive/deleted products deliberately have the same public response.
    if (!product) { issues[item.id] = "unavailable"; return { ...item, image: CART_IMAGE_PLACEHOLDER }; }
    const sizeId = requestedSizeId(item);
    const size = product.variants.find((variant) => variant.id === sizeId);
    const price = sizeId ? size?.price : product.variants.length ? null : product.price;
    if (!product.isOrderable) issues[item.id] = "unavailable";
    else if (price == null || priceMinor(price) === null || price <= 0) issues[item.id] = "sizeUnavailable";
    if (price != null && priceMinor(price) !== null && price !== item.price) changed.push(item.id);
    return { ...item, name: getProductName(product, locale), slug: product.slug, image: product.image,
      ...(price != null && priceMinor(price) !== null ? { price } : {}),
      ...(size ? { variant: { id: size.id, labelUa: size.labelUa, labelEn: size.labelEn } } : {}) };
  });
  return { items: refreshed, issues, changed };
}
