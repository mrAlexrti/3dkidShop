export const dynamic = "force-dynamic";

import Link from "next/link";
import { listPaymentAttempts } from "@/lib/admin/payment-attempts";
import { ATTEMPT_FILTERS, type AttemptSearchParams } from "@/lib/payments/attempt-diagnostics";
import { getT, getLocale } from "@/lib/i18n-server";
import { formatManagerDateTime } from "@/lib/date-time";
import { phoneHref, emailHref } from "@/lib/admin/attempt-contacts";

export default async function PaymentAttemptsPage({ searchParams }: { searchParams: Promise<AttemptSearchParams> }) {
  const result = await listPaymentAttempts(await searchParams);
  const translations = await getT();
  const t = translations.admin.paymentAttempts;
  const locale = await getLocale();
  const { filters, page, pages, total, attempts } = result;
  const date = (value: Date | null) => value ? <time dateTime={value.toISOString()}>{formatManagerDateTime(value, locale)}</time> : t.notAvailable;
  const contact = (value: string | null, href: string | null) => href
    ? <a href={href} className="inline-flex min-h-11 items-center text-pink-600 underline [overflow-wrap:anywhere]">{value}</a>
    : value ?? t.notAvailable;
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
    <section aria-label={t.table} className="mt-3 space-y-4">
      {attempts.map((attempt) => <article key={attempt.id} className="glass min-w-0 rounded-xl2 p-4 text-sm shadow-soft [overflow-wrap:anywhere] sm:p-6">
        <div className="grid min-w-0 gap-5 md:grid-cols-2 xl:grid-cols-3">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold">{attempt.customerName ?? t.notAvailable}</h2>
            <dl className="mt-2">
              <div><dt className="text-xs text-ink/60">{t.phone}</dt><dd>{contact(attempt.customerPhone, phoneHref(attempt.customerPhone))}</dd></div>
              <div><dt className="text-xs text-ink/60">{t.email}</dt><dd>{contact(attempt.customerEmail, emailHref(attempt.customerEmail))}</dd></div>
            </dl>
          </div>
          <dl className="min-w-0 space-y-3">
            <div><dt className="text-xs text-ink/60">{t.created}</dt><dd className="mt-1">{date(attempt.createdAt)}</dd></div>
            <div><dt className="text-xs text-ink/60">{t.amount}</dt><dd className="mt-1 text-lg font-semibold">{new Intl.NumberFormat(locale === "ua" ? "uk-UA" : "en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(attempt.amount))} {attempt.currency ?? t.notAvailable}</dd></div>
          </dl>
          <dl className="min-w-0 space-y-3 md:col-span-2 xl:col-span-1">
            <div><dt className="text-xs text-ink/60">{t.status}</dt><dd className="mt-1">
              {attempt.review && <span className="mb-2 block rounded-lg bg-amber-50 px-2 py-1 font-medium text-amber-800">{t.states.review}</span>}
              <span className="font-medium">{t.states[attempt.state]}</span>
              {attempt.state === "paid_unaccepted" && <p className="mt-2 text-xs text-amber-800">{t.paidWarning}</p>}
            </dd></div>
            <div><dt className="text-xs text-ink/60">{t.reason}</dt><dd className="mt-1">{t.reasons[attempt.reason]}</dd></div>
          </dl>
        </div>
        <details className="mt-4 border-t border-pink-100 pt-2">
          <summary className="min-h-11 cursor-pointer py-3 font-medium text-pink-600">{t.details}</summary>
          <dl className="grid min-w-0 gap-4 py-3 sm:grid-cols-2 xl:grid-cols-3">
            <div><dt className="text-ink/60">{t.attempt}</dt><dd className="mt-1 break-all font-mono text-xs">{attempt.id}</dd></div>
            <div><dt className="text-ink/60">{t.reference}</dt><dd className="mt-1 break-all font-mono text-xs">{attempt.reference ?? t.notAvailable}</dd></div>
            <div><dt className="text-ink/60">{t.invoice}</dt><dd className="mt-1 break-all font-mono text-xs">{attempt.invoiceId ?? t.notAvailable}</dd></div>
            <div><dt className="text-ink/60">{t.provider}</dt><dd className="mt-1">{t.providers[attempt.provider]}</dd></div>
            <div><dt className="text-ink/60">{t.modified}</dt><dd className="mt-1">{date(attempt.modifiedAt)}</dd></div>
            <div><dt className="text-ink/60">{t.expires}</dt><dd className="mt-1">{date(attempt.expiresAt)}</dd></div>
            <div><dt className="text-ink/60">{t.nextCheck}</dt><dd className="mt-1">{attempt.nextCheckAt ? date(attempt.nextCheckAt) : t.noCheck}</dd></div>
            <div><dt className="text-ink/60">{t.diagnostic}</dt><dd className="mt-1 break-all font-mono text-xs">{attempt.reason === "none" ? t.notAvailable : attempt.reason}</dd></div>
          </dl>
        </details>
      </article>)}
      {attempts.length === 0 && <p className="glass rounded-xl2 p-6 text-center text-sm text-ink/50">{t.empty}</p>}
    </section>
    <p className="mt-4 max-w-3xl text-xs text-ink/60">{t.noCheckHelp}</p>
    <nav aria-label={t.pagination} className="mt-5 flex flex-wrap items-center gap-4 text-sm">
      {page > 1 && !filters.invalid && <Link className="inline-flex min-h-11 items-center text-pink-600" href={pageUrl(page - 1)}>{t.previous}</Link>}
      <span>{t.page} {page} {t.of} {pages}</span>
      {page < pages && !filters.invalid && <Link className="inline-flex min-h-11 items-center text-pink-600" href={pageUrl(page + 1)}>{t.next}</Link>}
    </nav>
  </div>;
}
