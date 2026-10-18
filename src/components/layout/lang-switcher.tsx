"use client";

import { useRouter } from "next/navigation";
import { useLangStore } from "@/store/lang-store";
import type { Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export function LangSwitcher({ className }: { className?: string }) {
  const { locale, setLocale, t } = useLangStore();
  const router = useRouter();

  const changeLocale = (id: Locale) => {
    setLocale(id);
    document.documentElement.lang = id === "en" ? "en" : "uk";
    // Server components читают локаль из cookie — обновляем их.
    router.refresh();
  };

  const options: { id: Locale; label: string }[] = [
    { id: "ua", label: "UA" },
    { id: "en", label: "EN" },
  ];

  return (
    <div
      role="group"
      aria-label={t.language.label}
      className={cn(
        "sf-language flex items-center rounded-full border border-ink/10 bg-white/80 p-0.5 text-xs font-semibold",
        className
      )}
    >
      {options.map((o) => (
          <button
            key={o.id}
            type="button"
            aria-label={t.language[o.id]}
            aria-pressed={locale === o.id}
            onClick={() => changeLocale(o.id)}
            className={cn(
              "min-h-11 min-w-11 rounded-full px-2.5 py-1 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pink-700",
              locale === o.id
                ? "bg-pink-700 text-white"
                : "text-ink/60 hover:text-pink-600"
            )}
          >
            {o.label}
          </button>
      ))}
    </div>
  );
}
