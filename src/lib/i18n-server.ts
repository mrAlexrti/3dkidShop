// Серверный доступ к локали (для server components и админки).
// Источник истины — cookie `locale`. Клиентский стор (lang-store) синхронизируется с ней.

import { cookies } from "next/headers";
import { translations, type Locale } from "@/lib/i18n";

export const LOCALE_COOKIE = "locale";
export const DEFAULT_LOCALE: Locale = "ua";

function normalizeLocale(value: string | undefined): Locale {
  return value === "en" ? "en" : DEFAULT_LOCALE;
}

export async function getLocale(): Promise<Locale> {
  const store = await cookies();
  return normalizeLocale(store.get(LOCALE_COOKIE)?.value);
}

// Возвращаемый тип выводится как объединение локалей (как Translation в lang-store) —
// компоненты обращаются к общим ключам, литеральные значения не важны.
export async function getT() {
  const locale = await getLocale();
  return translations[locale];
}
