import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import * as crypto from "node:crypto";
import * as net from "node:net";
import * as authCore from "@auth/core";
import * as authErrors from "@auth/core/errors";
import * as authJwt from "@auth/core/jwt";
import type { CookieOption } from "@auth/core/types";
import { Prisma, PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import * as zod from "zod";
import { prisma } from "../src/lib/prisma";
import type * as actions from "../src/lib/customer/actions";
import type * as auth from "../src/lib/customer/auth";
import type * as favorites from "../src/lib/customer/favorites";
import * as sessions from "../src/lib/customer/session";
import * as security from "../src/lib/customer/security";
import * as password from "../src/lib/customer/password";
import * as emailTemplate from "../src/lib/customer/email-template";
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
  }) }, "@prisma/client": { Prisma }, bcryptjs: bcrypt, zod, "@/lib/prisma": { prisma }, "@/lib/server-env": serverEnv, "./password": password,
});
const unexpected = () => { throw new Error("Unexpected network or Next request operation in concurrency fixture"); };
const bindings = { zod, "@prisma/client": { Prisma }, "@/lib/prisma": { prisma }, "./security": customerSecurity, "./session": withSession };
const actionBindings = {
  ...bindings, "./password": password, "./email-template": emailTemplate, "@auth/core/errors": authErrors, "next/navigation": { redirect: unexpected },
  "next/server": { after: unexpected }, "@/lib/i18n-server": { getLocale: unexpected },
  "@/lib/notifications/email": { isEmailConfigured: unexpected }, "./pages": { customerVisibleOrder },
  "./auth": { customerSignInUrl: unexpected }, "./challenges": challenges,
};
const { confirmAccountEmail, updateProfile } = sourceModule<typeof actions>("src/lib/customer/actions.ts", actionBindings);
const { changeFavorites } = sourceModule<typeof favorites>("src/lib/customer/favorites.ts", { ...bindings, "next/cache": { revalidatePath: () => {} } });

const ownerURL = new URL(process.env.BATCH19_OWNER_DATABASE_URL ?? "");
assert.equal(ownerURL.host + ownerURL.pathname, runtime.host + runtime.pathname);
assert.equal(ownerURL.username, "batch18a_qa");
const owner = new PrismaClient({ datasourceUrl: ownerURL.href });

async function verifySecureCredentials(email: string, passwordValue: string, id: string) {
  const origin = "https://store.example.test";
  const env = { readServerEnv: (name: string) => name === "CUSTOMER_AUTH_ORIGIN" ? origin : serverEnv.readServerEnv(name) };
  const jar = new Map<string, { value: string; options: CookieOption["options"] }>();
  const requestHeaders = new Headers({ origin, host: new URL(origin).host });
  const nextHeaders = {
    headers: async () => requestHeaders,
    cookies: async () => ({
      get: (name: string) => jar.get(name),
      set: (name: string, value: string, options: CookieOption["options"]) => jar.set(name, { value, options }),
      toString: () => [...jar].map(([name, { value }]) => `${name}=${value}`).join("; "),
    }),
  };
  const shared = { "@prisma/client": { Prisma }, "@/lib/prisma": { prisma }, "next/headers": nextHeaders };
  const secure = sourceModule<typeof security>("src/lib/customer/security.ts", {
    ...shared, "node:crypto": crypto, "node:net": net, bcryptjs: bcrypt, zod, "@/lib/server-env": env, "./password": password,
  });
  const session = sourceModule<typeof sessions>("src/lib/customer/session.ts", {
    ...shared, "@auth/core/jwt": authJwt, "./security": secure,
  });
  const actualAuth = sourceModule<typeof auth>("src/lib/customer/auth.ts", {
    ...shared, "@auth/core": authCore, "@auth/core/errors": authErrors, "next-auth/providers/credentials": Credentials,
    "next-auth/providers/google": Google, "@/lib/server-env": env, "./session": session, "./security": secure, "./challenges": challenges,
  });
  const redirected = new Error("Synthetic account redirect");
  const { signInCustomer } = sourceModule<typeof actions>("src/lib/customer/actions.ts", {
    ...actionBindings, "./security": secure, "./session": session, "./auth": actualAuth,
    "next/navigation": { redirect: (path: string) => { assert.equal(path, "/account"); throw redirected; } },
  });
  const signIn = (value: string) => {
    const data = new FormData();
    data.set("email", email.toUpperCase());
    data.set("password", value);
    return signInCustomer(null, data);
  };
  requestHeaders.set("host", "unexpected.example.test");
  assert.equal(await signIn(passwordValue), "unavailable");
  requestHeaders.set("host", new URL(origin).host);
  assert.equal(await signIn(passwordValue.trim()), "signinError");
  assert.equal(await session.customerSession(), null);
  await assert.rejects(signIn(passwordValue), (error) => error === redirected);
  const { options } = jar.get("__Host-3dkid.customer.session") ?? {};
  assert.ok(options && options.httpOnly && options.secure && options.path === "/" && options.sameSite === "lax" && !options.domain);
  const read = await session.customerSession();
  assert.ok(read?.id === id && read.email === email);
  await session.revokeCustomerSession();
  assert.equal(await session.customerSession(), null);
  assert.equal(await session.activeCustomerSession(prisma, id, read.binding), false);
  console.log("PASS exact credentials via Auth.js with canonical HTTPS origin, wrong Host rejection, Secure session cookie, database session read and revocation");
}

async function verify() {
  const newEmail = "race-register@example.test";
  const testPassword = "  Chaîne 🔑 Générée +&%  ";
  const registration = await challenges.issueChallenge(prisma, { purpose: "register", email: newEmail });
  const register = (value: string, confirm: string) => {
    const data = new FormData();
    data.set("token", registration);
    data.set("password", value);
    data.set("confirmPassword", confirm);
    return confirmAccountEmail("register", null, data);
  };
  assert.equal(await register(testPassword, testPassword.trim()), "passwordMismatch");
  assert.equal(await register("🙂".repeat(19), "🙂".repeat(19)), "passwordRequirements");
  assert.equal(await register("short", "short"), "passwordRequirements");
  assert.equal(await owner.user.count({ where: { email: newEmail } }), 0);
  assert.equal(await prisma.customerChallenge.count({ where: { tokenHash: security.tokenHash(registration) } }), 1);
  assert.deepEqual((await Promise.all([register(testPassword, testPassword), register(testPassword, testPassword)])).sort(), ["invalid", "ok"]);
  const registered = await owner.user.findUniqueOrThrow({ where: { email: newEmail }, select: { id: true, passwordHash: true, emailVerified: true, role: true } });
  assert.ok(registered.emailVerified && registered.role === "CUSTOMER");
  assert.equal(await security.passwordMatches(testPassword, registered.passwordHash), true);
  assert.equal(await security.passwordMatches(testPassword.trim(), registered.passwordHash), false);
  assert.equal(await register(testPassword, testPassword), "invalid");
  console.log("PASS registration match and Unicode byte-limit checks leave proof intact; concurrent redemption commits exactly once and preserves the submitted password");
  await verifySecureCredentials(newEmail, testPassword, registered.id);

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
