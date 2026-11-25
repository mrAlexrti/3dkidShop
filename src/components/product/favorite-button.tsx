"use client";

import { createContext, useContext, useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Heart } from "lucide-react";
import { toast } from "sonner";
import { changeFavorites } from "@/lib/customer/favorites";
import { useLangStore } from "@/store/lang-store";
import { resolveCartSession, suspendCart, useCartStore } from "@/store/cart-store";
import { broadcastCart, CART_AUTH_KEY } from "@/lib/customer/guest-cart";
import { clearAccountPaymentMarker } from "@/lib/payments/checkout-session";

const key = "3dkid.guest-favorites";
const syncKey = "3dkid.favorites-sync";
const favorites = createContext<{ ids: string[]; busy: boolean; setFavorite: (id: string, saved: boolean) => void } | null>(null);
const customerPresence = createContext<boolean | null>(null);
export const useCustomerPresence = () => useContext(customerPresence);
const initialCartPending = createContext(false);
export const useInitialCartPending = () => useContext(initialCartPending);

function guestIds(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(id)).slice(0, 200) : [];
  } catch { return []; }
}

export function FavoritesProvider({ children, hasCustomerCookie = false }: { children: ReactNode; hasCustomerCookie?: boolean }) {
  const pathname = usePathname();
  const syncPath = pathname.startsWith("/account") ? pathname : "/";
  const [ids, setIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(true);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const lock = useRef(false);
  const refreshNeeded = useRef(false);
  const authenticated = useRef<boolean | null>(null);
  const version = useRef<string | null>(null);
  const lastSync = useRef(0);
  const observedSession = useRef<string | null | undefined>(undefined);
  const authEpoch = useRef(0);
  const expires = useRef<number>(0);
  const expiryTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const { t } = useLangStore();

  const refresh = useCallback(async function syncFavorites() {
    if (lock.current) { refreshNeeded.current = true; return; }
    lock.current = true;
    const epoch = authEpoch.current;
    setBusy(true);
    try {
      const response = await fetch("/api/customer-favorites", { cache: "no-store" });
      if (!response.ok) throw new Error("FAVORITES_UNAVAILABLE");
      const { ids: remote, version: sessionVersion } = await response.json() as { ids: string[] | null; version: string | null };
      if (epoch !== authEpoch.current) return;
      expires.current = Number(response.headers.get("X-Customer-Session-Expires") ?? 0);
      clearTimeout(expiryTimer.current);
      if (expires.current > 0) {
        expiryTimer.current = setTimeout(() => window.dispatchEvent(new Event(CART_AUTH_KEY)), Math.max(0, expires.current - Date.now()) + 5);
      }
      resolveCartSession(sessionVersion);
      if (observedSession.current !== sessionVersion) {
        if (observedSession.current) clearAccountPaymentMarker();
        if (sessionVersion || observedSession.current) broadcastCart(CART_AUTH_KEY);
        observedSession.current = sessionVersion;
      }
      authenticated.current = remote !== null;
      setSignedIn(authenticated.current);
      version.current = sessionVersion;
      const guest = guestIds();
      setIds(remote ?? guest);
      if (remote && guest.length) {
        const merged = await changeFavorites(sessionVersion, { type: "merge", ids: guest });
        if (!merged) throw new Error("FAVORITES_UNAVAILABLE");
        const remaining = guestIds().filter((id) => !guest.includes(id));
        localStorage.setItem(key, JSON.stringify(remaining));
        setIds(merged);
      }
      lastSync.current = Date.now();
    } catch {
      if (epoch !== authEpoch.current) return;
      setIds([]);
      authenticated.current = null;
      setSignedIn(null);
      version.current = null;
      if (useCartStore.getState().accountScope !== null) {
        suspendCart();
        useCartStore.setState({ syncStatus: "error", syncProblem: "failed" });
      }
      // Retry on navigation, focus or the next interaction.
    } finally {
      setBusy(false);
      lock.current = false;
      if (refreshNeeded.current) { refreshNeeded.current = false; void syncFavorites(); }
    }
  }, []);

  useLayoutEffect(() => {
    if (hasCustomerCookie && observedSession.current === undefined) suspendCart();
  }, [hasCustomerCookie]);
  useEffect(() => { void refresh(); }, [syncPath, refresh]);
  useEffect(() => {
    const invalidate = () => { ++authEpoch.current; clearTimeout(expiryTimer.current); };
    const auth = () => { invalidate(); suspendCart(); void refresh(); };
    const update = () => {
      if (expires.current && expires.current <= Date.now()) auth();
      else if (Date.now() - lastSync.current >= 15000) void refresh();
    };
    const storage = (event: StorageEvent) => {
      if (event.key === CART_AUTH_KEY) auth();
      else if (event.key === key || event.key === syncKey) void refresh();
    };
    const hide = () => { invalidate(); if (useCartStore.getState().accountScope !== null) suspendCart(); };
    const show = (event: PageTransitionEvent) => { if (event.persisted) void refresh(); };
    window.addEventListener("focus", update);
    window.addEventListener("storage", storage);
    window.addEventListener(CART_AUTH_KEY, auth);
    window.addEventListener("pagehide", hide);
    window.addEventListener("pageshow", show);
    return () => {
      invalidate();
      window.removeEventListener("focus", update);
      window.removeEventListener("storage", storage);
      window.removeEventListener(CART_AUTH_KEY, auth);
      window.removeEventListener("pagehide", hide);
      window.removeEventListener("pageshow", show);
    };
  }, [refresh]);

  async function setFavorite(id: string, saved: boolean) {
    if (lock.current) return;
    if (authenticated.current === null) {
      toast.error(t.account.result.failed);
      void refresh();
      return;
    }
    lock.current = true;
    setBusy(true);
    try {
      if (authenticated.current) {
        const result = await changeFavorites(version.current, { type: "set", productId: id, saved });
        if (!result) throw new Error("FAVORITES_UNAVAILABLE");
        setIds(result);
        // Keep other open tabs in sync without putting customer data in storage.
        try { localStorage.setItem(syncKey, crypto.randomUUID()); } catch { /* Storage is optional for signed-in customers. */ }
      } else {
        const current = guestIds();
        const next = saved ? [...new Set([...current, id])] : current.filter((value) => value !== id);
        if (next.length > 200) throw new Error("FAVORITES_LIMIT");
        localStorage.setItem(key, JSON.stringify(next));
        setIds(next);
      }
    } catch {
      toast.error(t.account.result.failed);
      refreshNeeded.current = true;
    } finally {
      setBusy(false);
      lock.current = false;
      if (refreshNeeded.current) { refreshNeeded.current = false; void refresh(); }
    }
  }

  return <customerPresence.Provider value={signedIn}>
    <initialCartPending.Provider value={hasCustomerCookie && signedIn === null}>
      <favorites.Provider value={{ ids, busy, setFavorite }}>{children}</favorites.Provider>
    </initialCartPending.Provider>
  </customerPresence.Provider>;
}

export function FavoriteButton({ productId, productName, className }: { productId: string; productName: string; className?: string }) {
  const state = useContext(favorites);
  const { t } = useLangStore();
  if (!state) return null;
  const saved = state.ids.includes(productId);
  return <button type="button" className={`grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white text-pink-700 shadow-soft focus-visible:outline focus-visible:outline-pink-700 ${className ?? ""}`}
    disabled={state.busy} aria-pressed={saved} aria-label={`${saved ? t.account.removeFavorite : t.account.addFavorite} · ${productName}`}
    onClick={() => state.setFavorite(productId, !saved)}><Heart size={20} fill={saved ? "currentColor" : "none"} aria-hidden="true" /></button>;
}
