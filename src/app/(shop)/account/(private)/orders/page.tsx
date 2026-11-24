import Link from "next/link";
import { AccountField, AccountForm } from "@/components/account/account-form";
import { requestAccountEmail } from "@/lib/customer/actions";
import { ownedOrders, requireCustomer } from "@/lib/customer/pages";
import { getLocale } from "@/lib/i18n-server";
import { translations } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { formatOrderReference } from "@/lib/order-reference";
import { getOrderStatusLabel } from "@/lib/order-status";
import { formatPrice } from "@/lib/utils";

const pageSize = 20;
export default async function CustomerOrders({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const [customer, locale, query] = await Promise.all([requireCustomer(), getLocale(), searchParams]);
  const requestedPage = Number(query.page);
  const page = Number.isSafeInteger(requestedPage) ? Math.min(1000, Math.max(1, requestedPage)) : 1;
  const t = translations[locale].account;
  const orders = await prisma.order.findMany({ where: ownedOrders(customer.id), orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * pageSize, take: pageSize + 1, select: { id: true, number: true, createdAt: true, total: true, status: true } });
  const date = new Intl.DateTimeFormat(locale === "ua" ? "uk-UA" : "en-GB", { dateStyle: "medium", timeZone: "Europe/Kyiv" });
  return <section className="space-y-4">
    <h2 className="font-display text-xl">{t.orders}</h2>
    {orders.length ? <ul className="space-y-2">{orders.slice(0, pageSize).map((order) =>
      <li key={order.id}><Link className="glass grid gap-x-4 gap-y-1 rounded-xl p-4 hover:underline sm:grid-cols-4" href={`/account/orders/${order.id}`}>
        <strong>{formatOrderReference(order.number, locale)}</strong><time dateTime={order.createdAt.toISOString()}>{date.format(order.createdAt)}</time>
        <span>{getOrderStatusLabel(order.status, locale)}</span><span>{formatPrice(Number(order.total), "UAH")}</span>
      </Link></li>)}</ul> : <p role="status">{t.emptyOrders}</p>}
    <div className="flex gap-5 text-pink-700">
      {page > 1 && <Link className="underline" href={`?page=${page - 1}`}>{t.earlier}</Link>}
      {orders.length > pageSize && <Link className="underline" href={`?page=${page + 1}`}>{t.later}</Link>}
    </div>
    {customer.emailVerified && <div className="glass max-w-md space-y-3 rounded-xl2 p-5">
      <h3 className="font-display text-lg">{t.claim}</h3><p className="text-sm">{t.claimHint}</p>
      <AccountForm action={requestAccountEmail.bind(null, "claim")} button={t.sendLink}>
        <AccountField name="number" label={t.orderNumber} maxLength={128} />
      </AccountForm>
    </div>}
  </section>;
}
