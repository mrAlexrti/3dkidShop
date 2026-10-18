"use client";

import { createContext, useContext } from "react";
import { createStore, useStore } from "zustand";
import { persist } from "zustand/middleware";
import { translations } from "@/lib/i18n";

export type Locale = keyof typeof translations;
export type Translation = (typeof translations)[Locale];

type LangStore = {
  locale: Locale;
  t: Translation;
  setLocale: (locale: Locale) => void;
};

// Синхронизируем выбранную локаль с cookie, чтобы её видели server components.
function writeLocaleCookie(locale: Locale) {
  if (typeof document === "undefined") return;
  document.cookie = `locale=${locale}; path=/; max-age=31536000; samesite=lax`;
}

// A provider-owned store keeps the server cookie authoritative and isolates SSR requests.
export const createLangStore = (initialLocale: Locale) => createStore<LangStore>()(
  persist(
    (set) => ({
      locale: initialLocale,
      t: translations[initialLocale] as Translation,
      setLocale: (locale) => {
        writeLocaleCookie(locale);
        set({
          locale,
          t: translations[locale] as Translation,
        });
      },
    }),
    {
      name: "stikr-lang",
      version: 1,
      skipHydration: true,
      partialize: (state) => ({ locale: state.locale }),
      migrate: () => ({ locale: initialLocale }),
      // Never restore a dictionary or override the server's cookie with localStorage.
      merge: (_persisted, current) => current,
    }
  )
);

export const LangStoreContext = createContext<ReturnType<typeof createLangStore> | null>(null);

export function useLangStore() {
  const store = useContext(LangStoreContext);
  if (!store) throw new Error("Language store requires Providers");
  return useStore(store);
}
