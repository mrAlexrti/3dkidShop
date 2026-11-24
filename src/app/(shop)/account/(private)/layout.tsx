import Link from "next/link";
import { getT } from "@/lib/i18n-server";
import { requireCustomer } from "@/lib/customer/pages";
import { signOutCustomer } from "@/lib/customer/actions";

export default async function PrivateAccountLayout({ children }: { children: React.ReactNode }) {
  await requireCustomer();
  const { account: t } = await getT();
  return <>
    <h1 className="font-display text-3xl">{t.title}</h1>
    <nav aria-label={t.title} className="flex flex-wrap gap-x-5 rounded-xl border bg-white px-4 text-sm font-semibold">
      {([["", t.overview], ["/profile", t.profile], ["/favorites", t.favorites], ["/orders", t.orders]] as const).map(([url, title]) =>
        <Link key={url} className="flex min-h-11 items-center hover:underline" href={`/account${url}`}>{title}</Link>)}
      <form action={signOutCustomer}><button className="min-h-11 text-pink-700 underline">{t.signOut}</button></form>
    </nav>
    {children}
  </>;
}
