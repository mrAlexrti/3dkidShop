import { requireCustomer } from "@/lib/customer/pages";
import { getT } from "@/lib/i18n-server";

export default async function AccountOverview() {
  const [customer, { account: t }] = await Promise.all([requireCustomer(), getT()]);
  return <section className="glass space-y-2 rounded-xl2 p-5">
    <h2 className="font-display text-xl">{[customer.firstName, customer.lastName].filter(Boolean).join(" ") || t.overview}</h2>
    <p className="break-all text-sm text-ink/70">{customer.email}</p>
    <p>{t.welcome}</p>
  </section>;
}
