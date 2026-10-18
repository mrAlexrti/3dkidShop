"use client";

import { SessionProvider } from "next-auth/react";
import { useEffect, useMemo } from "react";
import { createLangStore, LangStoreContext } from "@/store/lang-store";
import type { Locale } from "@/lib/i18n";

export function Providers({
  children,
  initialLocale,
}: {
  children: React.ReactNode;
  initialLocale: Locale;
}) {
  const store = useMemo(() => createLangStore(initialLocale), [initialLocale]);

  useEffect(() => {
    void store.persist?.rehydrate();
    store.getState().setLocale(initialLocale);
  }, [initialLocale, store]);

  return (
    <SessionProvider>
      <LangStoreContext.Provider value={store}>{children}</LangStoreContext.Provider>
    </SessionProvider>
  );
}
