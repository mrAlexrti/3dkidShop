// One-purpose development data cleanup. Default is read-only; --apply mutates; --verify only checks.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { loadEnvConfig } from "@next/env";
import { Prisma, PrismaClient } from "@prisma/client";

loadEnvConfig(process.cwd());
const db = new PrismaClient();
const canonical = [
  { name: "Іграшки", nameEn: "Toys", slug: "toys", order: 10, parentId: null, aliases: ["toys-3d"] },
  { name: "Брелоки", nameEn: "Keychains", slug: "keychains", order: 20, parentId: null, aliases: [] },
  { name: "Клікери", nameEn: "Clickers", slug: "clickers", order: 30, parentId: null, aliases: [] },
  { name: "Фіджети", nameEn: "Fidgets", slug: "fidgets", order: 40, parentId: null, aliases: [] },
  { name: "Аксесуари для навушників", nameEn: "Earphone Accessories", slug: "earphone-accessories", order: 50, parentId: null, aliases: ["headphone-accessories"] },
] as const;
type CanonicalSlug = (typeof canonical)[number]["slug"];
const fields = ({ name, nameEn, slug, order, parentId }: typeof canonical[number]) => ({ name, nameEn, slug, order, parentId });
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

async function inspect(client: Prisma.TransactionClient) {
  const [categories, products, orders, images, options, attributes, content] = await Promise.all([
    client.category.findMany({ orderBy: [{ order: "asc" }, { id: "asc" }] }),
    client.product.findMany({ orderBy: { id: "asc" } }),
    client.order.findMany({ orderBy: { id: "asc" }, include: { items: { orderBy: { id: "asc" } } } }),
    client.productImage.findMany({ orderBy: { id: "asc" } }),
    client.productOption.findMany({ orderBy: { id: "asc" }, include: { values: { orderBy: { id: "asc" } } } }),
    client.productAttribute.findMany({ orderBy: { id: "asc" } }),
    client.siteContent.findMany({ orderBy: { key: "asc" } }),
  ]);
  return { categories, products, orders, images, options, attributes, content };
}
type Snapshot = Awaited<ReturnType<typeof inspect>>;

function unchangedData(snapshot: Snapshot) {
  return {
    // Preserve all product fields, including timestamps and GIF URLs, except the intended category FK.
    products: snapshot.products.map((product) => {
      const { categoryId, ...unchanged } = product;
      void categoryId;
      return unchanged;
    }),
    orders: snapshot.orders,
    images: snapshot.images,
    options: snapshot.options,
    attributes: snapshot.attributes,
    content: snapshot.content,
  };
}

function inventory(snapshot: Snapshot) {
  const productIds = snapshot.products.map(({ id }) => id);
  return {
    productCount: productIds.length, productIds, productIdsHash: hash(productIds),
    orderCount: snapshot.orders.length, ordersHash: hash(snapshot.orders),
    imageCount: snapshot.images.length, unchangedDataHash: hash(unchangedData(snapshot)),
    categoryCount: snapshot.categories.length,
    categories: snapshot.categories.map(({ id, name, nameEn, slug, order, parentId }) => ({
      id, name, nameEn, slug, order, parentId,
      productCount: snapshot.products.filter((product) => product.categoryId === id).length,
    })),
  };
}

function classify(product: Snapshot["products"][number], category: Snapshot["categories"][number]): CanonicalSlug {
  const identity = `${product.name} ${product.nameEn ?? ""} ${product.slug}`.normalize("NFKC").toLowerCase();
  // Explicitly unrelated mock merchandise uses the owner-approved development fallback.
  if (["courses-3d-modeling", "shoppers", "jibbitz-crocs", "buttons"].includes(category.slug)
    || /\bcourse\b|мінікурс|курс|\btote\b|шопер|crocs|джибітс|jibbitz|ґудзик|\bbuttons?\b/.test(identity)) return "toys";
  if (/earphones?|headphones?|навушник/.test(identity) || ["headphone-accessories", "earphone-accessories"].includes(category.slug)) return "earphone-accessories";
  if (/key[\s-]?chains?|брел[оі]?к/.test(identity)) return "keychains";
  if (/clickers?|clicking|клікер|клац/.test(identity)) return "clickers";
  if (/fidgets?|фіджет/.test(identity)) return "fidgets";
  return canonical.find((item) => item.slug === category.slug)?.slug ?? "toys";
}

