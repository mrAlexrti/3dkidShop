"use client";
import * as React from "react";
import { useState } from "react";
import { useLangStore } from "@/store/lang-store";
import { MaterialsDivider } from "@/components/product/materials-divider";
import { MATERIALS_LIMIT, motifSchema } from "@/lib/product-materials";
import { AdminFieldError } from "./admin-form";

export function MaterialsFields({ defaults }: { defaults?: { materials?: string | null; materialsEn?: string | null; materialsDivider?: string | null } }) {
  const { t } = useLangStore(); const text = t.materials; const [motif, setMotif] = useState(defaults?.materialsDivider ?? "");
  const valid = motifSchema.safeParse(motif);
  const input = "w-full rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm";
  return <fieldset className="min-w-0 space-y-3 rounded-2xl border border-ink/10 p-4"><legend className="px-2 font-semibold">{text.adminTitle}</legend>
    <p className="text-sm text-ink/60">{text.help}</p>
    {([['materials', text.ua], ['materialsEn', text.en]] as const).map(([name, label]) => <label key={name} className="block text-sm">{label}<textarea name={name} rows={4} maxLength={MATERIALS_LIMIT} defaultValue={defaults?.[name] ?? ""} className={input} /><AdminFieldError name={name} /></label>)}
    <label className="block text-sm">{text.motif}<input name="materialsDivider" value={motif} onChange={(event) => setMotif(event.target.value)} aria-invalid={!valid.success || undefined} className={input} /><AdminFieldError name="materialsDivider" /></label>
    {!valid.success && <p role="alert" className="text-sm text-red-700">{text.invalid}</p>}
    <p className="text-xs text-ink/60">{text.preview}</p><MaterialsDivider motif={valid.success ? valid.data : null} />
  </fieldset>;
}
