// Disposable loopback PostgreSQL and browser. No existing DATABASE_URL is accepted.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as pause } from "node:timers/promises";
import bcrypt from "bcryptjs";

const root = process.cwd();
const directory = mkdtempSync(join(tmpdir(), "batch19-qa-"));
const data = join(directory, "data");
const marker = randomBytes(16).toString("hex");
const database = `batch18_review_${marker}`;
const owner = "batch18a_qa";
writeFileSync(join(directory, "qa-marker"), marker);
const pgBin = process.env.BATCH19_PG_BIN || "C:/Program Files/PostgreSQL/18/bin";
const pg = (name) => join(pgBin, name + (process.platform === "win32" ? ".exe" : ""));
const env = { ...process.env, DATABASE_URL: "postgresql://unused@127.0.0.1:1/unused",
  NEXT_TELEMETRY_DISABLED: "1", PRODUCT_MEDIA_CLEANUP_ENABLED: "false", PRODUCT_VARIANTS_ENABLED: "true",
  ONLINE_PAYMENT_MODE: "disabled", TELEGRAM_BOT_TOKEN: "", TELEGRAM_ADMIN_CHAT_ID: "", NP_API_KEY: "", AUTH_DEBUG: "0",
  AUTH_SECRET: randomBytes(32).toString("hex"), CUSTOMER_AUTH_SECRET: randomBytes(32).toString("hex"),
  RESEND_API_KEY: "local-mock", EMAIL_FROM: "QA <qa@example.test>", CUSTOMER_GOOGLE_CLIENT_ID: "local-google-id",
  CUSTOMER_GOOGLE_CLIENT_SECRET: "local-google-secret", ADMIN_USERNAME: "local-admin",
  // A fixture salt starting with "." keeps dotenv-expand from expanding the hash as a variable.
  ADMIN_PASSWORD_HASH: bcrypt.hashSync("isolated-admin-password", "$2a$10$......................"), BATCH19_MAIL_LOG: join(directory, "mail.ndjson"),
  BATCH19_QA_DIRECTORY: directory, BATCH19_QA_MARKER: marker, VERCEL: "", VERCEL_ENV: "" };
for (const key of Object.keys(env)) if (key.startsWith("PG")) delete env[key];
env.PGSSLMODE = "disable";
writeFileSync(env.BATCH19_MAIL_LOG, "");

function run(file, args, options = {}) {
  return new Promise((done, fail) => {
    const child = spawn(file, args, { cwd: root, env, windowsHide: true, ...options });
    let output = "";
    for (const stream of [child.stdout, child.stderr]) stream?.on("data", (part) => { output += part; });
    child.on("error", fail);
    child.on("close", (code) => code === 0 ? done(output) : fail(new Error(`${file} exited ${code}: ${output}`)));
  });
}

async function freePort() {
  const server = createServer();
  await new Promise((done, fail) => { server.once("error", fail); server.listen(0, "127.0.0.1", done); });
  const port = server.address().port;
  await new Promise((done) => server.close(done));
  return port;
}

