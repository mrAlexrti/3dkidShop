import type { CartItem } from "@/types";
import { checkoutSelectionLines } from "@/lib/cart-items";

const storageKey = "3dkid-online-checkout-v2";
const combinationKey = "3dkid-online-checkout-v3";
type PendingCheckout = { key: string; inputHash: string; cart: string; revision: number; reference?: string; retrySource?: { reference: string; token: string } };

function read(name = storageKey): PendingCheckout | null {
  const raw = localStorage.getItem(name);
  if (raw === null) return null;
  if (raw.length > 1000000) throw new Error("CHECKOUT_SESSION_UNAVAILABLE");
  const value = JSON.parse(raw) as PendingCheckout;
  if (!value || typeof value.key !== "string" || !/^[a-f0-9-]{36,64}$/i.test(value.key) || typeof value.inputHash !== "string" || typeof value.cart !== "string") throw new Error("CHECKOUT_SESSION_UNAVAILABLE");
  return value;
}
function matching(predicate: (entry: PendingCheckout) => boolean) {
  for (const name of [combinationKey, storageKey]) {
    // Corruption in an unrelated namespace must not break an existing return.
    // Fresh submissions still use strict read() and cannot invent a retry key.
    try { const entry = read(name); if (entry && predicate(entry)) return { name, entry }; } catch { /* Preserve unreadable records for recovery. */ }
  }
  return null;
}

// The browser stores a digest, never customer form contents. The server remains
// authoritative about identity, prices, payment and acceptance.
export async function onlineCheckoutKey(data: object, items: CartItem[], revision = 0) {
  const fields = Object.fromEntries(Object.entries(data).sort(([a], [b]) => a.localeCompare(b)));
  const name = items.some((item) => item.selection !== undefined) ? combinationKey : storageKey;
  const lines = checkoutSelectionLines(items);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify({ data: fields, lines, revision })));
  const inputHash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  const existing = read(name);
  if (existing?.inputHash === inputHash) return existing.key;
  const next: PendingCheckout = { key: crypto.randomUUID(), inputHash, cart: JSON.stringify(items), revision };
  localStorage.setItem(name, JSON.stringify(next));
  return next.key;
}
export function rememberCheckoutResult(key: string, resultUrl: string) {
  const match = matching((entry) => entry.key === key);
  if (!match) return;
  const reference = new URL(resultUrl, window.location.origin).searchParams.get("attempt");
  if (reference) localStorage.setItem(match.name, JSON.stringify({ ...match.entry, reference }));
}
export function completeCheckoutCart(reference: string, state: string, items: CartItem[], clear: () => void, revision = 0) {
  if (state !== "paid") return;
  const match = matching((entry) => entry.reference === reference);
  if (!match) return;
  if (match.entry.revision === revision && match.entry.cart === JSON.stringify(items)) clear();
  localStorage.removeItem(match.name);
}

export function explicitPaymentRetry(reference: string, key: string, token: string) {
  const match = matching((entry) => entry.reference === reference);
  if (!match || !/^[a-f0-9]{64}$/.test(key)) return false;
  localStorage.setItem(match.name, JSON.stringify({ ...match.entry, key, reference: undefined, retrySource: { reference, token } }));
  return true;
}
export function checkoutRetrySource(key?: string) {
  return key ? matching((entry) => entry.key === key)?.entry.retrySource : undefined;
}
