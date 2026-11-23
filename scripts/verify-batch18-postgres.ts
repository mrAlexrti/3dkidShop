// Invoked only by rehearse-batch18-variants.mjs on its NEW synthetic cluster.
// Actual PostgreSQL, no mocked locking/constraint proof, no project DATABASE_URL.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { tmpdir } from "node:os";
import { PrismaClient, type Prisma } from "@prisma/client";
import { getSizeVariants, startingPrice, orderSizeLabel } from "../src/lib/product-variants";
import { syncProductSizes } from "../src/lib/product-size-admin";
import { verifyApplication } from "./verify-batch18-application-postgres";

const directory = process.env.BATCH18_QA_CLUSTER_DIR ?? "";
assert.equal(resolve(directory, ".."), resolve(tmpdir()));
assert.ok(basename(directory).startsWith("batch18-variant-review-"));
assert.match(process.env.BATCH18_QA_MARKER ?? "", /^[a-f0-9]{48}$/);
assert.equal(readFileSync(resolve(directory, "qa-marker"), "utf8"), process.env.BATCH18_QA_MARKER);
const url = new URL(process.env.BATCH18_QA_DATABASE_URL ?? "");
assert.equal(url.protocol, "postgresql:"); assert.equal(url.hostname, "127.0.0.1");
assert.equal(url.username, "batch18_qa"); assert.equal(url.password, "");
assert.match(url.pathname, /^\/batch18_review_[a-f0-9]+$/); assert.ok(Number(url.port) > 1024);
url.searchParams.set("connection_limit", "1");
const makeClient = () => new PrismaClient({ datasources: { db: { url: url.toString() } } });
const a = makeClient(), b = makeClient(), observer = makeClient();
type Tx = Prisma.TransactionClient;
type Mode = "SIMPLE" | "SIZE" | "COLOR" | "COLOR_SIZE";
type Choice = { p: string; mode: Mode; v: string; color: string; size: string; cg: string; sg: string };
let seq = 0, passed = 0;
const pass = (message: string) => console.log(`PASS PG ${++passed}: ${message}`);
const txOptions = { timeout: 15000, maxWait: 10000 };
async function save<T>(work: (tx: Tx) => Promise<T>, options = txOptions): Promise<T> {
  return a.$transaction(async (tx) => {
    const result = await work(tx);
    await tx.$executeRawUnsafe("SET CONSTRAINTS ALL IMMEDIATE");
    return result;
  }, options);
}
async function rejected(work: () => Promise<unknown>, pattern: RegExp) {
  let caught: unknown;
  try { await work(); } catch (error) { caught = error; }
  assert.ok(caught, `Expected rejection ${pattern}`); assert.match(String(caught), pattern);
}
async function product(tx: Tx, mode: Mode, withVariant = true): Promise<Choice> {
  const p = `fixture_${++seq}`;
  const ids = { p, mode, v: `${p}_v`, color: `${p}_red`, size: `${p}_small`, cg: `${p}_cg`, sg: `${p}_sg` };
  await tx.product.create({ data: { id: p, name: "Fixture", nameEn: "Fixture", slug: p, description: "Synthetic", categoryId: "qa_category", price: "1.00", isActive: true, isOrderable: true } });
  await tx.$executeRaw`UPDATE "Product" SET "optionMode"=${mode}::"ProductOptionMode" WHERE id=${p}`;
  if (mode.includes("COLOR")) {
    await tx.$executeRaw`INSERT INTO "ProductOption" (id,"productId",name,kind) VALUES (${ids.cg},${p},'Колір','COLOR')`;
    await tx.$executeRaw`INSERT INTO "ProductOptionValue" (id,"optionId",value,"valueEn") VALUES (${ids.color},${ids.cg},'Червоний','Red')`;
  }
  if (mode.includes("SIZE")) {
    await tx.$executeRaw`INSERT INTO "ProductOption" (id,"productId",name,kind) VALUES (${ids.sg},${p},'Розмір','SIZE')`;
    await tx.$executeRaw`INSERT INTO "ProductOptionValue" (id,"optionId",value,"valueEn") VALUES (${ids.size},${ids.sg},'Маленький','Small')`;
  }
  if (mode !== "SIMPLE" && withVariant) {
    const key = [mode.includes("COLOR") ? `COLOR=${ids.color}` : "", mode.includes("SIZE") ? `SIZE=${ids.size}` : ""].filter(Boolean).join(";");
    await tx.$executeRaw`INSERT INTO "ProductVariant" (id,"productId","combinationKey",price,"isAvailable","updatedAt") VALUES (${ids.v},${p},${key},199.00,true,now())`;
    if (mode.includes("COLOR")) await tx.$executeRaw`INSERT INTO "ProductVariantSelection" ("variantId","productId","optionId","valueId") VALUES (${ids.v},${p},${ids.cg},${ids.color})`;
    if (mode.includes("SIZE")) await tx.$executeRaw`INSERT INTO "ProductVariantSelection" ("variantId","productId","optionId","valueId") VALUES (${ids.v},${p},${ids.sg},${ids.size})`;
  }
  return ids;
}
function snapshot(ids: Choice) {
  return JSON.stringify({ version: 2, variantId: ids.v, dimensions: [
    ...(ids.mode.includes("COLOR") ? [{ kind: "COLOR", optionId: ids.cg, valueId: ids.color, labelUa: "Червоний", labelEn: "Red" }] : []),
    ...(ids.mode.includes("SIZE") ? [{ kind: "SIZE", optionId: ids.sg, valueId: ids.size, labelUa: "Маленький", labelEn: "Small" }] : []),
  ] });
}
async function order(tx: Tx) {
  return tx.order.create({ data: { id: `order_${++seq}`, customerName: "Synthetic QA", customerEmail: "qa@example.invalid", customerPhone: "000", shippingAddress: "QA", city: "QA", postalCode: "000", paymentMethod: "cod", subtotal: "199.00", total: "199.00" } });
}
async function item(tx: Tx, ids: Choice, amount = "199.00", snap = snapshot(ids)) {
  const o = await order(tx), id = `item_${++seq}`;
  await tx.$executeRaw`INSERT INTO "OrderItem" (id,"orderId","productId","productVariantId","productName","optionsJson",price,quantity) VALUES (${id},${o.id},${ids.p},${ids.v},'Saved name',${snap},${amount}::numeric,1)`;
  return id;
}
const latch = () => { let open!: () => void; const promise = new Promise<void>((done) => { open = done; }); return { promise, open }; };
async function waitForLock(pid: number) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const rows = await observer.$queryRaw<{ waiting: boolean }[]>`SELECT wait_event_type='Lock' AS waiting FROM pg_stat_activity WHERE pid=${pid}`;
    if (rows[0]?.waiting) return;
    await new Promise((done) => setTimeout(done, 25));
  }
  throw new Error(`Session ${pid} did not demonstrably wait on a PostgreSQL lock`);
}

