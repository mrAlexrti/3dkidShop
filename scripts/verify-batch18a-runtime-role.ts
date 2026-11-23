// Actual PostgreSQL image writes using a separate non-owner login. Local only.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient, type Prisma } from "@prisma/client";
import { flushVariantConstraints, lockProductConfiguration } from "../src/lib/variant-transaction";
import { url } from "./fixtures/batch18a-data";

async function main() {
  const connection = process.env.BATCH18A_QA_DATABASE_URL!;
  const deniedConnection = process.env.BATCH18A_QA_MISSING_REVISION_URL!;
  const address = new URL(connection), deniedAddress = new URL(deniedConnection);
  assert.equal(address.hostname, "127.0.0.1"); assert.match(address.pathname, /^\/batch18_review_[a-f0-9]+$/);
  assert.equal(address.username, "app_3dkid_fixture"); assert.equal(deniedAddress.username, "batch18a_missing_revision");
  for (const key of ["hostname", "port", "pathname"] as const) assert.equal(address[key], deniedAddress[key]);
  assert.equal(readFileSync(resolve(process.env.BATCH18A_QA_DIRECTORY!, "qa-marker"), "utf8"), process.env.BATCH18A_QA_MARKER);
  const db = new PrismaClient({ datasources: { db: { url: connection } } });
  const denied = new PrismaClient({ datasources: { db: { url: deniedConnection } } });
  globalThis.fetch = async () => { throw new Error("EXTERNAL_EFFECT_FORBIDDEN"); };
  try {
    const [role] = await db.$queryRaw<{
      name: string; elevated: boolean; owner: boolean; ddl: boolean; trigger: boolean; orderMutation: boolean; epoch: boolean;
    }[]>`SELECT current_user::text AS name,
      (r.rolsuper OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication OR r.rolbypassrls
       OR pg_has_role(current_user,'batch18a_qa','MEMBER')) AS elevated,
      pg_has_role(current_user,c.relowner,'USAGE') AS owner,
      has_schema_privilege(current_user,'public','CREATE') AS ddl,
      has_table_privilege(current_user,'public."ProductImage"','TRIGGER') AS trigger,
      (has_table_privilege(current_user,'public."OrderItem"','INSERT')
       OR has_table_privilege(current_user,'public."OrderItem"','UPDATE')
       OR has_table_privilege(current_user,'public."OrderItem"','DELETE')) AS "orderMutation",
      has_column_privilege(current_user,'public."Product"','variantRevision','UPDATE') AS epoch
      FROM pg_roles r CROSS JOIN pg_class c
      WHERE r.rolname=current_user AND c.oid='public."ProductImage"'::regclass`;
    assert.deepEqual(role, { name: "app_3dkid_fixture", elevated: false, owner: false, ddl: false, trigger: false, orderMutation: false, epoch: true });
    const [negative] = await denied.$queryRaw<{ name: string; epoch: boolean; lock: boolean }[]>`
      SELECT current_user::text AS name,
        has_column_privilege(current_user,'public."Product"','variantRevision','UPDATE') AS epoch,
        has_column_privilege(current_user,'public."Product"','name','UPDATE') AS lock`;
    assert.deepEqual(negative, { name: "batch18a_missing_revision", epoch: false, lock: true });
    console.log("PASS restricted login: no ownership, owner membership, DDL/TRIGGER, superuser, role creation, replication, RLS bypass or order mutation rights.");
    const product = await db.product.findUniqueOrThrow({ where: { slug: "keep-link" }, include: { options: { include: { values: true } }, images: true } });
    const color = product.options.find((g) => g.kind === "COLOR")!.values[0];
    const size = product.options.find((g) => g.kind === "SIZE")!.values[0];
    const revision = async () => (await db.product.findUniqueOrThrow({ where: { id: product.id }, select: { variantRevision: true } })).variantRevision;
    const history = await db.orderItem.findMany();
    function write<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
      return db.$transaction(async (tx) => {
        await lockProductConfiguration(tx, product.id);
        const result = await operation(tx);
        await flushVariantConstraints(tx);
        return result;
      });
    }
    const beforeInsert = await revision();
    const image = await write((tx) => tx.productImage.create({ data: { productId: product.id, url: url("role.webp"), alt: "Role original", order: 9 } }));
    assert.ok(await revision() > beforeInsert);
    const beforeUpdate = await revision();
    const scoped = await write((tx) => tx.productImage.update({ where: { id: image.id }, data: { colorValueId: color.id, alt: "Role scoped" } }));
    assert.equal(scoped.id, image.id); assert.equal(scoped.url, image.url); assert.equal(scoped.colorValueId, color.id);
    assert.ok(await revision() > beforeUpdate);
    const beforeDenied = await db.product.findUniqueOrThrow({ where: { id: product.id }, include: { images: { orderBy: { id: "asc" } } } });
    for (const operation of [
      () => denied.productImage.create({ data: { productId: product.id, url: url("denied.webp") } }),
      () => denied.productImage.update({ where: { id: image.id }, data: { alt: "Must roll back" } }),
      () => denied.productImage.delete({ where: { id: image.id } }),
    ]) await assert.rejects(operation(), /permission denied for table Product/);
    assert.deepEqual(await db.product.findUniqueOrThrow({ where: { id: product.id }, include: { images: { orderBy: { id: "asc" } } } }), beforeDenied);
    console.log("PASS missing UPDATE(Product.variantRevision) rejects INSERT/UPDATE/DELETE atomically despite image DML and Product row-lock permission; no extra privileges needed by the complete profile.");
    await assert.rejects(write((tx) => tx.productImage.update({ where: { id: image.id }, data: { colorValueId: size.id } })), /B18A_IMAGE_COLOR_OWNER_OR_KIND/);
    await assert.rejects(db.productImage.create({ data: { productId: "legacy", url: url("foreign-role.webp"), colorValueId: color.id } }), /B18A_IMAGE_COLOR_OWNER_OR_KIND/);
    await assert.rejects(write((tx) => tx.product.update({ where: { id: product.id }, data: { variantRevision: 0 } })), /B18_REVISION_DB_MANAGED/);
    assert.equal(await revision(), beforeDenied.variantRevision);
    const beforeDelete = await revision();
    await write((tx) => tx.productImage.delete({ where: { id: image.id } }));
    assert.ok(await revision() > beforeDelete); assert.equal(await db.productImage.count({ where: { id: image.id } }), 0);
    assert.deepEqual(await db.orderItem.findMany(), history);
    console.log("PASS restricted image INSERT/UPDATE/DELETE advance the DB epoch; SIZE/foreign associations and explicit epoch tampering fail; existing image identities/URLs/color IDs and historical order fixture preserved.");
  } finally { await Promise.all([db.$disconnect(), denied.$disconnect()]); }
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
