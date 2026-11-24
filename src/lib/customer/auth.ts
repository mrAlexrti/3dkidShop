import { Auth, raw, skipCSRFCheck, type AuthConfig } from "@auth/core";
import { AuthError } from "@auth/core/errors";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { readServerEnv } from "@/lib/server-env";
import { consumeChallenge } from "./challenges";
import { activeCustomerSession, customerSession, issueSession, lockCustomer } from "./session";
import { customerCookie, customerOrigin, customerSecret, emailInput, googleEnabled, passwordMatches, rateLimit, sessionSeconds, tokenHash, tokenInput } from "./security";

export const customerAuthPath = "/api/customer-auth";
const cookieNames = ["sessionToken", "callbackUrl", "csrfToken", "pkceCodeVerifier", "state", "nonce", "webauthnChallenge"] as const;
const signInPath = "/account/sign-in";
export const googleLinkContext = (binding: string, state: string) => tokenHash(JSON.stringify([binding, state]));

export function googleIdentity(profile: { sub?: unknown; email?: unknown; email_verified?: unknown; hd?: unknown; given_name?: unknown; family_name?: unknown } | undefined, providerId: string) {
  const email = emailInput.safeParse(profile?.email);
  if (!profile || profile.sub !== providerId || !providerId || providerId.length > 255 || profile.email_verified !== true || !email.success) return null;
  return {
    email: email.data,
    emailVerified: email.data.endsWith("@gmail.com") || (typeof profile.hd === "string" && !!profile.hd.trim()) ? new Date() : null,
    firstName: typeof profile.given_name === "string" ? profile.given_name.slice(0, 100) : null,
    lastName: typeof profile.family_name === "string" ? profile.family_name.slice(0, 100) : null,
  };
}

async function resolveGoogleSession(providerAccountId: string, identity: NonNullable<ReturnType<typeof googleIdentity>>, state: string) {
  const previous = await customerSession();
  const cookie = (await cookies()).get(customerCookie("link").name)?.value;
  const link = tokenInput.safeParse(cookie);
  return prisma.$transaction(async (tx) => {
    const account = await tx.account.findUnique({ where: { provider_providerAccountId: { provider: "google", providerAccountId } }, select: { userId: true } });
    if (link.success) {
      if (!previous) throw new Error("CUSTOMER_LINK_INVALID");
      const challenge = await consumeChallenge(tx, tokenHash(link.data), "linkGoogle", { id: previous.id, context: googleLinkContext(previous.binding, state) });
      if (challenge?.email !== previous.email ||
          !await lockCustomer(tx, previous.id) || !await activeCustomerSession(tx, previous.id, previous.binding)) throw new Error("CUSTOMER_LINK_INVALID");
      const current = await tx.user.findUniqueOrThrow({ where: { id: previous.id }, select: { email: true, emailVerified: true, accounts: { where: { provider: "google" }, select: { providerAccountId: true } } } });
      if (current.email !== challenge.email || current.email !== identity.email || !current.emailVerified || (account && account.userId !== previous.id) ||
          current.accounts.some((row) => row.providerAccountId !== providerAccountId)) throw new Error("CUSTOMER_LINK_INVALID");
      if (!account) await tx.account.create({ data: { userId: previous.id, provider: "google", type: "oidc", providerAccountId }, select: { id: true } });
      return issueSession(tx, previous.id, previous.binding);
    }
    if (previous) throw new Error("CUSTOMER_ALREADY_SIGNED_IN");
    if (account) {
      if (!await lockCustomer(tx, account.userId)) throw new Error("CUSTOMER_SIGNIN_INVALID");
      return issueSession(tx, account.userId);
    }
    // A verified provider email by itself can never attach to an existing user.
    // Google is not authoritative for email addresses outside Gmail and Workspace.
    if (!identity.emailVerified) throw new Error("CUSTOMER_MAILBOX_PROOF_REQUIRED");
    const user = await tx.user.create({ data: { ...identity, role: "CUSTOMER" }, select: { id: true } });
    await tx.account.create({ data: { userId: user.id, provider: "google", type: "oidc", providerAccountId }, select: { id: true } });
    return issueSession(tx, user.id);
  });
}

