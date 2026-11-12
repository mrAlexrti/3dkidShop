import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadEnvConfig } from "@next/env";
import { sourceModule } from "./source-module";
import * as serverEnv from "../src/lib/server-env";
import { NextRequest, NextResponse } from "next/server";
import * as jsxRuntime from "react/jsx-runtime";
import * as icons from "lucide-react";
import { translations } from "../src/lib/i18n";
import type { AdminSidebar as Sidebar } from "../src/components/admin/admin-sidebar";
import type { ReactElement } from "react";

type Config = {
  session: { strategy: string };
  providers: { credentials: Record<string, unknown>; authorize: (credentials: Record<string, unknown>) => Promise<{ role: string }> }[];
  callbacks: { jwt: (input: { token: Record<string, unknown>; user?: { role: string } }) => Promise<Record<string, unknown>>; session: (input: { session: { user: Record<string, unknown> }; token: Record<string, unknown> }) => Promise<{ user: Record<string, unknown> }> };
};
let config: Config;
class CredentialsSignin extends Error { code = ""; }
async function verify() {
  const password = "Isolated-QA-only-42";
  process.env.AUTH_SECRET = "isolated-auth-secret-not-deployed";
  process.env.ADMIN_USERNAME = "isolated-admin";
  process.env.ADMIN_PASSWORD_HASH = await bcrypt.hash(password, 4);
  process.env.TEST_MODE = "1";
  sourceModule("src/lib/auth.ts", {
    "next-auth": { __esModule: true, default: (value: Config) => { config = value; return {}; }, CredentialsSignin },
    "next-auth/providers/credentials": { __esModule: true, default: (value: unknown) => value },
    bcryptjs: { __esModule: true, default: bcrypt }, "@/lib/server-env": serverEnv,
  });
  const provider = config!.providers[0];
  assert.deepEqual(Object.keys(provider.credentials), ["username", "password"]);
  assert.equal(config!.session.strategy, "jwt");
  assert.equal((await provider.authorize({ username: "isolated-admin", password })).role, "ADMIN");
  await assert.rejects(provider.authorize({ username: "isolated-admin", password: "wrong" }));
  await assert.rejects(provider.authorize({ username: "old-admin", password }));
  await assert.rejects(provider.authorize({ username: "admin", password: "Pass12345" }));
  const token = await config!.callbacks.jwt({ token: {}, user: { role: "ADMIN" } });
  assert.equal((await config!.callbacks.session({ session: { user: {} }, token })).user.role, "ADMIN");
  let role: string | undefined;
  process.env.AUTH_DEBUG = "0";
  const { default: middleware } = sourceModule<{ default: (request: NextRequest) => Promise<Response> }>("src/middleware.ts", {
    "next-auth/jwt": { getToken: async () => role ? { role } : null }, "next/server": { NextResponse }, "@/lib/server-env": serverEnv,
  });
  const { requireAdmin } = sourceModule<{ requireAdmin: () => Promise<void> }>("src/lib/actions/require-admin.ts", {
    "@/lib/auth": { auth: async () => role ? { user: { role } } : null },
  });
  for (role of [undefined, "MANAGER", "ADMIN"]) {
    const response = await middleware(new NextRequest("http://127.0.0.1/admin/products"));
    assert.equal(response.status, role === "ADMIN" ? 200 : 307);
    if (role === "ADMIN") await requireAdmin(); else await assert.rejects(requireAdmin());
  }
  let logout: unknown;
  const { AdminSidebar } = sourceModule<{ AdminSidebar: typeof Sidebar }>("src/components/admin/admin-sidebar.tsx", {
    "react/jsx-runtime": jsxRuntime, "next/link": { default: "a", __esModule: true }, "next/navigation": { usePathname: () => "/admin" },
    "next-auth/react": { signOut: (args: unknown) => { logout = args; } }, "lucide-react": icons, "@/lib/utils": { cn: () => "" },
    "@/store/lang-store": { useLangStore: () => ({ t: translations.ua }) }, "@/components/layout/lang-switcher": { LangSwitcher: () => null },
  });
  const sidebar = AdminSidebar() as ReactElement<{ children: ReactElement<Record<string, unknown>>[] }>;
  const logoutButton = sidebar.props.children.find((child) => child.type === "button")!;
  (logoutButton.props.onClick as () => void)();
  assert.deepEqual(logout, { callbackUrl: "/login" });
  process.env.ADMIN_PASSWORD_HASH = "invalid";
  await assert.rejects(provider.authorize({ username: "isolated-admin", password }));
  const prepared = execFileSync(process.execPath, ["scripts/prepare-admin-credentials.mjs"], { input: JSON.stringify({ username: "reset-test", password }), encoding: "utf8" });
  assert.ok(!prepared.includes(password), "Plaintext must never appear in helper output.");
  const directory = mkdtempSync(join(tmpdir(), "stikr-reset-qa-"));
  const savedEnv = { ...process.env };
  try {
    writeFileSync(join(directory, ".env"), prepared);
    for (const key of ["ADMIN_USERNAME", "ADMIN_PASSWORD_HASH", "AUTH_SECRET", "NEXTAUTH_SECRET", "TEST_MODE"]) delete process.env[key];
    const loaded = loadEnvConfig(directory, false, undefined, true).combinedEnv;
    assert.equal(loaded.ADMIN_USERNAME, "reset-test");
    assert.ok(await bcrypt.compare(password, loaded.ADMIN_PASSWORD_HASH!));
    assert.equal(loaded.AUTH_SECRET, loaded.NEXTAUTH_SECRET);
    assert.equal(loaded.TEST_MODE, "0");
  } finally {
    process.env = savedEnv;
    // Verified absolute temp directory returned by mkdtemp, never a repository or user directory.
    assert.ok(directory.startsWith(join(tmpdir(), "stikr-reset-qa-")));
    rmSync(directory, { recursive: true, force: true });
  }
  console.log("PASS admin credentials: configured login/password only, invalid/old/test-bypass credentials denied, JWT ADMIN role retained; middleware/actions deny absent/MANAGER and allow ADMIN; logout calls Auth.js; reset helper hash survives Next env parsing, plaintext not output; repository .env untouched.");
}
verify().catch((error) => { console.error(error); process.exitCode = 1; });
