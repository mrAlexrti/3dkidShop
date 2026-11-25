import { customerCopy } from "./copy";
import { renderBrandedEmail } from "@/lib/notifications/branded-email";
import type { Locale } from "@/lib/i18n";

export const emailPurposes = ["register", "reset", "verify", "addPassword", "emailOld", "emailNew", "claim"] as const;
export type EmailPurpose = (typeof emailPurposes)[number];

export const challengeMinutes = (purpose: EmailPurpose) => purpose === "claim" ? 30 : 20;

export function renderChallengeEmail(purpose: EmailPurpose, locale: Locale, url: string) {
  const copy = customerCopy[locale];
  const subject = copy.emailSubject[purpose];
  return {
    subject,
    html: renderBrandedEmail({ locale, title: subject, intro: copy.emailBody[purpose],
      action: { label: copy.openLink, url, fallback: true }, note: copy.emailExpiry(challengeMinutes(purpose)) }),
  };
}
