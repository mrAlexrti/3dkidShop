"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { CART_STORAGE_KEY, cartStorage, observeCartPersistence } from "@/lib/cart-persistence";
import { requestedSizeId } from "@/lib/cart-items";
import type { CartItem } from "@/types";
import { normalizeCartItems, cartAfterAddition } from "@/lib/cart-items";
import { canSetQuantity, cartTotalMinor } from "@/lib/cart-limits";
import { reconcileCart, withoutCartImages, type CartIssue } from "@/lib/cart-reconciliation";
import { lookupCartProducts } from "@/lib/actions/reconcile-cart";
import type { Locale } from "@/lib/i18n";

type CartState = {
  migrationError: boolean;
  persistenceError: boolean;
  retryPersistence: () => void;
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
      const mutate = (items: CartItem[], open = false) => set((state) => ({ items: withoutCartImages(items), ...(open ? { isOpen: true } : {}), checkoutRevision: state.checkoutRevision >= Number.MAX_SAFE_INTEGER ? 0 : state.checkoutRevision + 1,
        verification: "idle", verifiedRevision: null, issues: Object.fromEntries(Object.entries(state.issues).filter(([id]) => items.some((item) => item.id === id))),
        priceChanges: state.priceChanges.filter((id) => items.some((item) => item.id === id)) }));
      return {
      items: [],
      migrationError: false, persistenceError: false,
      retryPersistence: () => {
        if (get().migrationError) { void useCartStore.persist.rehydrate(); return; }
        cartStorage.setItem(CART_STORAGE_KEY, JSON.stringify({ version: 2, state: { items: withoutCartImages(get().items), checkoutRevision: get().checkoutRevision, priceChanges: get().priceChanges, legacyImported: true } }));
      },
      checkoutRevision: 0,
      isOpen: false,
      verification: "idle", verifiedRevision: null, issues: {}, priceChanges: [],
      ready: () => {
        const state = get();
        return !state.migrationError && !state.persistenceError && state.items.length > 0 && state.verification === "verified" && state.verifiedRevision === state.checkoutRevision &&
          !Object.keys(state.issues).length && !state.priceChanges.length && cartTotalMinor(state.items) !== null;
      },
      verifyCart: (locale, force = false) => {
        const state = get();
        if (pending?.revision === state.checkoutRevision && pending.locale === locale && state.verification === "loading") return pending.promise;
        if (!force && state.verification === "verified" && state.verifiedRevision === state.checkoutRevision) return Promise.resolve(state.ready());
        if (!state.items.length) return Promise.resolve(false);
        const revision = state.checkoutRevision;
        const items = withoutCartImages(state.items);
        const request = ++requestSequence;
        set({ items, verification: "loading", verifiedRevision: null });
        const current = () => request === requestSequence && get().checkoutRevision === revision && get().items === items;
        const promise = (async () => {
          try {
            const products = await lookupCartProducts({ version: 2, lines: items.map((item) => ({ productId: item.productId,
              ...(item.selection ? { selection: item.selection } : requestedSizeId(item) ? { sizeId: requestedSizeId(item) } : {}) })) });
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
        const previous = get().items;
        const items = cartAfterAddition(previous, item);
        if (!items) return false;
        const changed = items.filter((line) => previous.some((old) => old.id === line.id && old.price !== line.price)).map((line) => line.id);
        mutate(items, true);
        if (changed.length) set({ priceChanges: [...new Set([...get().priceChanges, ...changed])] });
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
      name: CART_STORAGE_KEY, version: 2, storage: createJSONStorage(() => cartStorage),
      onRehydrateStorage: () => (_state, error) => { if (error) queueMicrotask(() => useCartStore.setState({ migrationError: true })); },
      partialize: (state) => ({ items: withoutCartImages(state.items), checkoutRevision: state.checkoutRevision, priceChanges: state.priceChanges, migrationError: state.migrationError, legacyImported: true }),
      migrate: (persisted, version) => {
        if (![0,1,2].includes(version) || !persisted || typeof persisted !== "object") return { items: [], migrationError: true };
        const source = persisted as { items?: unknown; checkoutRevision?: unknown; priceChanges?: unknown };
        // Let merge inspect the ORIGINAL rows, so a discarded/unknown selection
        // cannot disappear before the loss check. Error records never overwrite storage.
        return { items: Array.isArray(source.items) ? source.items : [], migrationError: !Array.isArray(source.items), checkoutRevision: source.checkoutRevision, priceChanges: source.priceChanges };
      },
      merge: (persisted, current) => {
        if (!persisted || typeof persisted !== "object") return current;
        const revision = (persisted as { checkoutRevision?: unknown })?.checkoutRevision;
        const changes = (persisted as { priceChanges?: unknown })?.priceChanges;
        const items = withoutCartImages(normalizeCartItems((persisted as { items?: unknown })?.items));
        const raw = (persisted as { items?: unknown })?.items;
        const lost = !Array.isArray(raw) || raw.reduce((sum, item) => sum + (item?.quantity ?? NaN), 0) !== items.reduce((sum, item) => sum + item.quantity, 0);
        return { ...current, items, checkoutRevision: typeof revision === "number" && Number.isSafeInteger(revision) && revision >= 0 ? revision : 0, isOpen: false,
          migrationError: Boolean((persisted as { migrationError?: unknown })?.migrationError) || lost,
          verification: "idle", verifiedRevision: null, issues: {}, priceChanges: Array.isArray(changes) ? items.filter((item) => changes.includes(item.id)).map((item) => item.id) : [] };
      },
    }
  )
);
observeCartPersistence((persistenceError) => useCartStore.setState({ persistenceError }));
