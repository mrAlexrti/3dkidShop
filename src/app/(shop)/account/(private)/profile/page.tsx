import { AccountField, AccountForm, GoogleForm } from "@/components/account/account-form";
import { getT } from "@/lib/i18n-server";
import { requireCustomer } from "@/lib/customer/pages";
import { requestAccountEmail, updateProfile } from "@/lib/customer/actions";
import { googleEnabled } from "@/lib/customer/security";
import { prisma } from "@/lib/prisma";

const box = "glass space-y-3 rounded-xl2 p-5";
export default async function CustomerProfile() {
  const [customer, { account: t }] = await Promise.all([requireCustomer(), getT()]);
  const authentication = await prisma.user.findFirstOrThrow({
    where: { id: customer.id, role: "CUSTOMER" }, select: { passwordHash: true, accounts: { where: { provider: "google" }, select: { id: true } } },
  });
  return <div className="grid gap-4 md:grid-cols-2">
    <section className={box}>
      <h2 className="font-display text-xl">{t.profile}</h2>
      <p className="break-all text-sm">{customer.email}</p>
      <AccountForm action={updateProfile} button={t.save} refresh>
        <AccountField name="firstName" label={t.firstName} defaultValue={customer.firstName} autoComplete="given-name" maxLength={100} required={false} />
        <AccountField name="lastName" label={t.lastName} defaultValue={customer.lastName} autoComplete="family-name" maxLength={100} required={false} />
        <AccountField name="phone" label={t.phone} defaultValue={customer.phone} autoComplete="tel" type="tel" maxLength={32} required={false} help={t.phoneHint} />
      </AccountForm>
    </section>
    <div className="space-y-4">
      {!customer.emailVerified ? <section className={box}>
        <h2 className="font-display text-xl">{t.verifyEmail}</h2>
        <AccountForm action={requestAccountEmail.bind(null, "verify")} button={t.sendLink} />
      </section> : <>
        <section className={box}>
          <h2 className="font-display text-xl">{t.changeEmail}</h2>
          <p className="text-sm">{t.emailHint}</p>
          <AccountForm action={requestAccountEmail.bind(null, "emailOld")} button={t.sendLink}>
            <AccountField name="email" label={t.email} type="email" maxLength={254} />
          </AccountForm>
        </section>
        {!authentication.passwordHash && <section className={box}>
          <h2 className="font-display text-xl">{t.addPassword}</h2>
          <p className="text-sm">{t.addPasswordHint}</p>
          <AccountForm action={requestAccountEmail.bind(null, "addPassword")} button={t.sendLink} />
        </section>}
        {googleEnabled() && !!authentication.passwordHash && !authentication.accounts.length && <section className={box}>
          <h2 className="font-display text-xl">{t.linkGoogle}</h2>
          <p className="text-sm">{t.linkHint}</p>
          <GoogleForm link />
        </section>}
      </>}
    </div>
  </div>;
}
