import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getLocale } from "@/lib/i18n-server";
import { translations } from "@/lib/i18n";
import { requireAdmin } from "@/lib/actions/require-admin";
import { saveFilamentRequirements } from "@/lib/actions/filaments";
import { filamentOrder } from "@/lib/filaments";
import { FilamentRequirements } from "@/components/admin/filament-requirements";

export const dynamic = "force-dynamic";

export default async function VariantFilamentPage({ params }: { params: Promise<{ id: string; variantId: string }> }) {
  await requireAdmin();
  const { id, variantId } = await params;
  const [locale, directory, product] = await Promise.all([
    getLocale(),
    prisma.filament.findMany({ orderBy: filamentOrder }),
    prisma.product.findUnique({
      where: { id },
      select: { name: true, nameEn: true, isActive: true, isOrderable: true, variants: {
        where: { retiredAt: null },
        orderBy: { combinationKey: "asc" },
        include: {
          selections: { orderBy: { option: { kind: "asc" } }, select: { value: { select: { value: true, valueEn: true } } } },
          filamentGroups: { orderBy: { position: "asc" }, include: { alternatives: { orderBy: { filamentId: "asc" } } } },
        },
      } },
    }),
  ]);
  const variant = product?.variants.find((row) => row.id === variantId);
  if (!variant || !product) notFound();
  const t = translations[locale];
  const back = `/admin/products/${id}/edit`;
  const label = (row: typeof variant) => row.selections.map(({ value }) => locale === "en" ? value.valueEn?.trim() || value.value : value.value).join(" / ");
  const groups = (row: typeof variant) => row.filamentGroups.map((group) => group.alternatives.map((alt) => alt.filamentId));
  const snapshot = variant.filamentGroups.map((group) => group.id).join(",");
  return <div className="max-w-3xl space-y-4">
    <div className="flex flex-wrap gap-4">
      <Link className="text-pink-700 underline" href={back}>{locale === "en" ? product.nameEn?.trim() || product.name : product.name}</Link>
      <Link className="text-pink-700 underline" href="/admin/filaments">{t.filaments.title}</Link>
    </div>
    <h1 className="font-display text-3xl">{t.filaments.requirements} · {label(variant)}</h1>
    {!product.isActive || !product.isOrderable ? <p>{t.filaments.productDisabled}</p> : null}
    {!variant.isAvailable && <p>{t.filaments.manual}</p>}
    <FilamentRequirements key={`${variantId}:${snapshot}`} directory={directory} initial={groups(variant)}
      sources={product.variants.filter((row) => row.id !== variantId && row.filamentGroups.length).map((row) => ({ id: row.id, label: label(row), groups: groups(row) }))}
      action={saveFilamentRequirements.bind(null, id, variantId, snapshot)} back={back} />
  </div>;
}
