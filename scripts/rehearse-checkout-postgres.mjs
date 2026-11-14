// Creates its OWN cluster; never uses DATABASE_URL or an existing PG service.
// Requires installed PostgreSQL binaries. Synthetic fixtures only. No notifications.
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { randomUUID } from "node:crypto";

const root = process.cwd();
const bin = process.env.BATCH174A_PG_BIN || "C:/Program Files/PostgreSQL/18/bin";
const directory = mkdtempSync(join(tmpdir(), "batch174a-private-pg-"));
const data = join(directory, "data");
const marker = randomUUID();
writeFileSync(join(directory, "qa-marker"), marker);
const env = { ...process.env, DATABASE_URL: "", PGHOST: "", PGPORT: "", PGDATABASE: "", PGUSER: "", PGPASSWORD: "", PGSERVICE: "", PGSERVICEFILE: "", PGOPTIONS: "", PGSSLMODE: "disable" };
for (const name of Object.keys(env)) if (name.startsWith("PG")) delete env[name];
function run(executable, args, options = {}) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(executable, args, { cwd: directory, env, windowsHide: true, ...options });
    let output = "";
    child.stdout?.on("data", (part) => { output += part; });
    child.stderr?.on("data", (part) => { output += part; });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolveRun(output) : reject(new Error(`${executable} exited ${code}: ${output}`)));
  });
}
const exe = (name) => join(bin, process.platform === "win32" ? `${name}.exe` : name);
let started = false;
try {
  const legacy = await run("git", ["-C", root, "show", "cf7334bc84ce007f3d4fa6a205a342c1ce83d485^:prisma/schema.prisma"]);
  if (!legacy.includes("number                  String      @unique") || legacy.includes("enum CheckoutAcceptance")) throw new Error("Unexpected legacy baseline");
  const baseline = join(directory, "baseline.prisma"); writeFileSync(baseline, legacy);
  const prisma = resolve(root, "node_modules/prisma/build/index.js");
  const sql = await run(process.execPath, [prisma, "migrate", "diff", "--from-empty", "--to-schema-datamodel", baseline, "--script"]);
  writeFileSync(join(directory, "baseline.sql"), sql);
  await run(exe("initdb"), ["-D", data, "-U", "batch174a_qa", "--auth=trust", "--locale=C", "--encoding=UTF8"]);
  const server = createServer();
  await new Promise((done, fail) => { server.once("error", fail); server.listen(0, "127.0.0.1", done); });
  const port = server.address().port;
  await new Promise((done) => server.close(done));
  // Explicit loopback port, cluster and database; no inherited default connection.
  await run(exe("pg_ctl"), ["-D", data, "-l", join(directory, "server.log"), "-o", `-h 127.0.0.1 -p ${port}`, "-w", "start"], { stdio: "ignore" });
  started = true;
  const connection = ["-X", "-v", "ON_ERROR_STOP=1", "-h", "127.0.0.1", "-p", String(port), "-U", "batch174a_qa", "-d", "postgres"];
  await run(exe("psql"), [...connection, "-c", "CREATE DATABASE batch174a_qa"]);
  connection[connection.length - 1] = "batch174a_qa";
  await run(exe("psql"), [...connection, "-f", join(directory, "baseline.sql")]);
  // Historical fixtures exist BEFORE expansion, including their item/FK rows.
  await run(exe("psql"), [...connection, "-f", resolve(root, "scripts/fixtures/batch174a-history.sql")]);
  await run(exe("psql"), [...connection, "-f", resolve(root, "prisma/changes/batch-1-7-4a-preflight-readonly.sql")]);
  await run(exe("psql"), [...connection, "-f", resolve(root, "prisma/changes/batch-1-7-4a-checkout-acceptance.sql")]);
  const url = `postgresql://batch174a_qa@127.0.0.1:${port}/batch174a_qa?schema=public&connection_limit=16`;
  const drift = await run(process.execPath, [prisma, "migrate", "diff", "--from-url", url, "--to-schema-datamodel", resolve(root, "prisma/schema.prisma"), "--script"]);
  if (!drift.includes("This is an empty migration")) throw new Error(`Prisma expansion drift: ${drift}`);
  // The SQL CHECK constraints are intentionally additional to Prisma's model.
  const output = await run(process.execPath, [resolve(root, "node_modules/tsx/dist/cli.mjs"), resolve(root, "scripts/verify-checkout-postgres.ts")], {
    cwd: root, env: { ...env, BATCH174A_QA_DATABASE_URL: url, BATCH174A_QA_CLUSTER_DIR: directory, BATCH174A_QA_MARKER: marker },
  });
  process.stdout.write(output);
  await run(exe("psql"), [...connection, "-f", resolve(root, "prisma/changes/batch-1-7-4a-monitor-readonly.sql")]);
  console.log("PASS expansion from pre-batch schema; Prisma diff empty; private PostgreSQL rehearsal completed.");
} finally {
  // Stop ONLY the cluster we initialized, also if tests/expansion failed.
  if (started && readFileSync(join(directory, "qa-marker"), "utf8") === marker) await run(exe("pg_ctl"), ["-D", data, "-m", "fast", "-w", "stop"], { stdio: "ignore" });
  console.log("Private rehearsal files retained in the OS temporary directory; no existing service targeted.");
}
