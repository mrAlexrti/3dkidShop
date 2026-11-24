import Link from "next/link";
import { Package, PackagePlus } from "lucide-react";
import { AccountField, AccountForm } from "@/components/account/account-form";
import { AccountOrderList, accountOrderSummary } from "@/components/account/account-order-list";
import { AccountEmpty, AccountIntro, AccountPanel } from "@/components/account/account-surface";
import { requestAccountEmail } from "@/lib/customer/actions";
import { ownedOrders, requireCustomer } from "@/lib/customer/pages";
import { getLocale } from "@/lib/i18n-server";
import { translations } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";

const pageSize = 20;
export default async function CustomerOrders({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const [customer, locale, query] = await Promise.all([requireCustomer(), getLocale(), searchParams]);
  const requestedPage = Number(query.page);
  const page = Number.isSafeInteger(requestedPage) ? Math.min(1000, Math.max(1, requestedPage)) : 1;
  const t = translations[locale].account;
  const orders = await prisma.order.findMany({ where: ownedOrders(customer.id), orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * pageSize, take: pageSize + 1, select: accountOrderSummary });
  return <>
    <AccountIntro title={t.orders} description={t.ordersHint} />
    {orders.length ? <AccountOrderList orders={orders.slice(0, pageSize)} locale={locale} /> : <div className="ac-panel">
      <AccountEmpty title={t.emptyOrders} description={t.emptyOrdersHint} cta={t.continueShopping} icon={<Package size={26} />} />
    </div>}
    {(page > 1 || orders.length > pageSize) && <div className="ac-pagination">
      {page > 1 && <Link className="ac-button ac-button--soft" href={`?page=${page - 1}`} prefetch={false}>{t.earlier}</Link>}
      {orders.length > pageSize && <Link className="ac-button ac-button--soft" href={`?page=${page + 1}`} prefetch={false}>{t.later}</Link>}
    </div>}
    {customer.emailVerified && <AccountPanel title={t.claim} description={t.claimHint} mark={<PackagePlus size={21} />}>
      <AccountForm action={requestAccountEmail.bind(null, "claim")} button={t.sendLink}>
        <AccountField name="number" label={t.orderNumber} maxLength={128} />
      </AccountForm>
    </AccountPanel>}
  </>;
}
