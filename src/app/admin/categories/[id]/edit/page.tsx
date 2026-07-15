export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { updateCategory } from "@/lib/actions/categories";
import { CategoryForm } from "@/components/admin/category-form";
import { getT } from "@/lib/i18n-server";

export default async function EditCategoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const t = await getT();

  const [category, topLevel] = await Promise.all([
    prisma.category.findUnique({ where: { id } }),
    prisma.category.findMany({
      where: { parentId: null },
      orderBy: { order: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  if (!category) notFound();

  // Категория не может быть родителем самой себе.
  const parents = topLevel.filter((c) => c.id !== id);

  return (
    <div className="max-w-xl">
      <Link
        href="/admin/categories"
        className="mb-4 inline-flex items-center gap-2 text-sm text-ink/60 transition-colors hover:text-pink-600"
      >
        <ArrowLeft size={16} /> {t.admin.common.back}
      </Link>

      <h1 className="font-display text-3xl">{t.admin.categories.editCategory}</h1>

      <div className="glass mt-6 rounded-xl2 p-6 shadow-soft">
        <CategoryForm
          parents={parents}
          defaults={{
            name: category.name,
            nameEn: category.nameEn,
            slug: category.slug,
            imageUrl: category.imageUrl,
            description: category.description,
            parentId: category.parentId,
            order: category.order,
          }}
          action={updateCategory.bind(null, id)}
          mode="edit"
        />
      </div>
    </div>
  );
}
