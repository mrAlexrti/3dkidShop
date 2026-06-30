import { prisma } from "@/lib/prisma";
import { createCategory, deleteCategory } from "@/lib/actions/categories";
import { DeleteButton } from "@/components/admin/delete-button";
import { Button } from "@/components/ui/button";

export default async function AdminCategoriesPage() {
  const categories = await prisma.category.findMany({
    orderBy: { order: "asc" },
    include: { _count: { select: { products: true } } },
  });

  const inputClass =
    "w-full rounded-xl border border-ink/10 bg-white px-4 py-2.5 text-sm outline-none focus:border-pink-400";

  return (
    <div>
      <h1 className="font-display text-3xl">Категории</h1>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="glass rounded-xl2 p-6 shadow-soft lg:col-span-1">
          <h2 className="mb-4 font-display text-lg">Новая категория</h2>
          <form action={createCategory} className="space-y-3">
            <input name="name" placeholder="Название" required className={inputClass} />
            <input name="slug" placeholder="slug (url)" required className={inputClass} />
            <input name="imageUrl" placeholder="URL изображения" className={inputClass} />
            <textarea name="description" placeholder="Описание" rows={2} className={inputClass} />
            <Button type="submit" className="w-full">
              Создать
            </Button>
          </form>
        </div>

        <div className="glass overflow-hidden rounded-xl2 shadow-soft lg:col-span-2">
          <table className="w-full text-left text-sm">
            <thead className="bg-pink-50/60 text-ink/60">
              <tr>
                <th className="px-4 py-3">Название</th>
                <th className="px-4 py-3">Slug</th>
                <th className="px-4 py-3">Товаров</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {categories.map((c) => (
                <tr key={c.id} className="border-t border-pink-100">
                  <td className="px-4 py-3">{c.name}</td>
                  <td className="px-4 py-3 text-ink/50">{c.slug}</td>
                  <td className="px-4 py-3">{c._count.products}</td>
                  <td className="px-4 py-3 text-right">
                    <DeleteButton action={deleteCategory.bind(null, c.id)} />
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
