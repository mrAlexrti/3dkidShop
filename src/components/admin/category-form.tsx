"use client";

import { useLangStore } from "@/store/lang-store";
import { AdminForm, AdminFieldError, AdminSaveButton } from "@/components/admin/admin-form";
import { MediaUrlField } from "@/components/admin/media-url-field";
import type { AdminFormResult } from "@/lib/admin-form-validation";

type CategoryDefaults = { name?: string; nameEn?: string; slug?: string; imageUrl?: string | null; description?: string | null; parentId?: string | null; order?: number };
export function CategoryForm({ parents, defaults, action }: {
  parents: { id: string; name: string }[]; defaults?: CategoryDefaults; action: (data: FormData) => Promise<AdminFormResult>; mode: "create" | "edit";
}) {
  const { t } = useLangStore(); const tc = t.admin.categories;
  const inputClass = "w-full rounded-xl border border-ink/10 bg-white px-4 py-2.5 text-sm outline-none focus:border-pink-400";
  return <AdminForm action={action} successHref="/admin/categories" className="space-y-3">
    {([['name', tc.nameUa], ['nameEn', tc.nameEn], ['slug', tc.slug]] as const).map(([name, label]) => <div key={name}>
      <label htmlFor={`category-${name}`} className="mb-1 block text-sm font-medium">{label} *</label>
      <input id={`category-${name}`} name={name} minLength={2} defaultValue={defaults?.[name]} required className={inputClass} /><AdminFieldError name={name} />
    </div>)}
    <label className="block text-sm">{tc.order}<input name="order" type="number" step="1" defaultValue={defaults?.order ?? 0} className={inputClass} /><AdminFieldError name="order" /></label>
    <label className="block text-sm">{tc.parent}<select name="parentId" defaultValue={defaults?.parentId ?? ""} className={inputClass}>
      <option value="">{t.admin.common.none}</option>{parents.map((parent) => <option key={parent.id} value={parent.id}>{parent.name}</option>)}
    </select><AdminFieldError name="parentId" /></label>
    <MediaUrlField name="imageUrl" label={tc.image} help={t.admin.media.imageHelp} defaultValue={defaults?.imageUrl ?? ""} uploadEnabled />
    <label className="block text-sm">{tc.description}<textarea name="description" defaultValue={defaults?.description ?? ""} rows={2} className={inputClass} /><AdminFieldError name="description" /></label>
    <AdminSaveButton className="w-full" />
  </AdminForm>;
}
