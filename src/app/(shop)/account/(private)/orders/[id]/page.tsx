import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Package, Truck } from "lucide-react";
import { AccountPanel } from "@/components/account/account-surface";
import { ProductImage } from "@/components/product/product-image";
import { ownedOrders, requireCustomer } from "@/lib/customer/pages";
import { identifier } from "@/lib/customer/security";
import { getLocale } from "@/lib/i18n-server";
import { translations } from "@/lib/i18n";
import { formatOrderReference } from "@/lib/order-reference";
import { orderSizeLabel } from "@/lib/product-variants";
import { normalizeOrderStage, statusLabels } from "@/lib/status";
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
  const price = (value: { toString(): string }) => formatPrice(Number(value.toString()), "UAH", locale);
  return <article className="ac-detail" aria-label={t.orderDetails}>
    <Link href="/account/orders" className="ac-text-link" prefetch={false}><ArrowLeft size={18} aria-hidden="true" />{t.backToOrders}</Link>
    <header className="ac-intro ac-detail-header">
      <div><h1>{formatOrderReference(order.number, locale)}</h1><time dateTime={order.createdAt.toISOString()}>{date.format(order.createdAt)}</time></div>
      <span className="ac-badge" data-stage={normalizeOrderStage(order.status)}>{getOrderStatusLabel(order.status, locale)}</span>
    </header>
    <AccountPanel title={t.orderedItems} mark={<Package size={22} />}>
      <ul className="ac-detail-items">{order.items.map((item) => {
        const options = orderSizeLabel(item.optionsJson, locale);
        return <li key={item.id}>
          <div className="ac-detail-image"><ProductImage alt="" src={item.productImageUrl ?? item.product?.images[0]?.url ?? "/images/placeholder.svg"} fill sizes="60px" className="object-cover" /></div>
          <div><strong>{item.productName}</strong>{options && <p>{options}</p>}
            <p>{t.unitPrice} · {price(item.price)} × {item.quantity}</p></div>
        </li>;
      })}</ul>
      <p className="ac-detail-total"><span>{translations[locale].cart.total}</span><strong>{price(order.total)}</strong></p>
    </AccountPanel>
    <AccountPanel title={t.orderSummary} mark={<Truck size={22} />}>
      <dl className="ac-detail-meta">
        <div><dt>{t.recipient}</dt><dd>{order.customerName}<br />{order.customerPhone}{order.customerEmail && <><br />{order.customerEmail}</>}</dd></div>
        <div><dt>{checkout.payment.title}</dt><dd>{method && <>{paymentLabels[method]}<br /></>}{labels.payment}</dd></div>
        <div><dt>{checkout.delivery.title}</dt><dd>{delivery && <>{deliveryLabels[delivery]}<br /></>}
          {deliveryAddress}<br />{labels.delivery}</dd></div>
        {order.novaPoshtaTtn && <div><dt>{t.tracking}</dt><dd>{order.novaPoshtaTtn}</dd></div>}
      </dl>
    </AccountPanel>
  </article>;
}