const next = resolve("node_modules/next/dist/bin/next");
const prisma = resolve("node_modules/prisma/build/index.js");
const release = "docs/release/batch-1.9-customer-account";
const approved = ["-c", "SET batch19.reviewed_execution='customer-account-reviewed'"];
let app;
try {
  const port = await freePort();
  await run(pg("initdb"), ["-D", data, "-U", owner, "--auth=trust", "--locale=C", "--encoding=UTF8"], { cwd: directory });
  await run(pg("pg_ctl"), ["-D", data, "-l", join(directory,"postgres.log"), "-o", `-h 127.0.0.1 -p ${port} -c max_connections=25 -c timezone=Europe/Kyiv`, "-w", "start"], { cwd: directory, stdio: "ignore" });
  const connection = ["-X", "-v", "ON_ERROR_STOP=1", "-h", "127.0.0.1", "-p", String(port), "-U", owner, "-d", "postgres"];
  const sql = (args) => run(pg("psql"), [...connection, ...args]);
  const file = (path, settings = []) => sql([...settings, "-f", resolve(path)]);
  await sql(["-c", `CREATE DATABASE ${database}`]);
  connection[connection.length - 1] = database;
  const baseline = join(directory, "baseline.prisma");
  writeFileSync(baseline, await run("git", ["show", "76621cf01ebe482bfee9a80aaed4a4b5b9dfed22:prisma/schema.prisma"]));
  writeFileSync(join(directory, "baseline.sql"), await run(process.execPath, [prisma, "migrate", "diff", "--from-empty", "--to-schema-datamodel", baseline, "--script"]));
  await file(join(directory, "baseline.sql"));
  await file("docs/review/batch-1.8-variants.sql", ["-c", "SET batch18.disposable_review='synthetic-fixtures-only'"]);
  await file("docs/release/batch-1.8a-color-images.sql", ["-c", "SET batch18a.reviewed_execution='color-images-reviewed'"]);
  await sql(["-c", `CREATE ROLE app_3dkid LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
    REVOKE CREATE ON SCHEMA public FROM PUBLIC; GRANT USAGE ON SCHEMA public TO app_3dkid;
    GRANT SELECT ON public."Category",public."SiteContent",public."Product",public."ProductImage",public."ProductOption",public."ProductOptionValue",public."ProductVariant",public."ProductVariantSelection",public."ProductAttribute",public."Review" TO app_3dkid;
    GRANT UPDATE (name) ON public."Product" TO app_3dkid;
    GRANT SELECT, INSERT ON public."Order",public."OrderItem" TO app_3dkid;
    INSERT INTO public."User" (id,email,role) VALUES ('qa_existing_admin','admin@example.test','ADMIN');`]);
  await file("docs/release/batch-1.8.1-filaments.sql", ["-c", "SET batch181.reviewed_execution='filaments-reviewed'"]);
  await sql(["-c", `
    INSERT INTO public."Account" (id,"userId",provider,"providerAccountId",type) VALUES ('legacy_account','qa_existing_admin','legacy','admin-id','oidc');
    INSERT INTO public."Session" (id,"userId","sessionToken",expires) VALUES ('legacy_session','qa_existing_admin','legacy-session-token',now()+interval '1 day');
    INSERT INTO public."Order" (id,number,"checkoutAcceptance","acceptedAt","customerName","customerEmail","customerPhone","shippingAddress",city,"postalCode","paymentMethod",subtotal,total)
      VALUES ('legacy_order','91','ACCEPTED',now(),'Legacy Buyer','legacy@example.test','0500000091','Legacy address','Kyiv','12','COD',7,7);`]);
  await file(release + "-preflight.sql");
  await assert.rejects(file(release + ".sql"), /B19_REVIEW_OR_BASELINE_GUARD_MISSING/);
  await file(release + ".sql", approved);
  await file(release + "-verify.sql");
  const baselineCompatibility = await sql(["-qAt", "-c", `BEGIN; SET LOCAL ROLE app_3dkid;
    SELECT "customerEmail" || '|' || total FROM public."Order" WHERE id = 'legacy_order';
    INSERT INTO public."Order" (id,number,"customerName","customerEmail","customerPhone","shippingAddress",city,"postalCode","paymentMethod",subtotal,total)
      VALUES ('legacy_new','92','Legacy Checkout','older-client@example.test','0500000092','Legacy address','Kyiv','12','COD',8,8);
    SELECT "customerEmail" FROM public."Order" WHERE id='legacy_new'; ROLLBACK;`]);
  assert.match(baselineCompatibility, /legacy@example\.test\|7(?:\.0+)?\s+older-client@example\.test/);
  assert.match(await sql(["-qAt", "-c", `SELECT "sessionToken" FROM public."Session" WHERE id='legacy_session'; SELECT "providerAccountId" FROM public."Account" WHERE id='legacy_account'`]), /legacy-session-token\s+admin-id/);
  await assert.rejects(sql(["-c", `SET ROLE app_3dkid; DELETE FROM public."Session" WHERE id='legacy_session'`]), /B19_RUNTIME_CUSTOMERS_ONLY/);
  await assert.rejects(sql(["-c", `SET ROLE app_3dkid; INSERT INTO public."Account" (id,"userId",provider,"providerAccountId",type) VALUES ('forged_account','qa_existing_admin','google','forged','oidc')`]), /B19_RUNTIME_CUSTOMERS_ONLY/);
  await file(release + "-rollback.sql", approved);
  await file(release + "-preflight.sql");
  await file(release + ".sql", approved);
  const ownerUrl = `postgresql://${owner}@127.0.0.1:${port}/${database}?schema=public&connection_limit=6`;
  const drift = await run(process.execPath, [prisma, "migrate", "diff", "--from-url", ownerUrl, "--to-schema-datamodel", resolve("prisma/schema.prisma"), "--script"]);
  assert.match(drift, /This is an empty migration/);
  console.log("PASS baseline guards, sentinel, legacy checkout reads/writes and admin records, transactional migration, empty rollback, reapply and Prisma schema comparison");

  if (process.argv.includes("--commerce-regression")) {
    await sql(["-c", `INSERT INTO public."Category" (id,name,"nameEn",slug) VALUES ('qa_category','QA','QA','qa');
      INSERT INTO public."Product" (id,name,slug,description,price,"categoryId","updatedAt","isOrderable")
      VALUES ('legacy_simple','QA Simple','legacy-simple','Synthetic',123.45,'qa_category',now(),true);`]);
    console.log(await run(process.execPath, [resolve("node_modules/tsx/dist/cli.mjs"), resolve("scripts/verify-batch181-postgres.ts")], {
      env: { ...env, DATABASE_URL: ownerUrl, BATCH18_QA_DATABASE_URL: ownerUrl, BATCH18A_QA_DIRECTORY: directory, BATCH18A_QA_MARKER: marker },
    }));
  }
  await file("scripts/fixtures/batch19-data.sql");
  await assert.rejects(sql(["-c", `SET ROLE app_3dkid; INSERT INTO public."User" (id,email,role) VALUES ('forged','forged@example.test','ADMIN')`]), /B19_RUNTIME_CUSTOMERS_ONLY/);
  await assert.rejects(sql(["-c", `SET ROLE app_3dkid; UPDATE public."User" SET "passwordHash"='fake' WHERE id='qa_existing_admin'`]), /B19_RUNTIME_CUSTOMERS_ONLY/);
  await assert.rejects(sql(["-c", `SET ROLE app_3dkid; UPDATE public."Order" SET "customerId"='qa_existing_admin' WHERE id='claim_order'`]), /B19_ORDER_OWNER_MUST_BE_CUSTOMER/);
  await assert.rejects(sql(["-c", `UPDATE public."OrderItem" SET "productImageUrl"='changed' WHERE id='historic_item'`]), /B19_ORDER_IMAGE_IMMUTABLE/);
  const runtime = `postgresql://app_3dkid@127.0.0.1:${port}/${database}?schema=public&connection_limit=6`;
  env.DATABASE_URL = runtime;
  env.BATCH19_OWNER_DATABASE_URL = ownerUrl;

  const appPort = await freePort();
  const origin = `http://127.0.0.1:${appPort}`;
  Object.assign(env, { CUSTOMER_AUTH_ORIGIN: origin, AUTH_URL: origin, NEXTAUTH_URL: origin, NEXT_PUBLIC_SITE_URL: origin, BATCH19_APP_ORIGIN: origin });
  console.log(await run(process.execPath, [resolve("node_modules/tsx/dist/cli.mjs"), resolve("scripts/verify-batch19-concurrency.ts")]));

  if (!process.argv.includes("--database-only")) {
  const externalMock = resolve("scripts/fixtures/batch19-mock-providers.cjs").replaceAll("\\", "/");
  env.NODE_OPTIONS = `--require "${externalMock}" --use-system-ca`;
  if (!process.argv.includes("--reuse-build")) console.log(await run(process.execPath, [next, "build"]));
  app = spawn(process.execPath, [next, "start", "--hostname", "127.0.0.1", "--port", String(appPort)], { cwd: root, env, stdio: ["ignore", "inherit", "inherit"], windowsHide: true });
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try { ready = (await fetch(`${origin}/api/customer-favorites`)).ok; } catch { /* Wait for bind. */ }
    if (ready) break;
    await pause(100);
  }
  assert.ok(ready, "Private app failed to start");
  const start = origin + "/api/customer-auth/start/google";
  function startRequest(headers, body = new URLSearchParams({ mode: "signin" })) {
    return fetch(start, { method: "POST", headers: { origin, ...headers }, body });
  }
  const unexpectedHost = await new Promise((done, fail) => {
    const body = "mode=signin";
    const request = httpRequest(start, { method: "POST", headers: {
      host: "wrong.example.test", origin, "content-type": "application/x-www-form-urlencoded", "content-length": body.length,
    } }, (response) => { response.resume(); done(response.statusCode); });
    request.on("error", fail);
    request.end(body);
  });
  assert.equal(unexpectedHost, 403);
  assert.equal((await startRequest({ "content-type": "application/json" }, "{}")).status, 400);
  assert.equal((await startRequest({}, new URLSearchParams({ mode: "signin", extra: "a".repeat(1024) }))).status, 400);
  assert.equal((await fetch(start)).status, 404);
  const oauth = await startRequest({ "x-forwarded-host": "wrong.example.test", "x-forwarded-proto": "https", forwarded: "host=wrong.example.test;proto=https" });
  assert.equal(oauth.status, 200, "Local OAuth initiation HTTP status");
  const oauthStart = await oauth.json();
  assert.ok(typeof oauthStart.url === "string", `Local OAuth initiation failed (${oauth.status}, ${oauthStart.error}). Cookie names: ${oauth.headers.getSetCookie().map((cookie) => cookie.split("=")[0]).join(", ")}`);
  assert.equal(new URL(oauthStart.url).searchParams.get("redirect_uri"), origin + "/api/customer-auth/callback/google");
  assert.match(oauth.headers.get("cache-control"), /private.*no-store/);
  console.log("PASS canonical OAuth origin and customer auth method, Host and bounded body checks");
  const screenshots = process.argv.includes("--ux06-screenshots") ? ["--ux06-screenshots"] : [];
  console.log(await run(process.execPath, [resolve("scripts/verify-batch19-browser.mjs"), ...screenshots]));
  }
  await assert.rejects(file(release + "-rollback.sql", approved), /B19_USE_FORWARD_RECOVERY/);
  if (!process.argv.includes("--database-only")) {
    await assert.rejects(sql(["-c", `UPDATE public."Order" SET "customerId"=NULL WHERE id='claim_order'`]), /B19_ORDER_OWNER_IMMUTABLE/);
  }
  await file(release + "-verify.sql");
  console.log("PASS restricted runtime role, immutable order ownership and rollback refusal after customer data");
  await file("scripts/fixtures/batch19-workload.sql");
  console.log(await run(process.execPath, [resolve("node_modules/tsx/dist/cli.mjs"), resolve("scripts/verify-batch19-workload.ts")]));
} finally {
  if (app && app.exitCode === null) { const stopped = new Promise((done) => app.once("exit", done)); app.kill(); await stopped; }
  if (existsSync(join(data, "postmaster.pid")) && readFileSync(join(directory,"qa-marker"),"utf8") === marker)
    await run(pg("pg_ctl"), ["-D", data, "-m", "fast", "-w", "stop"], { cwd: directory, stdio: "ignore" });
}
