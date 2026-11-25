import { normalizeCartItems } from "./cart-items";
import { withoutCartImages } from "./cart-reconciliation";

type Storage = { getItem: (key: string) => string | null; setItem: (key: string, value: string) => void; removeItem: (key: string) => void };
export const CART_STORAGE_KEY = "stikr-cart-v2";
export const GUEST_CART_DRAFT_KEY = "3dkid.guest-cart-draft";
export const GUEST_CART_RECEIPT_PREFIX = "3dkid.guest-cart-receipt.";

export function pendingGuestCart(storage: Storage, raw = storage.getItem(CART_STORAGE_KEY)) {
  if (raw === null) return null;
  try {
    const draft = JSON.parse(storage.getItem(GUEST_CART_DRAFT_KEY) ?? "null");
    if (draft?.source === raw && typeof draft.pending === "string") return draft.pending as string;
  } catch { /* Ignore an unreadable overlay and preserve the original cart. */ }
  return raw;
}

function guestCartReceipt(storage: Storage, raw: string) {
  const state = JSON.parse(raw)?.state;
  if (state?.transferPending !== true || typeof state.guestBatch !== "string") return null;
  const receipt = JSON.parse(storage.getItem(GUEST_CART_RECEIPT_PREFIX + state.guestBatch) ?? "null");
  return receipt?.pending === raw && typeof receipt.cart === "string" ? receipt.cart as string : null;
}

export function guestTransferPending() {
  try {
    const raw = pendingGuestCart(localStorage);
    return raw !== null && JSON.parse(raw)?.state?.transferPending === true && guestCartReceipt(localStorage, raw) === null;
  }
  catch { return false; }
}
let listener: ((failed: boolean) => void) | undefined;
let failed = false;
function report(value: boolean) { if (failed !== value) { failed = value; queueMicrotask(() => listener?.(value)); } }
export const observeCartPersistence = (handler: (failed: boolean) => void) => { listener = handler; };
export function migratedCart(storage: Storage) {
  const current = storage.getItem(CART_STORAGE_KEY);
  if (current !== null) {
    try {
      const effective = pendingGuestCart(storage, current)!;
      return guestCartReceipt(storage, effective) ?? effective;
    }
    catch { return current; }
  }
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
      const previous = pendingGuestCart(localStorage, localStorage.getItem(name));
      localStorage.setItem(name, value);
      if (previous && guestCartReceipt(localStorage, previous) !== null) {
        localStorage.removeItem(GUEST_CART_RECEIPT_PREFIX + JSON.parse(previous).state.guestBatch);
      }
      report(false);
    } catch { report(true); }
  },
  removeItem: (name: string) => { try { localStorage.removeItem(name); report(false); } catch { report(true); } },
};
