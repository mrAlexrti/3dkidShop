import { normalizeCartItems } from "./cart-items";
import { withoutCartImages } from "./cart-reconciliation";

type Storage = { getItem: (key: string) => string | null; setItem: (key: string, value: string) => void; removeItem: (key: string) => void };
export const CART_STORAGE_KEY = "stikr-cart-v2";
export function guestTransferPending() {
  try { return JSON.parse(localStorage.getItem(CART_STORAGE_KEY) ?? "null")?.state?.transferPending === true; }
  catch { return false; }
}
let listener: ((failed: boolean) => void) | undefined;
let failed = false;
function report(value: boolean) { if (failed !== value) { failed = value; queueMicrotask(() => listener?.(value)); } }
export const observeCartPersistence = (handler: (failed: boolean) => void) => { listener = handler; };
export function migratedCart(storage: Storage) {
  const current = storage.getItem(CART_STORAGE_KEY);
  if (current !== null) return current;
  const raw = storage.getItem("stikr-cart");
  if (raw === null) return null;
  try {
    const source = JSON.parse(raw);
    const original = source?.state?.items;
    if (!Array.isArray(original) || original.some((item) => item?.selection !== undefined)) throw new Error("LEGACY_CART_REVIEW");
    const items = withoutCartImages(normalizeCartItems(original));
    const count = original.reduce((total, item) => total + (item?.quantity ?? NaN), 0);
    if (!Number.isSafeInteger(count) || items.reduce((total, item) => total + item.quantity, 0) !== count) throw new Error("LEGACY_CART_REVIEW");
    const result = JSON.stringify({ version: 2, state: { ...source.state, items, legacyImported: true } });
    try { storage.setItem(CART_STORAGE_KEY, result); report(false); } catch { report(true); }
    return result;
  } catch {
    // The entire source remains intact; never import truncated or downgraded data.
    return JSON.stringify({ version: 2, state: { items: [], migrationError: true } });
  }
}
export const cartStorage = {
  getItem: () => { try { return migratedCart(localStorage); } catch { report(true); return JSON.stringify({ version: 2, state: { items: [], migrationError: true } }); } },
  setItem: (name: string, value: string) => {
    try {
      const state = JSON.parse(value)?.state;
      if (state?.migrationError || state?.privateCart || guestTransferPending()) return;
      localStorage.setItem(name, value);
      report(false);
    } catch { report(true); }
  },
  removeItem: (name: string) => { try { localStorage.removeItem(name); report(false); } catch { report(true); } },
};
