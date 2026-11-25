"use client";

import { CART_STORAGE_KEY, migratedCart } from "@/lib/cart-persistence";
import { normalizeCartItems } from "@/lib/cart-items";
import { changeAccountCart } from "./cart-actions";
import { cartLineInput, type CartMutationResult } from "./cart-contract";

export const CART_SYNC_KEY = "3dkid.cart-sync";
export const CART_AUTH_KEY = "3dkid.cart-auth";
export function broadcastCart(key: string) {
  try { localStorage.setItem(key, crypto.randomUUID()); } catch { /* Optional cross-tab signal. */ }
}

type StoredGuest = { version: number; state: { items?: unknown; checkoutRevision?: number; migrationError?: boolean;
  guestBatch?: string; transferPending?: boolean; transferFinished?: boolean } };

export async function transferGuestCart(scope: string, stillCurrent: () => boolean): Promise<CartMutationResult | null> {
  const read = () => JSON.parse(migratedCart(localStorage) ?? "null") as StoredGuest | null;
  if (!navigator.locks) return normalizeCartItems(read()?.state.items).length ? { problem: "retry" } : null;
  return navigator.locks.request(CART_STORAGE_KEY, async () => {
    const record = read();
    const guest = record?.state;
    if (!guest || guest.transferFinished || !stillCurrent()) return null;
    const items = normalizeCartItems(guest.items);
    if (guest.migrationError || (Array.isArray(guest.items) && (guest.items.length !== items.length ||
      guest.items.reduce((total, item) => total + (item?.quantity ?? NaN), 0) !== items.reduce((total, item) => total + item.quantity, 0)))) return { problem: "retry" };
    if (!items.length) return null;

    // Retain the operation ID across reloads, timeouts and overlapping tabs.
    // The guest adapter freezes edits until the server receipt is confirmed.
    const batch = guest.guestBatch ?? crypto.randomUUID();
    const state = { ...guest, guestBatch: batch, transferPending: true };
    const pending = JSON.stringify({ version: 2, state });
    localStorage.setItem(CART_STORAGE_KEY, pending);
    const response = await changeAccountCart(scope, { type: "merge", batch, lines: items.map(cartLineInput) });
    if ("snapshot" in response && response.accepted && localStorage.getItem(CART_STORAGE_KEY) === pending) {
      const accepted = response.accepted;
      const remaining = items.flatMap((item) => {
        const quantity = item.quantity - (Object.hasOwn(accepted, item.id) ? accepted[item.id] : 0);
        return quantity > 0 ? [{ ...item, quantity }] : [];
      });
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify({ version: 2, state: {
        ...state, items: remaining, transferPending: false, transferFinished: true,
        checkoutRevision: (guest.checkoutRevision ?? 0) + 1,
      } }));
      if (remaining.length) return { ...response, problem: "merge" };
    }
    return response;
  });
}
