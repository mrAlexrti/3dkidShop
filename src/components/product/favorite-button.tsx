"use client";

import { createContext, useContext, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Heart } from "lucide-react";
import { toast } from "sonner";
import { changeFavorites } from "@/lib/customer/favorites";
import { useLangStore } from "@/store/lang-store";

const key = "3dkid.guest-favorites";
const syncKey = "3dkid.favorites-sync";
const favorites = createContext<{ ids: string[]; busy: boolean; setFavorite: (id: string, saved: boolean) => void } | null>(null);

function guestIds(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(id)).slice(0, 200) : [];
  } catch { return []; }
}

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const syncPath = pathname.startsWith("/account") ? pathname : "/";
  const [ids, setIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(true);
  const lock = useRef(false);
  const refreshNeeded = useRef(false);
  const authenticated = useRef<boolean | null>(null);
  const version = useRef<string | null>(null);
  const lastSync = useRef(0);
  const { t } = useLangStore();

  const refresh = useCallback(async function syncFavorites() {
    if (lock.current) { refreshNeeded.current = true; return; }
    lock.current = true;
    setBusy(true);
    try {
      const response = await fetch("/api/customer-favorites", { cache: "no-store" });
      if (!response.ok) throw new Error("FAVORITES_UNAVAILABLE");
      const { ids: remote, version: sessionVersion } = await response.json() as { ids: string[] | null; version: string | null };
      authenticated.current = remote !== null;
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
      setIds([]);
      authenticated.current = null;
      version.current = null;
      // Retry on navigation, focus or the next interaction.
    } finally {
      setBusy(false);
      lock.current = false;
      if (refreshNeeded.current) { refreshNeeded.current = false; void syncFavorites(); }
    }
  }, []);

  useEffect(() => { void refresh(); }, [syncPath, refresh]);
  useEffect(() => {
    const update = () => { if (Date.now() - lastSync.current >= 15000) void refresh(); };
    const storage = (event: StorageEvent) => { if (event.key === key || event.key === syncKey) void refresh(); };
    window.addEventListener("focus", update);
    window.addEventListener("storage", storage);
    return () => { window.removeEventListener("focus", update); window.removeEventListener("storage", storage); };
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

  return <favorites.Provider value={{ ids, busy, setFavorite }}>{children}</favorites.Provider>;
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
