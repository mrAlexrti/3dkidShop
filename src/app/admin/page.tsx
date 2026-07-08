export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { getOrderStatusLabel } from "@/lib/order-status";
import { formatPrice } from "@/lib/utils";
import { getT } from "@/lib/i18n-server";
import { Package, FolderTree, ShoppingCart, TrendingUp } from "lucide-react";

export default async function AdminDashboard() {
  const t = await getT();
  const [productsCount, categoriesCount, ordersCount, orders] = await Promise.all([
    prisma.product.count(),
    prisma.category.count(),
    prisma.order.count(),
    prisma.order.findMany({ orderBy: { createdAt: "desc" }, take: 5 }),
  ]);

  const revenue = await prisma.order.aggregate({ _sum: { total: true } });

  const stats = [
    { label: t.admin.dashboard.products, value: productsCount, icon: Package },
    { label: t.admin.dashboard.categories, value: categoriesCount, icon: FolderTree },
    { label: t.admin.dashboard.orders, value: ordersCount, icon: ShoppingCart },
    { label: t.admin.dashboard.revenue, value: formatPrice(Number(revenue._sum.total ?? 0)), icon: TrendingUp },
  ];

  return (
    <div>
      <h1 className="font-display text-3xl">{t.admin.dashboard.title}</h1>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="glass rounded-xl2 p-5 shadow-soft">
            <s.icon className="text-pink-500" size={22} />
            <p className="mt-3 text-2xl font-semibold">{s.value}</p>
            <p className="text-sm text-ink/50">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="mt-10">
        <h2 className="mb-4 font-display text-xl">{t.admin.dashboard.recentOrders}</h2>
        <div className="glass overflow-hidden rounded-xl2 shadow-soft">
          <table className="w-full text-left text-sm">
            <thead className="bg-pink-50/60 text-ink/60">
              <tr>
                <th className="px-4 py-3">{t.admin.dashboard.thNumber}</th>
                <th className="px-4 py-3">{t.admin.dashboard.thCustomer}</th>
                <th className="px-4 py-3">{t.admin.dashboard.thStatus}</th>
                <th className="px-4 py-3">{t.admin.dashboard.thTotal}</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="border-t border-pink-100">
                  <td className="px-4 py-3">{o.number}</td>
                  <td className="px-4 py-3">{o.customerName}</td>
                  <td className="px-4 py-3">{getOrderStatusLabel(o.status)}</td>
                  <td className="px-4 py-3 font-medium">{formatPrice(Number(o.total))}</td>
                </tr>
              ))}
              {orders.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-ink/40">
                    {t.admin.dashboard.noOrders}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
