import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getT } from "@/lib/i18n-server";
import { requireAdmin } from "@/lib/actions/require-admin";
import { saveFilament } from "@/lib/actions/filaments";
import { filamentFacets } from "@/lib/filaments";
import { AdminFieldError, AdminForm, AdminSaveButton } from "@/components/admin/admin-form";

export const dynamic = "force-dynamic";

export default async function EditFilamentPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const [t, filament, directory] = await Promise.all([
    getT(),
    id === "new" ? null : prisma.filament.findUnique({ where: { id } }),
    prisma.filament.findMany({ select: { manufacturer: true, series: true, material: true, color: true } }),
  ]);
  if (id !== "new" && !filament) notFound();
  return <div className="max-w-xl space-y-4">
    <Link className="text-pink-700 underline" href="/admin/filaments">{t.filaments.title}</Link>
    <h1 className="font-display text-3xl">{filament ? t.filaments.edit : t.filaments.create}</h1>
    <AdminForm action={saveFilament.bind(null, filament?.id ?? null)} successHref="/admin/filaments" className="space-y-4">
      {filamentFacets.map((key) => <div key={key}>
        <label className="block">{t.filaments[key]}
          <input className="block w-full rounded border p-2" name={key} list={`filament-${key}`} defaultValue={filament?.[key]} maxLength={100} required />
        </label>
        <datalist id={`filament-${key}`}>{[...new Set(directory.map((row) => row[key]))].sort().map((label) => <option key={label} value={label} />)}</datalist>
        <AdminFieldError name={key} />
      </div>)}
      <label className="block">{t.filaments.hex}
        <input className="block w-full rounded border p-2" name="hex" placeholder="#FFB7CF" defaultValue={filament?.hex} pattern="#[0-9a-fA-F]{6}" required />
      </label>
      <AdminFieldError name="hex" />
      <AdminSaveButton />
    </AdminForm>
  </div>;
}
