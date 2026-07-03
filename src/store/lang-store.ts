"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { translations } from "@/lib/i18n";

export type Locale = keyof typeof translations;
export type Translation = (typeof translations)[Locale];

type LangStore = {
  locale: Locale;
  t: Translation;
  setLocale: (locale: Locale) => void;
};

export const useLangStore = create<LangStore>()(
  persist(
    (set) => ({
      locale: "ua",
      t: translations.ua as Translation,
      setLocale: (locale) =>
        set({
          locale,
          t: translations[locale] as Translation,
        }),
    }),
    { name: "stikr-lang" }
  )
);