"use client";

import Image from "next/image";
import { useState } from "react";
import { httpMediaUrl } from "@/lib/product-media";
import { useLangStore } from "@/store/lang-store";

export function MediaUrlField({ name, label, help, defaultValue = "", fallback }: {
  name: string;
  label: string;
  help: string;
  defaultValue?: string;
  fallback?: string;
}) {
  const { t } = useLangStore();
  const [value, setValue] = useState(defaultValue);
  const [failedUrl, setFailedUrl] = useState("");
  const trimmed = value.trim();
  const valid = httpMediaUrl.safeParse(trimmed).success;
  const preview = valid ? trimmed : !trimmed ? fallback : undefined;
  return (
    <div>
      <label htmlFor={name} className="mb-1 block text-sm font-medium">{label}</label>
      <input id={name} name={name} type="url" value={value} onChange={(event) => {
        setValue(event.target.value);
        event.target.setCustomValidity("");
      }} onBlur={(event) => event.target.setCustomValidity(trimmed && !valid ? t.admin.media.invalidUrl : "")}
        aria-describedby={`${name}-help`} placeholder="https://…"
        className="w-full rounded-xl border border-ink/10 bg-white px-4 py-2.5 text-sm outline-none focus:border-pink-400" />
      <p id={`${name}-help`} className="mt-2 text-xs leading-relaxed text-ink/60">{help}</p>
      {value && <button type="button" className="mt-2 text-sm underline" onClick={() => {
        setValue("");
        (document.getElementById(name) as HTMLInputElement)?.setCustomValidity("");
      }}>{t.admin.media.clear}</button>}
      {preview && preview !== failedUrl && <Image key={preview} src={preview} width={200} height={200} unoptimized
        className="mt-3 aspect-square rounded-xl object-cover motion-reduce:hidden" alt={`${t.admin.common.preview}: ${label}`} onError={() => setFailedUrl(preview)} />}
      {preview && preview === failedUrl && <p role="status" className="mt-2 text-xs text-ink/60">{t.admin.media.previewError}</p>}
    </div>
  );
}
