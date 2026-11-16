"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CartItem } from "@/types";
import { normalizeCartItems, cartAfterAddition } from "@/lib/cart-items";
import { canSetQuantity, cartTotalMinor } from "@/lib/cart-limits";
import { reconcileCart, type CartIssue } from "@/lib/cart-reconciliation";
import { lookupCartProducts } from "@/lib/actions/reconcile-cart";
import type { Locale } from "@/lib/i18n";

type CartState = {
  items: CartItem[];
  checkoutRevision: number;
  isOpen: boolean;
  verification: "idle" | "loading" | "verified" | "error";
  verifiedRevision: number | null;
  issues: Record<string, CartIssue>;
  priceChanges: string[];
  verifyCart: (locale: Locale, force?: boolean) => Promise<boolean>;
  reviewPrices: () => void;
  ready: () => boolean;
  addItem: (item: CartItem) => boolean;
  removeItem: (id: string) => void;
  updateQuantity: (id: string, quantity: number) => void;
  clear: () => void;
  openCart: () => void;
  closeCart: () => void;
  total: () => number;
  count: () => number;
};

let requestSequence = 0;
let pending: { revision: number; locale: Locale; promise: Promise<boolean> } | null = null;
export const useCartStore = create<CartState>()(
  persist(
    (set, get) => {
      const mutate = (items: CartItem[], open = false) => set((state) => ({ items, ...(open ? { isOpen: true } : {}), checkoutRevision: state.checkoutRevision >= Number.MAX_SAFE_INTEGER ? 0 : state.checkoutRevision + 1,
        verification: "idle", verifiedRevision: null, issues: Object.fromEntries(Object.entries(state.issues).filter(([id]) => items.some((item) => item.id === id))),
        priceChanges: state.priceChanges.filter((id) => items.some((item) => item.id === id)) }));
      return {
      items: [],
      checkoutRevision: 0,
      isOpen: false,
      verification: "idle", verifiedRevision: null, issues: {}, priceChanges: [],
      ready: () => {
        const state = get();
        return state.items.length > 0 && state.verification === "verified" && state.verifiedRevision === state.checkoutRevision &&
          !Object.keys(state.issues).length && !state.priceChanges.length && cartTotalMinor(state.items) !== null;
      },
      verifyCart: (locale, force = false) => {
        const state = get();
        if (pending?.revision === state.checkoutRevision && pending.locale === locale && state.verification === "loading") return pending.promise;
        if (!force && state.verification === "verified" && state.verifiedRevision === state.checkoutRevision) return Promise.resolve(state.ready());
        if (!state.items.length) return Promise.resolve(false);
        const revision = state.checkoutRevision;
        const items = state.items;
        const request = ++requestSequence;
        set({ verification: "loading", verifiedRevision: null });
        const current = () => request === requestSequence && get().checkoutRevision === revision && get().items === items;
        const promise = (async () => {
          try {
            const products = await lookupCartProducts([...new Set(items.map((item) => item.productId))]);
            if (!current()) return false;
            const result = reconcileCart(items, products, locale);
            set({ items: result.items, issues: result.issues, priceChanges: [...new Set([...get().priceChanges, ...result.changed])],
              verification: "verified", verifiedRevision: revision });
            return get().ready();
          } catch {
            if (current()) set({ verification: "error", verifiedRevision: null });
            return false;
          } finally { if (request === requestSequence) pending = null; }
        })();
        pending = { revision, locale, promise };
        return promise;
      },
      reviewPrices: () => { if (get().verification === "verified") set({ priceChanges: [] }); },
      addItem: (item) => {
        const items = cartAfterAddition(get().items, item);
        if (!items) return false;
        mutate(items, true);
        return true;
      },
      removeItem: (id) => mutate(get().items.filter((item) => item.id !== id)),
      updateQuantity: (id, quantity) => {
        const items = get().items;
        if (!items.some((item) => item.id === id && item.quantity !== quantity) || !canSetQuantity(items, id, quantity)) return;
        mutate(items.map((item) => item.id === id ? { ...item, quantity } : item));
      },
      clear: () => mutate([]),
      openCart: () => set({ isOpen: true }),
      closeCart: () => set({ isOpen: false }),
      total: () => (cartTotalMinor(get().items.filter((item) => !Object.hasOwn(get().issues, item.id))) ?? 0) / 100,
      count: () => get().items.reduce((sum, i) => sum + i.quantity, 0),
    }; },
    {
      name: "stikr-cart", version: 1,
      partialize: (state) => ({ items: state.items, checkoutRevision: state.checkoutRevision, priceChanges: state.priceChanges }),
      migrate: (persisted) => ({ items: normalizeCartItems((persisted as { items?: unknown })?.items) }),
      merge: (persisted, current) => {
        const revision = (persisted as { checkoutRevision?: unknown })?.checkoutRevision;
        const changes = (persisted as { priceChanges?: unknown })?.priceChanges;
        const items = normalizeCartItems((persisted as { items?: unknown })?.items);
        return { ...current, items, checkoutRevision: typeof revision === "number" && Number.isSafeInteger(revision) && revision >= 0 ? revision : 0, isOpen: false,
          verification: "idle", verifiedRevision: null, issues: {}, priceChanges: Array.isArray(changes) ? items.filter((item) => changes.includes(item.id)).map((item) => item.id) : [] };
      },
    }
  )
);
