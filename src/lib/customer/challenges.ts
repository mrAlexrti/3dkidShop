import { Prisma, type CustomerChallenge } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isEmailConfigured, sendEmail } from "@/lib/notifications/email";
import { translations, type Locale } from "@/lib/i18n";
import { customerOrigin, newToken, tokenHash } from "./security";

export type EmailPurpose = "register" | "reset" | "verify" | "addPassword" | "emailOld" | "emailNew" | "claim";
type Challenge = { purpose: EmailPurpose | "linkGoogle"; email: string; userId?: string; orderId?: string; context?: string };

export async function issueChallenge(db: Prisma.TransactionClient, data: Challenge, minutes = 30) {
  const token = newToken();
  await db.customerChallenge.create({ data: { ...data, tokenHash: tokenHash(token), expires: new Date(Date.now() + minutes * 60_000) } });
  return token;
}

export async function sendChallenge(data: Challenge & { purpose: EmailPurpose }, locale: Locale) {
  if (!isEmailConfigured()) return false;
  const token = await issueChallenge(prisma, data, data.purpose === "claim" ? 30 : 20);
  const url = `${customerOrigin()}/account/confirm?mode=${data.purpose}#${token}`;
  const copy = translations[locale].account;
  // These messages contain static, localized copy and an internally generated URL.
  const result = await sendEmail({ to: data.email, subject: copy.emailSubject[data.purpose],
    html: `<p>${copy.emailSubject[data.purpose]}</p><p><a href="${url}">${copy.openLink}</a></p><p>${copy.emailFooter}</p>` });
  // A timeout or 5xx can arrive after Resend accepted the email.
  if (!result.sent && result.outcome !== "unknown") await prisma.customerChallenge.deleteMany({ where: { tokenHash: tokenHash(token) } });
  return result.sent;
}

export async function consumeChallenge(tx: Prisma.TransactionClient, hash: string, purpose: Challenge["purpose"], owner?: { id: string; context?: string }) {
  const [row] = await tx.$queryRaw<Pick<CustomerChallenge, "email" | "userId" | "orderId" | "context">[]>`
    DELETE FROM public."CustomerChallenge"
    WHERE "tokenHash" = ${hash} AND purpose = ${purpose} AND expires > (clock_timestamp() AT TIME ZONE 'UTC')
      ${owner ? Prisma.sql`AND "userId" = ${owner.id}` : Prisma.empty}
      ${owner?.context ? Prisma.sql`AND context = ${owner.context}` : Prisma.empty}
    RETURNING email, "userId", "orderId", context`;
  return row ?? null;
}
