export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { CreateTtnButton } from "@/components/admin/create-ttn-button";
import { OrderStatusSelect } from "@/components/admin/order-status-select";
import { TakeOrderIntoWorkButton } from "@/components/admin/take-order-into-work-button";
import { prisma } from "@/lib/prisma";
import { formatPrice } from "@/lib/utils";

import { orderSizeLabel } from "@/lib/product-variants";
import { OrderStatusSummary } from "@/components/admin/order-status-summary";
import { getLocale } from "@/lib/i18n-server";
import { translations } from "@/lib/i18n";
import { statusLabels } from "@/lib/status";

function safeOptionLabel(optionsJson: string | null) {
  return orderSizeLabel(optionsJson) || "—";
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
  const locale = await getLocale();
  const statusCopy = translations[locale].statuses;
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
      <div className="flex flex-col items-start justify-between gap-4 lg:flex-row lg:items-center">
        <h1 className="min-w-0 font-display text-3xl [overflow-wrap:anywhere]">Замовлення {order.number}</h1>
        <div className="flex flex-wrap items-center gap-3">
          <TakeOrderIntoWorkButton orderId={order.id} status={order.status} />
          <OrderStatusSelect orderId={order.id} status={order.status} />
        </div>
      </div>

      <div className="glass mt-6 rounded-xl2 p-4"><OrderStatusSummary order={order} locale={locale} /></div>
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="glass min-w-0 rounded-xl2 p-4 shadow-soft sm:p-6 lg:col-span-2">
          <h2 className="mb-4 font-display text-lg">Товари</h2>
          <div tabIndex={0} role="region" aria-label="Товари" className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-sm lg:min-w-0">
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
          </div>

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

        <div className="min-w-0 space-y-6 [overflow-wrap:anywhere]">
          <div className="glass rounded-xl2 p-4 shadow-soft sm:p-6">
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

          <div className="glass rounded-xl2 p-4 shadow-soft sm:p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 lg:flex-nowrap">
              <h2 className="font-display text-lg">Нова Пошта</h2>
              {order.novaPoshtaTtn && <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">ТТН створена</span>}
            </div>

            <dl className="space-y-2 text-sm">
              <div><dt className="text-ink/50">Тип доставки</dt><dd>{deliveryTypeLabel(order.deliveryMethod)}</dd></div>
              <div><dt className="text-ink/50">Місто</dt><dd>{order.novaPoshtaCity || order.city || "—"}</dd></div>
              <div><dt className="text-ink/50">City Ref</dt><dd className="break-all">{order.novaPoshtaCityRef || "—"}</dd></div>
              <div><dt className="text-ink/50">Відділення / поштомат</dt><dd>{order.novaPoshtaBranch || order.shippingAddress || "—"}</dd></div>
              <div><dt className="text-ink/50">Branch Ref</dt><dd className="break-all">{order.novaPoshtaBranchRef || "—"}</dd></div>
              <div><dt className="text-ink/50">{statusCopy.fields.delivery}</dt><dd>{statusLabels(order, locale).delivery}</dd></div>
              <div><dt className="text-ink/50">Сума післяплати</dt><dd>{order.novaPoshtaCodAmount ? formatPrice(Number(order.novaPoshtaCodAmount)) : "—"}</dd></div>
              <div><dt className="text-ink/50">Доставлено</dt><dd>{formatDateTime(order.novaPoshtaDeliveredAt)}</dd></div>
              <div><dt className="text-ink/50">Створено</dt><dd>{formatDateTime(order.novaPoshtaCreatedAt)}</dd></div>
              <div><dt className="text-ink/50">Остання синхронізація</dt><dd>{formatDateTime(order.novaPoshtaSyncedAt)}</dd></div>
            </dl>
            <details className="mt-4 text-sm">
              <summary className="cursor-pointer text-ink/60">{statusCopy.providerDetails}</summary>
              <dl className="mt-2 space-y-2">
                <div><dt className="text-ink/50">{statusCopy.providerStatus}</dt><dd>{order.novaPoshtaStatus || "—"}</dd></div>
                <div><dt className="text-ink/50">{statusCopy.providerCode}</dt><dd>{order.novaPoshtaStatusCode || "—"}</dd></div>
                <div><dt className="text-ink/50">{statusCopy.providerCod}</dt><dd>{order.novaPoshtaCodStatus || "—"}</dd></div>
              </dl>
            </details>

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
