export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { ProductForm } from "@/components/admin/product-form";
import { updateProduct } from "@/lib/actions/products";
import { getT } from "@/lib/i18n-server";
import { getCategoryTree } from "@/lib/categories";
import { getLegacySizes, getSizeVariants } from "@/lib/product-variants";
import { productConfiguration } from "@/lib/product-configuration";
import { variantHistoryPage } from "@/lib/admin-variant-history";
import { nativeVariantWritesEnabled } from "@/lib/variant-rollout";

export default async function EditProductPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams?: Promise<{ historyPage?: string }> }) {
  const { id } = await params;
  const t = await getT();
  const [product, categories] = await Promise.all([
    prisma.$transaction((tx) => tx.product.findUnique({ where: { id }, include: { images: { orderBy: [{ order: "asc" }, { id: "asc" }] }, options: { include: { values: true } }, variants: { include: { selections: true } } } }), { isolationLevel: "RepeatableRead" }),
    getCategoryTree(),
  ]);

  if (!product) notFound();
  const history = variantHistoryPage(productConfiguration(product), Number((await searchParams)?.historyPage ?? 1));

  const boundUpdate = updateProduct.bind(null, id);

  return (
    <div>
      <h1 className="font-display text-3xl">{t.admin.productsList.editTitle}</h1>
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
            images: product.images.map(({ id, url, alt }) => ({ id, url, alt })),
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
