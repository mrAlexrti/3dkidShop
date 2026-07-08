export const dynamic = "force-dynamic";

import Link from "next/link";
import { Pencil } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { createCategory, deleteCategory } from "@/lib/actions/categories";
import { DeleteButton } from "@/components/admin/delete-button";
import { CategoryForm } from "@/components/admin/category-form";
import { getT } from "@/lib/i18n-server";

export default async function AdminCategoriesPage() {
  const t = await getT();
  const tc = t.admin.categories;

  const categories = await prisma.category.findMany({
    orderBy: [{ parentId: "asc" }, { order: "asc" }],
    include: {
      _count: { select: { products: true } },
      parent: { select: { name: true } },
    },
  });

  const parents = categories
    .filter((c) => c.parentId === null)
    .map((c) => ({ id: c.id, name: c.name }));

  return (
    <div>
      <h1 className="font-display text-3xl">{tc.title}</h1>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="glass rounded-xl2 p-6 shadow-soft lg:col-span-1">
          <h2 className="mb-4 font-display text-lg">{tc.newCategory}</h2>
          <CategoryForm parents={parents} action={createCategory} mode="create" />
        </div>

        <div className="glass overflow-hidden rounded-xl2 shadow-soft lg:col-span-2">
          <table className="w-full text-left text-sm">
            <thead className="bg-pink-50/60 text-ink/60">
              <tr>
                <th className="px-4 py-3">{tc.thImage}</th>
                <th className="px-4 py-3">{tc.thName}</th>
                <th className="px-4 py-3">{tc.thParent}</th>
                <th className="px-4 py-3">{tc.thProducts}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {categories.map((c) => (
                <tr key={c.id} className="border-t border-pink-100">
                  <td className="px-4 py-3">
                    <div className="h-10 w-10 overflow-hidden rounded-lg border border-pink-100 bg-pink-50">
                      {c.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={c.imageUrl} alt="" className="h-full w-full object-cover" />
                      ) : null}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{c.name}</div>
                    <div className="text-xs text-ink/40">{c.slug}</div>
                  </td>
                  <td className="px-4 py-3 text-ink/50">{c.parent?.name ?? "—"}</td>
                  <td className="px-4 py-3">{c._count.products}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <Link
                        href={`/admin/categories/${c.id}/edit`}
                        className="rounded-full p-2 text-ink/40 transition-colors hover:bg-pink-50 hover:text-pink-600"
                        title={t.admin.common.edit}
                      >
                        <Pencil size={16} />
                      </Link>
                      <DeleteButton action={deleteCategory.bind(null, c.id)} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
