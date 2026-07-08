export const dynamic = "force-dynamic";

import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getOrderStatusLabel } from "@/lib/order-status";
import { formatPrice } from "@/lib/utils";
import { getT } from "@/lib/i18n-server";

export default async function AdminOrdersPage() {
  const t = await getT();
  const td = t.admin.dashboard;
  const orders = await prisma.order.findMany({ orderBy: { createdAt: "desc" } });

  return (
    <div>
      <h1 className="font-display text-3xl">{t.admin.nav.orders}</h1>

      <div className="glass mt-6 overflow-hidden rounded-xl2 shadow-soft">
        <table className="w-full text-left text-sm">
          <thead className="bg-pink-50/60 text-ink/60">
            <tr>
              <th className="px-4 py-3">{td.thNumber}</th>
              <th className="px-4 py-3">{td.thCustomer}</th>
              <th className="px-4 py-3">{td.thDate}</th>
              <th className="px-4 py-3">{td.thStatus}</th>
              <th className="px-4 py-3">{td.thTotal}</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id} className="border-t border-pink-100 hover:bg-pink-50/40">
                <td className="px-4 py-3">
                  <Link href={`/admin/orders/${o.id}`} className="font-medium text-pink-600">
                    {o.number}
                  </Link>
                </td>
                <td className="px-4 py-3">{o.customerName}</td>
                <td className="px-4 py-3 text-ink/50">{o.createdAt.toLocaleDateString("uk-UA")}</td>
                <td className="px-4 py-3">{getOrderStatusLabel(o.status)}</td>
                <td className="px-4 py-3 font-medium">{formatPrice(Number(o.total))}</td>
              </tr>
            ))}
            {orders.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-ink/40">
                  {td.noOrders}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