const customerAuthConfig = {
  secret: customerSecret() || "disabled-customer-auth",
  basePath: customerAuthPath,
  trustHost: true,
  redirectProxyUrl: "",
  useSecureCookies: customerOrigin().startsWith("https:"),
  cookies: Object.fromEntries(cookieNames.map((name) => [name, customerCookie(name === "sessionToken" ? "session" : name)])),
  session: { strategy: "jwt", maxAge: sessionSeconds },
  pages: { signIn: signInPath, error: signInPath },
  logger: {
    error(error) {
      const root = error instanceof AuthError ? error.cause?.err : undefined;
      const reason = root && "code" in root && typeof root.code === "string" && /^[A-Z_0-9]{1,64}$/.test(root.code) ? root.code : undefined;
      console.warn("Customer auth failed", error instanceof AuthError ? error.type : "AuthError", reason ?? "");
    },
    warn: () => {}, debug: () => {},
  },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(credentials) {
        const email = emailInput.safeParse(credentials.email);
        const password = credentials.password;
        if (!email.success || typeof password !== "string" || !await rateLimit("signin", email.data)) return null;
        const previous = await customerSession();
        if (previous) return null;
        const user = await prisma.user.findFirst({ where: { role: "CUSTOMER", email: email.data, emailVerified: { not: null } },
          select: { id: true, passwordHash: true } });
        if (!await passwordMatches(password, user?.passwordHash) || !user) return null;
        return prisma.$transaction(async (tx) => {
          if (!await lockCustomer(tx, user.id)) return null;
          const live = await tx.user.findUnique({ where: { id: user.id, email: email.data, emailVerified: { not: null }, passwordHash: user.passwordHash }, select: { id: true } });
          if (!live) return null;
          return { id: user.id, customerSession: await issueSession(tx, user.id) };
        });
      },
    }),
    ...(googleEnabled() ? [Google({
      clientId: readServerEnv("CUSTOMER_GOOGLE_CLIENT_ID"),
      clientSecret: readServerEnv("CUSTOMER_GOOGLE_CLIENT_SECRET"),
      checks: ["pkce", "state", "nonce"],
      authorization: { params: { prompt: "select_account" } },
    })] : []),
  ],
  callbacks: {
    async redirect({ url }) {
      const origin = customerOrigin();
      return url === signInPath || url === `${origin}${signInPath}` ? `${origin}${signInPath}` : `${origin}/account`;
    },
    async jwt({ token, account, user }) {
      if (account?.provider === "credentials") return (user as typeof user & { customerSession: { sub: string; sid: string } }).customerSession;
      return token;
    },
  },
} satisfies AuthConfig;

// Both callers validate the request Origin and Host before invoking this helper.
export async function customerSignInUrl(provider: "credentials" | "google", fields: Record<string, string> = {}) {
  const origin = customerOrigin();
  const action = provider === "credentials" ? "callback" : "signin";
  const jar = await cookies();
  const response = await Auth(new Request(`${origin}${customerAuthPath}/${action}/${provider}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", cookie: jar.toString() },
    body: new URLSearchParams({ ...fields, callbackUrl: `${origin}/account` }),
  }), { ...customerAuthConfig, raw, skipCSRFCheck });
  for (const cookie of response.cookies ?? []) jar.set(cookie.name, cookie.value, cookie.options);
  return response.redirect;
}

export function customerOAuthCallback(request: Request) {
  const state = new URL(request.url).searchParams.get("state") ?? "";
  return Auth(request, {
    ...customerAuthConfig,
    callbacks: { ...customerAuthConfig.callbacks, async jwt({ account, profile }) {
      const identity = account?.provider === "google" ? googleIdentity(profile, account.providerAccountId) : null;
      if (!identity || !account || !state) throw new Error("CUSTOMER_PROVIDER_IDENTITY");
      return resolveGoogleSession(account.providerAccountId, identity, state);
    } },
  });
}
