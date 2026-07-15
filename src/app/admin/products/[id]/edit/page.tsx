export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { ProductForm } from "@/components/admin/product-form";
import { updateProduct } from "@/lib/actions/products";
import { getT } from "@/lib/i18n-server";
import { getCategoryTree } from "@/lib/categories";

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getT();
  const [product, categories] = await Promise.all([
    prisma.product.findUnique({ where: { id }, include: { images: true } }),
    getCategoryTree(),
  ]);

  if (!product) notFound();

  const boundUpdate = updateProduct.bind(null, id);

  return (
    <div>
      <h1 className="font-display text-3xl">{t.admin.productsList.editTitle}</h1>
      <div className="mt-6">
        <ProductForm
          categories={categories}
          action={boundUpdate}
          defaults={{
            name: product.name,
            nameEn: product.nameEn,
            slug: product.slug,
            description: product.description,
            descriptionEn: product.descriptionEn,
            price: Number(product.price),
            oldPrice: product.oldPrice ? Number(product.oldPrice) : null,
            stock: product.stock,
            categoryId: product.categoryId,
            imageUrl: product.images[0]?.url,
            isFeatured: product.isFeatured,
            isNew: product.isNew,
            isActive: product.isActive,
          }}
        />
      </div>
    </div>
  );
}
