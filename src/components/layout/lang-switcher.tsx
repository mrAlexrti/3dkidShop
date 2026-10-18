"use client";

import { Fragment } from "react";
import { useRouter } from "next/navigation";
import { useLangStore } from "@/store/lang-store";
import type { Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export function LangSwitcher({ className }: { className?: string }) {
  const { locale, setLocale } = useLangStore();
  const router = useRouter();

  const changeLocale = (id: Locale) => {
    setLocale(id);
    // Server components читают локаль из cookie — обновляем их.
    router.refresh();
  };

  const options: { id: Locale; label: string }[] = [
    { id: "ua", label: "UA" },
    { id: "en", label: "EN" },
  ];

  return (
    <div
      className={cn(
        "flex h-11 shrink-0 items-center rounded-full border border-white/80 bg-cream/95 p-0.5 text-xs font-semibold shadow-bubble-soft",
        className
      )}
    >
      {options.map((o, i) => (
        <Fragment key={o.id}>
          {i > 0 && <span key={`sep-${o.id}`} className="text-ink/15">|</span>}
          <button
            onClick={() => changeLocale(o.id)}
            className={cn(
              "grid min-h-10 min-w-10 place-items-center rounded-full px-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-600 focus-visible:ring-offset-1 focus-visible:ring-offset-cream",
              locale === o.id
                ? "bg-pink-600 text-white shadow-sm"
                : "text-ink/70 hover:bg-white hover:text-pink-700"
            )}
          >
            {o.label}
          </button>
        </Fragment>
      ))}
    </div>
  );
}
