"use client";

import { SessionProvider } from "next-auth/react";
import { useEffect } from "react";
import { useLangStore } from "@/store/lang-store";
import type { Locale } from "@/lib/i18n";

export function Providers({
  children,
  initialLocale,
}: {
  children: React.ReactNode;
  initialLocale: Locale;
}) {
  // Cookie (initialLocale, отрендеренная сервером) — источник истины.
  // Если клиентский стор из localStorage разошёлся с cookie — приводим к cookie.
  useEffect(() => {
    if (useLangStore.getState().locale !== initialLocale) {
      useLangStore.getState().setLocale(initialLocale);
    }
  }, [initialLocale]);

  return <SessionProvider>{children}</SessionProvider>;
}