function plan(snapshot: Snapshot) {
  return snapshot.products.map((product) => {
    const category = snapshot.categories.find(({ id }) => id === product.categoryId);
    assert.ok(category, `Invalid category FK before cleanup: ${product.id}`);
    return { productId: product.id, name: product.name, fromCategoryId: category.id, fromSlug: category.slug, toSlug: classify(product, category) };
  });
}

function verify(snapshot: Snapshot) {
  assert.deepEqual(snapshot.categories.map(({ name, nameEn, slug, order, parentId }) => ({ name, nameEn, slug, order, parentId })), canonical.map(fields));
  const ids = new Set(snapshot.categories.map(({ id }) => id));
  assert.equal(ids.size, 5);
  for (const product of snapshot.products) assert.ok(ids.has(product.categoryId), `Invalid category FK: ${product.id}`);
}

async function main() {
  const flags = process.argv.slice(2);
  assert.ok(flags.length <= 1 && flags.every((flag) => ["--apply", "--verify", "--dry-run"].includes(flag)), "Use --apply, --verify, or --dry-run (default).");
  if (!flags.includes("--apply")) {
    const snapshot = await inspect(db);
    if (flags.includes("--verify")) {
      verify(snapshot);
      console.log(JSON.stringify({ status: "VERIFIED_READ_ONLY", inventory: inventory(snapshot) }, null, 2));
    } else {
      console.log(JSON.stringify({ status: "DRY_RUN_NO_WRITES", before: inventory(snapshot), productPlan: plan(snapshot), canonical: canonical.map(fields) }, null, 2));
    }
    return;
  }
  assert.notEqual(process.env.NODE_ENV, "production", "This script is only for the explicitly authorized development database.");
  const result = await db.$transaction(async (tx) => {
    const before = await inspect(tx);
    const productPlan = plan(before);
    // Record the complete pre-change ID/count inventory before any writes; never print order/customer data.
    console.log(JSON.stringify({ status: "BEFORE_MUTATION", before: inventory(before), productPlan }, null, 2));
    const targets = new Map<CanonicalSlug, string>();
    const categoryActions: { id: string; fromSlug: string | null; toSlug: CanonicalSlug; action: string }[] = [];
    for (const spec of canonical) {
      const candidate = before.categories.find(({ slug }) => slug === spec.slug)
        ?? before.categories.find(({ slug }) => (spec.aliases as readonly string[]).includes(slug));
      const data = fields(spec);
      if (candidate) {
        const changed = Object.entries(data).some(([key, value]) => candidate[key as keyof typeof data] !== value);
        if (changed) await tx.category.update({ where: { id: candidate.id }, data });
        targets.set(spec.slug, candidate.id);
        categoryActions.push({ id: candidate.id, fromSlug: candidate.slug, toSlug: spec.slug, action: changed ? "updated" : "unchanged" });
      } else {
        const created = await tx.category.create({ data });
        targets.set(spec.slug, created.id);
        categoryActions.push({ id: created.id, fromSlug: null, toSlug: spec.slug, action: "created" });
      }
    }
    const reassigned: typeof productPlan = [];
    for (const move of productPlan) {
      const categoryId = targets.get(move.toSlug);
      assert.ok(categoryId);
      if (categoryId === move.fromCategoryId) continue;
      const original = before.products.find(({ id }) => id === move.productId)!;
      await tx.product.update({ where: { id: move.productId }, data: { categoryId, updatedAt: original.updatedAt } });
      reassigned.push(move);
    }
    const retainedIds = new Set(targets.values());
    const obsolete = before.categories.filter(({ id }) => !retainedIds.has(id));
    const obsoleteIds = obsolete.map(({ id }) => id);
    if (obsoleteIds.length) {
      assert.equal(await tx.product.count({ where: { categoryId: { in: obsoleteIds } } }), 0, "Products must be reassigned before obsolete categories are removed.");
      const deleted = await tx.category.deleteMany({ where: { id: { in: obsoleteIds } } });
      assert.equal(deleted.count, obsoleteIds.length);
    }
    const after = await inspect(tx);
    verify(after);
    assert.deepEqual(after.products.map(({ id }) => id), before.products.map(({ id }) => id));
    assert.equal(hash(unchangedData(after)), hash(unchangedData(before)), "Only categories and Product.categoryId may change.");
    return {
      before: inventory(before), after: inventory(after), categoryActions, reassigned,
      removedCategories: obsolete.map(({ id, slug, name }) => ({ id, slug, name })),
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 60000, maxWait: 10000 });
  console.log(JSON.stringify({ status: "COMMITTED_AND_VERIFIED", ...result }, null, 2));
}

void main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => db.$disconnect());
