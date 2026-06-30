import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatPrice } from "@/lib/utils";

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Ожидает",
  PAID: "Оплачен",
  PROCESSING: "В обработке",
  SHIPPED: "Отправлен",
  COMPLETED: "Завершён",
  CANCELLED: "Отменён",
};

export default async function AdminOrdersPage() {
  const orders = await prisma.order.findMany({ orderBy: { createdAt: "desc" } });

  return (
    <div>
      <h1 className="font-display text-3xl">Заказы</h1>

      <div className="glass mt-6 overflow-hidden rounded-xl2 shadow-soft">
        <table className="w-full text-left text-sm">
          <thead className="bg-pink-50/60 text-ink/60">
            <tr>
              <th className="px-4 py-3">№ заказа</th>
              <th className="px-4 py-3">Клиент</th>
              <th className="px-4 py-3">Дата</th>
              <th className="px-4 py-3">Статус</th>
              <th className="px-4 py-3">Сумма</th>
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
                <td className="px-4 py-3 text-ink/50">{o.createdAt.toLocaleDateString("ru-RU")}</td>
                <td className="px-4 py-3">{STATUS_LABELS[o.status]}</td>
                <td className="px-4 py-3 font-medium">{formatPrice(Number(o.total))}</td>
              </tr>
            ))}
            {orders.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-ink/40">
                  Заказов пока нет
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
