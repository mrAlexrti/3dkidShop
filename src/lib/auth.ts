import NextAuth from "next-auth";
import { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { getAuthSecret, readServerEnv } from "@/lib/server-env";

class InvalidCredentialsError extends CredentialsSignin {
  code = "invalid_credentials";
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
  if (!username || !/^\$2[aby]\$\d{2}\$/.test(passwordHash)) return null;
  return { username, passwordHash };
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
      },
      async authorize(credentials) {
        const username = credentials?.username;
        const password = credentials?.password;

        if (!getAuthSecret()) throw new MissingAuthSecretError();

        const adminConfig = getAdminConfig();
        if (!adminConfig) throw new MissingAdminConfigError();
        if (typeof username !== "string" || typeof password !== "string" || !password || username.trim() !== adminConfig.username) {
          throw new InvalidCredentialsError();
        }

        const validPassword = await bcrypt.compare(password, adminConfig.passwordHash);
        if (!validPassword) throw new InvalidCredentialsError();

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
