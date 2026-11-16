// Actual actions/worker, isolated transactional fixtures and mocked Blob SDK.
// No environment loading, Prisma client, provider network or real storage access.
import assert from "node:assert/strict";
import * as crypto from "node:crypto";
import { z } from "zod";
import * as React from "react";
import * as jsx from "react/jsx-runtime";
import { sourceModule } from "./source-module";
import * as policy from "../src/lib/media-lifecycle-policy";
import * as media from "../src/lib/product-media";
import * as slugs from "../src/lib/product-slug";
import * as variants from "../src/lib/product-variants";
import { translations } from "../src/lib/i18n";

// This small query interpreter intentionally accepts varying Prisma projections.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
type State = Record<string, Row[]>;
const blob = (id = 1, kind = "image", extension = "webp", store = "teststore") =>
  `https://${store}.public.blob.vercel-storage.com/3dkid/product-media/${kind}/00000000-0000-4000-8000-${id.toString().padStart(12, "0")}.${extension}`;
const external = "https://res.cloudinary.com/fixture/main.webp";
const savedEnv = { token: process.env.BLOB_READ_WRITE_TOKEN, store: process.env.BLOB_STORE_ID, enabled: process.env.PRODUCT_MEDIA_CLEANUP_ENABLED,
  scope: process.env.PRODUCT_MEDIA_CLEANUP_SCOPE, database: process.env.DATABASE_URL, environment: process.env.VERCEL_ENV };
const RETENTION = 30 * 24 * 60 * 60 * 1000;
const fixtureDatabase = "postgresql://fixture:fixture@db.fixture.invalid/shop";
function approveScope(database = fixtureDatabase, environment = "production", storeId = "teststore") {
  const url = new URL(database);
  url.searchParams.sort();
  process.env.PRODUCT_MEDIA_CLEANUP_SCOPE = JSON.stringify({ exclusiveStore: true, environment, storeId,
    databaseFingerprint: crypto.createHash("sha256").update(JSON.stringify([url.hostname.toLowerCase(), url.port || "5432", url.pathname, url.username, url.search])).digest("hex") });
}
const savedFetch = globalThis.fetch;
const savedWarn = console.warn;
const savedNow = Date.now;
const logs: string[] = [];
let clock = 1000000;
Date.now = () => clock;
process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_teststore_FIXTURE_ONLY";
process.env.PRODUCT_MEDIA_CLEANUP_ENABLED = "true";
process.env.DATABASE_URL = fixtureDatabase;
process.env.VERCEL_ENV = "production";
approveScope();
delete process.env.BLOB_STORE_ID;
globalThis.fetch = async () => { throw new Error("NETWORK_FORBIDDEN"); };
console.warn = (...values) => { logs.push(values.join(" ")); };

function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (key === "NOT") return !matches(row, value);
    if (key === "OR") return (value as Row[]).some((part) => matches(row, part));
    if (value && typeof value === "object") {
      if ("in" in value) return value.in.includes(row[key]);
      if ("startsWith" in value) return row[key]?.startsWith(value.startsWith);
      if ("contains" in value) return row[key]?.includes(value.contains);
    }
    return row[key] === value;
  });
}

