export const dynamic = "force-dynamic";

import Link from "next/link";
import Image from "next/image";
import { prisma } from "@/lib/prisma";
import { formatPrice } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DeleteButton } from "@/components/admin/delete-button";
import { deleteProduct } from "@/lib/actions/products";
import { getT } from "@/lib/i18n-server";
import { Plus, Pencil } from "lucide-react";

export default async function AdminProductsPage() {
  const t = await getT();
  const tl = t.admin.productsList;
  const products = await prisma.product.findMany({
    include: { images: { orderBy: [{ order: "asc" }, { id: "asc" }] }, category: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 lg:gap-0">
        <h1 className="font-display text-3xl">{t.admin.nav.products}</h1>
        <Link href="/admin/products/new">
          <Button>
            <Plus size={16} /> {tl.add}
          </Button>
        </Link>
      </div>

      <div tabIndex={0} role="region" aria-label={t.admin.nav.products} className="glass mt-6 overflow-x-auto rounded-xl2 shadow-soft">
        <table className="w-full min-w-[720px] text-left text-sm lg:min-w-0">
          <thead className="bg-pink-50/60 text-ink/60">
            <tr>
              <th className="px-4 py-3">{tl.thProduct}</th>
              <th className="px-4 py-3">{tl.thCategory}</th>
              <th className="px-4 py-3">{tl.thPrice}</th>
              <th className="px-4 py-3">{t.admin.product.isOrderable}</th>
              <th className="px-4 py-3">{tl.thStatus}</th>
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
                  <span>
                    <span className="block font-medium">{p.name}</span>
                    <span className="block text-xs text-ink/45">{p.nameEn || "—"}</span>
                  </span>
                </td>
                <td className="px-4 py-3">{p.category.name}</td>
                <td className="px-4 py-3">{formatPrice(Number(p.price))}</td>
                <td className="px-4 py-3">{p.isOrderable ? tl.orderable : tl.unavailable}</td>
                <td className="px-4 py-3">
                  <span className={p.isActive ? "text-green-600" : "text-ink/40"}>
                    {p.isActive ? tl.active : tl.hidden}
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
