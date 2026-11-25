import { getT } from "@/lib/i18n-server";
import { confirmAccountEmail } from "@/lib/customer/actions";
import { AccountField, AccountForm } from "@/components/account/account-form";
import { AccountAuthFrame, AccountIntro } from "@/components/account/account-surface";
import { notFound } from "next/navigation";

export default async function ConfirmAccount({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  const [{ account: t }, { mode }] = await Promise.all([getT(), searchParams]);
  if (mode !== "register" && mode !== "reset" && mode !== "verify" && mode !== "addPassword" && mode !== "emailOld" && mode !== "emailNew" && mode !== "claim") notFound();
  const needsPassword = mode === "register" || mode === "reset" || mode === "addPassword";
  return <AccountAuthFrame>
    <AccountForm key={mode} action={confirmAccountEmail.bind(null, mode)} button={t.confirm} confirmMode={mode}
      intro={<AccountIntro title={t.emailSubject[mode]} description={t.confirmHint} />} token done={needsPassword || mode === "emailNew" ? "/account/sign-in" : "/account"}>
      {needsPassword && <>
        <AccountField label={t.newPassword} type="password" name="password" autoComplete="new-password" maxLength={128} help={t.passwordHint} />
        <AccountField label={t.confirmPassword} type="password" name="confirmPassword" autoComplete="new-password" maxLength={128} />
      </>}
    </AccountForm>
  </AccountAuthFrame>;
}
