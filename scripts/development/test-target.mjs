import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { runInThisContext } from "node:vm";
import ts from "typescript";
import { devConnection, localAppConnection, localMarker, neonDev, prismaDevUrl } from "../../src/lib/dev-target.mjs";
import { assertLocalTooling, resolveEnvironment, verifyDevelopmentIdentity } from "../../src/lib/environment.mjs";

const production = "postgresql://app_3dkid:synthetic@ep-jolly-cell-ai0scrqk.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require";
const sample = "postgresql://app_3dkid:synthetic@" + neonDev.pooled + "/neondb?sslmode=require";
const owner = "postgresql://neondb_owner:synthetic@" + neonDev.direct + "/neondb?sslmode=verify-full";
const neon = prismaDevUrl(devConnection(sample, "app"), "C:\\synthetic\\ca.pem");
const localDatabase = "ops02_" + "a".repeat(32);
const local = "postgresql://app_3dkid@127.0.0.1:5432/" + localDatabase;
const ordinary = { NODE_ENV: "production", DATABASE_URL: production, ONLINE_PAYMENT_MODE: "live",
  MONO_ACQUIRING_TOKEN: "synthetic-production-mono", RESEND_API_KEY: "synthetic-production-email", CRON_SECRET: "synthetic-cron",
  TELEGRAM_BOT_TOKEN: "synthetic-production-telegram", BLOB_READ_WRITE_TOKEN: "synthetic-production-blob",
  CUSTOMER_GOOGLE_CLIENT_ID: "synthetic-production-google", CUSTOMER_GOOGLE_CLIENT_SECRET: "synthetic-production-secret",
  NP_API_KEY: "synthetic-production-delivery" };
