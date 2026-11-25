"use client";

import { CART_STORAGE_KEY, GUEST_CART_DRAFT_KEY, GUEST_CART_RECEIPT_PREFIX, migratedCart, pendingGuestCart } from "@/lib/cart-persistence";
import { normalizeCartItems } from "@/lib/cart-items";
import { changeAccountCart } from "./cart-actions";
import { cartLineInput, type CartMutationResult } from "./cart-contract";
import { guestCartTransaction } from "./guest-cart-transaction";

export const CART_SYNC_KEY = "3dkid.cart-sync";
export const CART_AUTH_KEY = "3dkid.cart-auth";
export function broadcastCart(key: string) {
  try { localStorage.setItem(key, crypto.randomUUID()); } catch { /* Optional cross-tab signal. */ }
}

type StoredGuest = { version: number; state: { items?: unknown; checkoutRevision?: number; migrationError?: boolean;
  guestBatch?: string; transferPending?: boolean; transferFinished?: boolean } };

function newGuestBatch() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const id = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return [id.slice(0, 8), id.slice(8, 12), id.slice(12, 16), id.slice(16, 20), id.slice(20)].join("-");
}

export async function transferGuestCart(scope: string, stillCurrent: () => boolean): Promise<CartMutationResult | null> {
  const read = () => JSON.parse(migratedCart(localStorage) ?? "null") as StoredGuest | null;
  const initial = read()?.state;
  if (initial?.migrationError) return { problem: "retry" };
  if (!initial || initial.transferFinished || !normalizeCartItems(initial.items).length || !stillCurrent()) return null;
  const stage = (onlyFrozen = false) => {
    const raw = localStorage.getItem(CART_STORAGE_KEY);
    const guest = read()?.state;
    if (!guest || guest.transferFinished || !stillCurrent() || localStorage.getItem(CART_STORAGE_KEY) !== raw) return null;
    if (onlyFrozen && (!guest.transferPending || !guest.guestBatch)) return null;
    const items = normalizeCartItems(guest.items);
    if (guest.migrationError || (Array.isArray(guest.items) && (guest.items.length !== items.length ||
      guest.items.reduce((total, item) => total + (item?.quantity ?? NaN), 0) !== items.reduce((total, item) => total + item.quantity, 0)))) throw new Error("GUEST_CART_REVIEW");
    if (!items.length || raw === null) return null;

    // Retain the operation ID across reloads, timeouts and overlapping tabs.
    // The guest adapter freezes edits until the server receipt is confirmed.
    const batch = guest.guestBatch ?? newGuestBatch();
    const state = { ...guest, guestBatch: batch, transferPending: true };
    const pending = guest.transferPending ? pendingGuestCart(localStorage, raw)! : JSON.stringify({ version: 2, state });
    if (!guest.transferPending) {
      // Binding a draft to the current source leaves a concurrent guest write
      // to the original storage key intact.
      localStorage.setItem(GUEST_CART_DRAFT_KEY, JSON.stringify({ source: raw, pending }));
    }
    return { batch, state, pending, items };
  };
  // An already frozen local draft has an immutable server id. It can be
  // reconciled even if IndexedDB becomes unavailable after staging it.
  const draft = initial.transferPending ? stage(true) : await guestCartTransaction(stage);
  if (!draft || !stillCurrent()) return null;
  if (pendingGuestCart(localStorage) !== draft.pending) return { problem: "retry" };
  const { batch, state, pending, items } = draft;
  const response = await changeAccountCart(scope, { type: "merge", batch, lines: items.map(cartLineInput) });
  if ("snapshot" in response && response.accepted) {
    const accepted = response.accepted;
    const remaining = items.flatMap((item) => {
      const quantity = item.quantity - (Object.hasOwn(accepted, item.id) ? accepted[item.id] : 0);
      return quantity > 0 ? [{ ...item, quantity }] : [];
    });
    if (pendingGuestCart(localStorage) === pending) {
      const cart = JSON.stringify({ version: 2, state: { ...state, items: remaining, transferPending: false,
        transferFinished: true, checkoutRevision: (state.checkoutRevision ?? 0) + 1 } });
      // A receipt overlays only this exact frozen version. It never rewrites a
      // newer guest cart while a reply is arriving in another tab.
      try { localStorage.setItem(GUEST_CART_RECEIPT_PREFIX + batch, JSON.stringify({ pending, cart })); }
      catch { return { ...response, problem: "merge" }; }
    }
    if (remaining.length || pendingGuestCart(localStorage) !== pending) return { ...response, problem: "merge" };
  }
  return response;
}
