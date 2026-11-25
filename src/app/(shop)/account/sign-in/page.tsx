import Link from "next/link";
import { getT } from "@/lib/i18n-server";
import { customerSession } from "@/lib/customer/session";
import { customerEnabled, googleEnabled } from "@/lib/customer/security";
import { requestAccountEmail, signInCustomer } from "@/lib/customer/actions";
import { AccountField, AccountForm, GoogleForm } from "@/components/account/account-form";
import { AccountAuthFrame } from "@/components/account/account-surface";
import { AccountEmailRequest } from "@/components/account/account-email-request";
import { redirect } from "next/navigation";

export default async function CustomerSignIn({ searchParams }: { searchParams: Promise<{ mode?: string; error?: string }> }) {
  const [{ account: t }, session, { mode, error }] = await Promise.all([getT(), customerSession(), searchParams]);
  if (session && !error) redirect("/account");
  const mailMode = mode === "register" || mode === "reset" ? mode : null;
  const title = mailMode ? t[mailMode] : t.signIn;
  const alternatives = <>
    {mailMode !== "reset" && googleEnabled() && <div className="ac-auth-google">
      <GoogleForm intent={mailMode === "register" ? "register" : "signin"} />
      <p>{t.googleHint}</p>
    </div>}
    <nav className="ac-auth-links" aria-label={t.title}>
      {mailMode && <Link href="/account/sign-in" prefetch={false}>{t.signIn}</Link>}
      {mailMode !== "register" && <Link href="/account/sign-in?mode=register" prefetch={false}>{t.register}</Link>}
      {mailMode !== "reset" && <Link href="/account/sign-in?mode=reset" prefetch={false}>{t.reset}</Link>}
    </nav>
  </>;
  return <AccountAuthFrame title={title} description={mailMode === "register" ? t.registerHint : mailMode === "reset" ? t.resetHint : t.authIntro}>
    {error && <p role="alert" className="ac-feedback">{t.googleError}</p>}
    {session ? <Link className="ac-text-link" href="/account/profile" prefetch={false}>{t.profile}</Link> :
      customerEnabled() ? mailMode ? <AccountEmailRequest key={mailMode} mode={mailMode} action={requestAccountEmail.bind(null, mailMode, null)}>
        {alternatives}
      </AccountEmailRequest> : <>
        <AccountForm action={signInCustomer} button={t.signIn} retainOnError>
          <AccountField label={t.email} name="email" type="email" autoComplete="email" maxLength={254} />
          <AccountField label={t.password} name="password" type="password" autoComplete="current-password" maxLength={128} />
        </AccountForm>
        {alternatives}
      </> : <p role="status" className="ac-feedback">{t.result.unavailable}</p>}
  </AccountAuthFrame>;
}
