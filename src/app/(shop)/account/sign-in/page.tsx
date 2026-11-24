import Link from "next/link";
import { getT } from "@/lib/i18n-server";
import { customerSession } from "@/lib/customer/session";
import { customerEnabled, googleEnabled } from "@/lib/customer/security";
import { requestAccountEmail, signInCustomer } from "@/lib/customer/actions";
import { AccountField, AccountForm, GoogleForm } from "@/components/account/account-form";
import { redirect } from "next/navigation";

export default async function CustomerSignIn({ searchParams }: { searchParams: Promise<{ mode?: string; error?: string }> }) {
  const [{ account: t }, session, { mode, error }] = await Promise.all([getT(), customerSession(), searchParams]);
  if (session && !error) redirect("/account");
  const mailMode = mode === "register" || mode === "reset" ? mode : null;
  const action = mailMode ? requestAccountEmail.bind(null, mailMode) : signInCustomer;
  const title = mailMode ? t[mailMode] : t.signIn;
  return <section className="glass mx-auto max-w-md space-y-5 rounded-xl2 p-5 sm:p-8">
    <h1 className="font-display text-2xl">{title}</h1>
    {error && <p role="alert" className="text-sm">{t.googleError}</p>}
    {session ? <Link className="text-pink-700 underline" href="/account/profile">{t.profile}</Link> :
      customerEnabled() ? <>
        {mailMode && <p className="text-sm">{mailMode === "register" ? t.registerHint : t.resetHint}</p>}
        <AccountForm key={mode ?? "sign-in"} action={action} button={mailMode ? t.sendLink : t.signIn}>
          <AccountField label={t.email} name="email" type="email" autoComplete="email" maxLength={254} />
          {!mailMode && <AccountField label={t.password} name="password" type="password" autoComplete="current-password" maxLength={72} />}
        </AccountForm>
        {!mailMode && googleEnabled() && <div className="space-y-2">
          <GoogleForm />
          <p className="text-xs text-ink/70">{t.googleHint}</p>
        </div>}
        <nav className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-pink-700">
          {mailMode && <Link className="underline" href="/account/sign-in">{t.signIn}</Link>}
          {mailMode !== "register" && <Link className="underline" href="/account/sign-in?mode=register">{t.register}</Link>}
          {mailMode !== "reset" && <Link className="underline" href="/account/sign-in?mode=reset">{t.reset}</Link>}
        </nav>
      </> : <p role="status">{t.result.unavailable}</p>}
  </section>;
}
