export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { ProductForm } from "@/components/admin/product-form";
import { createProduct } from "@/lib/actions/products";

export default async function NewProductPage() {
  const categories = await prisma.category.findMany({ orderBy: { name: "asc" } });

  return (
    <div>
      <h1 className="font-display text-3xl">Новый товар</h1>
      <div className="mt-6">
        <ProductForm categories={categories} action={createProduct} />
      </div>
    </div>
  );
}
