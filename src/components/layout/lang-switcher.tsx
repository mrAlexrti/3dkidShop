"use client";

import { Fragment } from "react";
import { useLangStore } from "@/store/lang-store";
import type { Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export function LangSwitcher({ className }: { className?: string }) {
  const { locale, setLocale } = useLangStore();

  const options: { id: Locale; label: string }[] = [
    { id: "ua", label: "UA" },
    { id: "en", label: "EN" },
  ];

  return (
    <div
      className={cn(
        "flex items-center rounded-full border border-ink/10 bg-white/80 p-0.5 text-xs font-semibold",
        className
      )}
    >
      {options.map((o, i) => (
        <Fragment key={o.id}>
          {i > 0 && <span key={`sep-${o.id}`} className="text-ink/20">|</span>}
          <button
            onClick={() => setLocale(o.id)}
            className={cn(
              "rounded-full px-2.5 py-1 transition-colors",
              locale === o.id
                ? "bg-pink-500 text-white"
                : "text-ink/60 hover:text-pink-600"
            )}
          >
            {o.label}
          </button>
        </Fragment>
      ))}
    </div>
  );
}
