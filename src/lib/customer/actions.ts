"use server";

import { AuthError } from "@auth/core/errors";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { Prisma, type User } from "@prisma/client";
import { z } from "zod";
import { getLocale } from "@/lib/i18n-server";
import { isEmailConfigured } from "@/lib/notifications/email";
import { prisma } from "@/lib/prisma";
import { customerVisibleOrder } from "./pages";
import { customerSignInUrl } from "./auth";
import { consumeChallenge, sendChallenge, type EmailPurpose } from "./challenges";
import { emailPurposes } from "./email-template";
import { activeCustomerSession, customerSession, lockCustomer, revokeCustomerSession } from "./session";
import { customerOrigin, customerPost, emailInput, hashPassword, identifier, passwordFits, rateLimit, tokenHash, tokenInput } from "./security";
import { passwordCreationError } from "./password";

export type AccountResult = "ok" | "sent" | "invalid" | "failed" | "signinError" | "rate" | "unavailable" | "passwordRequirements" | "passwordMismatch";
const profileInput = z.object({
  firstName: z.string().trim().max(100), lastName: z.string().trim().max(100),
  phone: z.string().trim().max(32).refine((value) => !value || (/^[+\d\s()-]+$/.test(value) && /^\d{10,15}$/.test(value.replace(/\D/g, "")))),
});
const needsPassword = new Set(["register", "reset", "addPassword"]);

function resetContext(user: { passwordHash: string | null; emailVerified: Date | null }) {
  return tokenHash(JSON.stringify([user.passwordHash, user.emailVerified]));
}

function scheduleEmail(data: Parameters<typeof sendChallenge>[0], locale: Awaited<ReturnType<typeof getLocale>>) {
  after(async () => {
    try { await sendChallenge(data, locale); }
    catch { console.warn("Customer email request failed"); }
  });
}

export async function signInCustomer(_: AccountResult | null, data: FormData): Promise<AccountResult> {
  if (!await customerPost()) return "unavailable";
  if (!(data instanceof FormData)) return "invalid";
  const email = emailInput.safeParse(data.get("email"));
  const password = data.get("password");
  if (!email.success || typeof password !== "string" || !passwordFits(password)) return "signinError";
  try {
    if (await customerSignInUrl("credentials", { email: email.data, password }) === `${customerOrigin()}/account`) redirect("/account");
  } catch (error) {
    if (error instanceof AuthError) return "signinError";
    throw error;
  }
  return "signinError";
}

export async function signOutCustomer() {
  if (!await customerPost()) return;
  await revokeCustomerSession();
  redirect("/account/sign-in");
}

export async function updateProfile(_: AccountResult | null, data: FormData): Promise<AccountResult> {
  if (!await customerPost()) return "unavailable";
  if (!(data instanceof FormData)) return "invalid";
  const session = await customerSession();
  if (!session) return "invalid";
  const input = profileInput.safeParse({ firstName: data.get("firstName"), lastName: data.get("lastName"), phone: data.get("phone") });
  if (!input.success) return "invalid";
  const result = await prisma.$transaction(async (tx) => {
    if (!await lockCustomer(tx, session.id) || !await activeCustomerSession(tx, session.id, session.binding)) return false;
    await tx.user.update({ where: { id: session.id }, data: {
      firstName: input.data.firstName || null, lastName: input.data.lastName || null, phone: input.data.phone || null,
    }, select: { id: true } });
    return true;
  });
  return result ? "ok" : "invalid";
}

export async function requestAccountEmail(mode: "register" | "reset" | "verify" | "addPassword" | "emailOld" | "claim", _: AccountResult | null, data: FormData): Promise<AccountResult> {
  if (!await customerPost() || !isEmailConfigured()) return "unavailable";
  if (!(data instanceof FormData)) return "invalid";
  const locale = await getLocale();
  if (mode === "register" || mode === "reset") {
    const email = emailInput.safeParse(data.get("email"));
    if (!email.success) return "invalid";
    if (!await rateLimit(`email:${mode}`, email.data, 5)) return "sent";
    const [user] = await prisma.$queryRaw<Pick<User, "id" | "role" | "passwordHash" | "emailVerified">[]>`
      SELECT id, role, "passwordHash", "emailVerified" FROM public."User" WHERE lower(email) = ${email.data}`;
    if (mode === "register" && !user) scheduleEmail({ email: email.data, purpose: mode }, locale);
    if (mode === "reset" && user?.role === "CUSTOMER" && user.passwordHash && user.emailVerified) {
      scheduleEmail({ email: email.data, purpose: mode, userId: user.id, context: resetContext(user) }, locale);
    }
    return "sent";
  }
  const session = await customerSession();
  if (!session || !["verify", "emailOld", "addPassword", "claim"].includes(mode)) return "invalid";
  if (!await rateLimit(`email:${mode}`, session.email, 5)) return "rate";
  const common = { email: session.email, userId: session.id, context: session.binding };
  if (mode === "verify") {
    if (session.emailVerified) return "invalid";
    return await sendChallenge({ ...common, purpose: mode }, locale) ? "sent" : "failed";
  }
  if (!session.emailVerified) return "invalid";
  if (mode === "addPassword") {
    const user = await prisma.user.findUnique({ where: { id: session.id }, select: { passwordHash: true } });
    if (!user || user.passwordHash) return "invalid";
    return await sendChallenge({ ...common, purpose: mode }, locale) ? "sent" : "failed";
  }
  if (mode === "emailOld") {
    const email = emailInput.safeParse(data.get("email"));
    if (!email.success || email.data === session.email) return "invalid";
    // The current mailbox authorizes this precise destination.
    return await sendChallenge({ ...common, purpose: mode, context: JSON.stringify([session.binding, email.data]) }, locale) ? "sent" : "failed";
  }
  const number = identifier.safeParse(data.get("number"));
  if (!number.success) return "invalid";
  const order = await prisma.order.findFirst({
    where: { number: number.data, customerId: null,
      customerEmail: { equals: session.email, mode: "insensitive" }, ...customerVisibleOrder },
    select: { id: true },
  });
  if (order) scheduleEmail({ ...common, purpose: "claim", orderId: order.id }, locale);
  return "sent";
}

