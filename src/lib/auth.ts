import NextAuth from "next-auth";
import { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { verifyTotpCode } from "@/lib/totp";

const TEST_ADMIN_USERNAME = "admin";
const TEST_ADMIN_PASSWORD = "Pass12345";

class InvalidCredentialsError extends CredentialsSignin {
  code = "invalid_credentials";
}

class InvalidTotpError extends CredentialsSignin {
  code = "invalid_totp";
}

class MissingAdminConfigError extends CredentialsSignin {
  code = "admin_config_missing";
}

function readEnv(name: string) {
  const value = process.env[name]?.trim() ?? "";
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1).trim();
  }

  return value;
}

function isTestMode() {
  return readEnv("TEST_MODE") === "1";
}

function getAdminConfig() {
  const username = readEnv("ADMIN_USERNAME");
  const passwordHash = readEnv("ADMIN_PASSWORD_HASH");
  const totpSecret = readEnv("ADMIN_TOTP_SECRET");

  if (!username || !passwordHash || !totpSecret) return null;

  return { username, passwordHash, totpSecret };
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  pages: {
    signIn: "/login",
  },
  session: { strategy: "jwt" },
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
        totp: { label: "2FA code", type: "text" },
      },
      async authorize(credentials) {
        const username = credentials?.username as string | undefined;
        const password = credentials?.password as string | undefined;
        const totp = credentials?.totp as string | undefined;

        if (isTestMode()) {
          if (username?.trim() !== TEST_ADMIN_USERNAME || password !== TEST_ADMIN_PASSWORD) {
            throw new InvalidCredentialsError();
          }

          return {
            id: "test-admin",
            name: "Test Admin",
            email: "test-admin@3dkid.local",
            role: "ADMIN",
          };
        }

        const adminConfig = getAdminConfig();
        if (!adminConfig) throw new MissingAdminConfigError();
        if (!username || !password || username.trim() !== adminConfig.username) {
          throw new InvalidCredentialsError();
        }

        const validPassword = await bcrypt.compare(password, adminConfig.passwordHash);
        if (!validPassword) throw new InvalidCredentialsError();

        if (!totp || !verifyTotpCode(adminConfig.totpSecret, totp)) {
          throw new InvalidTotpError();
        }

        return {
          id: "admin",
          name: "Admin",
          email: adminConfig.username.includes("@") ? adminConfig.username : "admin@3dkid.local",
          role: "ADMIN",
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as { role?: string }).role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as { role?: string }).role = token.role as string | undefined;
      }
      return session;
    },
  },
});