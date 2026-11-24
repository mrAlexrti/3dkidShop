"use client";
import { useId, type Dispatch, type SetStateAction } from "react";
import { useLangStore } from "@/store/lang-store";
import { AdminFieldError, useAdminForm } from "./admin-form";
import { matchesMode, needsColor, needsSize, type ProductConfiguration, type OptionKind } from "@/lib/product-configuration";
import type { ConfigurationInput } from "@/lib/product-configuration-admin";
import type { SizeVariant } from "@/lib/product-variants";
import { ConfirmButton, EditorRemoveButton } from "./confirm-button";

export type ConfigurationDraft = Omit<ConfigurationInput, "combinations"> & { combinations: (ConfigurationInput["combinations"][number] & { draftKey: string })[] };
export function initialConfigurationDraft(config?: ProductConfiguration, legacySizes: SizeVariant[] = []): ConfigurationDraft {
  if (config && config.mode !== "LEGACY") return { mode: config.mode,
    values: config.values.map((v) => ({ key: v.id, id: v.id, kind: v.kind, labelUa: v.labelUa, labelEn: v.labelEn ?? "", noteUa: v.noteUa ?? "", noteEn: v.noteEn ?? "", retired: v.retired, displayPosition: v.displayPosition ?? undefined })),
    combinations: config.combinations.map((v) => ({ id: v.id, draftKey: v.id, color: v.values.COLOR, size: v.values.SIZE, price: v.price, isAvailable: v.isAvailable, retired: v.retired })) };
  return { mode: legacySizes.length ? "SIZE" : "SIMPLE",
    values: legacySizes.map((v) => ({ key: v.id, id: v.id, kind: "SIZE", labelUa: v.labelUa, labelEn: v.labelEn ?? "", noteUa: v.noteUa ?? "", noteEn: v.noteEn ?? "", retired: false })),
    combinations: legacySizes.map((v) => ({ draftKey: v.id, size: v.id, price: String(v.price), isAvailable: false, retired: false })) };
}
export function VariantEditor({ draft, setDraft, enabled, onEnabled, legacy, history, allowNative }: {
  draft: ConfigurationDraft; setDraft: Dispatch<SetStateAction<ConfigurationDraft>>; enabled: boolean; onEnabled: (value: boolean) => void; legacy: boolean;
  history?: { page: number; pages: number; href: string };
  allowNative: boolean;
}) {
  const { t, locale } = useLangStore(); const text = t.variantConfig; const { pending } = useAdminForm(); const prefix = useId();
  function changeMode(color: boolean, size: boolean) {
    const mode = color ? size ? "COLOR_SIZE" : "COLOR" : size ? "SIZE" : "SIMPLE";
    setDraft((current) => ({ mode,
      values: current.values.filter((v) => v.id || (v.kind === "COLOR" ? color : size)).map((v) => v.kind === "COLOR" ? color ? v : { ...v, retired: true } : size ? v : { ...v, retired: true }),
      combinations: current.combinations.filter((v) => v.id || matchesMode(mode, { COLOR: v.color, SIZE: v.size })).map((v) => matchesMode(mode, { COLOR: v.color, SIZE: v.size }) ? v : { ...v, retired: true }) }));
  }
  function addValue(kind: OptionKind) {
    setDraft((current) => ({ ...current, values: [...current.values, { key: crypto.randomUUID(), kind, labelUa: "", labelEn: "", noteUa: "", noteEn: "", retired: false }] }));
  }
  function moveValue(index: number, direction: -1 | 1) {
    setDraft((current) => {
      const values = [...current.values];
      const sameKind = values.flatMap((value, i) => value.kind === values[index].kind && !value.retired ? [i] : []);
      const target = sameKind[sameKind.indexOf(index) + direction];
      if (target === undefined) return current;
      [values[target], values[index]] = [values[index], values[target]];
      sameKind.forEach((i, position) => { values[i] = { ...values[i], displayPosition: position }; });
      return { ...current, values };
    });
  }
  const field = (name: string, title: string, value: string, update: (value: string) => void, options: { required?: boolean; numeric?: boolean; max?: number } = {}) => <div key={name} className="min-w-0">
    <label htmlFor={`${prefix}-${name}`} className="mb-1 block text-sm">{title}</label>
    <input id={`${prefix}-${name}`} name={name} value={value} onChange={(e) => update(e.target.value)} required={options.required} maxLength={options.max ?? 100}
      type={options.numeric ? "number" : "text"} min={options.numeric ? "0.01" : undefined} max={options.numeric ? "99999999.99" : undefined} step={options.numeric ? "0.01" : undefined}
      className="min-h-11 w-full rounded-xl border border-ink/15 px-3 py-2 text-sm" /><AdminFieldError name={name} />
  </div>;
  return <section data-field-name="configuration" tabIndex={-1} className="space-y-4 rounded-xl border border-ink/10 p-3 sm:p-4">
    <h2 className="font-display text-xl">{text.title}</h2><AdminFieldError name="configuration" />
    {!allowNative && <p className="text-sm text-ink/60">{t.admin.validation.nativeDisabled}</p>}
    {legacy && <><p className="text-sm text-ink/60">{text.legacy}</p><button type="button" disabled={pending || !allowNative} className="min-h-11 text-sm underline" onClick={() => onEnabled(!enabled)}>{enabled ? text.cancel : text.convert}</button></>}
    <fieldset hidden={!enabled} disabled={!enabled || pending || !allowNative} className="min-w-0 space-y-4">
      {enabled && allowNative && <input type="hidden" name="configuration" value={JSON.stringify(draft)} />}
      <p className="text-sm text-ink/60">{text.limits}</p>
      <AdminFieldError name="configuration.values" />
      <div className="flex flex-wrap gap-4">{(["COLOR", "SIZE"] as const).map((kind) => {
        const checked = kind === "COLOR" ? needsColor(draft.mode) : needsSize(draft.mode);
        const apply = () => changeMode(kind === "COLOR" ? !checked : needsColor(draft.mode), kind === "SIZE" ? !checked : needsSize(draft.mode));
        return <label key={kind} className="flex min-h-11 items-center gap-2 text-sm"><ConfirmButton message={t.adminSafety.mode} actionLabel={t.adminSafety.apply} onConfirm={apply}
          renderTrigger={(ask) => <input type="checkbox" checked={checked} onChange={() => { if (draft.combinations.some((row) => row.id && !row.retired)) ask(); else apply(); }} />} />{kind === "COLOR" ? text.useColor : text.useSize}</label>;
      })}</div>
      {(["COLOR", "SIZE"] as const).map((kind) => <div key={kind} className="space-y-3">
        <h3 className="font-semibold">{kind === "COLOR" ? text.color : text.size}</h3>
        {draft.values.map((value, i) => value.kind === kind && <div key={value.key} className={`space-y-3 rounded-xl border p-3 ${value.retired ? "border-dashed opacity-75" : "border-ink/15"}`} data-field-name={`configuration.values.${i}`} tabIndex={-1}>
          <div className="grid gap-3 sm:grid-cols-2">{(["labelUa", "labelEn", "noteUa", "noteEn"] as const).map((name) => field(`configuration.values.${i}.${name}`, text[name], value[name], (next) => setDraft((d) => ({ ...d, values: d.values.map((v, j) => j === i ? { ...v, [name]: next } : v) })), { required: name === "labelUa", max: name.startsWith("note") ? 500 : 100 }))}</div>
          {value.retired && <span className="text-sm">{text.retired}</span>}
          {!value.retired && <div className="flex flex-wrap gap-4">
            <button type="button" className="min-h-11 text-sm underline disabled:opacity-50" onClick={() => moveValue(i, -1)}
              disabled={!draft.values.slice(0, i).some((v) => v.kind === kind && !v.retired)}>{t.filamentSummary.up}</button>
            <button type="button" className="min-h-11 text-sm underline disabled:opacity-50" onClick={() => moveValue(i, 1)}
              disabled={!draft.values.slice(i + 1).some((v) => v.kind === kind && !v.retired)}>{t.filamentSummary.down}</button>
          </div>}
          <EditorRemoveButton persisted={Boolean(value.id && !value.retired)} retiring name={(locale === "en" ? value.labelEn || value.labelUa : value.labelUa) || text.choose} className="min-h-11 text-sm underline" disabled={value.retired && (kind === "COLOR" ? !needsColor(draft.mode) : !needsSize(draft.mode))} onConfirm={() => setDraft((d) => ({ ...d,
            values: value.id ? d.values.map((v, j) => j === i ? { ...v, retired: !v.retired } : v) : d.values.filter((_, j) => j !== i),
            combinations: d.combinations.filter((r) => r.id || r.color !== value.key && r.size !== value.key).map((r) => !value.retired && (r.color === value.key || r.size === value.key) ? { ...r, retired: true } : r),
          }))}>{value.id ? value.retired ? text.restore : text.retire : text.remove}</EditorRemoveButton><AdminFieldError name={`configuration.values.${i}.retired`} />
        </div>)}
        {(kind === "COLOR" ? needsColor(draft.mode) : needsSize(draft.mode)) && <button type="button" className="min-h-11 text-sm underline" disabled={draft.values.length >= 160 || draft.values.filter((v) => v.kind === kind && !v.retired).length >= 40} onClick={() => addValue(kind)}>{kind === "COLOR" ? text.addColor : text.addSize}</button>}
      </div>)}
      <div className="space-y-3"><h3 className="font-semibold">{text.combinations}</h3><p className="text-sm text-ink/60">{text.immutable}</p><AdminFieldError name="configuration.combinations" />
        {draft.combinations.map((row, i) => <div key={row.draftKey} data-field-name={`configuration.combinations.${i}`} tabIndex={-1} className="space-y-3 rounded-xl border border-ink/15 p-3">
          <div className="grid gap-3 sm:grid-cols-2">{(["COLOR", "SIZE"] as const).filter((kind) => row.retired ? Boolean(kind === "COLOR" ? row.color : row.size) : kind === "COLOR" ? needsColor(draft.mode) : needsSize(draft.mode)).map((kind) => {
            const prop = kind === "COLOR" ? "color" : "size";
            const name = `configuration.combinations.${i}.${prop}`;
            return <div key={kind}><label htmlFor={`${prefix}-${name}`} className="mb-1 block text-sm">{kind === "COLOR" ? text.color : text.size}</label><select id={`${prefix}-${name}`} name={name} required disabled={Boolean(row.id)} value={row[prop] ?? ""}
              onChange={(e) => setDraft((d) => ({ ...d, combinations: d.combinations.map((v, j) => j === i ? { ...v, [prop]: e.target.value } : v) }))} className="min-h-11 w-full min-w-0 rounded-xl border border-ink/15 px-3 text-sm">
              <option value="">{text.choose}</option>{draft.values.filter((v) => v.kind === kind && (!v.retired || v.key === row[prop])).map((v) => <option key={v.key} value={v.key}>{(locale === "en" ? v.labelEn || v.labelUa : v.labelUa) || text.choose}</option>)}</select><AdminFieldError name={name} /></div>;
          })}
          {field(`configuration.combinations.${i}.price`, text.price, row.price, (price) => setDraft((d) => ({ ...d, combinations: d.combinations.map((v, j) => j === i ? { ...v, price } : v) })), { numeric: true, required: true })}</div>
          <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={row.isAvailable} onChange={(e) => setDraft((d) => ({ ...d, combinations: d.combinations.map((v, j) => j === i ? { ...v, isAvailable: e.target.checked } : v) }))} />{text.available}</label>
          {row.retired && <span className="text-sm">{text.retired} </span>}
          <EditorRemoveButton persisted={Boolean(row.id && !row.retired)} retiring name={[row.color, row.size].filter(Boolean).map((key) => { const value = draft.values.find((v) => v.key === key); return value ? (locale === "en" ? value.labelEn || value.labelUa : value.labelUa) : key; }).join(" / ")} className="min-h-11 text-sm underline" disabled={row.retired && (!matchesMode(draft.mode, { COLOR: row.color, SIZE: row.size }) || draft.values.some((v) => v.retired && (v.key === row.color || v.key === row.size)))} onConfirm={() => setDraft((d) => ({ ...d, combinations: row.id ? d.combinations.map((v, j) => j === i ? { ...v, retired: !v.retired } : v) : d.combinations.filter((_, j) => j !== i) }))}>{row.id ? row.retired ? text.restore : text.retire : text.remove}</EditorRemoveButton>
          <AdminFieldError name={`configuration.combinations.${i}`} />
        </div>)}
        {draft.mode !== "SIMPLE" && <button type="button" className="min-h-11 text-sm underline" disabled={draft.combinations.length >= 400 || draft.combinations.filter((r) => !r.retired).length >= 200} onClick={() => setDraft((d) => ({ ...d, combinations: [...d.combinations, { draftKey: crypto.randomUUID(), price: "", isAvailable: false, retired: false }] }))}>{text.addCombination}</button>}
        {draft.mode !== "SIMPLE" && !draft.combinations.some((r) => !r.retired && r.isAvailable) && <p className="text-sm">{text.empty}</p>}
      </div>
    </fieldset>
    {enabled && history && history.pages > 1 && <nav aria-label={text.history} className="flex flex-wrap gap-4 text-sm"><span>{text.history}: {history.page} / {history.pages}</span>{[-1,1].map((direction) => history.page+direction>=1 && history.page+direction<=history.pages && <a key={direction} className="min-h-11 underline" href={`${history.href}?historyPage=${history.page+direction}`} onClick={(e) => { if (pending || !window.confirm(text.historyWarning)) e.preventDefault(); }}>{direction<0?text.previous:text.next}</a>)}</nav>}
  </section>;
}
