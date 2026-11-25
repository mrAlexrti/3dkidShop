"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { CART_STORAGE_KEY, cartStorage, guestTransferPending, observeCartPersistence } from "@/lib/cart-persistence";
import { requestedSizeId } from "@/lib/cart-items";
import type { CartItem } from "@/types";
import { normalizeCartItems, cartAfterAddition } from "@/lib/cart-items";
import { canSetQuantity, cartTotalMinor } from "@/lib/cart-limits";
import { reconcileCart, withoutCartImages, type CartIssue } from "@/lib/cart-reconciliation";
import { lookupCartProducts } from "@/lib/actions/reconcile-cart";
import type { Locale } from "@/lib/i18n";
import { changeAccountCart } from "@/lib/customer/cart-actions";
import { cartLineInput, type CartMutation, type CartSnapshot } from "@/lib/customer/cart-contract";
import { broadcastCart, CART_AUTH_KEY, CART_SYNC_KEY, transferGuestCart } from "@/lib/customer/guest-cart";
import { clearAccountPaymentMarker } from "@/lib/payments/checkout-session";

type CartState = {
  accountScope: string | null | undefined;
  accountRevision: number;
  syncStatus: "guest" | "loading" | "ready" | "error";
  syncProblem: "conflict" | "merge" | "pending" | "failed" | null;
  guestBatch?: string;
  transferFinished?: boolean;
  busy: boolean;
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
let accountEpoch = 0;
let accountQueue = Promise.resolve<unknown>(undefined);
let loadingCart: { epoch: number; promise: Promise<boolean> } | undefined;
let guestReload = false;

export function suspendCart() {
  ++accountEpoch;
  ++requestSequence;
  accountQueue = Promise.resolve();
  useCartStore.setState({ accountScope: undefined, accountRevision: 0, syncStatus: "loading", syncProblem: null, items: [],
    checkoutRevision: 0, verification: "idle", verifiedRevision: null, issues: {}, priceChanges: [],
    migrationError: false, persistenceError: false, busy: false });
}

export function announceCartSessionChange() {
  suspendCart();
  clearAccountPaymentMarker();
  broadcastCart(CART_AUTH_KEY);
}

export function restoreGuestCart() {
  guestReload = true;
  try { void useCartStore.persist.rehydrate(); }
  finally { guestReload = false; }
}

function showAccountSnapshot(snapshot: CartSnapshot) {
  const state = useCartStore.getState();
  if (snapshot.revision < state.accountRevision) return false;
  const previous = new Map(state.items.map((item) => [item.id, item.price]));
  const changed = snapshot.items.filter((item) => !Object.hasOwn(snapshot.issues, item.id) &&
    previous.has(item.id) && previous.get(item.id) !== item.price).map((item) => item.id);
  const priceChanges = [...new Set([...state.priceChanges.filter((id) => snapshot.items.some((item) => item.id === id)), ...changed])];
  useCartStore.setState({ items: snapshot.items, issues: snapshot.issues, accountRevision: snapshot.revision, checkoutRevision: snapshot.revision,
    verification: "verified", verifiedRevision: snapshot.revision, priceChanges, syncStatus: "ready" });
  return useCartStore.getState().ready();
}

function requireSessionRefresh() {
  announceCartSessionChange();
  window.dispatchEvent(new Event(CART_AUTH_KEY));
}

export function refreshAccountCart(merge = false) {
  const scope = useCartStore.getState().accountScope;
  if (!scope) return Promise.resolve(false);
  const epoch = accountEpoch;
  if (loadingCart?.epoch === epoch) return loadingCart.promise;
  const current = () => accountEpoch === epoch && useCartStore.getState().accountScope === scope;
  const promise = accountQueue.then(async () => {
    if (!current()) return false;
    try {
      const response = await fetch("/api/customer-cart", { cache: "no-store", headers: { "X-Cart-Scope": scope } });
      if (!current()) return false;
      if (response.status === 401) { requireSessionRefresh(); return false; }
      if (!response.ok) throw new Error("CART_READ_FAILED");
      const snapshot: CartSnapshot = await response.json();
      if (!current()) return false;
      if (merge) {
        const imported = await transferGuestCart(scope, current).catch(() => ({ problem: "retry" as const }));
        if (!current()) return false;
        if (imported?.problem === "auth") { requireSessionRefresh(); return false; }
        if (imported) {
          useCartStore.setState({ syncProblem: imported.problem ? "merge" : null });
          if ("snapshot" in imported) return showAccountSnapshot(imported.snapshot);
        }
      }
      if (useCartStore.getState().syncProblem === "failed") useCartStore.setState({ syncProblem: null });
      return showAccountSnapshot(snapshot);
    } catch {
      if (current()) useCartStore.setState({ syncStatus: "error", syncProblem: "failed", verification: "error" });
      return false;
    }
  });
  accountQueue = promise;
  loadingCart = { epoch, promise };
  void promise.finally(() => { if (loadingCart?.promise === promise) loadingCart = undefined; });
  return promise;
}

export function resolveCartSession(scope: string | null) {
  if (useCartStore.getState().accountScope === scope) return;
  suspendCart();
  if (scope === null) { restoreGuestCart(); return; }
  useCartStore.setState({ accountScope: scope });
  void refreshAccountCart(true);
}

function mutateAccount(mutation: (revision: number) => CartMutation, open = false) {
  const state = useCartStore.getState();
  const scope = state.accountScope;
  const epoch = accountEpoch;
  if (!scope || state.busy || state.syncStatus !== "ready") return false;
  const input = mutation(state.accountRevision);
  useCartStore.setState({ busy: true, syncProblem: null, ...(open ? { isOpen: true } : {}) });
  const current = () => accountEpoch === epoch;
  accountQueue = accountQueue.then(async () => {
    if (!current()) return;
    try {
      const result = await changeAccountCart(scope, input);
      if (!current()) return;
      if (result.problem === "auth") { requireSessionRefresh(); return; }
      if ("snapshot" in result) showAccountSnapshot(result.snapshot);
      if (result.problem) useCartStore.setState({ syncProblem: result.problem === "conflict" ? "conflict" : "failed" });
      else broadcastCart(CART_SYNC_KEY);
    } catch {
      if (current()) useCartStore.setState({ syncProblem: "failed" });
    } finally {
      if (current()) useCartStore.setState({ busy: false });
    }
  });
  return true;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get): CartState => {
      const mutate = (items: CartItem[], open = false) => set((state) => ({ items: withoutCartImages(items), guestBatch: undefined, transferFinished: false,
        ...(open ? { isOpen: true } : {}), checkoutRevision: state.checkoutRevision >= Number.MAX_SAFE_INTEGER ? 0 : state.checkoutRevision + 1,
        verification: "idle", verifiedRevision: null, issues: Object.fromEntries(Object.entries(state.issues).filter(([id]) => items.some((item) => item.id === id))),
        priceChanges: state.priceChanges.filter((id) => items.some((item) => item.id === id)) }));
      return {
      accountScope: null, accountRevision: 0, syncStatus: "guest", syncProblem: null, busy: false,
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
        return !state.busy && (state.accountScope !== null || !guestTransferPending()) && (state.syncStatus === "guest" || state.syncStatus === "ready") &&
          !state.migrationError && !state.persistenceError && state.items.length > 0 && state.verification === "verified" && state.verifiedRevision === state.checkoutRevision &&
          !Object.keys(state.issues).length && !state.priceChanges.length && cartTotalMinor(state.items) !== null;
      },
      verifyCart: (locale, force = false) => {
        const state = get();
        if (state.accountScope) return force ? refreshAccountCart() : Promise.resolve(state.ready());
        if (state.accountScope === undefined) return Promise.resolve(false);
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
        if (get().accountScope) return mutateAccount((revision) => ({ type: "add", line: cartLineInput(item), revision }), true);
        if (get().accountScope === undefined || guestTransferPending()) return false;
        const previous = get().items;
        const items = cartAfterAddition(previous, item);
        if (!items) return false;
        const changed = items.filter((line) => previous.some((old) => old.id === line.id && old.price !== line.price)).map((line) => line.id);
        mutate(items, true);
        if (changed.length) set({ priceChanges: [...new Set([...get().priceChanges, ...changed])] });
        return true;
      },
      removeItem: (id) => {
        if (get().accountScope) mutateAccount((revision) => ({ type: "set", id, quantity: 0, revision }));
        else if (get().accountScope === null && !guestTransferPending()) mutate(get().items.filter((item) => item.id !== id));
      },
      updateQuantity: (id, quantity) => {
        if (get().accountScope) { mutateAccount((revision) => ({ type: "set", id, quantity, revision })); return; }
        if (get().accountScope === undefined || guestTransferPending()) return;
        const items = get().items;
        if (!items.some((item) => item.id === id && item.quantity !== quantity) || !canSetQuantity(items, id, quantity)) return;
        mutate(items.map((item) => item.id === id ? { ...item, quantity } : item));
      },
      clear: () => { if (get().accountScope === null && !guestTransferPending()) mutate([]); },
      openCart: () => set({ isOpen: true }),
      closeCart: () => set({ isOpen: false }),
      total: () => (cartTotalMinor(get().items.filter((item) => !Object.hasOwn(get().issues, item.id))) ?? 0) / 100,
      count: () => get().items.reduce((sum, i) => sum + i.quantity, 0),
    }; },
    {
      name: CART_STORAGE_KEY, version: 2, storage: createJSONStorage(() => cartStorage),
      onRehydrateStorage: () => (_state, error) => { if (error) queueMicrotask(() => {
        if (useCartStore.getState().accountScope === null || useCartStore.getState().accountScope === undefined) useCartStore.setState({ accountScope: null, syncStatus: "guest", migrationError: true });
      }); },
      partialize: (state) => state.accountScope !== null ? { privateCart: true } : ({ items: withoutCartImages(state.items), checkoutRevision: state.checkoutRevision,
        priceChanges: state.priceChanges, migrationError: state.migrationError, legacyImported: true, guestBatch: state.guestBatch, transferFinished: state.transferFinished }),
      migrate: (persisted, version) => {
        if (![0,1,2].includes(version) || !persisted || typeof persisted !== "object") return { items: [], migrationError: true };
        const source = persisted as { items?: unknown; checkoutRevision?: unknown; priceChanges?: unknown };
        // Let merge inspect the ORIGINAL rows, so a discarded/unknown selection
        // cannot disappear before the loss check. Error records never overwrite storage.
        return { items: Array.isArray(source.items) ? source.items : [], migrationError: !Array.isArray(source.items), checkoutRevision: source.checkoutRevision, priceChanges: source.priceChanges };
      },
      merge: (persisted, current) => {
        if (guestReload) current = { ...current, accountScope: null, syncStatus: "guest", syncProblem: guestTransferPending() ? "pending" : null,
          items: [], priceChanges: [], issues: {}, checkoutRevision: 0, verification: "idle", verifiedRevision: null };
        else if (current.accountScope === null && guestTransferPending()) current = { ...current, syncProblem: "pending" };
        if (!persisted || typeof persisted !== "object") return current;
        const revision = (persisted as { checkoutRevision?: unknown })?.checkoutRevision;
        const changes = (persisted as { priceChanges?: unknown })?.priceChanges;
        const items = withoutCartImages(normalizeCartItems((persisted as { items?: unknown })?.items));
        const raw = (persisted as { items?: unknown })?.items;
        const lost = !Array.isArray(raw) || raw.reduce((sum, item) => sum + (item?.quantity ?? NaN), 0) !== items.reduce((sum, item) => sum + item.quantity, 0);
        const transfer = persisted as { guestBatch?: string; transferFinished?: boolean };
        return { ...current, items, guestBatch: transfer.guestBatch, transferFinished: transfer.transferFinished,
          checkoutRevision: typeof revision === "number" && Number.isSafeInteger(revision) && revision >= 0 ? revision : 0, isOpen: guestReload && current.isOpen,
          migrationError: Boolean((persisted as { migrationError?: unknown })?.migrationError) || lost,
          verification: "idle", verifiedRevision: null, issues: {}, priceChanges: Array.isArray(changes) ? items.filter((item) => changes.includes(item.id)).map((item) => item.id) : [] };
      },
    }
  )
);
observeCartPersistence((persistenceError) => { if (useCartStore.getState().accountScope === null) useCartStore.setState({ persistenceError }); });
