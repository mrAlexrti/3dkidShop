import Link from "next/link";
import { ChevronRight, Package } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { translations, type Locale } from "@/lib/i18n";
import { formatOrderReference } from "@/lib/order-reference";
import { getOrderStatusLabel } from "@/lib/order-status";
import { normalizeOrderStage, statusLabels } from "@/lib/status";
import { formatPrice } from "@/lib/utils";

export const accountOrderPreview = { id: true, number: true, createdAt: true, status: true, total: true } satisfies Prisma.OrderSelect;
export const accountOrderSummary = {
  ...accountOrderPreview, paidAt: true, paymentStatus: true, paymentProvider: true, paymentMethod: true,
  novaPoshtaTtn: true, novaPoshtaStatus: true, novaPoshtaStatusCode: true, novaPoshtaDeliveredAt: true,
} satisfies Prisma.OrderSelect;

type Preview = Prisma.OrderGetPayload<{ select: typeof accountOrderPreview }>;
type Summary = Prisma.OrderGetPayload<{ select: typeof accountOrderSummary }>;

export function AccountOrderList({ orders, locale }: { orders: readonly (Preview | Summary)[]; locale: Locale }) {
  const date = new Intl.DateTimeFormat(locale === "ua" ? "uk-UA" : "en-GB", { dateStyle: "medium", timeZone: "Europe/Kyiv" });
  const { account, checkout } = translations[locale];
  return <ul className="ac-order-list">{orders.map((order) => {
    const labels = "paymentStatus" in order ? statusLabels(order, locale) : null;
    return <li key={order.id}>
      <Link className="ac-order-link" href={`/account/orders/${order.id}`} prefetch={false}>
        <span className="ac-order-main">
          <span className="ac-mark" aria-hidden="true"><Package size={20} /></span>
          <span><strong>{formatOrderReference(order.number, locale)}</strong><time dateTime={order.createdAt.toISOString()}>{date.format(order.createdAt)}</time></span>
        </span>
        <span className="ac-order-result">
          <span className="ac-badge" data-stage={normalizeOrderStage(order.status)}>{getOrderStatusLabel(order.status, locale)}</span>
          <strong>{formatPrice(Number(order.total), "UAH")}</strong>
        </span>
        <ChevronRight className="ac-order-chevron" size={19} aria-hidden="true" />
        {labels && <dl className="ac-order-meta">
          <div><dt>{checkout.payment.title}</dt><dd>{labels.payment}</dd></div>
          <div><dt>{checkout.delivery.title}</dt><dd>{labels.delivery}</dd></div>
          {"novaPoshtaTtn" in order && order.novaPoshtaTtn && <div><dt>{account.tracking}</dt><dd>{order.novaPoshtaTtn}</dd></div>}
        </dl>}
      </Link>
    </li>;
  })}</ul>;
}
