// Exactly the owner-approved Batch 1.4 data plan. No creates, schema changes or external effects.
// Default: read-only preflight. --apply: one guarded transaction. --verify: read-only final-state QA.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { loadEnvConfig } from "@next/env";
import { PrismaClient, Prisma } from "@prisma/client";
import { getSizeVariants, hasConfiguredSizes, startingPrice } from "../src/lib/product-variants";

loadEnvConfig(process.cwd());
const db = new PrismaClient();
const labels = ["Маленький", "Середній", "Великий"];
const english = ["Small", "Medium", "Large"];
const remove = [
  { productId: "cmrb2qlgd000h1jjbj7assulp", groupId: "cmrb2qlge000j1jjbtd3j2tet", name: "Брелок «Зірочка»", base: 119, values: ["cmrb2qlge000k1jjbtywqhatz", "cmrb2qlge000l1jjb6pqi6k4b", "cmrb2qlge000m1jjbuji0ilu2"] },
  { productId: "cmrb2qo52000z1jjbo88lodk5", groupId: "cmrb2qo5200111jjbvek92vsb", name: "Ґудзики «Веселка»", base: 99, values: ["cmrb2qo5200121jjbj41jnwk8", "cmrb2qo5200131jjbvhqrub73", "cmrb2qo5200141jjbn1fdzt2z"] },
  { productId: "cmrb2qpez00181jjb2j2ws3vd", groupId: "cmrb2qpez001a1jjbrpa9xpi8", name: "Джибітс «Смайлик»", base: 129, values: ["cmrb2qpez001b1jjbbyejaoru", "cmrb2qpez001c1jjbbvcl6yy4", "cmrb2qpez001d1jjb2heaumzl"] },
  { productId: "cmrb2qqrq001h1jjbqfta3dfr", groupId: "cmrb2qqrq001j1jjbn3aewz31", name: "Кліпса для навушників", base: 139, values: ["cmrb2qqrq001k1jjbmpakmm01", "cmrb2qqrq001l1jjbi0i8wsq6", "cmrb2qqrq001m1jjbp8fch7d3"] },
  { productId: "cmrb2qvhn00281jjbc704w76o", groupId: "cmrb2qvhn002a1jjbn4jp5r45", name: "Курс «Старт у 3D моделюванні»", base: 499, values: ["cmrb2qvhn002b1jjb2f1bs73s", "cmrb2qvhn002c1jjba2kuyz53", "cmrb2qvhn002d1jjbuvgfgmip"] },
  { productId: "cmrb2qwxc002h1jjbzz8gaohd", groupId: "cmrb2qwxd002j1jjbn3gq1ov6", name: "Мінікурс «Моделюємо іграшку»", base: 349, values: ["cmrb2qwxd002k1jjb67bbd3w3", "cmrb2qwxd002l1jjbt8lzni0b", "cmrb2qwxd002m1jjboaj006yy"] },
  { productId: "cmrb2qs9l001q1jjbypq7631v", groupId: "cmrb2qs9m001s1jjbs8fjp38a", name: "Шопер «3D Kid Heart»", base: 399, values: ["cmrb2qs9m001t1jjb3bvm40lv", "cmrb2qs9m001u1jjbdwrjadw9", "cmrb2qs9m001v1jjb3b3u2es2"] },
  { productId: "cmrb2qu2b001z1jjbtsy8reee", groupId: "cmrb2qu2b00211jjb557xqkmu", name: "Шопер «Playful Shapes»", base: 549, values: ["cmrb2qu2b00221jjb019f6nwg", "cmrb2qu2b00231jjbgdmajscb", "cmrb2qu2b00241jjbn3grczng"] },
];
const keep = [
  { productId: "cmrb2qjf700081jjbohggu03b", groupId: "cmrb2qjf7000a1jjbynm46h26", name: "3D іграшка «Ведмедик»", base: 149, values: ["cmrb2qjf7000b1jjbx8uq0bra", "cmrb2qjf7000c1jjbbhx40rqk", "cmrb2qjf7000d1jjb83mbxkby"], prices: [149, 199, 249] },
  { productId: "cmrb2qmsq000q1jjb1rbniyby", groupId: "cmrb2qmsq000s1jjbi1bcxzgd", name: "Набір 3D фігурок «Космос»", base: 299, values: ["cmrb2qmsq000t1jjbkylncewg", "cmrb2qmsq000u1jjbe4yng99b", "cmrb2qmsq000v1jjbjmanxsiv"], prices: [299, 349, 399] },
];
const all = [...remove, ...keep];
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