function fixture() {
  let state: State = { product: [], productImage: [], category: [], siteContent: [], review: [] };
  let tail = Promise.resolve(); let active = false; let sequence = 0;
  let failOperation = ""; let failCommit: ((draft: State) => boolean) | undefined;
  let scanError = false; let scanLimit = false; let admin = true; let variantWrites = 0;
  let databaseClock: number | undefined;
  const scheduled: (() => Promise<void>)[] = [];
  const deleted: string[] = [];
  let deleteEffect: (url: string) => Promise<void> = async () => {};
  const models = (getState: () => State, isLocked: () => boolean) => Object.fromEntries(Object.keys(state).map((name) => [name, Object.fromEntries(
    ["findMany", "findFirst", "findUnique", "create", "update", "upsert", "delete", "deleteMany"].map((method) => [method, async (args: Row = {}) => {
      assert.ok(isLocked(), `unlocked ${name}.${method}`);
      if (`${name}.${method}` === failOperation) throw new Error("FIXTURE_WRITE_FAILED");
      if (method === "findMany" && name === "productImage" && scanError) throw new Error("FIXTURE_SCAN_FAILED");
      const db = getState(); const table = db[name];
      const found = table.filter((row) => matches(row, args.where));
      if (args.orderBy) {
        const orders: Row[] = Array.isArray(args.orderBy) ? args.orderBy : [args.orderBy];
        found.sort((a, b) => { for (const order of orders) for (const [key, dir] of Object.entries(order)) { if (a[key] !== b[key]) return (a[key] < b[key] ? -1 : 1) * (dir === "desc" ? -1 : 1); } return 0; });
      }
      const project = (row: Row) => {
        const result = structuredClone(row);
        if (name === "product" && args.select?.images) {
          result.images = structuredClone(db.productImage.filter((image) => image.productId === row.id).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id)));
          if (args.select.images.take) result.images = result.images.slice(0, args.select.images.take);
        }
        if (name === "category") { result.children = db.category.filter((child) => child.parentId === row.id); result._count = { products: db.product.filter((product) => product.categoryId === row.id).length, children: result.children.length }; }
        return result;
      };
      if (method === "findMany") return scanLimit && name === "productImage" ? Array.from({ length: 1001 }, () => ({ url: external })) : found.slice(0, args.take ?? found.length).map(project);
      if (method === "findUnique" || method === "findFirst") return found[0] ? project(found[0]) : null;
      if (method === "create" || (method === "upsert" && !found[0])) {
        const row = { id: `fixture-${++sequence}`, ...(args.create ?? args.data) };
        if (name === "product" && row.images) { for (const image of row.images.create) db.productImage.push({ ...image, id: `fixture-${++sequence}`, productId: row.id }); delete row.images; }
        table.push(row); return project(row);
      }
      if (method === "update" || method === "upsert") { assert.ok(found[0], "missing fixture update"); Object.assign(found[0], args.update ?? args.data); return project(found[0]); }
      if (method === "delete" || method === "deleteMany") {
        if (method === "delete") assert.ok(found[0]);
        for (const row of found) { table.splice(table.indexOf(row), 1); if (name === "product") db.productImage = db.productImage.filter((image) => image.productId !== row.id); }
        return { count: found.length };
      }
      throw new Error("UNEXPECTED_FIXTURE_QUERY");
    }])
  )]));
  const prisma = { ...models(() => state, () => true), $transaction: async (callback: (tx: Row) => Promise<unknown>, options: Row) => {
    assert.equal(options.isolationLevel, "ReadCommitted");
    // Serialize transactions just as the application advisory lock does. Clone
    // AFTER acquiring the lock, and commit only on success, including queue writes.
    const previous = tail; let release!: () => void;
    tail = new Promise<void>((done) => { release = done; });
    await previous; const draft = structuredClone(state); active = true; let locked = false;
    try {
      const result = await callback({ ...models(() => draft, () => locked),
        $executeRaw: async (strings: TemplateStringsArray) => { assert.equal(strings.join(""), "SELECT pg_advisory_xact_lock(175501, 1)"); locked = true; },
        $queryRaw: async (strings: TemplateStringsArray) => { assert.ok(locked); assert.equal(strings.join(""), 'SELECT clock_timestamp() AS "now"'); return [{ now: new Date(databaseClock ?? clock) }]; },
      });
      assert.ok(locked); if (failCommit?.(draft)) throw new Error("FIXTURE_COMMIT_FAILED");
      state = draft; return result;
    } finally { active = false; release(); }
  } };
  class BlobNotFoundError extends Error {}
  const loadLifecycle = () => sourceModule<typeof import("../src/lib/media-lifecycle")>("src/lib/media-lifecycle.ts", {
    "server-only": {}, "node:crypto": crypto, "@/lib/prisma": { prisma }, "@/lib/media-lifecycle-policy": policy,
    "@vercel/blob": { BlobNotFoundError, del: async (url: string, options: Row) => { assert.equal(active, false, "network deletion inside transaction"); assert.equal(options.token, process.env.BLOB_READ_WRITE_TOKEN); assert.ok(options.abortSignal instanceof AbortSignal); deleted.push(url); await deleteEffect(url); } },
  });
  const lifecycle = loadLifecycle();
  let scheduleFails = false;
  const after = sourceModule<typeof import("../src/lib/media-cleanup-after")>("src/lib/media-cleanup-after.ts", {
    "server-only": {}, "@/lib/media-lifecycle": lifecycle,
    "next/server": { after: (callback: () => Promise<void>) => { if (scheduleFails) throw new Error("NO_AFTER_CONTEXT"); scheduled.push(callback); } },
  });
  const bindings = { "@/lib/prisma": { prisma }, "next/cache": { revalidatePath: () => {} }, zod: { z },
    "@/lib/actions/require-admin": { requireAdmin: async () => { if (!admin) throw new Error("UNAUTHORIZED"); } },
    "@/lib/media-lifecycle": lifecycle, "@/lib/media-lifecycle-policy": policy, "@/lib/media-cleanup-after": after };
  const products = sourceModule<typeof import("../src/lib/actions/products")>("src/lib/actions/products.ts", { ...bindings,
    "@/lib/product-media": media, "@/lib/product-slug": slugs, "@/lib/product-variants": variants,
    "@/lib/product-size-admin": { syncProductSizes: async () => { variantWrites++; } },
  });
  const content = sourceModule<typeof import("../src/lib/site-content")>("src/lib/site-content.ts", { zod: { z }, "@/lib/product-media": media, "@/lib/i18n": { translations } });
  const categories = sourceModule<typeof import("../src/lib/actions/categories")>("src/lib/actions/categories.ts", { ...bindings,
    "@/lib/site-content": content, "@/lib/site-settings": { SITE_FONT_KEY: "site_font_theme" }, "@/lib/fonts": { isFontThemeId: () => true },
  });
  function seed(id = "p1", image = blob(), hover: string | null = null) {
    state.product.push({ id, slug: id, name: "Fixture", nameEn: "Fixture", description: "Description", descriptionEn: "Description", hoverGifUrl: hover, categoryId: "c1", price: 123, variants: [{ id: "size-stable", price: 150 }] });
    state.productImage.push({ id: `${id}-main`, productId: id, order: 0, url: image });
  }
  const queue = () => state.siteContent.filter((row) => row.key.startsWith(policy.CLEANUP_QUEUE_PREFIX));
  const retired = () => state.siteContent.filter((row) => row.key.startsWith(policy.RETIRED_MEDIA_PREFIX));
  return { products, categories, lifecycle, restartWorker: loadLifecycle, seed, deleted, scheduled, queue, retired, BlobNotFoundError,
    get state() { return state; }, get variantWrites() { return variantWrites; },
    fail: (operation: string) => { failOperation = operation; }, commitFailure: (test?: (draft: State) => boolean) => { failCommit = test; },
    scanFailure: (value: boolean) => { scanError = value; }, limit: () => { scanLimit = true; },
    unauthorized: () => { admin = false; }, scheduleFailure: () => { scheduleFails = true; },
    databaseTime: (value: number) => { databaseClock = value; },
    deletion: (effect: (url: string) => Promise<void>) => { deleteEffect = effect; },
    drain: async () => { while (scheduled.length) await scheduled.shift()!(); },
  };
}
function form(image = external, hover = "", id = "p1") {
  const result = new FormData();
  for (const [key, value] of Object.entries({ name: "Fixture", nameEn: "Fixture", slug: id, description: "Description", descriptionEn: "Description", price: "123", categoryId: "c1", imageUrl: image, hoverGifUrl: hover, isActive: "on", isOrderable: "on" })) result.set(key, value);
  return result;
}
const categoryForm = (imageUrl: string) => { const result = new FormData(); for (const [key, value] of Object.entries({ name: "Fixture", nameEn: "Fixture", slug: "fixture", imageUrl, order: "0" })) result.set(key, value); return result; };
const contentForm = (value: string) => { const result = new FormData(); result.set("hero_image_1", value); return result; };
function gate() { let resolve!: () => void; const promise = new Promise<void>((done) => { resolve = done; }); return { promise, resolve }; }
let passed = 0;
function pass(message: string) { console.log(`PASS ${++passed}: ${message}`); }
async function mature(f: ReturnType<typeof fixture>) {
  await f.drain(); clock += RETENTION; await f.lifecycle.runProductMediaCleanup();
}

