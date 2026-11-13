// Production compilation/prerender verification without connecting to any DB.
// This is a local QA runner, never a deployment or normal npm build replacement.
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawn } from "node:child_process";

const directory = resolve(".next/cache/batch17-build");
// Fresh output avoids OneDrive reparse-point cleanup errors from prior builds.
const outputDirectory = `.next/cache/batch17-build-output-${Date.now()}`;
const nextEnvBefore = readFileSync("next-env.d.ts", "utf8");
mkdirSync(directory, { recursive: true });
const preload = resolve(directory, "isolated-prisma.cjs");
writeFileSync(resolve(directory, "tsconfig.json"), JSON.stringify({ extends: resolve("tsconfig.json"), compilerOptions: { baseUrl: process.cwd(), paths: { "@/*": ["src/*"] } }, include: [resolve("src/**/*"), resolve("scripts/**/*"), resolve("next-env.d.ts")], exclude: [resolve("node_modules")] }));
writeFileSync(preload, `
const Module = require('node:module');
const load = Module._load;
const configFile = require.resolve('next/dist/server/config');
const forbidden = () => { throw new Error('ISOLATED_BUILD_EFFECT_FORBIDDEN'); };
const model = new Proxy({}, { get: (_, method) => {
  if (method === 'findMany') return async () => [];
  if (method === 'findUnique' || method === 'findFirst') return async () => null;
  if (method === 'count') return async () => 0;
  return forbidden;
} });
class FixtureClient {
  constructor() { return new Proxy(this, { get: (_, key) => typeof key === 'string' && key.startsWith('$') ? forbidden : model }); }
}
Module._load = function(name, parent, main) {
  const result = load.call(this, name, parent, main);
  if (name.includes('config') && Module._resolveFilename(name, parent) === configFile) {
    return { ...result, __esModule: true, default: async (...args) => {
      const config = await result.default(...args);
      return { ...config, distDir: ${JSON.stringify(outputDirectory)}, typescript: { ...config.typescript, tsconfigPath: '.next/cache/batch17-build/tsconfig.json' } };
    } };
  }
  return name === '@prisma/client' ? { ...result, PrismaClient: FixtureClient } : result;
};
globalThis.fetch = async () => forbidden();
`);
const env = { ...process.env, NEXT_TELEMETRY_DISABLED: "1", DATABASE_URL: "", MONO_ACQUIRING_TOKEN: "", LIQPAY_PRIVATE_KEY: "", LIQPAY_PUBLIC_KEY: "", NP_API_KEY: "", RESEND_API_KEY: "", TELEGRAM_BOT_TOKEN: "", ONLINE_PAYMENT_MODE: "disabled" };
env.NODE_OPTIONS = `${env.NODE_OPTIONS || ""} --use-system-ca --require=${JSON.stringify(preload)}`.trim();
console.log("Isolated production build: empty Prisma read fixtures; DB writes/connections and provider fetch blocked. Ignored QA output/tsconfig paths; no environment files changed.");
const child = spawn(process.execPath, [resolve("node_modules/next/dist/bin/next"), "build"], { env, stdio: "inherit", windowsHide: true });
child.on("error", () => { console.error("Isolated build could not start."); process.exitCode = 1; });
child.on("exit", (code) => {
  // Next rewrites this generated reference even with a custom QA tsconfig. Restore
  // only its known QA-path change, never unrelated edits in the shared workspace.
  const after = readFileSync("next-env.d.ts", "utf8");
  if (after !== nextEnvBefore) {
    const restored = after.replace(`./${outputDirectory}/types/routes.d.ts`, "./.next/types/routes.d.ts");
    if (restored.replaceAll("\r\n", "\n") === nextEnvBefore.replaceAll("\r\n", "\n")) writeFileSync("next-env.d.ts", nextEnvBefore);
    else { console.error("Generated type reference changed unexpectedly; retained for review."); process.exitCode = 1; return; }
  }
  process.exitCode = code ?? 1;
});
