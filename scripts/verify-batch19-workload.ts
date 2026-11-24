import assert from "node:assert/strict";
import { Prisma, PrismaClient } from "@prisma/client";
import { productOffer } from "../src/lib/product-configuration";
import * as productQuery from "../src/lib/product-query";
import { sourceModule } from "./source-module";

const runtime = new URL(process.env.DATABASE_URL ?? "");
const marker = process.env.BATCH19_QA_MARKER;
assert.match(marker ?? "", /^[a-f0-9]{32}$/);
assert.equal(runtime.hostname, "127.0.0.1");
assert.equal(runtime.pathname, `/batch18_review_${marker}`);
assert.equal(runtime.username, "app_3dkid");
const ownerURL = new URL(process.env.BATCH19_OWNER_DATABASE_URL ?? "");
assert.equal(ownerURL.host + ownerURL.pathname, runtime.host + runtime.pathname);
assert.equal(ownerURL.username, "batch18a_qa");
const db = new PrismaClient({ datasourceUrl: runtime.href, log: [{ emit: "event", level: "query" }] });
const owner = new PrismaClient({ datasourceUrl: ownerURL.href });
let queries = 0;
db.$on("query", () => { queries++; });
const { catalogProducts } = sourceModule<typeof import("../src/lib/catalog-products")>("src/lib/catalog-products.ts", {
  "@prisma/client": { Prisma }, "./prisma": { prisma: db }, "./product-query": productQuery,
});

async function verify() {
  const list = (page: number) => catalogProducts({ where: { isActive: true, categoryId: "work_category" },
    orderBy: { name: "asc" }, categoryIds: ["work_category"], page, pageSize: 24, sort: "price_asc" });
  const started = performance.now();
  const first = await list(1);
  const firstQueries = queries;
  assert.equal(first.total, 100);
  assert.equal(first.products.length, 24);
  assert.equal(first.products[0].id, "work_p1");
  assert.equal(first.products[0].variants.length, 6);
  assert.equal(first.products[0].variants.find((variant) => variant.id === "work_p1_v21")?.filamentGroups.length, 1);
  assert.ok(firstQueries <= 20, `Catalog relation reads must be batched. Observed ${firstQueries} statements.`);
  const startSecond = queries;
  const second = await list(2);
  assert.equal(second.products[0].id, "work_p25");
  assert.equal(queries - startSecond, firstQueries);
  assert.equal(productOffer(first.products[0]).price, 102);
  await owner.filament.update({ where: { id: "work_b" }, data: { isAvailable: true } });
  assert.equal(productOffer((await list(1)).products[0]).price, 12);
  assert.equal(await db.customerFavorite.count({ where: { userId: "work_u1" } }), 8);
  assert.equal(await db.order.count({ where: { customerId: "work_u1" } }), 3);
  assert.equal(await db.order.count({ where: { id: { startsWith: "work_o" } } }), 49);
  console.log(`PASS workload: 100 products, 600 variants, 1,200 groups, 160 favorites, 49 orders, ${firstQueries} statements per catalog page, ${Math.round(performance.now() - started)} ms for the local sample`);
}

verify().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => Promise.all([db.$disconnect(), owner.$disconnect()]));