async function readState(client: Prisma.TransactionClient) {
  const [products, images, categories, orders, orderItems, attributes, groups, values] = await Promise.all([
    client.product.findMany({ orderBy: { id: "asc" } }), client.productImage.findMany({ orderBy: { id: "asc" } }),
    client.category.findMany({ orderBy: { id: "asc" } }), client.order.findMany({ orderBy: { id: "asc" } }),
    client.orderItem.findMany({ orderBy: { id: "asc" } }), client.productAttribute.findMany({ orderBy: { id: "asc" } }),
    client.productOption.findMany({ orderBy: { id: "asc" } }), client.productOptionValue.findMany({ orderBy: { id: "asc" } }),
  ]);
  return { protected: { products, images, categories, orders, orderItems, attributes }, groups, values };
}
type State = Awaited<ReturnType<typeof readState>>;
function counts(state: State) {
  const data = state.protected;
  return { products: data.products.length, images: data.images.length, categories: data.categories.length, orders: data.orders.length, orderItems: data.orderItems.length, groups: state.groups.length, values: state.values.length, explicitPrices: state.values.filter((value) => value.price != null).length };
}
function checkProducts(state: State) {
  assert.equal(state.protected.products.length, 10);
  for (const item of all) {
    const product = state.protected.products.find((row) => row.id === item.productId);
    assert.ok(product, `Missing reviewed product ${item.name}`);
    assert.equal(product.name, item.name); assert.equal(Number(product.price), item.base);
    assert.equal(product.stock, keep.includes(item as typeof keep[number]) ? 49 : 50);
  }
}
function beforeGuard(state: State) {
  assert.deepEqual(counts(state), { products: 10, images: 10, categories: 5, orders: 2, orderItems: 2, groups: 10, values: 30, explicitPrices: 0 });
  checkProducts(state);
  assert.deepEqual(state.groups.map((row) => row.id).sort(), all.map((row) => row.groupId).sort());
  for (const item of all) {
    const group = state.groups.find((row) => row.id === item.groupId)!;
    assert.equal(group.productId, item.productId); assert.equal(group.name, "Розмір");
    assert.deepEqual(state.values.filter((row) => row.optionId === group.id).map((row) => row.id).sort(), [...item.values].sort());
    item.values.forEach((id, index) => {
      const value = state.values.find((row) => row.id === id)!;
      assert.equal(value.value, labels[index]); assert.equal(Number(value.priceModifier), index * 50);
      assert.equal(value.price, null); assert.equal(value.valueEn, null); assert.equal(value.note, null); assert.equal(value.noteEn, null);
    });
  }
}
function afterGuard(state: State) {
  assert.deepEqual(counts(state), { products: 10, images: 10, categories: 5, orders: 2, orderItems: 2, groups: 2, values: 6, explicitPrices: 6 });
  checkProducts(state);
  for (const item of all) {
    const groups = state.groups.filter((row) => row.productId === item.productId).map((group) => ({ ...group, values: state.values.filter((value) => value.optionId === group.id) }));
    const configured = getSizeVariants(groups);
    const fixture = keep.find((row) => row.productId === item.productId);
    if (!fixture) {
      assert.equal(groups.length, 0); assert.equal(configured.length, 0); assert.equal(hasConfiguredSizes(groups), false); assert.equal(startingPrice(item.base, groups), item.base);
    } else {
      assert.equal(groups.length, 1); assert.equal(groups[0].id, fixture.groupId); assert.equal(configured.length, 3); assert.equal(hasConfiguredSizes(groups), true);
      fixture.values.forEach((id, index) => {
        const value = state.values.find((row) => row.id === id)!;
        assert.equal(value.optionId, fixture.groupId); assert.equal(value.value, labels[index]); assert.equal(value.valueEn, english[index]);
        assert.equal(Number(value.price), fixture.prices[index]); assert.equal(Number(value.priceModifier), 0); assert.equal(value.note, null); assert.equal(value.noteEn, null);
      });
    }
  }
}
async function main() {
  if (process.argv.includes("--verify")) {
    const state = await readState(db); afterGuard(state);
    console.log(JSON.stringify({ status: "VERIFIED_READ_ONLY", counts: counts(state), protectedHash: hash(state.protected) }, null, 2));
    return;
  }
  if (!process.argv.includes("--apply")) {
    const state = await readState(db); beforeGuard(state);
    console.log(JSON.stringify({ status: "PREFLIGHT_READ_ONLY", counts: counts(state), deleteGroups: remove.map((row) => row.groupId), deleteValues: remove.flatMap((row) => row.values), updateValues: keep.flatMap((row) => row.values), protectedHash: hash(state.protected) }, null, 2));
    return;
  }
  const result = await db.$transaction(async (tx) => {
    const before = await readState(tx); beforeGuard(before);
    const deletedValues = await tx.productOptionValue.deleteMany({ where: { id: { in: remove.flatMap((item) => item.values) } } });
    assert.equal(deletedValues.count, 24);
    const deletedGroups = await tx.productOption.deleteMany({ where: { id: { in: remove.map((item) => item.groupId) } } });
    assert.equal(deletedGroups.count, 8);
    const updates = new Map<string, { valueEn: string; price: Prisma.Decimal; priceModifier: Prisma.Decimal }>();
    for (const item of keep) for (const [index, id] of item.values.entries()) {
      const data = { valueEn: english[index], price: new Prisma.Decimal(item.prices[index]), priceModifier: new Prisma.Decimal(0) };
      const update = await tx.productOptionValue.updateMany({ where: { id, optionId: item.groupId, price: null }, data });
      assert.equal(update.count, 1); updates.set(id, data);
    }
    const after = await readState(tx); afterGuard(after);
    assert.equal(hash(after.protected), hash(before.protected), "Protected product/stock/media/category/order/history data changed; abort transaction.");
    assert.equal(hash(after.groups), hash(before.groups.filter((group) => keep.some((item) => item.groupId === group.id))));
    assert.equal(hash(after.values), hash(before.values.filter((value) => updates.has(value.id)).map((value) => ({ ...value, ...updates.get(value.id)! }))), "A size field outside the approved updates changed; abort.");
    return { status: "APPLIED_EXACT_REVIEWED_PLAN", before: counts(before), after: counts(after), deletedGroups: 8, deletedValues: 24, updatedValues: 6, protectedHashBefore: hash(before.protected), protectedHashAfter: hash(after.protected) };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 60000 });
  const verified = await readState(db); afterGuard(verified);
  assert.equal(hash(verified.protected), result.protectedHashBefore);
  console.log(JSON.stringify(result, null, 2));
}
main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => db.$disconnect());
