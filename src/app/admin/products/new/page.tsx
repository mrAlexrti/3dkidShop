export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { ProductForm } from "@/components/admin/product-form";
import { createProduct } from "@/lib/actions/products";
import { getT } from "@/lib/i18n-server";

export default async function NewProductPage() {
  const t = await getT();
  const categories = await prisma.category.findMany({ orderBy: { name: "asc" } });

  return (
    <div>
      <h1 className="font-display text-3xl">{t.admin.productsList.newTitle}</h1>
      <div className="mt-6">
        <ProductForm categories={categories} action={createProduct} />
      </div>
    </div>
  );
}