async function verify() {
  const settings = await a.$queryRaw<{ data_directory: string }[]>`SHOW data_directory`;
  assert.equal(resolve(settings[0].data_directory).toLowerCase(), resolve(directory, "data").toLowerCase());
  const version = await a.$queryRaw<{ version: number }[]>`SELECT current_setting('server_version_num')::int AS version`;
  assert.ok(version[0].version >= 180000 && version[0].version < 190000);
  const old = await a.$queryRaw<{ optionMode: string; variantRevision: number }[]>`SELECT "optionMode","variantRevision" FROM "Product" ORDER BY id`;
  assert.equal(old.length, 2); assert.ok(old.every((p) => p.optionMode === "LEGACY" && p.variantRevision === 0));
  const legacy = await a.product.findUniqueOrThrow({ where: { id: "legacy_size" }, include: { options: { include: { values: true } } } });
  assert.equal(startingPrice(legacy.price, legacy.options), 199); assert.deepEqual(getSizeVariants(legacy.options).map((s) => [s.id, s.price]), [["legacy_small", 199]]);
  assert.equal(Number(legacy.options[0].values.find((s) => s.id === "legacy_unpriced")!.priceModifier), 50);
  pass("expanded legacy defaults, exact size ID/full price and unpriced modifier remain unchanged");
  const beforeV1=await a.orderItem.findUniqueOrThrow({where:{id:"before_v1"}});
  const beforeFlat=await a.orderItem.findUniqueOrThrow({where:{id:"before_flat"}});
  assert.equal(orderSizeLabel(beforeV1.optionsJson,"ua"),"Маленький");
  assert.equal(orderSizeLabel(beforeV1.optionsJson,"en"),"Small");
  assert.equal(orderSizeLabel(beforeFlat.optionsJson,"en"),"Historical small");
  const beforeFk=await a.$queryRaw<{productVariantId:null}[]>`SELECT "productVariantId" FROM "OrderItem" WHERE id IN ('before_v1','before_flat')`;
  assert.ok(beforeFk.every((i)=>i.productVariantId===null));
  pass("pre-expansion historical v1/flat OrderItems survive DDL unchanged with NULL new FK and readable UA/EN snapshots");

  await save(async (tx) => {
    const p = await tx.product.create({ data: { name: "Legacy sync", slug: "legacy-sync", description: "Fixture", price: 1, categoryId: "qa_category" } });
    await syncProductSizes(tx, p.id, [{ labelUa: "Малий", labelEn: "Small", price: 123, noteUa: "", noteEn: "" }]);
    const initial = await tx.productOption.findFirstOrThrow({ where: { productId: p.id }, include: { values: true } });
    await tx.productOptionValue.create({ data: { optionId: initial.id, value: "Old unpriced", priceModifier: 987 } });
    await syncProductSizes(tx, p.id, [{ id: initial.values[0].id, labelUa: "Малий новий", labelEn: "Small changed", price: 234, noteUa: "", noteEn: "" }]);
    const after = await tx.productOptionValue.findMany({ where: { optionId: initial.id } });
    assert.equal(after.length, 2); assert.equal(Number(after.find((v) => v.id === initial.values[0].id)!.price), 234);
    await syncProductSizes(tx, p.id, []);
    assert.equal(await tx.productOptionValue.count({ where: { optionId: initial.id } }), 1);
  }, txOptions);
  pass("actual existing size sync against expanded PG schema retains IDs, full price, null-price legacy values and disable behavior");

  const simple = await save((tx) => product(tx, "SIMPLE"), txOptions);
  const size = await save((tx) => product(tx, "SIZE"), txOptions);
  const color = await save((tx) => product(tx, "COLOR"), txOptions);
  const combined = await save((tx) => product(tx, "COLOR_SIZE"), txOptions);
  const empty = await save((tx) => product(tx, "COLOR", false), txOptions);
  assert.equal((await a.$queryRaw<{ n: number }[]>`SELECT count(*)::int n FROM "ProductVariant" WHERE "productId"=${empty.p}`)[0].n, 0);
  pass("simple, size-only, color-only, sparse combined and empty/unavailable configurations commit with explicit modes");
  let commitError: unknown;
  let invalidProduct = "";
  try { await a.$transaction(async (tx) => {
    const bad = await product(tx, "COLOR", false);
    invalidProduct = bad.p;
    await tx.$executeRaw`INSERT INTO "ProductVariant" (id,"productId","combinationKey",price,"updatedAt") VALUES (${bad.v},${bad.p},'FORGED',199,now())`;
    assert.equal((await tx.$queryRaw<{ n: number }[]>`SELECT count(*)::int n FROM "ProductVariant" WHERE id=${bad.v}`)[0].n, 1, "Invalid intermediate row exists before deferred commit check");
  }, txOptions); } catch(error) { commitError=error; }
  console.log(`DIAGNOSTIC deferred COMMIT: error=${String(commitError)}; persistedProduct=${await a.product.count({where:{id:invalidProduct}})}`);
  assert.equal(await a.product.count({where:{id:invalidProduct}}),0);
  if (!commitError) console.log("KNOWN FAIL original architecture: Prisma 5 resolves a deferred-COMMIT rollback. Explicit constraint flush is mandatory.");
  await rejected(() => save(async (tx) => {
    const bad=await product(tx,"COLOR",false);
    await tx.$executeRaw`INSERT INTO "ProductVariant" (id,"productId","combinationKey",price,"updatedAt") VALUES (${bad.v},${bad.p},'FORGED',199,now())`;
  }), /B18_INVALID_COMBINATION/);
  pass("deferred commit rejects incomplete/forged identity and rolls back the entire product Save");
  const originalName=(await a.product.findUniqueOrThrow({where:{id:color.p}})).name;
  await rejected(()=>save(async(tx)=>{
    await tx.product.update({where:{id:color.p},data:{name:"Must roll back"}});
    await tx.$executeRaw`INSERT INTO "ProductVariant" (id,"productId","combinationKey",price,"updatedAt") VALUES ('failed_update',${color.p},'FORGED',199,now())`;
  }),/B18_INVALID_COMBINATION/);
  assert.equal((await a.product.findUniqueOrThrow({where:{id:color.p}})).name,originalName);
  pass("failed update plus explicit constraint flush preserves previously saved product fields atomically");
  for (const [column, value] of [["combinationKey", "COLOR=other"], ["id", "new_identity"], ["productId", simple.p]] as const)
    await rejected(() => a.$executeRawUnsafe(`UPDATE "ProductVariant" SET "${column}"=$1 WHERE id=$2`, value, color.v), /B18_IMMUTABLE/);
  await rejected(() => a.$executeRaw`DELETE FROM "ProductVariantSelection" WHERE "variantId"=${color.v}`, /B18_RETIRE/);
  await rejected(() => a.$executeRaw`UPDATE "ProductOption" SET kind='SIZE' WHERE id=${color.cg}`, /B18_IMMUTABLE_KIND/);
  await rejected(() => a.$executeRaw`UPDATE "ProductOptionValue" SET "optionId"=${size.sg} WHERE id=${color.color}`, /B18_IMMUTABLE_VALUE_OWNER/);
  pass("variant ID/owner/key, selection tuple and typed dimension/value ownership are immutable");
  await rejected(() => a.$executeRaw`INSERT INTO "ProductVariant" (id,"productId","combinationKey",price,"updatedAt") SELECT 'duplicate',"productId","combinationKey",price,now() FROM "ProductVariant" WHERE id=${color.v}`, /23505|unique constraint/);
  await rejected(() => a.$executeRaw`INSERT INTO "ProductOption" (id,"productId",name,kind) VALUES ('duplicate_group',${color.p},'Other','COLOR')`, /23505|unique constraint/);
  await rejected(() => a.$executeRaw`INSERT INTO "ProductVariantSelection" ("variantId","productId","optionId","valueId") VALUES (${color.v},${color.p},${size.sg},${size.size})`, /23503|foreign key|B18_INVALID_COMBINATION/);
  await rejected(() => a.$executeRaw`INSERT INTO "ProductVariantSelection" ("variantId","productId","optionId","valueId") VALUES (${color.v},${size.p},${size.sg},${size.size})`, /23503|foreign key|B18_INVALID_COMBINATION/);
  pass("duplicate tuples/dimensions and cross-product composite FK attacks rejected");
  await rejected(() => save(async (tx) => {
    const p=await tx.product.create({data:{name:"Bad conversion",slug:"bad-conversion",description:"Fixture",price:1,categoryId:"qa_category"}});
    const g=await tx.productOption.create({data:{productId:p.id,name:"Розмір"}});
    await tx.productOptionValue.create({data:{id:"bad;SIZE=injected",optionId:g.id,value:"Bad",price:199}});
    await tx.$executeRaw`UPDATE "Product" SET "optionMode"='SIZE' WHERE id=${p.id}`;
    await tx.$executeRaw`UPDATE "ProductOption" SET kind='SIZE' WHERE id=${g.id}`;
  }), /B18_INVALID_TYPED_VALUE/);
  await rejected(() => a.$executeRaw`UPDATE "Product" SET "optionMode"='SIMPLE' WHERE id=${color.p}`, /B18_MODE_OR_RETIREMENT/);
  pass("typing pre-existing legacy values validates IDs too; incompatible mode change without retiring combinations rejects atomically");
  await rejected(() => a.$executeRaw`UPDATE "ProductOptionValue" SET "retiredAt"=now() WHERE id=${color.color}`, /B18_MODE_OR_RETIREMENT/);
  await save(async (tx) => {
    await tx.$executeRaw`UPDATE "ProductVariant" SET "retiredAt"=now() WHERE id=${color.v}`;
    await tx.$executeRaw`UPDATE "ProductOptionValue" SET "retiredAt"=now() WHERE id=${color.color}`;
  }, txOptions);
  await rejected(() => a.$executeRaw`DELETE FROM "ProductVariant" WHERE id=${color.v}`, /B18_RETIRE/);
  await save(async (tx) => {
    await tx.$executeRaw`UPDATE "ProductOptionValue" SET "retiredAt"=NULL WHERE id=${color.color}`;
    await tx.$executeRaw`UPDATE "ProductVariant" SET "retiredAt"=NULL WHERE id=${color.v}`;
  }, txOptions);
  pass("retirement is atomic; active references prevent value retirement; restore retains the original variant ID");
  for (const price of ["0", "-1", "NaN", "100000000.00"])
    await rejected(() => a.$executeRaw`UPDATE "ProductVariant" SET price=${price}::numeric WHERE id=${color.v}`, /23514|22003|check constraint|numeric field overflow/);
  assert.equal((await a.$queryRaw<{ rounded: string }[]>`SELECT (1.005::numeric(10,2))::text AS rounded`)[0].rounded, "1.01");
  pass("price bounds/NaN rejected; actual PG rounding confirms pre-coercion cent validation is REQUIRED in the bridge");
  const oldOrder = await save((tx) => order(tx));
  await a.orderItem.create({ data: { orderId: oldOrder.id, productId: "legacy_size", productName: "Original", optionsJson: '{"version":1,"size":{"id":"legacy_small","labelUa":"Маленький","labelEn":"Small"}}', price: 199, quantity: 1 } });
  await rejected(() => a.orderItem.create({ data: { orderId: oldOrder.id, productId: combined.p, productName: "Old binary", price: 1, quantity: 1 } }), /B18_ORDER_VARIANT_UNAVAILABLE_OR_PRICE/);
  await rejected(() => save((tx) => item(tx, combined, "1.00"), txOptions), /B18_ORDER_VARIANT_UNAVAILABLE_OR_PRICE/);
  const saved = await save((tx) => item(tx, combined), txOptions);
  await rejected(() => save((tx) => item(tx,combined,"199.00",snapshot(combined).replace("Червоний","Forged label"))), /B18_SNAPSHOT_SELECTION_MISMATCH/);
  await rejected(() => a.$executeRaw`UPDATE "OrderItem" SET price=1 WHERE id=${saved}`, /B18_IMMUTABLE_ORDER_SNAPSHOT/);
  await rejected(() => a.$executeRaw`UPDATE "OrderItem" SET "optionsJson"='{}' WHERE id=${saved}`, /B18_IMMUTABLE_ORDER_SNAPSHOT/);
  await a.$executeRaw`UPDATE "ProductOptionValue" SET value='Нова назва' WHERE id=${combined.color}`;
  assert.equal((await a.orderItem.findUniqueOrThrow({ where: { id: saved } })).optionsJson, snapshot(combined));
  await rejected(() => a.product.delete({ where: { id: combined.p } }), /Foreign key|foreign key/);
  pass("legacy snapshots accepted unchanged; native base-price/old-writer bypass blocked; v2 price/snapshot immutable and historical Product FK preserved");
  const oldSnapshot=(await a.orderItem.findFirstOrThrow({where:{orderId:oldOrder.id}})).optionsJson;
  await save(async(tx)=>{
    await tx.$executeRaw`SELECT id FROM "Product" WHERE id='legacy_size' FOR UPDATE`;
    await tx.$executeRaw`UPDATE "Product" SET "optionMode"='SIZE' WHERE id='legacy_size'`;
    await tx.$executeRaw`UPDATE "ProductOption" SET kind='SIZE' WHERE id='legacy_group'`;
    await tx.$executeRaw`INSERT INTO "ProductVariant" (id,"productId","combinationKey",price,"isAvailable","updatedAt") VALUES ('legacy_native_variant','legacy_size','SIZE=legacy_small',199,true,now())`;
    await tx.$executeRaw`INSERT INTO "ProductVariantSelection" ("variantId","productId","optionId","valueId") VALUES ('legacy_native_variant','legacy_size','legacy_group','legacy_small')`;
  });
  const mapped=await a.$queryRaw<{id:string}[]>`SELECT id FROM "ProductVariant" WHERE "productId"='legacy_size' AND "combinationKey"='SIZE=legacy_small'`;
  assert.equal(mapped[0].id,"legacy_native_variant");
  assert.equal((await a.orderItem.findFirstOrThrow({where:{orderId:oldOrder.id}})).optionsJson,oldSnapshot);
  const converted=await a.product.findUniqueOrThrow({where:{id:"legacy_size"},include:{options:{include:{values:true}}}});
  assert.equal(getSizeVariants(converted.options)[0].id,"legacy_small"); assert.equal(getSizeVariants(converted.options)[0].price,199);
  assert.equal(converted.options[0].values.length,2);
  assert.equal((await a.orderItem.findUniqueOrThrow({where:{id:"before_v1"}})).optionsJson,beforeV1.optionsJson);
  assert.equal((await a.orderItem.findUniqueOrThrow({where:{id:"before_flat"}})).optionsJson,beforeFlat.optionsJson);
  pass("explicit synthetic size conversion keeps original group/value IDs, full price, unpriced legacy rows and old v1 order snapshot; no automatic modifier conversion");
  for (const field of ["isActive", "isOrderable"] as const) {
    await a.product.update({ where: { id: color.p }, data: { [field]: false } });
    await rejected(() => save((tx) => item(tx, color), txOptions), /B18_ORDER_VARIANT_UNAVAILABLE_OR_PRICE/);
    await a.product.update({ where: { id: color.p }, data: { [field]: true } });
  }
  await a.$executeRaw`UPDATE "ProductVariant" SET "isAvailable"=false WHERE id=${color.v}`;
  await rejected(() => save((tx) => item(tx, color), txOptions), /B18_ORDER_VARIANT_UNAVAILABLE_OR_PRICE/);
  await a.$executeRaw`UPDATE "ProductVariant" SET "isAvailable"=true,"retiredAt"=now() WHERE id=${color.v}`;
  await rejected(() => save((tx) => item(tx, color), txOptions), /B18_ORDER_VARIANT_UNAVAILABLE_OR_PRICE/);
  await a.$executeRaw`UPDATE "ProductVariant" SET "retiredAt"=NULL WHERE id=${color.v}`;
  pass("product publication/orderability and unavailable/retired combination all reject new native orders");

  const before = (await a.$queryRaw<{ variantRevision: number }[]>`SELECT "variantRevision" FROM "Product" WHERE id=${color.p}`)[0].variantRevision;
  await b.$executeRaw`UPDATE "ProductVariant" SET price=199 WHERE id=${color.v}`;
  const after = (await a.$queryRaw<{ variantRevision: number }[]>`SELECT "variantRevision" FROM "Product" WHERE id=${color.p}`)[0].variantRevision;
  assert.ok(after > before);
  await rejected(() => save(async (tx) => {
    const current = await tx.$queryRaw<{ variantRevision: number }[]>`SELECT "variantRevision" FROM "Product" WHERE id=${color.p} FOR UPDATE`;
    if (current[0].variantRevision !== before) throw new Error("STALE_EDITOR");
  }, txOptions), /STALE_EDITOR/);
  await rejected(() => a.$executeRaw`UPDATE "Product" SET "variantRevision"=0 WHERE id=${color.p}`, /B18_REVISION_DB_MANAGED/);
  pass("child-only mutation advances DB revision; stale-editor compare fails under lock; arbitrary revision reset rejected");

  const held = latch(), release = latch(), bidder = latch(); let pidA=0,pidB=0; let lockedOrder="";
  const reading = save(async (tx) => {
    pidA = (await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`)[0].pid;
    await tx.$queryRaw`SELECT id FROM "Product" WHERE id=${size.p} FOR SHARE`;
    held.open(); await release.promise;
    lockedOrder = await item(tx, size);
  }, txOptions);
  await held.promise;
  const writing = b.$transaction(async (tx) => {
    pidB = (await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`)[0].pid;
    bidder.open();
    await tx.$executeRaw`UPDATE "ProductVariant" SET price=299 WHERE id=${size.v}`;
  }, txOptions);
  await bidder.promise;
  try { assert.notEqual(pidA,pidB); await waitForLock(pidB); }
  finally { release.open(); }
  await Promise.all([reading,writing]);
  assert.equal(Number((await a.orderItem.findUniqueOrThrow({ where: { id: lockedOrder } })).price),199);
  assert.equal((await a.$queryRaw<{ price: string }[]>`SELECT price::text FROM "ProductVariant" WHERE id=${size.v}`)[0].price,"299.00");
  pass(`two real PG sessions ${pidA}/${pidB}: checkout SHARE lock blocks child-only Admin price update; committed order retains old price`);

  const holding = latch(), unlock = latch(), trying = latch(); let waitingPid=0; let observedAvailable=true;
  const writer = save(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Product" WHERE id=${color.p} FOR UPDATE`;
    await tx.$executeRaw`UPDATE "ProductVariant" SET "isAvailable"=false WHERE id=${color.v}`;
    holding.open(); await unlock.promise;
  }, txOptions);
  await holding.promise;
  const checkout = b.$transaction(async (tx) => {
    waitingPid=(await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`)[0].pid; trying.open();
    await tx.$queryRaw`SELECT id FROM "Product" WHERE id=${color.p} FOR SHARE`;
    observedAvailable=(await tx.$queryRaw<{ isAvailable: boolean }[]>`SELECT "isAvailable" FROM "ProductVariant" WHERE id=${color.v}`)[0].isAvailable;
  }, txOptions);
  await trying.promise;
  try { await waitForLock(waitingPid); } finally { unlock.open(); }
  await Promise.all([writer,checkout]); assert.equal(observedAvailable,false);
  pass("reverse two-session race: checkout demonstrably waits for Admin and reloads committed unavailability, not stale props");

  const disposable = await save((tx) => product(tx,"COLOR_SIZE"),txOptions);
  await a.product.delete({where:{id:disposable.p}});
  assert.equal((await a.$queryRaw<{ n: number }[]>`SELECT count(*)::int n FROM "ProductVariant" WHERE "productId"=${disposable.p}`)[0].n,0);
  await a.product.update({where:{id:combined.p},data:{isActive:false,isOrderable:false}});
  assert.equal((await a.orderItem.findUniqueOrThrow({where:{id:saved}})).optionsJson,snapshot(combined));
  await rejected(()=>a.$executeRaw`UPDATE "Product" SET "optionMode"='LEGACY' WHERE id=${simple.p}`,/B18_NO_LEGACY_DOWNGRADE/);
  pass("whole-product cascade without orders succeeds; historical product archival retains order snapshot; unsafe native->LEGACY downgrade blocked");
  const constraints = await a.$queryRaw<{ condeferrable: boolean; condeferred: boolean }[]>`SELECT condeferrable,condeferred FROM pg_constraint WHERE conname IN ('ProductVariantSelection_productId_optionId_fkey','ProductVariantSelection_optionId_valueId_fkey')`;
  assert.equal(constraints.length,2); assert.ok(constraints.every((c)=>c.condeferrable&&c.condeferred));
  pass("actual catalog confirms deferred ownership FKs; SQL guards, rollback, uniqueness and concurrency were executed, not mocked");
  const start=Date.now();
  let bulkProduct="";
  await save(async(tx)=>{
    const bulk=await product(tx,"COLOR_SIZE",false); bulkProduct=bulk.p;
    // Remove no rows: use the initial red/small plus 19/9 new values (20 x 10).
    await tx.$executeRaw`INSERT INTO "ProductOptionValue" (id,"optionId",value)
      SELECT ${bulk.p}||'_c_'||n,${bulk.cg},'Color '||n FROM generate_series(1,19) n`;
    await tx.$executeRaw`INSERT INTO "ProductOptionValue" (id,"optionId",value)
      SELECT ${bulk.p}||'_s_'||n,${bulk.sg},'Size '||n FROM generate_series(1,9) n`;
    await tx.$executeRaw`INSERT INTO "ProductVariant" (id,"productId","combinationKey",price,"isAvailable","updatedAt")
      SELECT 'bulk_'||c.id||'_'||s.id,${bulk.p},'COLOR='||c.id||';SIZE='||s.id,199,true,now()
      FROM "ProductOptionValue" c CROSS JOIN "ProductOptionValue" s
      WHERE c."optionId"=${bulk.cg} AND s."optionId"=${bulk.sg}`;
    await tx.$executeRaw`INSERT INTO "ProductVariantSelection" ("variantId","productId","optionId","valueId")
      SELECT v.id,${bulk.p},c."optionId",c.id FROM "ProductVariant" v
      JOIN "ProductOptionValue" c ON c."optionId"=${bulk.cg} AND v."combinationKey" LIKE 'COLOR='||c.id||';SIZE=%'
      WHERE v."productId"=${bulk.p}
      UNION ALL SELECT v.id,${bulk.p},s."optionId",s.id FROM "ProductVariant" v
      JOIN "ProductOptionValue" s ON s."optionId"=${bulk.sg} AND right(v."combinationKey",length('SIZE='||s.id))='SIZE='||s.id
      WHERE v."productId"=${bulk.p}`;
  },{timeout:60000,maxWait:10000});
  const elapsed=Date.now()-start;
  assert.equal((await a.$queryRaw<{n:number}[]>`SELECT count(*)::int n FROM "ProductVariant" WHERE "productId"=${bulkProduct}`)[0].n,200);
  pass(`20-color x 10-size explicit 200-combination local fixture commits with scoped deferred checks in ${elapsed} ms (local measurement, not Production SLA)`);
  console.log(`PASS Batch 1.8 PostgreSQL review: ${passed} groups, isolated synthetic data only.`);
  await verifyApplication(a);
}
verify().finally(async()=>{await Promise.all([a.$disconnect(),b.$disconnect(),observer.$disconnect()]);}).catch((error)=>{console.error(error);process.exitCode=1;});
