import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { del, BlobNotFoundError } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { CLEANUP_QUEUE_PREFIX, RETIRED_MEDIA_PREFIX, managedMediaUrl, mediaReferences, RetiredMediaError } from "@/lib/media-lifecycle-policy";

const LEASE_MS = 60000;
const MAX_SCAN = 1000;
const BATCH_SIZE = 4;
export const MEDIA_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
// A lock waiter must read a fresh snapshot AFTER the advisory lock is granted,
// even if the database's default transaction isolation changes in the future.
export const MEDIA_TRANSACTION_OPTIONS = { isolationLevel: "ReadCommitted" as const };
type Job = { version: 2; url: string; retentionStartedAt: number | null; attempts: number; nextAttemptAt: number; leaseUntil: number; claim: string | null };
const assetId = (url: string) => createHash("sha256").update(url).digest("hex");
const queueKey = (url: string) => CLEANUP_QUEUE_PREFIX + assetId(url);
const retiredKey = (url: string) => RETIRED_MEDIA_PREFIX + assetId(url);
const backoff = (attempts: number) => Math.min(3600000, 60000 * 2 ** Math.min(6, Math.max(0, attempts - 1)));
function log(event: string, url?: string) { console.warn(JSON.stringify({ event, ...(url ? { asset: assetId(url) } : {}) })); }