const hosted = { ...ordinary, VERCEL: "1", VERCEL_ENV: "production", VERCEL_TARGET_ENV: "production" };
const isolation = { NODE_ENV: "production", ONLINE_PAYMENT_MODE: "disabled", PRODUCT_MEDIA_CLEANUP_ENABLED: "false" };
const preview = { ...isolation, VERCEL_ENV: "preview", OPS02_DEPLOYMENT: "preview", OPS02_MODE: "neon", DEV_DATABASE_APP_URL: sample };
const localEnv = { ...isolation, OPS02_MODE: "local", DATABASE_URL: local };
const neonEnv = { ...isolation, OPS02_MODE: "neon", DATABASE_URL: neon };
const listeners = { database: 0, providers: 0, credentials: 0, destructive: 0 };
const prismaSource = readFileSync(new URL("../../src/lib/prisma.ts", import.meta.url), "utf8");
const prismaJavaScript = ts.transpileModule(prismaSource, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const loadPrisma = runInThisContext("(function(require, exports, process, globalThis) {\n" + prismaJavaScript + "\n})");

function prismaOptions(env) {
  let constructed;
  const fixtureRequire = name => {
    if (name === "@/lib/environment.mjs") return { resolveEnvironment };
    assert.equal(name, "@prisma/client");
    return { PrismaClient: class { constructor(options) { constructed = options; listeners.database++; } } };
  };
  loadPrisma(fixtureRequire, {}, { env }, {});
  return constructed;
}

// This models startup's ordering. It never loads the real client or providers.
async function start(env, marker) {
  const selected = resolveEnvironment(env);
  if (selected.kind !== "ordinary") {
    await verifyDevelopmentIdentity(selected, async () => [{
      database: selected.database, role: "app_3dkid", marker: marker ?? selected.marker, restricted: true,
    }]);
  }
  const options = prismaOptions(env);
  if (selected.kind === "preview") assert.equal(options.datasourceUrl, selected.datasourceUrl);
  else assert.ok(!Object.hasOwn(options, "datasourceUrl"));
  listeners.providers++;
  return selected;
}

const matrix = [
  ["1 hosted Production", hosted, "ordinary"],
  ["2 unflagged Production", ordinary, "ordinary"],
  ["3 Production with local mode", { ...hosted, OPS02_MODE: "local", DATABASE_URL: local }, /PRODUCTION_DEVELOPMENT_CONFLICT/],
  ["4 Production with DEV URL", { ...hosted, DEV_DATABASE_APP_URL: sample }, /PRODUCTION_DEVELOPMENT_CONFLICT/],
  ["5 Production with loopback", { ...hosted, DATABASE_URL: local }, /PRODUCTION_DATASOURCE_REJECTED/],
  ["6 Production with mock settings", { ...hosted, NP_API_KEY: "ops02-mock-only" }, /PRODUCTION_DEVELOPMENT_CONFLICT/],
  ["7 isolated Preview", preview, "preview"],
  ["8 Preview missing development configuration", { ...preview, DEV_DATABASE_APP_URL: undefined }, /DATABASE_TARGET_REJECTED/],
  ["9 Preview with Production URL", { ...preview, DATABASE_URL: production }, /UNSAFE_PREVIEW_CONFIGURATION/],
  ["10 valid Neon DEV", neonEnv, "neon"],
  ["11 valid disposable DB", localEnv, "local"],
  ["12 DEV with Production hostname", { ...neonEnv, DATABASE_URL: production }, /DATABASE_TARGET_REJECTED/],
  ["13 DEV with unknown hostname", { ...neonEnv, DATABASE_URL: neon.replace(neonDev.pooled, "unknown.example.test") }, /DATABASE_TARGET_REJECTED/],
  ["14 DEV with incorrect marker", localEnv, /RUNTIME_IDENTITY_UNVERIFIED/, "wrong-marker"],
  ["ordinary without DATABASE_URL during build", { NODE_ENV: "production" }, "ordinary"],
  ["Preview missing explicit marker", { ...preview, OPS02_DEPLOYMENT: undefined }, /PREVIEW_MARKER_REQUIRED/],
  ["Preview live provider credential", { ...preview, RESEND_API_KEY: "synthetic-production-email" }, /LIVE_PROVIDER_IN_ISOLATION/],
  ["Preview without optional Vercel flags", { ...preview, VERCEL_ENV: undefined }, "preview"],
  ["ambiguous hosted identity", { VERCEL: "1", DATABASE_URL: production }, /HOSTED_IDENTITY_REQUIRED/],
  ["conflicting hosted labels", { ...hosted, VERCEL_TARGET_ENV: "preview" }, /DEPLOYMENT_IDENTITY_CONFLICT/],
  ["unflagged Production with Neon DEV datasource", { ...ordinary, DATABASE_URL: neon }, /PRODUCTION_DATASOURCE_REJECTED/],
  ["Production alternate loopback notation", { ...hosted, DATABASE_URL: production.replace(new URL(production).host, "2130706433") }, /PRODUCTION_DATASOURCE_REJECTED/],
  ["Production alternate routed hostname", { ...hosted, DATABASE_URL: production + "&host=127.0.0.1" }, /PRODUCTION_DATASOURCE_REJECTED/],
  ["unflagged DB mode with live provider", { ...localEnv, NP_API_KEY: "synthetic-production-delivery" }, /LIVE_PROVIDER_IN_ISOLATION/],
  ["unguarded test process", { ...ordinary, NODE_ENV: "test" }, /USE_GUARDED_DEV_COMMAND/],
];
for (const [name, env, expected, marker] of matrix) {
  const before = { ...listeners };
  if (expected instanceof RegExp) {
    await assert.rejects(start(env, marker), expected);
    if (marker === undefined) assert.throws(() => prismaOptions(env), expected);
    assert.deepEqual(listeners, before);
  } else {
    const selected = await start(env);
    assert.equal(selected.kind, expected);
    if (expected === "ordinary") {
      assert.equal(selected.datasourceUrl, undefined);
      if (env.DATABASE_URL) assert.equal(env.DATABASE_URL, production);
      if (env.ONLINE_PAYMENT_MODE) assert.equal(env.ONLINE_PAYMENT_MODE, "live");
    }
    if (expected === "preview") assert.equal(new URL(selected.datasourceUrl).hostname, neonDev.pooled);
    if (expected === "local") assert.equal(selected.marker, localMarker);
  }
  console.log("PASS " + name);
}

assert.equal(devConnection(owner, "owner").host, neonDev.direct);
const settings = new URL(neon).searchParams;
assert.equal(settings.get("sslmode"), "require");
assert.equal(settings.get("sslaccept"), "strict");
assert.equal(settings.get("sslcert"), "C:/synthetic/ca.pem");
for (const target of [undefined, production, sample.replace(neonDev.pooled, neonDev.direct), sample + "&host=wrong.example.test",
  sample + "&hostaddr=1.2.3.4", sample + "&sslmode=require", sample.replace("require","disable"),
  sample + "&sslaccept=accept_invalid_certs", sample.replace("/neondb","/another"), owner, sample + "#ignored"]) {
  assert.throws(() => devConnection(target, "app"), /OPS02_DATABASE_/);
}
assert.equal(localAppConnection(local), localDatabase);
assert.throws(() => localAppConnection(local + "?host=wrong.example.test"), /OPS02_LOCAL/);

const { scripts } = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
const commands = { install: "prisma generate", build: "next build", start: "next start", devBuild: "node scripts/development/dev.mjs build",
  devStart: "node scripts/development/dev.mjs start", localStart: "node scripts/development/dev.mjs local-start" };
assert.equal(scripts.postinstall, commands.install);
assert.equal(scripts.build, commands.build);
assert.equal(scripts.start, commands.start);
assert.equal(scripts["dev:build"], commands.devBuild);
assert.equal(scripts["dev:start"], commands.devStart);
assert.equal(scripts["dev:start:local"], commands.localStart);
assert.throws(() => assertLocalTooling(hosted), /LOCAL_TOOLING_ON_HOSTED_DEPLOYMENT/);
assert.throws(() => assertLocalTooling(preview), /LOCAL_TOOLING_ON_HOSTED_DEPLOYMENT/);

const sandbox = fileURLToPath(new URL("./sandbox.cjs", import.meta.url));
const tool = fileURLToPath(new URL("./dev.mjs", import.meta.url));
const base = Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(SystemRoot|WINDIR|PATH|TEMP|TMP)$/i.test(key)));
const run = (args, env) => spawnSync(process.execPath, args, { env: { ...base, ...env }, encoding: "utf8", windowsHide: true });
const config = new URL("../../next.config.mjs", import.meta.url).href;
const loadConfig = ["--input-type=module", "-e", "await import(" + JSON.stringify(config) + ")"];
assert.equal(run(loadConfig, hosted).status, 0);
assert.equal(run(loadConfig, ordinary).status, 0);
assert.match(run(loadConfig, { ...hosted, OPS02_MODE: "local" }).stderr, /OPS02_PRODUCTION_DEVELOPMENT_CONFLICT/);
assert.match(run(loadConfig, { VERCEL_ENV: "preview" }).stderr, /OPS02_PREVIEW_MARKER_REQUIRED/);
for (const command of ["build", "start", "bootstrap", "seed", "reset", "regression"]) {
  const result = run([tool, command], hosted);
  assert.equal(result.status, 1);
  assert.equal(result.stderr.trim(), "OPS02_LOCAL_TOOLING_ON_HOSTED_DEPLOYMENT");
}
const hostedMock = run(["--require", sandbox, "-e", "process.exit(2)"], hosted);
assert.equal(hostedMock.status, 1);
assert.match(hostedMock.stderr, /OPS02_LOCAL_TOOLING_ON_HOSTED_DEPLOYMENT/);
const lifecycleMock = run(["--require", sandbox, "-e", "process.exit(2)"],
  { ...localEnv, npm_lifecycle_event: "build", OPS02_SANDBOX: "1" });
assert.equal(lifecycleMock.status, 1);
assert.match(lifecycleMock.stderr, /OPS02_LOCAL_TOOLING_IN_STANDARD_LIFECYCLE/);
console.log("PASS 15 ordinary commands do not dispatch Development tooling");
console.log("PASS 16 explicit build/start wiring and hosted child-process rejection");

const subprocess = run(["--require", sandbox, "--input-type=commonjs", "-e",
  "const a=require('node:assert/strict'); (async()=>{a.throws(()=>require('node:fs').readFileSync('.env'),{code:'ENOENT'});" +
  "await a.rejects(fetch('https://api.telegram.org/'),/OPS02_EXTERNAL_HTTP_BLOCKED/);" +
  "await a.rejects(require('undici').fetch('https://vercel.com/api/blob/'),err=>err.cause?.code==='UND_MOCK_ERR_MOCK_NOT_MATCHED');})().catch(()=>process.exitCode=1);"],
{ ...localEnv, OPS02_SANDBOX: "1", CUSTOMER_AUTH_ORIGIN: "http://127.0.0.1:3000" });
assert.equal(subprocess.status, 0, subprocess.stderr);
console.log("PASS dotenv denial, fetch and SDK egress isolation");
