export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { CreateTtnButton } from "@/components/admin/create-ttn-button";
import { OrderStatusSelect } from "@/components/admin/order-status-select";
import { prisma } from "@/lib/prisma";
import { formatPrice } from "@/lib/utils";

function safeOptionLabel(optionsJson: string | null) {
  if (!optionsJson) return "—";

  try {
    const values = Object.values(JSON.parse(optionsJson));
    return values.length ? values.join(", ") : "—";
  } catch {
    return "—";
  }
}

function formatDateTime(value: Date | null) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("uk-UA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

function deliveryTypeLabel(value: string | null) {
  if (value === "np_warehouse") return "Відділення Нової Пошти";
  if (value === "np_parcel_locker") return "Поштомат Нової Пошти";
  if (value === "np_courier") return "Кур'єр Нової Пошти";
  return value || "—";
}

export default async function AdminOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const order = await prisma.order.findUnique({
    where: { id },
    include: { items: true },
  });
  if (!order) notFound();

  const hasNovaPoshtaDelivery = order.deliveryMethod?.startsWith("np_") ?? false;
  const canCreateTtn = hasNovaPoshtaDelivery && !order.novaPoshtaTtn;
  const trackingUrl = order.novaPoshtaTtn
    ? `https://novaposhta.ua/tracking/?cargo_number=${encodeURIComponent(order.novaPoshtaTtn)}`
    : null;

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-display text-3xl">Замовлення {order.number}</h1>
        <OrderStatusSelect orderId={order.id} status={order.status} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="glass rounded-xl2 p-6 shadow-soft lg:col-span-2">
          <h2 className="mb-4 font-display text-lg">Товари</h2>
          <table className="w-full text-left text-sm">
            <thead className="text-ink/50">
              <tr>
                <th className="pb-2">Товар</th>
                <th className="pb-2">Опції</th>
                <th className="pb-2">К-сть</th>
                <th className="pb-2">Сума</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((item) => (
                <tr key={item.id} className="border-t border-pink-100">
                  <td className="py-2">{item.productName}</td>
                  <td className="py-2 text-ink/50">{safeOptionLabel(item.optionsJson)}</td>
                  <td className="py-2">{item.quantity}</td>
                  <td className="py-2 font-medium">{formatPrice(Number(item.price) * item.quantity)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-4 space-y-1 border-t border-pink-100 pt-4 text-sm">
            <div className="flex justify-between">
              <span className="text-ink/50">Підсумок</span>
              <span>{formatPrice(Number(order.subtotal))}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink/50">Доставка</span>
              <span>{formatPrice(Number(order.shippingCost))}</span>
            </div>
            <div className="flex justify-between text-base font-semibold">
              <span>Разом</span>
              <span>{formatPrice(Number(order.total))}</span>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="glass rounded-xl2 p-6 shadow-soft">
            <h2 className="mb-4 font-display text-lg">Клієнт</h2>
            <dl className="space-y-2 text-sm">
              <div><dt className="text-ink/50">Ім&apos;я</dt><dd>{order.customerName}</dd></div>
              <div><dt className="text-ink/50">Email</dt><dd>{order.customerEmail}</dd></div>
              <div><dt className="text-ink/50">Телефон</dt><dd>{order.customerPhone}</dd></div>
              <div><dt className="text-ink/50">Адреса</dt><dd>{order.shippingAddress}, {order.city}, {order.postalCode}</dd></div>
              <div><dt className="text-ink/50">Оплата</dt><dd>{order.paymentMethod}</dd></div>
              {order.comment && <div><dt className="text-ink/50">Коментар</dt><dd>{order.comment}</dd></div>}
            </dl>
          </div>

          <div className="glass rounded-xl2 p-6 shadow-soft">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="font-display text-lg">Нова Пошта</h2>
              {order.novaPoshtaTtn && <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">ТТН створена</span>}
            </div>

            <dl className="space-y-2 text-sm">
              <div><dt className="text-ink/50">Тип доставки</dt><dd>{deliveryTypeLabel(order.deliveryMethod)}</dd></div>
              <div><dt className="text-ink/50">Місто</dt><dd>{order.novaPoshtaCity || order.city || "—"}</dd></div>
              <div><dt className="text-ink/50">City Ref</dt><dd className="break-all">{order.novaPoshtaCityRef || "—"}</dd></div>
              <div><dt className="text-ink/50">Відділення / поштомат</dt><dd>{order.novaPoshtaBranch || order.shippingAddress || "—"}</dd></div>
              <div><dt className="text-ink/50">Branch Ref</dt><dd className="break-all">{order.novaPoshtaBranchRef || "—"}</dd></div>
              <div><dt className="text-ink/50">Статус</dt><dd>{order.novaPoshtaStatus || "—"}</dd></div>
              <div><dt className="text-ink/50">Код статусу</dt><dd>{order.novaPoshtaStatusCode || "—"}</dd></div>
              <div><dt className="text-ink/50">Післяплата</dt><dd>{order.novaPoshtaCodStatus || "—"}</dd></div>
              <div><dt className="text-ink/50">Сума післяплати</dt><dd>{order.novaPoshtaCodAmount ? formatPrice(Number(order.novaPoshtaCodAmount)) : "—"}</dd></div>
              <div><dt className="text-ink/50">Доставлено</dt><dd>{formatDateTime(order.novaPoshtaDeliveredAt)}</dd></div>
              <div><dt className="text-ink/50">Створено</dt><dd>{formatDateTime(order.novaPoshtaCreatedAt)}</dd></div>
              <div><dt className="text-ink/50">Остання синхронізація</dt><dd>{formatDateTime(order.novaPoshtaSyncedAt)}</dd></div>
            </dl>

            {order.novaPoshtaTtn ? (
              <div className="mt-4 rounded-2xl bg-pink-50 p-4 text-sm">
                <p className="font-semibold text-ink">ТТН: {order.novaPoshtaTtn}</p>
                {trackingUrl && (
                  <Link href={trackingUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-hot underline">
                    Відкрити трекінг Нової Пошти
                  </Link>
                )}
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {!hasNovaPoshtaDelivery && (
                  <p className="rounded-2xl bg-yellow-50 p-3 text-sm text-yellow-800">
                    Для цього замовлення не вибрано доставку Новою Поштою.
                  </p>
                )}
                {canCreateTtn && <CreateTtnButton orderId={order.id} />}
              </div>
            )}

            {order.novaPoshtaError && (
              <p className="mt-4 rounded-2xl bg-red-50 p-3 text-sm text-red-700">
                Помилка Нової Пошти: {order.novaPoshtaError}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}