import { cookies } from "next/headers";
import { decode } from "@auth/core/jwt";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { customerCookie, customerEnabled, customerSecret, newToken, sessionSeconds, tokenHash, tokenInput } from "./security";

const profile = {
  id: true, email: true, emailVerified: true, firstName: true, lastName: true, phone: true,
} satisfies Prisma.UserSelect;

export async function customerSession() {
  if (!customerEnabled()) return null;
  const cookie = customerCookie("session");
  const token = (await cookies()).get(cookie.name)?.value;
  if (!token || token.length > 2048) return null;
  const jwt = await decode({ token, salt: cookie.name, secret: customerSecret() }).catch(() => null);
  const sid = tokenInput.safeParse(jwt?.sid);
  if (!sid.success || typeof jwt?.sub !== "string") return null;
  const session = await prisma.session.findFirst({
    where: { sessionToken: tokenHash(sid.data), userId: jwt.sub, expires: { gt: new Date() }, user: { role: "CUSTOMER" } },
    select: { sessionToken: true, expires: true, user: { select: profile } },
  });
  return session && { ...session.user, binding: session.sessionToken, expires: session.expires };
}

export const favoritesVersion = (binding: string) => tokenHash(`favorites:${binding}`);

export async function lockCustomer(tx: Prisma.TransactionClient, id: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM public."User" WHERE id=${id} AND role='CUSTOMER' FOR UPDATE`;
  return rows.length === 1;
}

export async function activeCustomerSession(tx: Prisma.TransactionClient, id: string, binding: string) {
  return !!await tx.session.findFirst({
    where: { userId: id, sessionToken: binding, expires: { gt: new Date() } },
    select: { id: true },
  });
}

export async function issueSession(tx: Prisma.TransactionClient, userId: string, previous?: string) {
  if (previous) await tx.session.deleteMany({ where: { sessionToken: previous, user: { role: "CUSTOMER" } } });
  await tx.session.deleteMany({ where: { userId, expires: { lte: new Date() } } });
  const sid = newToken();
  await tx.session.create({ data: { sessionToken: tokenHash(sid), userId, expires: new Date(Date.now() + sessionSeconds * 1000) } });
  return { sub: userId, sid };
}

export async function revokeCustomerSession() {
  const session = await customerSession();
  if (session) {
    await prisma.$transaction(async (tx) => {
      if (await lockCustomer(tx, session.id)) {
        await tx.session.deleteMany({ where: { userId: session.id, sessionToken: session.binding } });
      }
    });
  }
  const jar = await cookies();
  // A pending Google link keeps its purpose through sign-out. Its revoked
  // customer session cannot complete linking, and a fresh OAuth start replaces it.
  const cookie = customerCookie("session");
  jar.set(cookie.name, "", { ...cookie.options, maxAge: 0 });
}
