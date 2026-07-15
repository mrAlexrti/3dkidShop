export const dynamic = "force-dynamic";

import { ProductForm } from "@/components/admin/product-form";
import { createProduct } from "@/lib/actions/products";
import { getT } from "@/lib/i18n-server";
import { getCategoryTree } from "@/lib/categories";

export default async function NewProductPage() {
  const t = await getT();
  const categories = await getCategoryTree();

  return (
    <div>
      <h1 className="font-display text-3xl">{t.admin.productsList.newTitle}</h1>
      <div className="mt-6">
        <ProductForm categories={categories} action={createProduct} />
      </div>
    </div>
  );
}
