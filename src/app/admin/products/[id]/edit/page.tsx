export const dynamic = "force-dynamic";

import Link from "next/link";
import { requireAdmin } from "@/lib/actions/require-admin";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { ProductForm } from "@/components/admin/product-form";
import { updateProduct } from "@/lib/actions/products";
import { getLocale } from "@/lib/i18n-server";
import { translations } from "@/lib/i18n";
import { getCategoryTree } from "@/lib/categories";
import { getLegacySizes, getSizeVariants } from "@/lib/product-variants";
import { productConfiguration } from "@/lib/product-configuration";
import { adminAvailabilityVariantInclude, variantFilamentSummary } from "@/lib/product-query";
import { variantHistoryPage } from "@/lib/admin-variant-history";
import { nativeVariantWritesEnabled } from "@/lib/variant-rollout";

export default async function EditProductPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams?: Promise<{ historyPage?: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const locale = await getLocale();
  const t = translations[locale];
  const [product, categories] = await Promise.all([
    prisma.$transaction((tx) => tx.product.findUnique({ where: { id }, include: { images: { orderBy: [{ order: "asc" }, { id: "asc" }] }, options: { include: { values: true } }, variants: { include: adminAvailabilityVariantInclude } } }), { isolationLevel: "RepeatableRead" }),
    getCategoryTree(),
  ]);

  if (!product) notFound();
  const config = productConfiguration({ ...product, variants: product.variants.map((row) => ({
    ...row, filamentGroups: row.filamentGroups.filter((group) => !group.alternatives.length),
  })) });
  const history = variantHistoryPage(config, Number((await searchParams)?.historyPage ?? 1));
  const byId = new Map(config.combinations.map((row) => [row.id, row]));
  const summary = t.filamentSummary;

  const boundUpdate = updateProduct.bind(null, id);
  const defaultNames = new Map(product.options.flatMap((option) => option.values.map((value) => [value.id, locale === "en" ? value.valueEn?.trim() || value.value : value.value])));

  return (
    <div>
      <h1 className="font-display text-3xl">{t.admin.productsList.editTitle}</h1>
      {product.variants.some((row) => !row.retiredAt) && <details className="mt-4 rounded-lg border bg-white p-3">
        <summary className="cursor-pointer font-medium">{t.filaments.requirements}</summary>
        <ul className="mt-2 space-y-1">
          {product.variants.filter((row) => !row.retiredAt).map((row) => {
            const values = byId.get(row.id)?.values;
            const name = [values?.COLOR, values?.SIZE].flatMap((value) => value ? [defaultNames.get(value)] : []).join(" / ");
            const material = variantFilamentSummary(row.filamentGroups);
            return <li key={row.id}>
              <Link className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-ink/10 px-3 py-2 text-sm hover:bg-pink-50"
                href={`/admin/products/${id}/filaments/${row.id}`}>
                <strong className="break-words text-pink-700 underline">{name}</strong>
                {material.groups ? <>
                  <span>{summary.groups} ({material.groups}) · {summary.alternatives} ({material.alternatives})</span>
                  <span className={material.blocked.length ? "text-red-800" : "text-green-800"}>{material.blocked.length ? summary.blocked : summary.ready}</span>
                  {!!material.blocked.length && <span>{summary.blocking} ({material.blocked.join(", ")})</span>}
                </> : <span>{summary.none}</span>}
                {!row.isAvailable && <span>{t.filaments.manual}</span>}
              </Link>
            </li>;
          })}
        </ul>
      </details>}
      <div className="mt-6">
        <ProductForm
          allowNative={nativeVariantWritesEnabled()}
          key={`${id}:${history.page}`}
          categories={categories}
          action={boundUpdate}
          defaults={{
            optionMode: product.optionMode, variantRevision: product.variantRevision, configuration: history.configuration,
            history: { page: history.page, pages: history.pages, href: `/admin/products/${encodeURIComponent(id)}/edit` },
            variants: getSizeVariants(product.options),
            legacySizes: getLegacySizes(product.options),
            name: product.name,
            nameEn: product.nameEn,
            slug: product.slug,
            description: product.description,
            descriptionEn: product.descriptionEn,
            materials: product.materials, materialsEn: product.materialsEn, materialsDivider: product.materialsDivider,
            price: Number(product.price),
            oldPrice: product.oldPrice ? Number(product.oldPrice) : null,
            isOrderable: product.isOrderable,
            categoryId: product.categoryId,
            imageUrl: product.images[0]?.url,
            images: product.images.map(({ id, url, alt, colorValueId }) => ({ id, url, alt, colorValueId })),
            hoverGifUrl: product.hoverGifUrl,
            isFeatured: product.isFeatured,
            isNew: product.isNew,
            isActive: product.isActive,
          }}
        />
      </div>
    </div>
  );
}
