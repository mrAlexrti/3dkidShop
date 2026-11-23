// Called ONLY by the owned disposable-cluster harness, with synthetic fixtures.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { PrismaClient, Prisma } from "@prisma/client";
import { z } from "zod";
import { sourceModule } from "./source-module";
import * as media from "../src/lib/product-media";
import * as variants from "../src/lib/product-variants";
import * as sizes from "../src/lib/product-size-admin";
import * as slug from "../src/lib/product-slug";
import * as gallery from "../src/lib/product-gallery-admin";
import * as galleryDomain from "../src/lib/gallery";
import * as validation from "../src/lib/admin-form-validation";
import * as policy from "../src/lib/media-lifecycle-policy";
import * as siteContent from "../src/lib/site-content";

const url = new URL(process.env.BATCH18_QA_DATABASE_URL ?? "postgresql://invalid");
const directory = process.env.BATCH18_QA_CLUSTER_DIR ?? "";
assert.equal(url.hostname, "127.0.0.1"); assert.equal(url.username, "batch18_qa");
assert.match(url.pathname, /^\/batch18_review_[a-f0-9]+$/); assert.notEqual(url.port, "55432");
assert.ok(directory.includes("batch18-variant-review-"));
assert.equal(readFileSync(join(directory, "qa-marker"), "utf8"), process.env.BATCH18_QA_MARKER);
const make = () => new PrismaClient({ datasources: { db: { url: url.toString() } } });
const a = make(), b = make(), observer = make();
let groups = 0;
const pass = (message: string) => console.log(`PASS ADDENDUM PG ${++groups}: ${message}`);
const opts = { timeout: 15000, maxWait: 10000 };
const bindings = (db: unknown) => ({
  "@/lib/prisma": { prisma: db }, "@prisma/client": { Prisma }, zod: { z }, "next/cache": { revalidatePath: () => {} },
  "@/lib/actions/require-admin": { requireAdmin: async () => {} }, "@/lib/product-media": media,
  "@/lib/product-variants": variants, "@/lib/product-size-admin": sizes, "@/lib/product-slug": slug,
  "@/lib/product-gallery-admin": gallery, "@/lib/gallery": galleryDomain, "@/lib/admin-form-validation": validation,
  "@/lib/media-lifecycle-policy": policy, "@/lib/site-content": siteContent,
  "@/lib/fonts": { isFontThemeId: () => true }, "@/lib/site-settings": { SITE_FONT_KEY: "site_font" },
  // Storage/notification effects are forbidden. Real FK/row locks use the supplied tx.
  "@/lib/media-lifecycle": { lockMediaWrites: async () => {}, assertMediaAttachable: async () => {}, enqueueSupersededMedia: async () => {}, MEDIA_TRANSACTION_OPTIONS: opts },
  "@/lib/media-cleanup-after": { scheduleProductMediaCleanup: () => {} },
});
const categories = (db: unknown) => sourceModule<typeof import("../src/lib/actions/categories")>("src/lib/actions/categories.ts", bindings(db));
const products = sourceModule<typeof import("../src/lib/actions/products")>("src/lib/actions/products.ts", bindings(a));
const createCategory = (id: string, parentId?: string) => a.category.create({ data: { id, name: "Synthetic category", nameEn: "Synthetic category", slug: id, parentId } });
const createProduct = (id: string, categoryId: string, active = true) => a.product.create({ data: { id, name: "Synthetic product", slug: id, description: "Original description", categoryId, price: 100, isActive: active, isOrderable: active } });
async function waitBlocked(pid: number) {
  const end = Date.now() + 5000;
  while (Date.now() < end) {
    const rows = await observer.$queryRaw<{ blocked: boolean }[]>`SELECT cardinality(pg_blocking_pids(${pid}::int))>0 AS blocked`;
    if (rows[0].blocked) return;
    await new Promise((done) => setTimeout(done, 20));
  }
  assert.fail("Expected a real second-session lock wait");
}
function latch() { let release!: () => void; const promise = new Promise<void>((done) => { release = done; }); return { promise, release }; }