// Every application media writer acquires this same cross-instance transaction lock
// BEFORE reading previous values or checking tombstones. Checkout never takes it.
export async function lockMediaWrites(tx: Prisma.TransactionClient) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(175501, 1)`;
}

export async function assertMediaAttachable(tx: Prisma.TransactionClient, values: (string | null | undefined)[]) {
  const references = mediaReferences(values, true);
  const keys = references.map(retiredKey);
  if (!keys.length) return;
  const retired = await tx.siteContent.findFirst({ where: { key: { in: keys } }, select: { key: true } });
  // Presence is enough: malformed markers fail closed, as do uncertain deletions.
  if (retired) throw new RetiredMediaError();
  // Reuse during retention cancels the candidate in the SAME save transaction.
  // A failed save rolls this cancellation back too. Claimed assets stay fenced.
  await tx.siteContent.deleteMany({ where: { key: { in: references.map(queueKey) } } });
}

export async function enqueueSupersededMedia(tx: Prisma.TransactionClient, previous: (string | null | undefined)[], next: (string | null | undefined)[] = []) {
  const retained = new Set(mediaReferences(next, true));
  const candidates = mediaReferences(previous).filter((value) => !retained.has(value));
  if (!candidates.length) return;
  let referenced: Set<string>;
  try { referenced = await readMediaReferences(tx); }
  catch (error) {
    // An oversized reference inventory retains files without blocking Save.
    if (error instanceof Error && error.message === "MEDIA_REFERENCE_SCAN_LIMIT") { log("media_cleanup_enqueue_scan_limit"); return; }
    throw error;
  }
  for (const url of candidates) {
    // Retiring/deleted markers and uncertain retries are permanent protections.
    if (await tx.siteContent.findUnique({ where: { key: retiredKey(url) }, select: { key: true } })) continue;
    if (referenced.has(url)) {
      await tx.siteContent.deleteMany({ where: { key: queueKey(url) } });
      continue;
    }
    // Completed retirement is permanent; repeated mutations do not re-delete it.
    const job: Job = { version: 2, url, retentionStartedAt: null, attempts: 0, nextAttemptAt: 0, leaseUntil: 0, claim: null };
    // A later removal (including the last shared reference) earns a fresh full
    // retention period. Only an unclaimed candidate can be reset this way.
    await tx.siteContent.upsert({ where: { key: queueKey(url) }, create: { key: queueKey(url), value: JSON.stringify(job) }, update: { value: JSON.stringify(job) } });
  }
}

function configuredStore(): { token: string; host: string } | null {
  const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  // SDK 2.9 read-write tokens carry their store id as the fourth '_' segment.
  // Never fall back to a client token or an arbitrary URL-supplied store id.
  const parts = token?.split("_");
  const id = parts?.[3];
  if (!token || !token.startsWith("vercel_blob_rw_") || !id || !/^[a-z0-9]+$/i.test(id) || !parts?.slice(4).join("_")) return null;
  const configured = process.env.BLOB_STORE_ID?.replace(/^store_/, "").toLowerCase();
  if (configured && configured !== id.toLowerCase()) return null;
  return { token, host: `${id.toLowerCase()}.public.blob.vercel-storage.com` };
}

function isolatedScopeApproved(host: string) {
  // Connection variables alone cannot prove that Preview uses the same DB.
  // Require an operator-reviewed, exclusive store/environment/database binding.
  try {
    const raw = process.env.PRODUCT_MEDIA_CLEANUP_SCOPE;
    if (!raw || raw.length > 1024) return false;
    const scope = JSON.parse(raw);
    const database = new URL(process.env.DATABASE_URL ?? "");
    if (!["postgres:", "postgresql:"].includes(database.protocol) || !database.hostname || database.pathname.length < 2) return false;
    // Schema/search-path parameters and DB role can change visible references
    // even when host/database match. Bind these too; exclude the URI password.
    database.searchParams.sort();
    const databaseFingerprint = createHash("sha256").update(JSON.stringify([
      database.hostname.toLowerCase(), database.port || "5432", database.pathname, database.username, database.search,
    ])).digest("hex");
    return scope?.exclusiveStore === true && ["production", "preview", "development"].includes(scope.environment) &&
      scope.environment === process.env.VERCEL_ENV && scope.storeId === host.split(".")[0] && scope.databaseFingerprint === databaseFingerprint;
  } catch { return false; }
}

function parseJob(key: string, value: string): Job | null {
  try {
    const stored = JSON.parse(value);
    // Legacy immediate candidates get a NEW 30-day clock, never an inferred age.
    const job: Job = stored.version === 1 ? { ...stored, version: 2, retentionStartedAt: null } : stored;
    if (job.version !== 2 || managedMediaUrl(job.url) !== job.url || queueKey(job.url) !== key ||
      !(job.retentionStartedAt === null || Number.isSafeInteger(job.retentionStartedAt) && job.retentionStartedAt >= 0) ||
      !Number.isSafeInteger(job.attempts) || job.attempts < 0 || !Number.isFinite(job.nextAttemptAt) || !Number.isFinite(job.leaseUntil) ||
      !(job.claim === null || typeof job.claim === "string")) return null;
    return job;
  } catch { return null; }
}

async function readMediaReferences(tx: Prisma.TransactionClient) {
  // Bounded, conservative projections include inactive products and every gallery
  // image. A scan limit/error defers cleanup; it can never authorize deletion.
  const [images, products, categories, content, testimonials] = await Promise.all([
    tx.productImage.findMany({ select: { url: true }, take: MAX_SCAN + 1 }),
    tx.product.findMany({ select: { hoverGifUrl: true, description: true, descriptionEn: true }, take: MAX_SCAN + 1 }),
    tx.category.findMany({ select: { imageUrl: true, description: true }, take: MAX_SCAN + 1 }),
    tx.siteContent.findMany({ where: { NOT: { OR: [{ key: { startsWith: CLEANUP_QUEUE_PREFIX } }, { key: { startsWith: RETIRED_MEDIA_PREFIX } }] } }, select: { value: true }, take: MAX_SCAN + 1 }),
    tx.review.findMany({ select: { avatarUrl: true, text: true }, take: MAX_SCAN + 1 }),
  ]);
  if ([images, products, categories, content, testimonials].some((rows) => rows.length > MAX_SCAN)) throw new Error("MEDIA_REFERENCE_SCAN_LIMIT");
  return new Set(mediaReferences([...images.map((row) => row.url), ...products.flatMap((row) => [row.hoverGifUrl, row.description, row.descriptionEn]),
    ...categories.flatMap((row) => [row.imageUrl, row.description]), ...content.map((row) => row.value),
    ...testimonials.flatMap((row) => [row.avatarUrl, row.text])], true));
}

async function claimJob(key: string, host: string): Promise<Job | null> {
  return prisma.$transaction(async (tx) => {
    await lockMediaWrites(tx);
    const row = await tx.siteContent.findUnique({ where: { key } });
    const job = row && parseJob(key, row.value);
    if (!job || new URL(job.url).hostname !== host) return null;
    // One authoritative clock across instances. A fast app-server clock cannot
    // shorten retention. A failed/invalid DB clock lookup retains the asset.
    const [time] = await tx.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS "now"`;
    const now = time?.now instanceof Date ? time.now.getTime() : NaN;
    if (!Number.isFinite(now)) throw new Error("MEDIA_CLEANUP_CLOCK_UNAVAILABLE");
    if (job.nextAttemptAt > now || job.leaseUntil > now) return null;
    const retired = await tx.siteContent.findUnique({ where: { key: retiredKey(job.url) } });
    if (retired && JSON.parse(retired.value).state === "deleted") { await tx.siteContent.deleteMany({ where: { key } }); return null; }
    if ((await readMediaReferences(tx)).has(job.url)) {
      if (!retired) {
        // A future removal by any participating writer re-enqueues the last reference.
        await tx.siteContent.deleteMany({ where: { key } });
      } else {
        log("media_cleanup_retired_reference_detected", job.url);
        await tx.siteContent.update({ where: { key }, data: { value: JSON.stringify({ ...job, nextAttemptAt: Date.now() + 3600000 }) } });
      }
      return null;
    }
    if (job.retentionStartedAt === null) {
      // The queue row was read AFTER its mutation committed. Starting the clock
      // here guarantees >=30 days after Save, including when cleanup was disabled.
      await tx.siteContent.update({ where: { key }, data: { value: JSON.stringify({ ...job, retentionStartedAt: now, nextAttemptAt: now + MEDIA_RETENTION_MS }) } });
      return null;
    }
    if (now < job.retentionStartedAt + MEDIA_RETENTION_MS) return null;
    const claimed = { ...job, attempts: job.attempts + 1, claim: randomUUID(), leaseUntil: now + LEASE_MS };
    // This marker MUST COMMIT before del(). It closes the check/delete race and
    // survives a crash, timeout or lost database acknowledgement after deletion.
    await tx.siteContent.upsert({ where: { key: retiredKey(job.url) }, create: { key: retiredKey(job.url), value: JSON.stringify({ version: 1, url: job.url, state: "retiring" }) }, update: {} });
    await tx.siteContent.update({ where: { key }, data: { value: JSON.stringify(claimed) } });
    return claimed;
  }, MEDIA_TRANSACTION_OPTIONS);
}

