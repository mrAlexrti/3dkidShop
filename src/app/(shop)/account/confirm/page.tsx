import { getT } from "@/lib/i18n-server";
import { confirmAccountEmail } from "@/lib/customer/actions";
import { AccountField, AccountForm } from "@/components/account/account-form";
import { AccountAuthFrame } from "@/components/account/account-surface";
import { notFound } from "next/navigation";

export default async function ConfirmAccount({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  const [{ account: t }, { mode }] = await Promise.all([getT(), searchParams]);
  if (mode !== "register" && mode !== "reset" && mode !== "verify" && mode !== "addPassword" && mode !== "emailOld" && mode !== "emailNew" && mode !== "claim") notFound();
  const needsPassword = mode === "register" || mode === "reset" || mode === "addPassword";
  return <AccountAuthFrame title={t.emailSubject[mode]} description={t.confirmHint}>
    <AccountForm action={confirmAccountEmail.bind(null, mode)} button={t.confirm} token done={needsPassword || mode === "emailNew" ? "/account/sign-in" : "/account"}>
      {needsPassword && <AccountField label={t.newPassword} type="password" name="password" autoComplete="new-password" maxLength={72} help={t.passwordHint} />}
    </AccountForm>
  </AccountAuthFrame>;
}
