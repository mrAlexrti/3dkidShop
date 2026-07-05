export const dynamic = "force-dynamic";

import Link from "next/link";
import Image from "next/image";
import { prisma } from "@/lib/prisma";
import { formatPrice } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DeleteButton } from "@/components/admin/delete-button";
import { deleteProduct } from "@/lib/actions/products";
import { Plus, Pencil } from "lucide-react";

export default async function AdminProductsPage() {
  const products = await prisma.product.findMany({
    include: { images: true, category: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="font-display text-3xl">Товары</h1>
        <Link href="/admin/products/new">
          <Button>
            <Plus size={16} /> Добавить товар
          </Button>
        </Link>
      </div>

      <div className="glass mt-6 overflow-hidden rounded-xl2 shadow-soft">
        <table className="w-full text-left text-sm">
          <thead className="bg-pink-50/60 text-ink/60">
            <tr>
              <th className="px-4 py-3">Товар</th>
              <th className="px-4 py-3">Категория</th>
              <th className="px-4 py-3">Цена</th>
              <th className="px-4 py-3">Остаток</th>
              <th className="px-4 py-3">Статус</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id} className="border-t border-pink-100">
                <td className="flex items-center gap-3 px-4 py-3">
                  <div className="relative h-10 w-10 overflow-hidden rounded-lg bg-white">
                    {p.images[0] && <Image src={p.images[0].url} alt={p.name} fill className="object-cover" />}
                  </div>
                  {p.name}
                </td>
                <td className="px-4 py-3">{p.category.name}</td>
                <td className="px-4 py-3">{formatPrice(Number(p.price))}</td>
                <td className="px-4 py-3">{p.stock}</td>
                <td className="px-4 py-3">
                  <span className={p.isActive ? "text-green-600" : "text-ink/40"}>
                    {p.isActive ? "Активен" : "Скрыт"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1">
                    <Link href={`/admin/products/${p.id}/edit`} className="rounded-full p-2 hover:bg-pink-50">
                      <Pencil size={16} />
                    </Link>
                    <DeleteButton action={deleteProduct.bind(null, p.id)} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
