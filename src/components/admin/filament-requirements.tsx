"use client";

import { useState } from "react";
import { useLangStore } from "@/store/lang-store";
import { filamentLabel } from "@/lib/filaments";
import { AdminFieldError, AdminForm, AdminSaveButton } from "@/components/admin/admin-form";
import type { AdminFormResult } from "@/lib/admin-form-validation";

type Filament = Parameters<typeof filamentLabel>[0] & { id: string; isAvailable: boolean };

export function FilamentRequirements({ directory, initial, sources, action, back }: {
  directory: Filament[];
  initial: string[][];
  sources: { id: string; label: string; groups: string[][] }[];
  action: (form: FormData) => Promise<AdminFormResult>;
  back: string;
}) {
  const { t } = useLangStore();
  const copy = t.filaments;
  const [groups, setGroups] = useState(initial);
  const available = new Set(directory.filter((filament) => filament.isAvailable).map((filament) => filament.id));
  const update = (index: number, ids: string[]) => setGroups(groups.map((group, i) => i === index ? ids : group));
  return <AdminForm action={action} successHref={back} className="space-y-4">
    <p>{copy.help}</p>
    {sources.length > 0 && <label className="block">{copy.copy}
      <select className="block max-w-full rounded border p-2" value="" onChange={(event) => {
        const source = sources.find((row) => row.id === event.target.value);
        if (source) setGroups(source.groups);
      }}>
        <option value="">{copy.copy}</option>
        {sources.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}
      </select>
    </label>}
    <input type="hidden" name="requirements" value={JSON.stringify(groups)} />
    <div data-field-name="requirements" tabIndex={-1} className="space-y-3">
      <AdminFieldError name="requirements" />
      {groups.length === 0 && <p>{copy.none}</p>}
      {groups.map((ids, index) => <fieldset key={index} className="min-w-0 space-y-3 rounded-lg border bg-white p-3">
        <legend className="px-2">{copy.alternative} {index + 1}</legend>
        <p className={ids.some((id) => available.has(id)) ? "text-green-800" : "text-red-800"}>
          {ids.some((id) => available.has(id)) ? copy.ready : copy.blocked}
        </p>
        {ids.map((id, slot) => <div key={slot} className="flex flex-wrap items-center gap-2">
          <select aria-label={`${copy.alternative} ${index + 1} / ${slot + 1}`} className="max-w-full rounded border p-2" value={id}
            onChange={(event) => update(index, ids.map((value, i) => i === slot ? event.target.value : value))}>
            <option value="">{copy.choose}</option>
            {directory.map((filament) => <option key={filament.id} value={filament.id} disabled={id !== filament.id && ids.includes(filament.id)}>
              {filamentLabel(filament)} · {filament.isAvailable ? copy.available : copy.unavailable}
            </option>)}
          </select>
          <button type="button" className="min-h-11 underline" onClick={() => update(index, ids.filter((_, i) => i !== slot))}>{copy.removeAlternative}</button>
        </div>)}
        <div className="flex flex-wrap gap-4">
          <button type="button" className="min-h-11 underline disabled:opacity-50" disabled={ids.length >= 32 || ids.includes("") || ids.length >= directory.length}
            onClick={() => update(index, [...ids, ""])}>{copy.addAlternative}</button>
          <button type="button" className="min-h-11 text-red-800 underline" onClick={() => setGroups(groups.filter((_, i) => i !== index))}>{copy.removeGroup}</button>
        </div>
      </fieldset>)}
    </div>
    <div className="flex gap-4">
      <button type="button" className="min-h-11 underline disabled:opacity-50" disabled={groups.length >= 24 || !directory.length}
        onClick={() => setGroups([...groups, [""]])}>{copy.addGroup}</button>
      <AdminSaveButton />
    </div>
  </AdminForm>;
}