async function finishJob(job: Job, success: boolean) {
  await prisma.$transaction(async (tx) => {
    await lockMediaWrites(tx);
    const row = await tx.siteContent.findUnique({ where: { key: queueKey(job.url) } });
    if (!row || parseJob(row.key, row.value)?.claim !== job.claim) return;
    if (success) {
      await tx.siteContent.update({ where: { key: retiredKey(job.url) }, data: { value: JSON.stringify({ version: 1, url: job.url, state: "deleted" }) } });
      await tx.siteContent.deleteMany({ where: { key: queueKey(job.url) } });
    } else {
      await tx.siteContent.update({ where: { key: queueKey(job.url) }, data: { value: JSON.stringify({ ...job, claim: null, leaseUntil: 0, nextAttemptAt: Date.now() + backoff(job.attempts) }) } });
    }
  }, MEDIA_TRANSACTION_OPTIONS);
}

// Private server helper, never a public deletion endpoint. No caller supplies URLs.
export async function runProductMediaCleanup() {
  // A two-phase rollout is required for destructive work: deploy writer guards
  // first, then explicitly enable only after all store/database writers comply.
  if (process.env.PRODUCT_MEDIA_CLEANUP_ENABLED?.trim() !== "true") return;
  const store = configuredStore();
  if (!store) { log("media_cleanup_configuration_unavailable"); return; }
  if (!isolatedScopeApproved(store.host)) { log("media_cleanup_isolation_unverified"); return; }
  try {
    const rows = await prisma.siteContent.findMany({ where: { key: { startsWith: CLEANUP_QUEUE_PREFIX }, value: { contains: store.host } }, orderBy: { key: "asc" }, take: 100 });
    let processed = 0;
    for (const row of rows) {
      if (processed >= BATCH_SIZE) break;
      const candidate = parseJob(row.key, row.value);
      if (!candidate || new URL(candidate.url).hostname !== store.host || candidate.nextAttemptAt > Date.now() || candidate.leaseUntil > Date.now()) continue;
      processed++;
      let job: Job | null;
      try { job = await claimJob(row.key, store.host); }
      catch { log("media_cleanup_reference_or_claim_failed"); continue; }
      if (!job) continue;
      let success = false;
      try { await del(job.url, { token: store.token, abortSignal: AbortSignal.timeout(3000) }); success = true; }
      catch (error) { success = error instanceof BlobNotFoundError; if (!success) log("media_cleanup_delete_failed", job.url); }
      try { await finishJob(job, success); }
      catch { log("media_cleanup_finalize_failed", job.url); }
    }
  } catch { log("media_cleanup_queue_read_failed"); }
}
