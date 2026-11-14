import type { CartItem } from "@/types";
import { requestedSizeId } from "@/lib/cart-items";

const storageKey = "3dkid-online-checkout-v2";
type PendingCheckout = { key: string; inputHash: string; cart: string; revision: number; reference?: string };

function read(): PendingCheckout | null {
  try { return JSON.parse(localStorage.getItem(storageKey) ?? "null"); } catch { return null; }
}

// The browser stores a digest, never customer form contents. The server remains
// authoritative about identity, prices, payment and acceptance.
export async function onlineCheckoutKey(data: object, items: CartItem[], revision = 0) {
  const fields = Object.fromEntries(Object.entries(data).sort(([a], [b]) => a.localeCompare(b)));
  const lines = items.map((item) => ({ productId: item.productId, size: requestedSizeId(item) ?? null, quantity: item.quantity })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify({ data: fields, lines, revision })));
  const inputHash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  const existing = read();
  if (existing?.inputHash === inputHash) return existing.key;
  const next: PendingCheckout = { key: crypto.randomUUID(), inputHash, cart: JSON.stringify(items), revision };
  localStorage.setItem(storageKey, JSON.stringify(next));
  return next.key;
}
export function rememberCheckoutResult(key: string, resultUrl: string) {
  const existing = read();
  if (!existing || existing.key !== key) return;
  const reference = new URL(resultUrl, window.location.origin).searchParams.get("attempt");
  if (reference) localStorage.setItem(storageKey, JSON.stringify({ ...existing, reference }));
}
export function completeCheckoutCart(reference: string, state: string, items: CartItem[], clear: () => void, revision = 0) {
  if (!["paid", "failed", "cancelled", "expired"].includes(state)) return;
  const existing = read();
  if (!existing || existing.reference !== reference) return;
  if (state === "paid" && existing.revision === revision && existing.cart === JSON.stringify(items)) clear();
  localStorage.removeItem(storageKey);
}
