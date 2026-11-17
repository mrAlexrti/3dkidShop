// Isolated snapshots only; no environment loading, DB client or Blob SDK.
import assert from "node:assert/strict";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { diagnoseBlobInventory, MAX_DIAGNOSTIC_INPUT_BYTES, ORPHAN_REVIEW_MIN_AGE_MS, SNAPSHOT_MAX_AGE_MS } from "./lib/blob-inventory-diagnostics";

const now = Date.parse("2026-11-17T00:00:00Z");
const iso = (time: number) => new Date(time).toISOString();
const url = (index = 1, store = "fixturestore") => `https://${store}.public.blob.vercel-storage.com/3dkid/product-media/image/00000000-0000-4000-8000-${String(index).padStart(12, "0")}.webp`;
function fixture() {
  return {
    version: 1, storeId: "fixturestore", targetEnvironment: "production", expectedSources: ["prod-db", "preview-db"],
    inventory: { capturedAt: iso(now), complete: true, blobs: [{ url: url(), uploadedAt: iso(now - ORPHAN_REVIEW_MIN_AGE_MS) as string | null }] },
    references: ["production", "preview"].map((environment) => ({
      sourceId: environment === "production" ? "prod-db" : "preview-db", environment, capturedAt: iso(now), complete: true,
      values: [] as string[], pendingRetirementUrls: [] as string[], retiredUrls: [] as string[],
    })),
  };
}
let passed = 0;
const pass = (message: string) => console.log(`PASS ${++passed}: ${message}`);
const savedFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error("LIVE_NETWORK_FORBIDDEN"); };
try {
  const initial = fixture(); const before = structuredClone(initial); const report = diagnoseBlobInventory(initial, now);
  assert.equal(report.mode, "offline-review-only"); assert.equal(report.deletionAuthorized, false); assert.equal(report.activationAuthorized, false);
  assert.equal(report.assets[0].state, "candidate_for_manual_review"); assert.deepEqual(initial, before);
  assert.ok(report.warnings.includes("SNAPSHOTS_AND_AGE_NEVER_AUTHORIZE_DELETION"));
  pass("30-day-old unreferenced object is review-only, never authorized for deletion/activation; input remains unchanged");

  for (const [age, expected] of [[ORPHAN_REVIEW_MIN_AGE_MS - 1, "retained_young"], [ORPHAN_REVIEW_MIN_AGE_MS, "candidate_for_manual_review"], [-1, "retained_unknown_or_future_age"]] as const) {
    const input = fixture(); input.inventory.blobs[0].uploadedAt = iso(now - age);
    assert.equal(diagnoseBlobInventory(input, now).assets[0].state, expected);
  }
  const unknown = fixture(); unknown.inventory.blobs[0].uploadedAt = null;
  assert.equal(diagnoseBlobInventory(unknown, now).assets[0].state, "retained_unknown_or_future_age");
  pass("minimum-age boundary is not rounded down; unknown and future upload dates are retained");

  for (const reference of [url(), `${url()}?cache=1#fragment`, url().replace("https:", "http:"), JSON.stringify({ body: encodeURIComponent(url()) }), `Paragraph\n\n${url()}`]) {
    const input = fixture(); input.references[0].values.push(reference);
    assert.equal(diagnoseBlobInventory(input, now).assets[0].state, "referenced");
  }
  pass("main/gallery/hover/category/hero/About/Review exported values protect direct, embedded, encoded and HTTP/query aliases");

  const shared = fixture(); shared.references[1].values.push(url()); shared.inventory.blobs.push({ url: url(2), uploadedAt: iso(now - ORPHAN_REVIEW_MIN_AGE_MS) });
  const sharedReport = diagnoseBlobInventory(shared, now);
  assert.equal(sharedReport.crossEnvironmentReferences, true); assert.equal(sharedReport.assets[0].state, "referenced");
  assert.equal(sharedReport.assets[1].state, "insufficient_evidence");
  assert.ok(sharedReport.evidenceIssues.includes("target_store_referenced_in_other_environment"));
  pass("Preview references to the target Production store block store-isolation evidence, including other currently unreferenced objects");

  for (const kind of ["pendingRetirementUrls", "retiredUrls"] as const) {
    const input = fixture(); input.references[0][kind].push(url());
    assert.equal(diagnoseBlobInventory(input, now).assets[0].state, "existing_retirement");
  }
  pass("existing candidates, uncertain/deleted markers and their clocks are excluded from orphan enrollment; diagnostic never resets them");

  const unsafeUrls = ["https://res.cloudinary.com/fixture/image.webp", url(1, "otherstore"), url().replace("/3dkid/product-media/", "/unmanaged/"),
    url().replace("https://", "https://PRIVATE_USER:PRIVATE_PASSWORD@"), url().replace("https:", "http:"), `${url()}.html`, "javascript:PRIVATE_SCRIPT"];
  for (const unsafe of unsafeUrls) {
    const input = fixture(); input.inventory.blobs[0].url = unsafe;
    const asset = diagnoseBlobInventory(input, now).assets[0]; assert.ok(asset.state.startsWith("ignored_")); assert.ok(!("url" in asset));
    assert.ok(!JSON.stringify(asset).includes("PRIVATE_"));
  }
  const query = fixture(); query.inventory.blobs[0].url += "?PRIVATE_QUERY_SECRET=value";
  assert.equal(diagnoseBlobInventory(query, now).assets[0].url, url());
  pass("only exact store/app-managed objects are reviewable; external/foreign/arbitrary URLs are ignored and untrusted URL credentials/queries never appear in reports");

  for (const failure of ["inventory", "reference", "missing", "undeclared", "stale", "future", "preview-missing"] as const) {
    const input = fixture();
    if (failure === "inventory") input.inventory.complete = false;
    if (failure === "reference") input.references[0].complete = false;
    if (failure === "missing") input.expectedSources.push("missing-db");
    if (failure === "undeclared") input.expectedSources.pop();
    if (failure === "stale") input.references[0].capturedAt = iso(now - SNAPSHOT_MAX_AGE_MS - 1);
    if (failure === "future") input.inventory.capturedAt = iso(now + 1);
    if (failure === "preview-missing") { input.references.pop(); input.expectedSources.pop(); }
    const output = diagnoseBlobInventory(input, now); assert.equal(output.snapshotEvidenceComplete, false); assert.equal(output.assets[0].state, "insufficient_evidence");
  }
  pass("missing/truncated/stale/future or undeclared source snapshots fail closed; Production/Preview coverage cannot be silently omitted");

  const duplicate = fixture(); duplicate.inventory.blobs.push({ ...duplicate.inventory.blobs[0], url: `${url()}?alias=1` });
  assert.ok(diagnoseBlobInventory(duplicate, now).assets.every((asset) => asset.state === "duplicate_inventory"));
  const duplicateSource = fixture(); duplicateSource.references.push(duplicateSource.references[0]); assert.throws(() => diagnoseBlobInventory(duplicateSource, now));
  assert.throws(() => diagnoseBlobInventory({ ...fixture(), token: "FIXTURE_SECRET_MUST_NOT_BE_ACCEPTED" }, now));
  assert.throws(() => diagnoseBlobInventory(fixture(), NaN));
  const tooMany = fixture(); tooMany.inventory.blobs = Array.from({ length: 10001 }, () => ({ ...tooMany.inventory.blobs[0] })); assert.throws(() => diagnoseBlobInventory(tooMany, now));
  assert.throws(() => diagnoseBlobInventory({ unexpected: "x".repeat(MAX_DIAGNOSTIC_INPUT_BYTES) }, now));
  pass("duplicate identities, malformed/credential-bearing schema extensions, invalid clocks and bounded-size overflow cannot produce candidate reports");

  const output = resolve(".next/cache/blob-inventory-qa"); mkdirSync(output, { recursive: true });
  const inputPath = resolve(output, "fixture.json"); const data = fixture(); data.inventory.capturedAt = iso(Date.now());
  for (const source of data.references) source.capturedAt = data.inventory.capturedAt;
  writeFileSync(inputPath, JSON.stringify(data)); const inputBefore = readFileSync(inputPath, "utf8");
  const cli = (args: string[]) => spawnSync(process.execPath, [resolve("node_modules/tsx/dist/cli.mjs"), "scripts/diagnose-blob-inventory.ts", ...args], { encoding: "utf8", windowsHide: true });
  const successful = cli([inputPath]); assert.equal(successful.status, 0, successful.stderr);
  assert.equal(JSON.parse(successful.stdout).deletionAuthorized, false); assert.equal(readFileSync(inputPath, "utf8"), inputBefore);
  assert.notEqual(cli([inputPath, "--delete"]).status, 0); assert.notEqual(cli(["https://fixture.invalid/inventory.json"]).status, 0);
  writeFileSync(inputPath, JSON.stringify({ token: "FIXTURE_DO_NOT_ECHO" })); const invalid = cli([inputPath]);
  assert.notEqual(invalid.status, 0); assert.ok(invalid.stderr.includes("BLOB_DIAGNOSTIC_INPUT_REJECTED")); assert.ok(!invalid.stderr.includes("FIXTURE_DO_NOT_ECHO"));
  for (const path of ["scripts/diagnose-blob-inventory.ts", "scripts/lib/blob-inventory-diagnostics.ts"]) assert.ok(!/process\.env|@vercel\/blob|@prisma|dotenv|\bfetch\s*\(/.test(readFileSync(path, "utf8")));
  pass("CLI accepts only explicit bounded local files, rejects delete/URL arguments, preserves input, sanitizes failures and has no SDK/DB/env/network path");
  console.log(`PASS Blob inventory diagnostics: ${passed} isolated groups. No live DB/storage operations or cleanup activation.`);
} finally { globalThis.fetch = savedFetch; }
