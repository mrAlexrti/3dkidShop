import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadEnvConfig } from "@next/env";
import { sourceModule } from "./source-module";
import * as serverEnv from "../src/lib/server-env";

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
  process.env.ADMIN_PASSWORD_HASH = "invalid";
  await assert.rejects(provider.authorize({ username: "isolated-admin", password }));
  const prepared = execFileSync(process.execPath, ["scripts/prepare-admin-credentials.cjs"], { input: JSON.stringify({ username: "reset-test", password }), encoding: "utf8" });
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
  console.log("PASS admin credentials: configured login/password only, invalid/old/test-bypass credentials denied, JWT ADMIN role retained; reset helper hash survives Next env parsing, plaintext not output; repository .env untouched.");
}
verify().catch((error) => { console.error(error); process.exitCode = 1; });
