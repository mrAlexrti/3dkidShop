import { AccountNav } from "@/components/account/account-nav";
import { requireCustomer } from "@/lib/customer/pages";

export default async function PrivateAccountLayout({ children }: { children: React.ReactNode }) {
  const customer = await requireCustomer();
  const parts = [customer.firstName?.trim(), customer.lastName?.trim()].filter((part): part is string => Boolean(part));
  const initials = (parts.length ? parts : [customer.email]).map((part) => Array.from(part)[0]).join("").toUpperCase();
  return <div className="ac-layout">
    <AccountNav display={parts.join(" ") || customer.email} initials={initials} />
    <div className="ac-content">{children}</div>
  </div>;
}