async function verify() {
  for (const [oldImage, oldHover, nextImage, nextHover, expected] of [
    [blob(), null, blob(2), "", [blob()]],
    [external, blob(3, "animation", "gif"), external, blob(4, "animation"), [blob(3, "animation", "gif")]],
    [external, blob(5, "animation"), external, "", [blob(5, "animation")]],
  ] as const) {
    const f = fixture(); f.seed("p1", oldImage, oldHover); f.state.productImage.push({ id: "gallery-stable", productId: "p1", order: 1, url: external });
    const variantsBefore = structuredClone(f.state.product[0].variants);
    await f.products.updateProduct("p1", form(nextImage, nextHover));
    assert.deepEqual(f.deleted, []); assert.equal(f.queue().length, 1); assert.equal(f.state.productImage[0].id, "p1-main");
    assert.equal(f.state.productImage[1].id, "gallery-stable"); assert.equal(f.state.productImage[1].url, external);
    assert.deepEqual(f.state.product[0].variants, variantsBefore); assert.equal(f.variantWrites, 0); assert.equal(f.state.product[0].price, 123);
    await mature(f); assert.deepEqual(f.deleted, expected); assert.equal(f.queue().length, 0); assert.equal(JSON.parse(f.retired()[0].value).state, "deleted");
    await f.products.updateProduct("p1", form(nextImage, nextHover)); await f.drain(); assert.deepEqual(f.deleted, expected);
  }
  pass("photo/GIF/WebP replacement and clearing: post-commit only, gallery IDs, variants/prices and idempotency preserved");

  const deadline = fixture(); deadline.seed(); await deadline.products.updateProduct("p1", form(blob(2)));
  assert.equal(JSON.parse(deadline.queue()[0].value).retentionStartedAt, null);
  const observedAfterCommit = clock; await deadline.drain();
  assert.equal(deadline.lifecycle.MEDIA_RETENTION_MS, RETENTION);
  assert.equal(JSON.parse(deadline.queue()[0].value).retentionStartedAt, observedAfterCommit);
  clock += RETENTION - 1; await deadline.restartWorker().runProductMediaCleanup();
  assert.equal(deadline.deleted.length, 0); assert.equal(deadline.retired().length, 0);
  await deadline.products.updateProduct("p1", form(blob(2))); await deadline.drain();
  assert.equal(JSON.parse(deadline.queue()[0].value).retentionStartedAt, observedAfterCommit);
  clock++; await deadline.restartWorker().runProductMediaCleanup(); assert.deepEqual(deadline.deleted, [blob()]);
  pass("durable post-commit clock: no deletion at 30 days minus 1 ms, exact deadline eligible after worker restart, unchanged Save preserves deadline");

  const skew = fixture(); skew.seed(); await skew.products.updateProduct("p1", form(blob(2))); await skew.drain();
  const retentionStart = clock; clock += RETENTION;
  skew.databaseTime(retentionStart + RETENTION - 1); await skew.lifecycle.runProductMediaCleanup(); assert.equal(skew.deleted.length, 0);
  skew.databaseTime(retentionStart + RETENTION); await skew.lifecycle.runProductMediaCleanup(); assert.deepEqual(skew.deleted, [blob()]);
  pass("authoritative database time prevents a fast application clock from shortening the retention window");

  const reuse = fixture(); reuse.seed(); await reuse.products.updateProduct("p1", form(blob(2))); await reuse.drain();
  const queuedBefore = structuredClone(reuse.queue());
  reuse.fail("product.update"); await assert.rejects(reuse.products.updateProduct("p1", form(blob())));
  assert.deepEqual(reuse.queue(), queuedBefore); reuse.fail("");
  clock += RETENTION - 1; await reuse.products.updateProduct("p1", form(blob()));
  assert.equal(reuse.queue().some((row) => JSON.parse(row.value).url === blob()), false);
  clock += RETENTION; await reuse.drain(); assert.ok(!reuse.deleted.includes(blob()));
  await reuse.products.updateProduct("p1", form(blob(3))); await reuse.drain();
  const restartedAt = JSON.parse(reuse.queue().find((row) => JSON.parse(row.value).url === blob())!.value).retentionStartedAt;
  assert.equal(restartedAt, clock); clock += RETENTION - 1; await reuse.lifecycle.runProductMediaCleanup(); assert.ok(!reuse.deleted.includes(blob()));
  clock++; await reuse.lifecycle.runProductMediaCleanup(); assert.ok(reuse.deleted.includes(blob()));
  pass("reuse cancels pending retirement atomically, failed Save cannot cancel it, later removal receives a new full retention period");

  const legacy = fixture(); legacy.seed(); await legacy.products.updateProduct("p1", form(blob(2)));
  const legacyJob = JSON.parse(legacy.queue()[0].value); delete legacyJob.retentionStartedAt; legacyJob.version = 1;
  legacy.queue()[0].value = JSON.stringify(legacyJob); clock += RETENTION * 2;
  await legacy.drain(); assert.equal(legacy.deleted.length, 0); assert.equal(JSON.parse(legacy.queue()[0].value).retentionStartedAt, clock);
  clock += RETENTION; await legacy.restartWorker().runProductMediaCleanup(); assert.deepEqual(legacy.deleted, [blob()]);
  pass("legacy immediate-cleanup jobs receive a fresh 30-day deadline, never an inferred expired age");

  const clockFailure = fixture(); clockFailure.seed(); await clockFailure.products.updateProduct("p1", form(blob(2)));
  clockFailure.commitFailure((draft) => draft.siteContent.some((row) => row.key.startsWith(policy.CLEANUP_QUEUE_PREFIX) && JSON.parse(row.value).retentionStartedAt !== null));
  await clockFailure.drain(); assert.equal(JSON.parse(clockFailure.queue()[0].value).retentionStartedAt, null);
  clock += RETENTION * 2; clockFailure.commitFailure(); await clockFailure.restartWorker().runProductMediaCleanup();
  assert.equal(clockFailure.deleted.length, 0); assert.equal(JSON.parse(clockFailure.queue()[0].value).retentionStartedAt, clock);
  clock += RETENTION; await clockFailure.restartWorker().runProductMediaCleanup(); assert.deepEqual(clockFailure.deleted, [blob()]);
  pass("failed retention-clock commit preserves successful Save and cannot authorize early deletion after restart");

  for (const mode of ["validation", "product.update", "productImage.update", "siteContent.upsert", "commit", "unauthorized"]) {
    const f = fixture(); f.seed(); const before = structuredClone(f.state);
    const input = form(blob(2));
    if (mode === "validation") input.set("price", "-1");
    else if (mode === "commit") f.commitFailure(() => true);
    else if (mode === "unauthorized") f.unauthorized(); else f.fail(mode);
    await assert.rejects(f.products.updateProduct("p1", input));
    assert.deepEqual(f.state, before); assert.equal(f.scheduled.length, 0); await f.lifecycle.runProductMediaCleanup(); assert.deepEqual(f.deleted, []);
  }
  pass("invalid/unauthorized Save, image/product/queue write failure and commit failure roll back without deletion");

  for (const reference of ["gallery", "hover", "category", "content", "description", "testimonial"]) for (const httpAlias of [false, true]) {
    const f = fixture(); f.seed(); f.seed("p2", external);
    const alias = `${httpAlias ? blob().replace("https:", "http:") : blob()}?download=1#alias`;
    if (reference === "gallery") f.state.productImage.push({ id: "shared", productId: "p2", order: 1, url: alias });
    if (reference === "hover") f.state.product[1].hoverGifUrl = alias;
    if (reference === "category") f.state.category.push({ id: "c1", imageUrl: alias });
    if (reference === "content") f.state.siteContent.push({ key: "legacy_content", value: JSON.stringify({ image: encodeURIComponent(alias) }) });
    if (reference === "description") f.state.product[1].description = `See ${alias}`;
    if (reference === "testimonial") f.state.review.push({ avatarUrl: alias, text: "Saved testimonial" });
    await f.products.updateProduct("p1", form()); await mature(f); assert.deepEqual(f.deleted, []); assert.equal(f.retired().length, 0);
  }
  pass("all gallery, hover, category, saved content, descriptions and testimonial references protect shared media, including aliases");

  for (const previous of [external, "https://qa.supabase.co/storage/image.webp", blob(1, "image", "webp", "otherstore"), blob().replace("/product-media/", "/unmanaged/"), blob().replace("https:", "http:"), blob().replace("teststore.public", "teststore.public.evil")]) {
    const f = fixture(); f.seed("p1", previous); await f.products.updateProduct("p1", form(blob(2))); await mature(f); assert.deepEqual(f.deleted, []);
  }
  for (const invalid of ["", "https://user:secret@teststore.public.blob.vercel-storage.com/3dkid/product-media/image/a.webp", blob().replace("webp", "svg")]) assert.equal(policy.managedMediaUrl(invalid), null);
  pass("only configured public-store UUID product-media objects qualify; external/foreign/malformed/unmanaged URLs never deleted");

  const beforeClaim = fixture(); beforeClaim.seed(); beforeClaim.seed("p2", external);
  await beforeClaim.products.updateProduct("p1", form(blob(2)));
  await beforeClaim.products.updateProduct("p2", form(blob(), "", "p2"));
  await beforeClaim.drain(); assert.equal(beforeClaim.deleted.length, 0);
  await beforeClaim.products.updateProduct("p2", form(external, "", "p2")); await mature(beforeClaim); assert.ok(beforeClaim.deleted.includes(blob()));
  pass("reference attached after Save but before claim prevents deletion; removing the final reference safely re-enqueues");

  const concurrent = fixture(); concurrent.seed(); const entered = gate(); const release = gate();
  concurrent.deletion(async () => { entered.resolve(); await release.promise; });
  await concurrent.products.updateProduct("p1", form(blob(2)));
  await concurrent.drain(); clock += RETENTION;
  const running = concurrent.lifecycle.runProductMediaCleanup(); await entered.promise;
  assert.equal(JSON.parse(concurrent.retired()[0].value).state, "retiring");
  assert.deepEqual(await concurrent.products.updateProduct("p1", form(`${blob()}?alias=1`)), { error: "mediaRetired" });
  assert.deepEqual(await concurrent.products.updateProduct("p1", form(blob().replace("https:", "http:"))), { error: "mediaRetired" });
  assert.deepEqual(await concurrent.products.createProduct(form(blob(), "", "p3")), { error: "mediaRetired" });
  await assert.rejects(concurrent.categories.createCategory(categoryForm(blob())), policy.RetiredMediaError);
  await assert.rejects(concurrent.categories.updateSiteContent(contentForm(blob())), policy.RetiredMediaError);
  assert.equal(concurrent.state.productImage[0].url, blob(2));
  await concurrent.lifecycle.runProductMediaCleanup(); assert.equal(concurrent.deleted.length, 1);
  release.resolve(); await running; await concurrent.drain(); assert.equal(concurrent.deleted.length, 1);
  pass("committed retirement fences concurrent product/category/content attachments and competing workers across the network gap");

  const expired = fixture(); expired.seed(); const oldEntered = gate(); const oldRelease = gate(); let calls = 0;
  expired.deletion(async () => { if (++calls === 1) { oldEntered.resolve(); await oldRelease.promise; throw new Error("LATE_FAILURE"); } });
  await expired.products.updateProduct("p1", form(blob(2))); await expired.drain(); clock += RETENTION;
  const oldWorker = expired.lifecycle.runProductMediaCleanup(); await oldEntered.promise;
  clock += 60001; await expired.lifecycle.runProductMediaCleanup(); assert.equal(expired.queue().length, 0);
  oldRelease.resolve(); await oldWorker; assert.equal(expired.queue().length, 0); assert.equal(JSON.parse(expired.retired()[0].value).state, "deleted");
  pass("expired claim can recover a crashed worker; late stale finalization cannot overwrite the newer completed claim");

  const updates = fixture(); updates.seed();
  await Promise.all([updates.products.updateProduct("p1", form(blob(2))), updates.products.updateProduct("p1", form(blob(3)))]);
  await mature(updates); assert.equal(updates.state.productImage[0].url, blob(3)); assert.deepEqual(new Set(updates.deleted), new Set([blob(), blob(2)]));
  pass("concurrent updates read previous media under the lock and never delete the winning saved URL");

  const failure = fixture(); failure.seed(); failure.deletion(async () => { throw new Error("SDK_CREDENTIAL_SECRET_MUST_NOT_LOG"); });
  await failure.products.updateProduct("p1", form(blob(2))); await mature(failure);
  assert.equal(failure.state.productImage[0].url, blob(2)); assert.equal(failure.queue().length, 1); assert.equal(failure.retired().length, 1);
  assert.deepEqual(await failure.products.updateProduct("p1", form(blob())), { error: "mediaRetired" });
  await failure.lifecycle.runProductMediaCleanup(); assert.equal(failure.deleted.length, 1);
  clock += 60001; failure.deletion(async () => { throw new failure.BlobNotFoundError(); });
  await failure.lifecycle.runProductMediaCleanup(); assert.equal(failure.deleted.length, 2); assert.equal(failure.queue().length, 0);
  assert.ok(!logs.join(" ").includes("SDK_CREDENTIAL_SECRET")); assert.ok(!logs.join(" ").includes("FIXTURE_ONLY")); assert.ok(!logs.join(" ").includes(blob()));
  pass("Blob failures preserve successful Save and durable retry; uncertain URLs stay fenced, backoff/not-found retry safe, logs sanitized");

  for (const stage of ["claim", "finalize"]) {
    const f = fixture(); f.seed(); await f.products.updateProduct("p1", form(blob(2)));
    f.commitFailure((draft) => draft.siteContent.some((row) => row.key.startsWith(policy.RETIRED_MEDIA_PREFIX) && JSON.parse(row.value).state === (stage === "claim" ? "retiring" : "deleted")));
    await mature(f); assert.equal(f.deleted.length, stage === "claim" ? 0 : 1);
    if (stage === "claim") assert.equal(f.retired().length, 0);
    else assert.deepEqual(await f.products.updateProduct("p1", form(blob())), { error: "mediaRetired" });
    f.commitFailure(); clock += 60001; await f.lifecycle.runProductMediaCleanup(); assert.equal(f.queue().length, 0);
  }
  pass("claim commit failure never calls Blob; lost finalization keeps durable fence/lease and retries idempotently");

  const removal = fixture(); removal.seed("p1", blob(), blob(2, "animation", "gif")); removal.seed("p2", blob(3));
  removal.state.productImage.push({ id: "gallery-delete", productId: "p1", url: blob(4), order: 1 });
  removal.state.productImage.push({ id: "gallery-shared", productId: "p1", url: blob(3), order: 2 });
  await removal.products.deleteProduct("p1"); await removal.products.deleteProduct("p1"); await mature(removal);
  assert.deepEqual(new Set(removal.deleted), new Set([blob(), blob(2, "animation", "gif"), blob(4)])); assert.equal(removal.state.product.length, 1);
  const failedDelete = fixture(); failedDelete.seed(); failedDelete.fail("product.delete");
  await assert.rejects(failedDelete.products.deleteProduct("p1")); assert.equal(failedDelete.queue().length, 0); assert.equal(failedDelete.scheduled.length, 0);
  pass("product deletion includes the entire gallery and hover, protects shared URLs, repeats safely and queues nothing after FK/write failure");

  for (const writer of ["category", "content"]) {
    const f = fixture(); f.seed();
    if (writer === "category") f.state.category.push({ id: "c1", imageUrl: blob() });
    else f.state.siteContent.push({ key: "hero_image_1", value: blob() });
    await f.products.updateProduct("p1", form()); await f.drain(); assert.equal(f.deleted.length, 0);
    if (writer === "category") await f.categories.updateCategory("c1", categoryForm(""));
    else await f.categories.updateSiteContent(contentForm(""));
    await mature(f); assert.deepEqual(f.deleted, [blob()]);
  }
  pass("category/content writers remove the final shared reference under the same transactional protocol");

  for (const reason of ["disabled", "missing", "mismatch", "scan", "limit"]) {
    const f = fixture(); f.seed(); await f.products.updateProduct("p1", form(blob(2)));
    if (reason === "disabled") delete process.env.PRODUCT_MEDIA_CLEANUP_ENABLED;
    if (reason === "missing") delete process.env.BLOB_READ_WRITE_TOKEN;
    if (reason === "mismatch") process.env.BLOB_STORE_ID = "store_foreign";
    if (reason === "scan") f.scanFailure(true);
    if (reason === "limit") f.limit();
    await f.drain(); assert.equal(f.deleted.length, 0); assert.equal(f.queue().length, 1); assert.equal(f.retired().length, 0);
    process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_teststore_FIXTURE_ONLY"; process.env.PRODUCT_MEDIA_CLEANUP_ENABLED = "true"; delete process.env.BLOB_STORE_ID;
  }
  const scheduling = fixture(); scheduling.seed(); scheduling.scheduleFailure(); await scheduling.products.updateProduct("p1", form(blob(2))); assert.equal(scheduling.queue().length, 1);
  for (const locale of ["ua", "en"] as const) assert.ok(translations[locale].admin.media.retired.length > 30);
  pass("disabled rollout, missing/mismatched config, uncertain/oversized scan and unavailable after context fail closed; UA/EN recovery copy exists");

  for (const reason of ["missing-approval", "malformed", "shared-store", "preview-copy", "other-database", "other-store", "other-schema", "other-role"]) {
    const f = fixture(); f.seed(); await f.products.updateProduct("p1", form(blob(2)));
    if (reason === "missing-approval") delete process.env.PRODUCT_MEDIA_CLEANUP_SCOPE;
    if (reason === "malformed") process.env.PRODUCT_MEDIA_CLEANUP_SCOPE = "{";
    if (reason === "shared-store") process.env.PRODUCT_MEDIA_CLEANUP_SCOPE = JSON.stringify({ ...JSON.parse(process.env.PRODUCT_MEDIA_CLEANUP_SCOPE!), exclusiveStore: false });
    if (reason === "preview-copy") process.env.VERCEL_ENV = "preview";
    if (reason === "other-database") process.env.DATABASE_URL = "postgresql://fixture:fixture@other.fixture.invalid/preview";
    if (reason === "other-schema") process.env.DATABASE_URL = fixtureDatabase + "?schema=preview";
    if (reason === "other-role") process.env.DATABASE_URL = fixtureDatabase.replace("fixture:fixture@", "restricted:fixture@");
    if (reason === "other-store") approveScope(fixtureDatabase, "production", "foreignstore");
    await f.drain(); clock += RETENTION * 2; await f.lifecycle.runProductMediaCleanup();
    assert.equal(f.deleted.length, 0); assert.equal(JSON.parse(f.queue()[0].value).retentionStartedAt, null);
    process.env.DATABASE_URL = fixtureDatabase; process.env.VERCEL_ENV = "production"; approveScope();
  }
  const preview = fixture(); const previewUrl = blob(1, "image", "webp", "previewstore"); preview.seed("p1", previewUrl);
  process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_previewstore_FIXTURE_ONLY"; process.env.VERCEL_ENV = "preview";
  process.env.DATABASE_URL = "postgresql://fixture:fixture@preview.fixture.invalid/shop";
  approveScope(process.env.DATABASE_URL, "preview", "previewstore");
  await preview.products.updateProduct("p1", form()); await mature(preview); assert.deepEqual(preview.deleted, [previewUrl]);
  process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_teststore_FIXTURE_ONLY"; process.env.DATABASE_URL = fixtureDatabase; process.env.VERCEL_ENV = "production"; approveScope();
  pass("enable flag alone cannot delete: missing/shared/mismatched store, database or deployment scope blocked; explicitly approved isolated Preview fixture works");

  const bounded = fixture();
  for (let i = 1; i <= 6; i++) { bounded.seed(`p${i}`, blob(i)); await bounded.products.updateProduct(`p${i}`, form(external, "", `p${i}`)); }
  await bounded.drain(); clock += RETENTION;
  await bounded.lifecycle.runProductMediaCleanup(); assert.equal(bounded.deleted.length, 4); assert.equal(bounded.queue().length, 2);
  await bounded.lifecycle.runProductMediaCleanup(); assert.equal(bounded.deleted.length, 6); assert.equal(bounded.retired().length, 6);
  const ledgerBefore = structuredClone(bounded.state.siteContent); const tampered = new FormData(); tampered.set(ledgerBefore[0].key, "");
  await bounded.categories.updateSiteContent(tampered); assert.deepEqual(bounded.state.siteContent, ledgerBefore);
  pass("bounded worker drains subsequent passes; ordinary content submissions cannot overwrite internal retirement state");

  for (const locale of ["ua", "en"] as const) {
    const errors: string[] = []; let pending: Promise<void> | undefined;
    const blocked = () => { throw new Error("UNEXPECTED_NAVIGATION_OR_SUCCESS"); };
    const { ProductForm } = sourceModule<typeof import("../src/components/admin/product-form")>("src/components/admin/product-form.tsx", {
      react: { Fragment: React.Fragment, useState: (value: unknown) => [value, () => {}], useRef: (value: unknown) => ({ current: value }),
        useTransition: () => [false, (callback: () => Promise<void>) => { pending = callback(); }] },
      "react/jsx-runtime": jsx, "@/lib/product-slug": slugs, "@/store/lang-store": { useLangStore: () => ({ t: translations[locale] }) },
      "next/navigation": { useRouter: () => ({ push: blocked }) }, sonner: { toast: { success: blocked, error: (value: string) => { errors.push(value); } } },
      "@/components/ui/button": { Button: "button" }, "@/components/admin/media-url-field": { MediaUrlField: "div" }, "@/components/admin/size-editor": { SizeEditor: "div" },
    });
    const element = ProductForm({ categories: [], action: async () => ({ error: "mediaRetired" }) });
    element.props.action(form()); await pending;
    assert.deepEqual(errors, [translations[locale].admin.media.retired]);
  }
  pass("actual Product Save handler shows localized retirement recovery in UA/EN and stays on the unsaved form");
  console.log(`PASS media lifecycle: ${passed} isolated groups. No live DB, storage, uploads or deletions.`);
}

void verify().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => {
  globalThis.fetch = savedFetch; console.warn = savedWarn; Date.now = savedNow;
  if (savedEnv.token === undefined) delete process.env.BLOB_READ_WRITE_TOKEN; else process.env.BLOB_READ_WRITE_TOKEN = savedEnv.token;
  if (savedEnv.store === undefined) delete process.env.BLOB_STORE_ID; else process.env.BLOB_STORE_ID = savedEnv.store;
  if (savedEnv.enabled === undefined) delete process.env.PRODUCT_MEDIA_CLEANUP_ENABLED; else process.env.PRODUCT_MEDIA_CLEANUP_ENABLED = savedEnv.enabled;
  if (savedEnv.scope === undefined) delete process.env.PRODUCT_MEDIA_CLEANUP_SCOPE; else process.env.PRODUCT_MEDIA_CLEANUP_SCOPE = savedEnv.scope;
  if (savedEnv.database === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = savedEnv.database;
  if (savedEnv.environment === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = savedEnv.environment;
});
