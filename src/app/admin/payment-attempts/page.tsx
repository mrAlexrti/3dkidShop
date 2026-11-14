export const dynamic = "force-dynamic";

import Link from "next/link";
import { listPaymentAttempts } from "@/lib/admin/payment-attempts";
import { ATTEMPT_FILTERS, type AttemptSearchParams } from "@/lib/payments/attempt-diagnostics";
import { getT, getLocale } from "@/lib/i18n-server";

export default async function PaymentAttemptsPage({ searchParams }: { searchParams: Promise<AttemptSearchParams> }) {
  const result = await listPaymentAttempts(await searchParams);
  const translations = await getT();
  const t = translations.admin.paymentAttempts;
  const locale = await getLocale();
  const { filters, page, pages, total, attempts } = result;
  const dateFormat = new Intl.DateTimeFormat(locale === "ua" ? "uk-UA" : "en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });
  const date = (value: Date | null) => value ? <time dateTime={value.toISOString()}>{dateFormat.format(value)}</time> : t.notAvailable;
  const pageUrl = (target: number) => {
    const query = new URLSearchParams({ status: filters.status, page: String(target) });
    if (filters.q) query.set("q", filters.q);
    if (filters.from) query.set("from", filters.from);
    if (filters.to) query.set("to", filters.to);
    return `/admin/payment-attempts?${query}`;
  };
  const inputClass = "mt-1 min-h-11 w-full rounded-xl border border-pink-100 bg-white px-3 py-2 text-sm";
  return <div>
    <h1 className="font-display text-3xl">{translations.admin.nav.paymentAttempts}</h1>
    <p className="mt-3 max-w-3xl text-sm text-ink/70">{t.description}</p>
    <p className="mt-2 text-xs text-ink/60">{t.timezone}</p>
    <form method="get" action="/admin/payment-attempts" className="glass mt-6 grid gap-4 rounded-xl2 p-4 sm:grid-cols-2 xl:grid-cols-4">
      <label className="min-w-0 text-sm">{t.status}<select name="status" defaultValue={filters.status} className={inputClass}>
        {ATTEMPT_FILTERS.map((value) => <option key={value} value={value}>{value === "all" ? t.all : t.states[value]}</option>)}
      </select></label>
      <label className="min-w-0 text-sm">{t.search}<input name="q" type="search" maxLength={100} defaultValue={filters.q} className={inputClass} /></label>
      <label className="min-w-0 text-sm">{t.from}<input name="from" type="date" defaultValue={filters.from} className={inputClass} /></label>
      <label className="min-w-0 text-sm">{t.to}<input name="to" type="date" defaultValue={filters.to} className={inputClass} /></label>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2 xl:col-span-4">
        <button type="submit" className="min-h-11 rounded-xl bg-pink-500 px-5 py-2 text-sm text-white hover:bg-pink-600">{t.apply}</button>
        <Link href="/admin/payment-attempts" className="inline-flex min-h-11 items-center rounded-xl px-3 text-sm text-pink-600">{t.reset}</Link>
      </div>
    </form>
    {filters.invalid && <p role="alert" className="mt-4 text-sm text-red-700">{t.invalid}</p>}
    <p className="mt-5 text-sm text-ink/70">{t.total}: {total}</p>
    <div role="region" tabIndex={0} aria-label={t.table} className="glass mt-3 overflow-x-auto rounded-xl2 shadow-soft">
      <table className="w-full min-w-[1180px] text-left text-sm">
        <thead className="bg-pink-50/60 text-ink/60"><tr>
          {[t.created, t.attempt, t.customer, t.amount, t.provider, t.status, t.reference, t.invoice, t.expires, t.modified, t.nextCheck, t.reason].map((label) => <th scope="col" key={label} className="px-4 py-3">{label}</th>)}
        </tr></thead>
        <tbody>{attempts.map((attempt) => <tr key={attempt.id} className="border-t border-pink-100 align-top">
          <td className="px-4 py-3">{date(attempt.createdAt)}</td>
          <td className="max-w-52 break-all px-4 py-3 font-mono text-xs">{attempt.id}</td>
          <td className="max-w-52 break-words px-4 py-3">{attempt.customerName}</td>
          <td className="whitespace-nowrap px-4 py-3">{new Intl.NumberFormat(locale === "ua" ? "uk-UA" : "en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(attempt.amount))} {attempt.currency ?? t.notAvailable}</td>
          <td className="px-4 py-3">{t.providers[attempt.provider]}</td>
          <td className="min-w-48 px-4 py-3">
            {attempt.review && <span className="mb-2 block rounded-lg bg-amber-50 px-2 py-1 font-medium text-amber-800">{t.states.review}</span>}
            <span>{t.states[attempt.state]}</span>
            {attempt.state === "paid_unaccepted" && <p className="mt-2 text-xs text-amber-800">{t.paidWarning}</p>}
          </td>
          <td className="max-w-56 break-all px-4 py-3 font-mono text-xs">{attempt.reference ?? t.notAvailable}</td>
          <td className="max-w-52 break-all px-4 py-3 font-mono text-xs">{attempt.invoiceId ?? t.notAvailable}</td>
          <td className="px-4 py-3">{date(attempt.expiresAt)}</td>
          <td className="px-4 py-3">{date(attempt.modifiedAt)}</td>
          <td className="px-4 py-3">{attempt.nextCheckAt ? date(attempt.nextCheckAt) : t.noCheck}</td>
          <td className="min-w-48 px-4 py-3">{t.reasons[attempt.reason]}</td>
        </tr>)}
        {attempts.length === 0 && <tr><td colSpan={12} className="px-4 py-6 text-center text-ink/50">{t.empty}</td></tr>}
        </tbody>
      </table>
    </div>
    <p className="mt-4 max-w-3xl text-xs text-ink/60">{t.noCheckHelp}</p>
    <nav aria-label={t.pagination} className="mt-5 flex flex-wrap items-center gap-4 text-sm">
      {page > 1 && !filters.invalid && <Link className="inline-flex min-h-11 items-center text-pink-600" href={pageUrl(page - 1)}>{t.previous}</Link>}
      <span>{t.page} {page} {t.of} {pages}</span>
      {page < pages && !filters.invalid && <Link className="inline-flex min-h-11 items-center text-pink-600" href={pageUrl(page + 1)}>{t.next}</Link>}
    </nav>
  </div>;
}
