// OFFLINE artifact checks only. No PrismaClient, project .env or database connection.
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";

const review = readFileSync("docs/review/batch-1.8-variants.sql", "utf8");
const candidate = readFileSync("docs/review/batch-1.8-production-candidate.sql", "utf8");
const preflight = readFileSync("docs/review/batch-1.8-neon-preflight-readonly.sql", "utf8");
const normalize = (value) => value.replaceAll("\r\n", "\n").trim();
const body = review.slice(review.indexOf("-- CreateEnum"), review.lastIndexOf("COMMIT;")).trim();
const preserved = candidate.split("-- B18_PRESERVED_REVIEW_BODY_BEGIN")[1].split("-- B18_PRESERVED_REVIEW_BODY_END")[0].trim();
assert.equal(normalize(preserved), normalize(body));
assert.ok(review.startsWith("-- NOT APPROVED FOR PRODUCTION EXECUTION."));
assert.match(review, /batch18\.disposable_review/);
assert.match(review, /\^batch18_review_/);
assert.match(candidate, /current_database\(\)='restore_3dkid_batch18'/);
assert.match(candidate, /execution_mode',true\) IS DISTINCT FROM 'LOCAL_REHEARSAL'/);
assert.match(candidate, /\^batch18_rehearsal_/);
assert.match(candidate, /inet_server_port\(\) IS DISTINCT FROM 55432/);
assert.match(candidate, /B18_PRODUCTION_EXECUTION_NOT_AUTHORIZED/);
assert.match(candidate, /B18_REVIEWED_SCHEMA_FINGERPRINT_DIFFERS/);
assert.equal((candidate.match(/^BEGIN;/gm) ?? []).length, 1);
assert.equal((candidate.match(/^COMMIT;/gm) ?? []).length, 1);
assert.match(candidate, /SET CONSTRAINTS ALL IMMEDIATE;\s*COMMIT;\s*$/);
assert.ok(candidate.indexOf("B18_REVIEWED_SCHEMA_FINGERPRINT_DIFFERS") < candidate.indexOf("-- CreateEnum"));
console.log("PASS offline 1: preserved original guards/body, protected restore DB, local-only candidate and explicit manifest gate.");

const fingerprint = preflight.split("-- B18_SCHEMA_FINGERPRINT_BEGIN")[1].split("-- B18_SCHEMA_FINGERPRINT_END")[0].trim();
assert.ok(normalize(candidate).includes(normalize(fingerprint.replace("AS schema_fingerprint", "INTO actual_fingerprint"))));
const executable = preflight.replace(/--[^\r\n]*/g, "");
assert.match(executable, /BEGIN READ ONLY;/);
assert.doesNotMatch(executable, /^\s*(INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|GRANT|REVOKE|TRUNCATE|COPY)\b/im);
assert.doesNotMatch(executable, /pg_authid|rolpassword/i);
assert.match(executable, /B18_PREFLIGHT_IDENTITY_OR_APPROVAL_MISSING/);
console.log("PASS offline 2: identical metadata fingerprint and guarded read-only preflight without password/customer row queries.");

const directory = mkdtempSync(join(tmpdir(), "batch18-candidate-offline-"));
const schema = readFileSync("prisma/schema.prisma", "utf8");
const model = (value) => normalize(value).split("\n").filter((line) => !line.trim().startsWith("//")).join("\n");
assert.equal(model(schema), model(readFileSync("docs/review/batch-1.8-variants.prisma", "utf8")));
const baseline = spawnSync("git", ["show", "76621cf01ebe482bfee9a80aaed4a4b5b9dfed22:prisma/schema.prisma"], { encoding: "utf8" });
assert.equal(baseline.status, 0, "Pinned baseline schema unavailable");
writeFileSync(join(directory, "baseline.prisma"), baseline.stdout);
writeFileSync(join(directory, "candidate.prisma"), schema);
const env = {};
for (const key of ["SystemRoot", "SYSTEMROOT", "WINDIR", "ComSpec", "COMSPEC", "PATH", "Path", "PATHEXT", "TEMP", "TMP", "USERPROFILE", "APPDATA", "LOCALAPPDATA"])
  if (process.env[key] !== undefined) env[key] = process.env[key];
Object.assign(env, { DATABASE_URL: "postgresql://unused:unused@127.0.0.1:1/not_used", CHECKPOINT_DISABLE: "1", PRISMA_HIDE_UPDATE_MESSAGE: "1" });
const cli = resolve("node_modules/prisma/build/index.js");
function offline(args) {
  const result = spawnSync(process.execPath, [cli, ...args], { cwd: directory, env, encoding: "utf8", windowsHide: true });
  assert.equal(result.status, 0, `Offline Prisma command failed (exit ${result.status}); no database operation was requested.`);
  return result.stdout;
}
offline(["validate", "--schema", join(directory, "candidate.prisma")]);
const ddl = offline(["migrate", "diff", "--from-schema-datamodel", join(directory, "baseline.prisma"), "--to-schema-datamodel", join(directory, "candidate.prisma"), "--script"]);
const generated = body.split("-- End of Prisma 5.22 generated additive DDL.")[0];
const sql = (value) => value.replace(/--[^\r\n]*/g, "").replace(/\bpublic\./g, "").replace(/\s+/g, " ").trim();
assert.equal(sql(ddl), sql(generated));
console.log("PASS offline 3: Prisma validates; actual/review models and additive DDL agree without database access.");
console.log("NOT EXECUTED by this offline verifier: SQL execution and restored-product preservation. See the separate disposable PostgreSQL rehearsal evidence; static checks alone are not execution proof.");