export async function confirmAccountEmail(mode: EmailPurpose, _: AccountResult | null, data: FormData): Promise<AccountResult> {
  if (!await customerPost()) return "unavailable";
  if (!(data instanceof FormData)) return "invalid";
  const purpose = z.enum(emailPurposes).safeParse(mode);
  const token = tokenInput.safeParse(data.get("token"));
  if (!purpose.success || !token.success) return "invalid";
  const password = needsPassword.has(mode) ? data.get("password") : null;
  if (needsPassword.has(mode)) {
    const error = passwordCreationError(password, data.get("confirmPassword"));
    if (error) return error;
  }
  const publicProof = mode === "register" || mode === "reset";
  const session = publicProof ? null : await customerSession();
  if (!publicProof && !session) return "invalid";
  const digest = tokenHash(token.data);
  if (!await rateLimit("confirm", session ? tokenHash(`${digest}:${session.binding}`) : digest, 8)) return "rate";
  const owner = session ? { id: session.id, context: mode === "emailOld" || mode === "emailNew" ? undefined : session.binding } : undefined;
  // Keep bcrypt out of the transaction and skip it for invalid or expired proofs.
  if (needsPassword.has(mode) && !await prisma.customerChallenge.findFirst({
    where: { tokenHash: digest, purpose: mode, expires: { gt: new Date() }, userId: owner?.id, context: owner?.context }, select: { tokenHash: true },
  })) return "invalid";
  const hash = typeof password === "string" ? await hashPassword(password) : null;
  let destination: string | undefined;
  let outcome: boolean;
  try {
    outcome = await prisma.$transaction(async (tx) => {
      const challenge = await consumeChallenge(tx, digest, mode, owner);
      if (!challenge) return false;
      if (mode === "register") {
        if (!hash) return false;
        await tx.user.create({ data: { email: challenge.email, emailVerified: new Date(), passwordHash: hash, role: "CUSTOMER" }, select: { id: true } });
        return true;
      }
      if (!challenge.userId || !await lockCustomer(tx, challenge.userId)) return false;
      const user = await tx.user.findUniqueOrThrow({ where: { id: challenge.userId }, select: { id: true, email: true, emailVerified: true, passwordHash: true } });
      if (mode === "reset") {
        if (!hash || user.email !== challenge.email || !user.emailVerified || !user.passwordHash || resetContext(user) !== challenge.context) return false;
        await tx.user.update({ where: { id: user.id }, data: { passwordHash: hash }, select: { id: true } });
        await tx.session.deleteMany({ where: { userId: user.id } });
        return true;
      }
      if (session?.id !== user.id || !await activeCustomerSession(tx, user.id, session.binding)) return false;
      if (mode === "emailOld" || mode === "emailNew") {
        const binding = z.tuple([z.string(), emailInput]).safeParse(JSON.parse(challenge.context ?? "null"));
        if (!binding.success || binding.data[0] !== session.binding || !user.emailVerified) return false;
        if (mode === "emailOld") {
          if (user.email !== challenge.email || user.email === binding.data[1]) return false;
          destination = binding.data[1];
          return true;
        }
        if (user.email !== binding.data[1]) return false;
        await tx.user.update({ where: { id: user.id }, data: { email: challenge.email, emailVerified: new Date() }, select: { id: true } });
        await tx.session.deleteMany({ where: { userId: user.id } });
        return true;
      }
      if (challenge.email !== user.email || challenge.context !== session.binding) return false;
      if (mode === "verify" && !user.emailVerified) {
        await tx.user.update({ where: { id: user.id }, data: { emailVerified: new Date() }, select: { id: true } });
        return true;
      }
      if (!user.emailVerified) return false;
      if (mode === "addPassword" && !user.passwordHash && hash) {
        await tx.user.update({ where: { id: user.id }, data: { passwordHash: hash }, select: { id: true } });
        await tx.session.deleteMany({ where: { userId: user.id } });
        return true;
      }
      if (mode === "claim" && challenge.orderId) {
        const claim = await tx.order.updateMany({ where: { id: challenge.orderId, customerId: null,
          customerEmail: { equals: user.email, mode: "insensitive" }, ...customerVisibleOrder },
          data: { customerId: session.id } });
        return claim.count === 1;
      }
      return false;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return "invalid";
    throw error;
  }
  if (outcome && destination && session) {
    if (!await rateLimit("email:emailNew", destination, 5)) return "sent";
    await sendChallenge({ email: destination, userId: session.id, purpose: "emailNew", context: JSON.stringify([session.binding, session.email]) }, await getLocale());
    return "sent";
  }
  return outcome ? "ok" : "invalid";
}
