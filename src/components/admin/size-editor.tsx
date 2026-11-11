"use client";

import { useState } from "react";
import { useLangStore } from "@/store/lang-store";
import type { LegacySize, SizeVariant } from "@/lib/product-variants";

type Draft = { key: string; id?: string; labelUa: string; labelEn: string; price: string; noteUa: string; noteEn: string };
const emptySize = (): Draft => ({ key: crypto.randomUUID(), labelUa: "", labelEn: "", price: "", noteUa: "", noteEn: "" });

export function SizeEditor({ defaults = [], legacySizes = [] }: { defaults?: SizeVariant[]; legacySizes?: LegacySize[] }) {
  const { t } = useLangStore();
  const text = t.admin.sizes;
  const [state, setState] = useState(() => ({
    enabled: defaults.length > 0, dirty: false,
    sizes: defaults.map((size): Draft => ({ key: size.id, id: size.id, labelUa: size.labelUa, labelEn: size.labelEn ?? "", price: size.price?.toString() ?? "", noteUa: size.noteUa ?? "", noteEn: size.noteEn ?? "" })),
  }));
  const update = (key: string, field: keyof Draft, value: string) => setState((current) => ({ ...current, dirty: true, sizes: current.sizes.map((size) => size.key === key ? { ...size, [field]: value } : size) }));
  const inputClass = "w-full rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm";
  const payload = state.enabled ? state.sizes.map(({ id, labelUa, labelEn, price, noteUa, noteEn }) => ({ id, labelUa, labelEn, price, noteUa, noteEn })) : [];

  return <fieldset className="space-y-4 rounded-2xl border border-ink/10 p-4">
    <legend className="px-2 font-semibold">{text.title}</legend>
    <p className="text-sm text-ink/60">{text.help}</p>
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={state.enabled} onChange={(event) => {
        const enabled = event.target.checked;
        setState((current) => ({ ...current, enabled, dirty: true, sizes: enabled && !current.sizes.length ? [emptySize()] : current.sizes }));
      }} />
      {text.enabled}
    </label>
    {/* An untouched editor sends no mutation instruction, including on legacy products. */}
    {state.dirty && <input type="hidden" name="variants" value={JSON.stringify(payload)} />}
    {legacySizes.length > 0 && <aside className="space-y-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
      <p className="font-semibold">{text.legacyTitle}</p>
      <p>{text.legacyHelp}</p>
      <ul className="list-inside list-disc">{legacySizes.map((size) => <li key={size.id}>{size.labelUa} — {text.legacyModifier}: {size.modifier}</li>)}</ul>
    </aside>}
    {state.enabled && state.sizes.map((size, index) => <div key={size.key} className="space-y-3 rounded-xl bg-white/60 p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {([['labelUa', text.labelUa], ['labelEn', text.labelEn], ['price', text.price], ['noteUa', text.noteUa], ['noteEn', text.noteEn]] as const).map(([field, label]) => <label key={field} className="block text-sm">
          <span className="mb-1 block">{label}</span>
          <input aria-label={`${label} ${index + 1}`} type={field === "price" ? "number" : "text"} min={field === "price" ? "0.01" : undefined} max={field === "price" ? "99999999.99" : undefined} step={field === "price" ? "0.01" : undefined}
            required={field === "labelUa" || field === "price"} maxLength={field.startsWith("note") ? 500 : 100} value={size[field]} onChange={(event) => update(size.key, field, event.target.value)} className={inputClass} />
        </label>)}
      </div>
      <button type="button" onClick={() => setState((current) => {
        const sizes = current.sizes.filter((entry) => entry.key !== size.key);
        return { ...current, sizes, enabled: sizes.length > 0, dirty: true };
      })} className="rounded-full px-3 py-2 text-sm text-pink-700">{text.remove}</button>
    </div>)}
    {!state.enabled && <p className="text-sm text-ink/60">{text.none}</p>}
    {state.dirty && !state.enabled && defaults.length > 0 && <p className="text-sm text-ink/60">{text.disableHelp}</p>}
    {state.enabled && <button type="button" disabled={state.sizes.length >= 40} onClick={() => setState((current) => ({ ...current, dirty: true, sizes: [...current.sizes, emptySize()] }))} className="rounded-full border border-pink-300 px-4 py-2 text-sm">{text.add}</button>}
  </fieldset>;
}
