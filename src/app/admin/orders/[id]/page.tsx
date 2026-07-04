import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { formatPrice } from "@/lib/utils";
import { OrderStatusSelect } from "@/components/admin/order-status-select";

export default async function AdminOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const order = await prisma.order.findUnique({
    where: { id },
    include: { items: true },
  });
  if (!order) notFound();

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="font-display text-3xl">Р—Р°РєР°Р· {order.number}</h1>
        <OrderStatusSelect orderId={order.id} status={order.status} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="glass rounded-xl2 p-6 shadow-soft lg:col-span-2">
          <h2 className="mb-4 font-display text-lg">РўРѕРІР°СЂС‹</h2>
          <table className="w-full text-left text-sm">
            <thead className="text-ink/50">
              <tr>
                <th className="pb-2">РўРѕРІР°СЂ</th>
                <th className="pb-2">РћРїС†РёРё</th>
                <th className="pb-2">РљРѕР»-РІРѕ</th>
                <th className="pb-2">РЎСѓРјРјР°</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((item) => (
                <tr key={item.id} className="border-t border-pink-100">
                  <td className="py-2">{item.productName}</td>
                  <td className="py-2 text-ink/50">
                    {item.optionsJson ? Object.values(JSON.parse(item.optionsJson)).join(", ") : "вЂ”"}
                  </td>
                  <td className="py-2">{item.quantity}</td>
                  <td className="py-2 font-medium">{formatPrice(Number(item.price) * item.quantity)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-4 space-y-1 border-t border-pink-100 pt-4 text-sm">
            <div className="flex justify-between">
              <span className="text-ink/50">РџРѕРґС‹С‚РѕРі</span>
              <span>{formatPrice(Number(order.subtotal))}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink/50">Р”РѕСЃС‚Р°РІРєР°</span>
              <span>{formatPrice(Number(order.shippingCost))}</span>
            </div>
            <div className="flex justify-between text-base font-semibold">
              <span>РС‚РѕРіРѕ</span>
              <span>{formatPrice(Number(order.total))}</span>
            </div>
          </div>
        </div>

        <div className="glass rounded-xl2 p-6 shadow-soft">
          <h2 className="mb-4 font-display text-lg">РљР»РёРµРЅС‚</h2>
          <dl className="space-y-2 text-sm">
            <div><dt className="text-ink/50">РРјСЏ</dt><dd>{order.customerName}</dd></div>
            <div><dt className="text-ink/50">Email</dt><dd>{order.customerEmail}</dd></div>
            <div><dt className="text-ink/50">РўРµР»РµС„РѕРЅ</dt><dd>{order.customerPhone}</dd></div>
            <div><dt className="text-ink/50">РђРґСЂРµСЃ</dt><dd>{order.shippingAddress}, {order.city}, {order.postalCode}</dd></div>
            <div><dt className="text-ink/50">РћРїР»Р°С‚Р°</dt><dd>{order.paymentMethod}</dd></div>
            {order.comment && <div><dt className="text-ink/50">РљРѕРјРјРµРЅС‚Р°СЂРёР№</dt><dd>{order.comment}</dd></div>}
          </dl>
        </div>
      </div>
    </div>
  );
}