async function verify() {
  const identity = await a.$queryRaw<{ directory: string }[]>`SELECT current_setting('data_directory') AS directory`;
  assert.equal(resolve(identity[0].directory), resolve(directory, "data"));
  const columns = await a.$queryRaw<{ column_name: string; is_nullable: string }[]>`SELECT column_name,is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='Product' AND column_name IN ('materials','materialsEn','materialsDivider')`;
  assert.equal(columns.length, 3); assert.ok(columns.every((c) => c.is_nullable === "YES"));
  const originals = await a.product.findMany({ where: { id: { startsWith: "addendum_baseline_" } }, orderBy: { id: "asc" } });
  assert.equal(originals.length, 5);
  originals.forEach((row, i) => { assert.equal(row.description, `Unchanged paragraph ${i}\n\nOriginal materials remain here`); assert.equal(row.price.toFixed(2), `${101 + i}.25`); assert.equal(row.materials, null); assert.equal(row.materialsEn, null); assert.equal(row.materialsDivider, null); });
  pass("combined SQL keeps all five synthetic originals unchanged; materials nullable and unbackfilled");

  await createCategory("addendum_forms");
  const data = new FormData();
  for (const [key, value] of Object.entries({ name: "Materials fixture", nameEn: "Materials fixture", slug: "materials-fixture", description: "Original product description", descriptionEn: "Original English description", price: "123.45", categoryId: "addendum_forms", imageUrl: "https://res.cloudinary.com/fixture/image.webp", isActive: "on", isOrderable: "on", materials: "PLA\n\nДругий абзац\nрядок", materialsEn: "PLA\n\nSecond paragraph\nline", materialsDivider: "👩🏽‍🚀✦❀" })) data.set(key, value);
  assert.equal(await products.createProduct(data), undefined);
  const saved = await a.product.findUniqueOrThrow({ where: { slug: "materials-fixture" }, include: { images: true } });
  assert.equal(saved.materials, data.get("materials")); assert.equal(saved.materialsDivider, "👩🏽‍🚀✦❀");
  data.set("materials", ""); data.set("materialsEn", ""); data.set("materialsDivider", "");
  assert.equal(await products.updateProduct(saved.id, data), undefined);
  const cleared = await a.product.findUniqueOrThrow({ where: { id: saved.id }, include: { images: true } });
  assert.equal(cleared.materials, null); assert.equal(cleared.materialsEn, null); assert.equal(cleared.materialsDivider, null);
  assert.equal(cleared.images[0].id, saved.images[0].id); assert.equal(cleared.description, saved.description); assert.equal(cleared.price.toString(), saved.price.toString());
  data.set("materialsDivider", "✦".repeat(9)); assert.equal((await products.updateProduct(saved.id, data))?.error, "validation");
  assert.equal((await a.product.findUniqueOrThrow({ where: { id: saved.id } })).materialsDivider, null);
  pass("actual product actions persist bilingual paragraphs/emoji, clear optional fields and preserve gallery IDs/prices on invalid save");

  const action = categories(a);
  await createCategory("addendum_empty"); assert.equal(await action.deleteCategory("addendum_empty"), undefined);
  assert.equal(await a.category.count({ where: { id: "addendum_empty" } }), 0);
  for (const active of [true, false]) {
    const id = `addendum_category_${active}`; await createCategory(id); await createProduct(`${id}_product`, id, active);
    assert.deepEqual(await action.deleteCategory(id), { error: "categoryProducts" });
    await assert.rejects(a.category.delete({ where: { id } }));
    assert.equal(await a.product.count({ where: { categoryId: id } }), 1);
  }
  await createCategory("addendum_parent"); await createCategory("addendum_child", "addendum_parent");
  await createProduct("addendum_descendant_product", "addendum_child", false);
  assert.deepEqual(await action.deleteCategory("addendum_parent"), { error: "categoryChildren" });
  await assert.rejects(a.category.delete({ where: { id: "addendum_parent" } }));
  assert.equal((await a.category.findUniqueOrThrow({ where: { id: "addendum_child" } })).parentId, "addendum_parent");
  pass("empty category deletion works; active/inactive products and nested descendants block both action and direct SQL deletes without reassignment");

  for (const kind of ["product", "child"] as const) {
    const id = `addendum_delete_first_${kind}`; await createCategory(id);
    const locked = latch(), release = latch(); let writerPid = 0;
    const wrapped = { $transaction: (work: (tx: Prisma.TransactionClient) => Promise<unknown>) => a.$transaction(async (tx) => {
      const proxy = new Proxy(tx, { get(target, key) {
        if (key === "$queryRaw") return async (...args: unknown[]) => {
          const result = await (target.$queryRaw as (...input: unknown[]) => Promise<unknown>)(...args);
          locked.release(); await release.promise; return result;
        };
        return Reflect.get(target, key);
      } });
      return work(proxy);
    }, opts) };
    const deleting = categories(wrapped).deleteCategory(id); await locked.promise;
    let rejected = false;
    const writing = b.$transaction(async (tx) => {
      writerPid = (await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`)[0].pid;
      if (kind === "product") await tx.product.create({ data: { id: `${id}_new`, slug: `${id}_new`, name: "Concurrent synthetic", description: "Synthetic", categoryId: id, price: 1 } });
      else await tx.category.create({ data: { id: `${id}_new`, slug: `${id}_new`, name: "Synthetic child", nameEn: "Synthetic child", parentId: id } });
    }, opts).catch(() => { rejected = true; if (!writerPid) writerPid = -1; });
    while (!writerPid) await new Promise((done) => setTimeout(done, 5));
    try { await waitBlocked(writerPid); } finally { release.release(); }
    assert.equal(await deleting, undefined); await writing; assert.equal(rejected, true);
    assert.equal(await a.category.count({ where: { id } }), 0);
    pass(`two-session ${kind} attachment waits behind actual category action FOR UPDATE; deleting winner rejects new reference`);

    const other = `addendum_writer_first_${kind}`; await createCategory(other);
    const inserted = latch(), finish = latch(), deleteStarted = latch(); let deletePid = 0;
    const firstWriter = b.$transaction(async (tx) => {
      if (kind === "product") await tx.product.create({ data: { id: `${other}_new`, slug: `${other}_new`, name: "Concurrent synthetic", description: "Synthetic", categoryId: other, price: 1, isActive: false } });
      else await tx.category.create({ data: { id: `${other}_new`, slug: `${other}_new`, name: "Synthetic child", nameEn: "Synthetic child", parentId: other } });
      inserted.release(); await finish.promise;
    }, opts); await inserted.promise;
    const db = { $transaction: (work: (tx: Prisma.TransactionClient) => Promise<unknown>) => a.$transaction(async (tx) => { deletePid = (await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`)[0].pid; deleteStarted.release(); return work(tx); }, opts) };
    const secondDelete = categories(db).deleteCategory(other); await deleteStarted.promise;
    try { await waitBlocked(deletePid); } finally { finish.release(); }
    await firstWriter; assert.deepEqual(await secondDelete, { error: kind === "product" ? "categoryProducts" : "categoryChildren" });
    assert.equal(await a.category.count({ where: { id: other } }), 1);
    pass(`two-session ${kind} writer holds parent KEY SHARE; deletion waits, then observes committed dependency and refuses`);
  }

  await a.order.create({ data: { id: "addendum_history", number: "ADDENDUM-LOCAL", checkoutAcceptance: "LEGACY", customerName: "Synthetic", customerEmail: "qa@example.invalid", customerPhone: "000", shippingAddress: "Synthetic", city: "Synthetic", postalCode: "000", paymentMethod: "LOCAL_TEST_NO_DELIVERY", subtotal: 123.45, total: 123.45, items: { create: { id: "addendum_item", productId: saved.id, productName: "Frozen", optionsJson: '{"Size":"Frozen legacy"}', price: 123.45, quantity: 1 } } } });
  const before = await a.orderItem.findUniqueOrThrow({ where: { id: "addendum_item" } });
  assert.deepEqual(await products.deleteProduct(saved.id), { error: "orderHistory" });
  assert.equal(await products.archiveProduct(saved.id), undefined);
  assert.deepEqual(await a.orderItem.findUniqueOrThrow({ where: { id: before.id } }), before);
  pass("actual product deletion/archive respects strict checkout CHECK and leaves historical flat snapshot and financial values untouched");
  console.log(`PASS addendum PostgreSQL: ${groups} groups; no existing database or external provider touched.`);
}
verify().finally(async () => { await Promise.all([a.$disconnect(),b.$disconnect(),observer.$disconnect()]); }).catch((error) => { console.error(error); process.exitCode = 1; });
