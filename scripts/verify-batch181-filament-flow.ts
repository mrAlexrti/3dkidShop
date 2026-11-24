import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import { sourceModule } from "./source-module";
import * as filament from "../src/lib/filaments";
import * as validation from "../src/lib/admin-form-validation";
import * as guards from "../src/lib/variant-transaction";
import { publicProductInclude } from "../src/lib/product-query";
import { productOffer, publicConfiguration } from "../src/lib/product-configuration";
import { reconcileCart } from "../src/lib/cart-reconciliation";
import type { CartItem } from "../src/types";

export async function verifyFilamentFlow({
  db, line, lookup, createOrder, data, listing,
}: {
  db: PrismaClient; line: CartItem;
  lookup: typeof import("../src/lib/actions/reconcile-cart").lookupCartProducts;
  createOrder: typeof import("../src/lib/actions/create-order").createOrder;
  data: Record<string, string>;
  listing: typeof import("../src/lib/catalog-products").catalogProducts;
}) {
  const address = new URL(process.env.BATCH18_QA_DATABASE_URL!);
  assert.equal(address.hostname, "127.0.0.1");
  assert.match(address.pathname, /^\/batch18_review_[a-f0-9]+$/);
  address.username = "app_3dkid";
  const role = new PrismaClient({ datasources: { db: { url: address.toString() } } });
  const variantId = line.selection!.variantId;
  const makeForm = (values: Record<string, string>) => {
    const form = new FormData();
    for (const [key, value] of Object.entries(values)) form.set(key, value);
    return form;
  };
  const requirements = (groups: string[][]) => makeForm({ requirements: JSON.stringify(groups) });
  const body = { manufacturer: "Bambu Lab", series: "Basic", material: "PLA", color: "Pink", hex: "#ffc0cb" };
  try {
    const actions = sourceModule<typeof import("../src/lib/actions/filaments")>("src/lib/actions/filaments.ts", {
      "node:crypto": { randomUUID }, "@prisma/client": { Prisma }, "@/lib/prisma": { prisma: role }, "@/lib/filaments": filament,
      "@/lib/admin-form-validation": validation, "@/lib/variant-transaction": guards,
      "next/cache": { revalidatePath: () => {} }, "@/lib/actions/require-admin": { requireAdmin: async () => {} },
    });
    assert.equal(await actions.saveFilament(null, makeForm(body)), undefined);
    assert.equal(await actions.saveFilament(null, makeForm({ ...body, manufacturer: "bambu lab", color: "pink" })).then((result) => result?.fieldErrors?.color), "optionDuplicate");
    assert.equal(await actions.saveFilament(null, makeForm({ ...body, manufacturer: "SUNLU", series: "PLA+", material: "PLA+", color: "pink" })), undefined);
    assert.equal(await actions.saveFilament(null, makeForm({ ...body, manufacturer: "bambu lab", color: "White", hex: "#ffffff" })), undefined);
    const pink = await role.filament.findFirstOrThrow({ where: { manufacturer: "Bambu Lab", color: "Pink" } });
    const sunlu = await role.filament.findFirstOrThrow({ where: { manufacturer: "SUNLU", color: "Pink" } });
    const white = await role.filament.findFirstOrThrow({ where: { manufacturer: "Bambu Lab", color: "White" } });
    assert.equal(pink.hex, "#FFC0CB");
    assert.equal(await actions.saveFilament(pink.id, makeForm({ ...body, hex: "#febdcc" })), undefined);
    assert.equal((await role.filament.findUniqueOrThrow({ where: { id: pink.id } })).hex, "#FEBDCC");
    assert.deepEqual((await role.filament.findMany({ where: filament.filamentFilter({
      manufacturer: "bambu lab", series: "basic", material: "pla", color: "pink", q: "bambu", availability: "available",
    }) })).map(({ id }) => id), [pink.id]);
    assert.equal(await actions.setFilamentAvailability(sunlu.id, false), undefined);
    assert.deepEqual((await role.filament.findMany({ where: filament.filamentFilter({ availability: "unavailable" }) })).map(({ id }) => id), [sunlu.id]);

    const snapshot = async () => (await role.variantFilamentGroup.findMany({ where: { variantId }, orderBy: { position: "asc" } })).map((g) => g.id).join(",");
    const save = async (groups: string[][]) => actions.saveFilamentRequirements(line.productId, variantId, await snapshot(), requirements(groups));
    const current = () => db.product.findUniqueOrThrow({ where: { id: line.productId }, include: publicProductInclude });
    const refresh = async () => reconcileCart([line], await lookup({ version: 2, lines: [{ productId: line.productId, selection: line.selection }] }), "en");
    const checkout = () => createOrder(data, [line], "en", randomUUID());
    const minimum = async () => productOffer(await current()).price;
    const [manual] = (await current()).variants.filter((row) => !row.isAvailable);
    const [other] = (await current()).variants.filter((row) => row.isAvailable && row.id !== variantId);
    assert.equal(await save([[]]).then((result) => result?.fieldErrors?.requirements), "invalid");
    assert.equal(await save([[pink.id, pink.id]]).then((result) => result?.fieldErrors?.requirements), "invalid");
    assert.equal(await save([["c".padEnd(25, "9")]]).then((result) => result?.fieldErrors?.requirements), "invalid");
    assert.equal(await save([[pink.id]]), undefined);
    await assert.rejects(role.filament.delete({ where: { id: pink.id } }), /permission denied/);
    await assert.rejects(db.filament.delete({ where: { id: pink.id } }), /foreign key constraint/i);
    await assert.rejects(role.$transaction(async (tx) => {
      await tx.variantFilamentGroup.create({ data: { variantId, position: 9 } });
      await guards.flushVariantConstraints(tx);
    }), /B181_EMPTY_FILAMENT_GROUP/);
    await assert.rejects(role.$transaction(async (tx) => {
      await tx.variantFilamentAlternative.deleteMany({ where: { groupId: await snapshot() } });
      await guards.flushVariantConstraints(tx);
    }), /B181_EMPTY_FILAMENT_GROUP/);
    assert.equal(await actions.setFilamentAvailability(pink.id, false), undefined);
    assert.equal(await minimum(), Number(other.price));
    assert.equal((await refresh()).issues[line.id], "variantUnavailable");
    assert.equal((await checkout()).success, false);
    assert.equal(await actions.setFilamentAvailability(pink.id, true), undefined);

    assert.equal(await save([[pink.id, sunlu.id], [white.id]]), undefined);
    const [bodyGroup] = (await snapshot()).split(",");
    let snapshotReady!: () => void, resumeDeletion!: () => void;
    const beginDeletion = new Promise<void>((done) => { snapshotReady = done; });
    const waitToDelete = new Promise<void>((done) => { resumeDeletion = done; });
    const competingDeletion = role.$transaction(async (tx) => {
      await tx.variantFilamentAlternative.findMany({ where: { groupId: bodyGroup } });
      snapshotReady();
      await waitToDelete;
      await tx.variantFilamentAlternative.deleteMany({ where: { groupId: bodyGroup, filamentId: pink.id } });
      await guards.flushVariantConstraints(tx);
    }, { isolationLevel: "RepeatableRead" });
    const rejected = assert.rejects(competingDeletion, /write conflict|serialize/);
    await beginDeletion;
    try {
      await role.$transaction(async (tx) => {
        await tx.variantFilamentAlternative.deleteMany({ where: { groupId: bodyGroup, filamentId: sunlu.id } });
        await guards.flushVariantConstraints(tx);
      });
    } finally { resumeDeletion(); }
    await rejected;
    assert.equal(await role.variantFilamentAlternative.count({ where: { groupId: bodyGroup } }), 1);
    assert.equal(await save([[pink.id, sunlu.id], [white.id]]), undefined);
    assert.equal(await actions.saveFilamentRequirements(line.productId, variantId, "", requirements([])).then((result) => result?.fieldErrors?.requirements), "stale");
    assert.equal(await actions.saveFilamentRequirements("legacy_simple", variantId, "", requirements([])).then((result) => result?.error), "notFound");
    assert.equal(await actions.saveFilamentRequirements(line.productId, manual.id, "", requirements([[white.id]])), undefined);
    assert.equal(await minimum(), line.price);
    assert.equal((await refresh()).issues[line.id], undefined);
    assert.equal((await checkout()).success, true);
    assert.equal(await actions.setFilamentAvailability(white.id, false), undefined);
    assert.equal(await minimum(), Number(other.price));
    assert.equal((await refresh()).issues[line.id], "variantUnavailable");
    assert.equal((await checkout()).success, false);
    assert.equal(await actions.setFilamentAvailability(white.id, true), undefined);
    assert.equal(await actions.setFilamentAvailability(pink.id, false), undefined);
    assert.equal(await minimum(), Number(other.price));
    assert.equal(await actions.setFilamentAvailability(sunlu.id, true), undefined);
    assert.equal(await minimum(), line.price);
    const config = publicConfiguration(await current());
    assert.equal(config.combinations.find((row) => row.id === manual.id)?.isAvailable, false);
    assert.equal(config.combinations.find((row) => row.id === other.id)?.isAvailable, true);
    assert.ok(!JSON.stringify(config).includes(sunlu.id));
    assert.equal((await current()).variants.find((row) => row.id === variantId)?.isAvailable, true);
    assert.equal(await actions.setFilamentAvailability(sunlu.id, false), undefined);
    // Give the simple comparison product a price between the two variant prices.
    await db.product.update({ where: { id: "legacy_simple" }, data: { price: (line.price + Number(other.price)) / 2 } });
    const catalogArgs = { where: { isActive: true }, categoryIds: [(await current()).categoryId], orderBy: { price: "asc" } as const, sort: "price_asc", page: 1, pageSize: 50 };
    const position = async () => (await listing(catalogArgs)).products.filter((p) => [line.productId, "legacy_simple"].includes(p.id)).map((p) => p.id);
    assert.deepEqual(await position(), ["legacy_simple", line.productId]);
    assert.equal(await actions.setFilamentAvailability(sunlu.id, true), undefined);
    assert.deepEqual(await position(), [line.productId, "legacy_simple"]);
    const simple = await db.product.findUniqueOrThrow({ where: { id: "legacy_simple" }, include: publicProductInclude });
    assert.equal(productOffer(simple).isOrderable, true);

    await db.product.update({ where: { id: line.productId }, data: { isOrderable: false } });
    assert.equal(productOffer(await current()).isOrderable, false);
    assert.equal((await refresh()).issues[line.id], "unavailable");
    assert.equal((await checkout()).success, false);
    await db.product.update({ where: { id: line.productId }, data: { isOrderable: true } });

    // Once the writer holds the row, checkout must wait and validate its new value.
    let locked!: () => void, release!: () => void;
    const writerLocked = new Promise<void>((done) => { locked = done; });
    const writerRelease = new Promise<void>((done) => { release = done; });
    const change = role.$transaction(async (tx) => {
      await tx.filament.update({ where: { id: sunlu.id }, data: { isAvailable: false } });
      locked();
      await writerRelease;
    });
    await writerLocked;
    const pending = checkout();
    try {
      assert.equal(await Promise.race([pending.then(() => "finished"), new Promise((done) => setTimeout(() => done("waiting"), 150))]), "waiting");
    } finally { release(); }
    await change;
    assert.equal((await pending).success, false);
    assert.equal(await actions.setFilamentAvailability(sunlu.id, true), undefined);

    assert.equal(await save([]), undefined);
    assert.equal(await minimum(), line.price);
    assert.equal((await refresh()).issues[line.id], undefined);
    await assert.rejects(role.$executeRaw`CREATE TABLE public.forbidden_filament_fixture(id text)`, /permission denied/);
    await role.$transaction(async (tx) => {
      await guards.lockProductConfiguration(tx, line.productId);
      await tx.$queryRaw`SELECT id FROM public."Filament" WHERE id=${sunlu.id} FOR SHARE`;
    });
    console.log("PASS Batch 1.8.1: restricted directory and group writes, stable IDs, validation, AND/OR, restoration, unrelated variants, sorting, stale cart and checkout, concurrent availability, safe retirement and permissions.");
  } finally { await role.$disconnect(); }
}
