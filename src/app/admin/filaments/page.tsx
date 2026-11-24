import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getT } from "@/lib/i18n-server";
import { requireAdmin } from "@/lib/actions/require-admin";
import { setFilamentAvailability } from "@/lib/actions/filaments";
import { filamentFacets, filamentFilter, filamentLabel, filamentOrder } from "@/lib/filaments";
import { AdminForm, AdminSaveButton } from "@/components/admin/admin-form";

export const dynamic = "force-dynamic";

export default async function FilamentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin();
  const params = await searchParams;
  const value = (key: string) => typeof params[key] === "string" ? params[key] : "";
  const [t, filaments, directory] = await Promise.all([
    getT(),
    prisma.filament.findMany({ where: filamentFilter(params), orderBy: filamentOrder }),
    prisma.filament.findMany({ select: { manufacturer: true, series: true, material: true, color: true } }),
  ]);
  return <div className="space-y-6">
    <h1 className="font-display text-3xl">{t.filaments.title}</h1>
    <Link className="text-pink-700 underline" href="/admin/filaments/new">{t.filaments.create}</Link>
    <form className="flex flex-wrap items-end gap-3">
      <label>{t.filaments.search}<input className="block rounded border p-2" name="q" defaultValue={value("q")} maxLength={100} /></label>
      {filamentFacets.map((key) => <label key={key}>{t.filaments[key]}
        <select className="block max-w-full rounded border p-2" name={key} defaultValue={value(key)}>
          <option value="">{t.filaments.all}</option>
          {[...new Set(directory.map((row) => row[key]))].sort().map((label) => <option key={label}>{label}</option>)}
        </select>
      </label>)}
      <label>{t.filaments.availability}<select className="block rounded border p-2" name="availability" defaultValue={value("availability")}>
        <option value="">{t.filaments.all}</option><option value="available">{t.filaments.available}</option><option value="unavailable">{t.filaments.unavailable}</option>
      </select></label>
      <button className="rounded border border-pink-700 px-3 py-2 text-pink-800">{t.filaments.filter}</button>
    </form>
    {filaments.length === 0 && <p>{t.filaments.empty}</p>}
    <ul className="space-y-2">
      {filaments.map((filament) => <li key={filament.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-white p-3">
        <div>
          <Link className="font-medium underline" href={`/admin/filaments/${filament.id}`}>{filamentLabel(filament)}</Link>
          <p className="text-sm"><span aria-hidden="true" className="mr-2 inline-block h-3 w-3 rounded-full border" style={{ backgroundColor: filament.hex }} />
            {filament.hex} · {filament.isAvailable ? t.filaments.available : t.filaments.unavailable}</p>
        </div>
        <AdminForm action={setFilamentAvailability.bind(null, filament.id, !filament.isAvailable)}>
          <AdminSaveButton size="sm">{filament.isAvailable ? t.filaments.disable : t.filaments.enable}</AdminSaveButton>
        </AdminForm>
      </li>)}
    </ul>
  </div>;
}
