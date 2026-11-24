import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import * as crypto from "node:crypto";
import * as net from "node:net";
import { Prisma, PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import * as zod from "zod";
import { prisma } from "../src/lib/prisma";
import type * as actions from "../src/lib/customer/actions";
import type * as favorites from "../src/lib/customer/favorites";
import * as sessions from "../src/lib/customer/session";
import * as security from "../src/lib/customer/security";
import * as challenges from "../src/lib/customer/challenges";
import { customerVisibleOrder } from "../src/lib/customer/pages";
import * as serverEnv from "../src/lib/server-env";
import { sourceModule } from "./source-module";

const runtime = new URL(process.env.DATABASE_URL ?? "");
const marker = process.env.BATCH19_QA_MARKER;
assert.match(marker ?? "", /^[a-f0-9]{32}$/);
assert.equal(runtime.hostname, "127.0.0.1");
assert.equal(runtime.pathname, `/batch18_review_${marker}`);
assert.equal(runtime.username, "app_3dkid");

type Session = NonNullable<Awaited<ReturnType<typeof sessions.customerSession>>>;
const request = new AsyncLocalStorage<Session | null>();
const withSession = { ...sessions, customerSession: async () => request.getStore() ?? null };
const customerSecurity = sourceModule<typeof security>("src/lib/customer/security.ts", {
  "node:crypto": crypto, "node:net": net, "next/headers": { headers: async () => new Headers({
    origin: security.customerOrigin(), host: new URL(security.customerOrigin()).host,
  }) }, "@prisma/client": { Prisma }, bcryptjs: bcrypt, zod, "@/lib/prisma": { prisma }, "@/lib/server-env": serverEnv,
});
const unexpected = () => { throw new Error("Unexpected network or Next request operation in concurrency fixture"); };
const bindings = { zod, "@prisma/client": { Prisma }, "@/lib/prisma": { prisma }, "./security": customerSecurity, "./session": withSession };
const { confirmAccountEmail, updateProfile } = sourceModule<typeof actions>("src/lib/customer/actions.ts", {
  ...bindings, "@auth/core/errors": { AuthError: Error }, "next/navigation": { redirect: unexpected },
  "next/server": { after: unexpected }, "@/lib/i18n-server": { getLocale: unexpected },
  "@/lib/notifications/email": { isEmailConfigured: unexpected }, "./pages": { customerVisibleOrder },
  "./auth": { customerSignInUrl: unexpected }, "./challenges": challenges,
});
const { changeFavorites } = sourceModule<typeof favorites>("src/lib/customer/favorites.ts", { ...bindings, "next/cache": { revalidatePath: () => {} } });

const ownerURL = new URL(process.env.BATCH19_OWNER_DATABASE_URL ?? "");
assert.equal(ownerURL.host + ownerURL.pathname, runtime.host + runtime.pathname);
assert.equal(ownerURL.username, "batch18a_qa");
const owner = new PrismaClient({ datasourceUrl: ownerURL.href });

async function verify() {
  const makeUser = async (email: string) => owner.user.create({ data: { email, emailVerified: new Date(), role: "CUSTOMER" } });
  const a = await makeUser("race-a@example.test");
  const b = await makeUser("race-b@example.test");
  const makeSession = async (user: typeof a) => {
    const issued = await prisma.$transaction((tx) => sessions.issueSession(tx, user.id));
    return { ...user, binding: security.tokenHash(issued.sid) };
  };
  const [first, second, other] = await Promise.all([makeSession(a), makeSession(a), makeSession(b)]);
  const profile = new FormData();
  for (const [key, value] of Object.entries({ firstName: "Scoped", lastName: "Profile", phone: "0500000903", userId: b.id,
    role: "ADMIN", email: b.email, emailVerified: "2026-01-01", passwordHash: "untrusted" })) profile.set(key, value);
  assert.equal(await request.run(null, () => updateProfile(null, profile)), "invalid");
  assert.equal(await request.run(first, () => updateProfile(null, profile)), "ok");
  const updated = await owner.user.findUniqueOrThrow({ where: { id: a.id } });
  assert.equal(updated.firstName, "Scoped");
  assert.equal(updated.role, "CUSTOMER");
  assert.equal(updated.email, a.email);
  assert.equal(updated.passwordHash, null);
  assert.deepEqual(await owner.user.findUniqueOrThrow({ where: { id: b.id } }), b);
  const order = await owner.order.create({ data: { number: "903", checkoutAcceptance: "ACCEPTED", acceptedAt: new Date(),
    customerName: "Guest claimant", customerEmail: a.email, customerPhone: "0500000903", shippingAddress: "Synthetic",
    city: "Kyiv", postalCode: "123", paymentMethod: "COD", subtotal: 21, total: 21 } });
  const issue = (session: Session) => challenges.issueChallenge(prisma, { purpose: "claim", orderId: order.id,
    userId: session.id, email: session.email, context: session.binding });
  const [token, conflicting] = await Promise.all([issue(first), issue(second)]);
  assert.ok(security.tokenInput.safeParse(token).success);
  assert.equal(await prisma.order.count({ where: { ...customerVisibleOrder, id: order.id, customerEmail: { equals: first.email, mode: "insensitive" }, customerId: null } }), 1);
  assert.equal(await sessions.activeCustomerSession(prisma, first.id, first.binding), true);
  assert.equal(await prisma.customerChallenge.count({ where: { tokenHash: security.tokenHash(token), userId: first.id, context: first.binding, expires: { gt: new Date() } } }), 1);
  const redeem = (session: Session | null, proof: string) => request.run(session, () => {
    const form = new FormData();
    form.set("token", proof);
    return confirmAccountEmail("claim", null, form);
  });
  assert.equal(await redeem(null, token), "invalid");
  assert.equal(await redeem(other, token), "invalid");
  assert.equal(await redeem(second, token), "invalid");
  assert.equal(await prisma.customerChallenge.count({ where: { orderId: order.id } }), 2);
  const outcomes = await Promise.all([redeem(first, token), redeem(first, token), redeem(second, conflicting)]);
  assert.deepEqual(outcomes.sort(), ["invalid", "invalid", "ok"]);
  assert.equal(await redeem(first, token), "invalid");
  assert.equal((await owner.order.findUniqueOrThrow({ where: { id: order.id } })).customerId, a.id);
  assert.equal(await prisma.customerChallenge.count({ where: { orderId: order.id } }), 0);

  const version = sessions.favoritesVersion(first.binding);
  const merge = { type: "merge", ids: ["qa_product", "qa_product", "missing-product"] };
  assert.equal(await request.run(other, () => changeFavorites(version, merge)), null);
  const writes = await Promise.all(Array.from({ length: 5 }, () => request.run(first, () => changeFavorites(version, merge))));
  for (const ids of writes) assert.deepEqual(ids, ["qa_product"]);
  assert.equal(await prisma.customerFavorite.count({ where: { userId: a.id } }), 1);
  assert.equal(await prisma.customerFavorite.count({ where: { userId: b.id } }), 0);

  const rateResults = await Promise.all(Array.from({ length: 9 }, () => customerSecurity.rateLimit("qaConcurrent", "one-subject", 4)));
  assert.equal(rateResults.filter(Boolean).length, 4);
  console.log("PASS concurrent restricted-role guest claims and replay, binding isolation, idempotent favorites and shared rate limits");
}

verify().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => Promise.all([prisma.$disconnect(), owner.$disconnect()]));
