// Offline-only review. No SDK, database, environment loading or mutation imports.
import { createHash } from "node:crypto";
import { z } from "zod";
import { managedMediaUrl, mediaReferences } from "../../src/lib/media-lifecycle-policy";

export const MAX_DIAGNOSTIC_INPUT_BYTES = 5_000_000;
export const ORPHAN_REVIEW_MIN_AGE_MS = 30 * 24 * 60 * 60 * 1000;
export const SNAPSHOT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const timestamp = z.string().datetime({ offset: true });
const identifier = z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/);
const environment = z.enum(["production", "preview", "development", "other"]);
const urls = z.array(z.string().max(2048)).max(10000);
export const inventoryDiagnosticSchema = z.object({
  version: z.literal(1), storeId: z.string().regex(/^[a-z0-9]{1,64}$/), targetEnvironment: environment,
  expectedSources: z.array(identifier).min(1).max(20),
  inventory: z.object({ capturedAt: timestamp, complete: z.boolean(), blobs: z.array(z.object({
    url: z.string().max(2048), uploadedAt: timestamp.nullable(),
  }).strict()).max(10000) }).strict(),
  references: z.array(z.object({
    sourceId: identifier, environment, capturedAt: timestamp, complete: z.boolean(),
    values: z.array(z.string().max(20000)).max(10000),
    pendingRetirementUrls: urls, retiredUrls: urls,
  }).strict()).max(20),
}).strict().superRefine((value, context) => {
  if (new Set(value.expectedSources).size !== value.expectedSources.length || new Set(value.references.map((source) => source.sourceId)).size !== value.references.length) {
    context.addIssue({ code: "custom", message: "DUPLICATE_SOURCE" });
  }
});

export function diagnoseBlobInventory(input: unknown, now = Date.now()) {
  if (!Number.isSafeInteger(now) || now < 0) throw new Error("INVALID_DIAGNOSTIC_CLOCK");
  if (Buffer.byteLength(JSON.stringify(input) ?? "", "utf8") > MAX_DIAGNOSTIC_INPUT_BYTES) throw new Error("DIAGNOSTIC_INPUT_TOO_LARGE");
  const data = inventoryDiagnosticSchema.parse(input);
  const host = `${data.storeId}.public.blob.vercel-storage.com`;
  const fresh = (value: string) => Number.isFinite(Date.parse(value)) && Date.parse(value) <= now && now - Date.parse(value) <= SNAPSHOT_MAX_AGE_MS;
  const issues: string[] = [];
  if (!data.inventory.complete) issues.push("inventory_incomplete");
  if (!fresh(data.inventory.capturedAt)) issues.push("inventory_stale_or_future");
  for (const source of data.expectedSources) if (!data.references.some((entry) => entry.sourceId === source)) issues.push(`missing_reference_source:${source}`);
  for (const source of data.references) {
    if (!data.expectedSources.includes(source.sourceId)) issues.push(`unexpected_reference_source:${source.sourceId}`);
    if (!source.complete) issues.push(`reference_snapshot_incomplete:${source.sourceId}`);
    if (!fresh(source.capturedAt)) issues.push(`reference_snapshot_stale_or_future:${source.sourceId}`);
  }
  // The currently shared-store audit requires both environments to be represented,
  // even when one explicitly supplies an empty, independently collected snapshot.
  for (const required of ["production", "preview"]) if (!data.references.some((source) => source.environment === required)) issues.push(`${required}_snapshot_missing`);
  const referenceSources = new Map<string, string[]>();
  const retirement = new Set<string>();
  let crossEnvironmentReferences = false;
  for (const source of data.references) {
    for (const url of mediaReferences(source.values, true)) {
      referenceSources.set(url, [...(referenceSources.get(url) ?? []), source.sourceId]);
      if (new URL(url).hostname === host && source.environment !== data.targetEnvironment) crossEnvironmentReferences = true;
    }
    for (const url of mediaReferences([...source.pendingRetirementUrls, ...source.retiredUrls], true)) retirement.add(url);
  }
  if (crossEnvironmentReferences) issues.push("target_store_referenced_in_other_environment");
  const canonical = data.inventory.blobs.map((blob) => managedMediaUrl(blob.url));
  const occurrences = new Map<string, number>();
  for (const url of canonical) if (url) occurrences.set(url, (occurrences.get(url) ?? 0) + 1);
  const assets = data.inventory.blobs.map((blob, index) => {
    const url = canonical[index];
    const owned = url !== null && new URL(url).hostname === host;
    const assetId = createHash("sha256").update(url ?? blob.url).digest("hex");
    const sources = url ? referenceSources.get(url) ?? [] : [];
    const age = blob.uploadedAt === null ? null : now - Date.parse(blob.uploadedAt);
    const state = !url ? "ignored_unmanaged" : !owned ? "ignored_other_store" : sources.length ? "referenced" : retirement.has(url) ? "existing_retirement" :
      (occurrences.get(url) ?? 0) > 1 ? "duplicate_inventory" : age === null || !Number.isFinite(age) || age < 0 ? "retained_unknown_or_future_age" :
      age < ORPHAN_REVIEW_MIN_AGE_MS ? "retained_young" : issues.length ? "insufficient_evidence" : "candidate_for_manual_review";
    return { assetId, ...(owned ? { url } : {}), state, referenceSources: sources };
  });
  return {
    version: 1, mode: "offline-review-only", deletionAuthorized: false, activationAuthorized: false,
    asOf: new Date(now).toISOString(), minimumReviewAgeDays: 30, snapshotEvidenceComplete: issues.length === 0,
    crossEnvironmentReferences, evidenceIssues: issues,
    warnings: ["OPERATOR_SUPPLIED_COMPLETENESS_NOT_INDEPENDENTLY_VERIFIED", "LIVE_STORE_DATABASE_SCOPE_AND_WRITERS_NOT_VERIFIED", "SNAPSHOTS_AND_AGE_NEVER_AUTHORIZE_DELETION"],
    counts: Object.fromEntries([...new Set(assets.map((asset) => asset.state))].map((state) => [state, assets.filter((asset) => asset.state === state).length])),
    assets,
  };
}
