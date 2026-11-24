import { notFound } from "next/navigation";
import { ProductImage } from "@/components/product/product-image";
import { ownedOrders, requireCustomer } from "@/lib/customer/pages";
import { identifier } from "@/lib/customer/security";
import { getLocale } from "@/lib/i18n-server";
import { translations } from "@/lib/i18n";
import { formatOrderReference } from "@/lib/order-reference";
import { orderSizeLabel } from "@/lib/product-variants";
import { statusLabels } from "@/lib/status";
import { getOrderStatusLabel } from "@/lib/order-status";
import { isCashOnDelivery } from "@/lib/payments/payment-method";
import { prisma } from "@/lib/prisma";
import { formatPrice } from "@/lib/utils";
import { DELIVERY_LABELS, PAYMENT_LABELS } from "@/lib/validations/checkout";

export default async function CustomerOrderDetails({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, customer, locale] = await Promise.all([params, requireCustomer(), getLocale()]);
  if (!identifier.safeParse(id).success) notFound();
  const order = await prisma.order.findFirst({
    where: { id, ...ownedOrders(customer.id) },
    select: { number: true, createdAt: true, total: true, status: true, paymentMethod: true, paymentProvider: true, paymentStatus: true, paidAt: true,
      deliveryMethod: true, shippingAddress: true, novaPoshtaCity: true, novaPoshtaBranch: true, novaPoshtaTtn: true, novaPoshtaStatus: true,
      novaPoshtaStatusCode: true, novaPoshtaDeliveredAt: true, customerName: true, customerPhone: true, customerEmail: true,
      items: { orderBy: { id: "asc" }, select: { id: true, productName: true, productImageUrl: true, quantity: true, price: true, optionsJson: true,
        product: { select: { images: { where: { colorValueId: null }, orderBy: [{ order: "asc" }, { id: "asc" }], take: 1, select: { url: true } } } } } } },
  });
  if (!order) notFound();
  const { account: t, checkout } = translations[locale];
  const labels = statusLabels(order, locale);
  const method = isCashOnDelivery(order.paymentMethod) ? "cash_on_delivery" :
    (Object.keys(PAYMENT_LABELS) as (keyof typeof PAYMENT_LABELS)[]).find((key) => PAYMENT_LABELS[key] === order.paymentMethod || key === order.paymentMethod);
  const delivery = (Object.keys(DELIVERY_LABELS) as (keyof typeof DELIVERY_LABELS)[]).find((key) => key === order.deliveryMethod || DELIVERY_LABELS[key] === order.deliveryMethod);
  const deliveryAddress = order.novaPoshtaBranch ? [order.novaPoshtaCity, order.novaPoshtaBranch].filter(Boolean).join(", ") :
    order.shippingAddress || order.novaPoshtaCity;
  const paymentLabels = { card_online: checkout.payment.card, cash_on_delivery: checkout.payment.cash, pay_on_pickup: checkout.payment.onPickup };
  const deliveryLabels = { np_warehouse: checkout.delivery.warehouse, np_parcel_locker: checkout.delivery.locker, np_courier: checkout.delivery.courier };
  const date = new Intl.DateTimeFormat(locale === "ua" ? "uk-UA" : "en-GB", { dateStyle: "long", timeZone: "Europe/Kyiv" });
  const price = (value: { toString(): string }) => formatPrice(Number(value.toString()), "UAH");
  return <article aria-label={t.orderDetails} className="glass space-y-5 rounded-xl2 p-5">
    <header><h2 className="font-display text-xl">{formatOrderReference(order.number, locale)}</h2>
      <p>{date.format(order.createdAt)} · {getOrderStatusLabel(order.status, locale)}</p></header>
    <ul className="space-y-3">{order.items.map((item) => <li key={item.id} className="flex flex-wrap items-center gap-3 border-b border-ink/10 pb-3">
      <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg"><ProductImage alt="" src={item.productImageUrl ?? item.product?.images[0]?.url ?? "/images/placeholder.svg"} fill sizes="56px" className="object-cover" /></div>
      <div className="min-w-0 flex-1"><strong>{item.productName}</strong><p>{orderSizeLabel(item.optionsJson, locale)}</p>
        <p className="text-sm">{t.unitPrice} · {price(item.price)} × {item.quantity}</p></div>
    </li>)}</ul>
    <dl className="grid gap-3 text-sm sm:grid-cols-2">
      <div><dt className="font-semibold">{t.recipient}</dt><dd>{order.customerName}<br />{order.customerPhone}{order.customerEmail && <><br /><span className="break-all">{order.customerEmail}</span></>}</dd></div>
      <div><dt className="font-semibold">{checkout.payment.title}</dt><dd>{method && <>{paymentLabels[method]}<br /></>}{labels.payment}</dd></div>
      <div><dt className="font-semibold">{checkout.delivery.title}</dt><dd>{delivery && <>{deliveryLabels[delivery]}<br /></>}
        {deliveryAddress}<br />{labels.delivery}</dd></div>
      {order.novaPoshtaTtn && <div><dt className="font-semibold">{t.tracking}</dt><dd>{order.novaPoshtaTtn}</dd></div>}
      <div><dt className="font-semibold">{translations[locale].cart.total}</dt><dd>{price(order.total)}</dd></div>
    </dl>
  </article>;
}
