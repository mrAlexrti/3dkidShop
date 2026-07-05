import NextAuth from "next-auth";
import { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { getAuthSecret, isTestModeEnabled, readServerEnv } from "@/lib/server-env";
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

class MissingAuthSecretError extends CredentialsSignin {
  code = "auth_secret_missing";
}

function getAdminConfig() {
  const username = readServerEnv("ADMIN_USERNAME");
  const passwordHash = readServerEnv("ADMIN_PASSWORD_HASH");
  const totpSecret = readServerEnv("ADMIN_TOTP_SECRET");

  if (!username || !passwordHash || !totpSecret) return null;

  return { username, passwordHash, totpSecret };
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  pages: {
    signIn: "/login",
  },
  secret: getAuthSecret(),
  trustHost: true,
  session: { strategy: "jwt" },
  providers: [
    Credentials({
      id: "credentials",
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

        if (!getAuthSecret()) throw new MissingAuthSecretError();

        if (isTestModeEnabled()) {
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