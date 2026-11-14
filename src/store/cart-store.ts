"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CartItem } from "@/types";
import { normalizeCartItems } from "@/lib/cart-items";

type CartState = {
  items: CartItem[];
  checkoutRevision: number;
  isOpen: boolean;
  addItem: (item: CartItem) => void;
  removeItem: (id: string) => void;
  updateQuantity: (id: string, quantity: number) => void;
  clear: () => void;
  openCart: () => void;
  closeCart: () => void;
  total: () => number;
  count: () => number;
};

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      checkoutRevision: 0,
      isOpen: false,
      addItem: (item) =>
        set((state) => ({ items: normalizeCartItems([...state.items, item]), isOpen: true, checkoutRevision: state.checkoutRevision + 1 })),
      removeItem: (id) => set((state) => ({ items: state.items.filter((i) => i.id !== id), checkoutRevision: state.checkoutRevision + 1 })),
      updateQuantity: (id, quantity) =>
        set((state) => ({
          checkoutRevision: state.checkoutRevision + 1,
          items: state.items.map((i) =>
            i.id === id && Number.isSafeInteger(quantity) ? { ...i, quantity: Math.max(1, quantity) } : i
          ),
        })),
      clear: () => set((state) => ({ items: [], checkoutRevision: state.checkoutRevision + 1 })),
      openCart: () => set({ isOpen: true }),
      closeCart: () => set({ isOpen: false }),
      total: () => get().items.reduce((sum, i) => sum + i.price * i.quantity, 0),
      count: () => get().items.reduce((sum, i) => sum + i.quantity, 0),
    }),
    {
      name: "stikr-cart", version: 1,
      partialize: (state) => ({ items: state.items, checkoutRevision: state.checkoutRevision }),
      migrate: (persisted) => ({ items: normalizeCartItems((persisted as { items?: unknown })?.items) }),
      merge: (persisted, current) => {
        const revision = (persisted as { checkoutRevision?: unknown })?.checkoutRevision;
        return { ...current, items: normalizeCartItems((persisted as { items?: unknown })?.items), checkoutRevision: typeof revision === "number" && Number.isSafeInteger(revision) && revision >= 0 ? revision : 0, isOpen: false };
      },
    }
  )
);
