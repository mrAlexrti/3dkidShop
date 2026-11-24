import { AccountField, AccountForm, GoogleForm } from "@/components/account/account-form";
import { AccountIntro, AccountPanel } from "@/components/account/account-surface";
import { BadgeCheck, KeyRound, Link2, Mail, ShieldCheck, UserRound } from "lucide-react";
import { getT } from "@/lib/i18n-server";
import { requireCustomer } from "@/lib/customer/pages";
import { requestAccountEmail, updateProfile } from "@/lib/customer/actions";
import { googleEnabled } from "@/lib/customer/security";
import { prisma } from "@/lib/prisma";

export default async function CustomerProfile() {
  const [customer, { account: t }] = await Promise.all([requireCustomer(), getT()]);
  const authentication = await prisma.user.findFirstOrThrow({
    where: { id: customer.id, role: "CUSTOMER" }, select: { passwordHash: true, accounts: { where: { provider: "google" }, select: { id: true } } },
  });
  const connected = authentication.accounts.length > 0;
  return <>
    <AccountIntro title={t.myProfile} description={t.profileHint} />
    <AccountPanel title={t.personalDetails} mark={<UserRound size={22} />}>
      <AccountForm action={updateProfile} button={t.save} refresh>
        <div className="ac-field-pair">
          <AccountField name="firstName" label={t.firstName} defaultValue={customer.firstName} autoComplete="given-name" maxLength={100} required={false} />
          <AccountField name="lastName" label={t.lastName} defaultValue={customer.lastName} autoComplete="family-name" maxLength={100} required={false} />
        </div>
        <AccountField name="phone" label={t.phone} defaultValue={customer.phone} autoComplete="tel" type="tel" maxLength={32} required={false} help={t.phoneHint} />
      </AccountForm>
    </AccountPanel>
    <AccountPanel title={t.security} mark={<ShieldCheck size={22} />}>
      <div className="ac-security-rows">
        <div className="ac-security-row">
          <div className="ac-security-identity"><Mail size={20} aria-hidden="true" /><div><strong>{t.accountEmail}</strong><p>{customer.email}</p></div></div>
          <span className="ac-badge" data-stage={customer.emailVerified ? "COMPLETED" : "PENDING"}>{customer.emailVerified && <BadgeCheck size={15} aria-hidden="true" />}{customer.emailVerified ? t.emailVerified : t.emailUnverified}</span>
        </div>
        <div className="ac-security-row">
          <div className="ac-security-identity"><KeyRound size={20} aria-hidden="true" /><strong>{t.password}</strong></div>
          <span className="ac-badge" data-stage={authentication.passwordHash ? "COMPLETED" : "PENDING"}>{authentication.passwordHash ? t.passwordSet : t.passwordNotSet}</span>
        </div>
        <div className="ac-security-row">
          <div className="ac-security-identity"><Link2 size={20} aria-hidden="true" /><strong>{t.googleProvider}</strong></div>
          <span className="ac-badge" data-stage={connected ? "COMPLETED" : "PENDING"}>{connected ? t.googleConnected : t.googleNotConnected}</span>
        </div>
      </div>
      {!customer.emailVerified ? <div className="ac-security-action">
        <h3>{t.verifyEmail}</h3><AccountForm action={requestAccountEmail.bind(null, "verify")} button={t.sendLink} />
      </div> : <>
        <div className="ac-security-action">
          <h3>{t.changeEmail}</h3><p>{t.emailHint}</p>
          <AccountForm action={requestAccountEmail.bind(null, "emailOld")} button={t.sendLink}>
            <AccountField name="email" label={t.newEmail} type="email" maxLength={254} />
          </AccountForm>
        </div>
        {!authentication.passwordHash && <div className="ac-security-action">
          <h3>{t.addPassword}</h3><p>{t.addPasswordHint}</p>
          <AccountForm action={requestAccountEmail.bind(null, "addPassword")} button={t.sendLink} />
        </div>}
        {googleEnabled() && !!authentication.passwordHash && !connected && <div className="ac-security-action">
          <h3>{t.linkGoogle}</h3><p>{t.linkHint}</p>
          <GoogleForm link />
        </div>}
      </>}
    </AccountPanel>
  </>;
}
