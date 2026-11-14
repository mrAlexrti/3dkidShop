// Invoked exclusively by rehearse-checkout-postgres.mjs on its newly created cluster.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, basename } from "node:path";
import * as crypto from "node:crypto";
import { PrismaClient, Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { sourceModule } from "./source-module";
import * as numbers from "../src/lib/order-number";
import * as acceptance from "../src/lib/payments/acceptance";
import * as flags from "../src/lib/payments/initialization-state";
import * as money from "../src/lib/payments/money";
import * as orderStatus from "../src/lib/order-status";
import * as adapter from "../src/lib/payments/mono-state";

const directory = process.env.BATCH174A_QA_CLUSTER_DIR ?? "";
assert.equal(resolve(directory, ".."), resolve(tmpdir()));
assert.ok(basename(directory).startsWith("batch174a-private-pg-"));
assert.ok(process.env.BATCH174A_QA_MARKER);
assert.equal(readFileSync(resolve(directory, "qa-marker"), "utf8"), process.env.BATCH174A_QA_MARKER);
const url = new URL(process.env.BATCH174A_QA_DATABASE_URL ?? "");
assert.equal(url.protocol, "postgresql:"); assert.equal(url.hostname, "127.0.0.1");
assert.equal(url.pathname, "/batch174a_qa"); assert.equal(url.username, "batch174a_qa");
assert.ok(Number(url.port) > 1024 && url.port !== "5432");
const db = new PrismaClient({ datasources: { db: { url: url.href } } });
const forbidden = async () => { throw new Error("EXTERNAL_EFFECT_FORBIDDEN"); };
const savedFetch = globalThis.fetch; globalThis.fetch = forbidden;
const outbox = sourceModule<typeof import("../src/lib/notifications/outbox")>("src/lib/notifications/outbox.ts", {
  "node:crypto": crypto, "@/lib/prisma": { prisma: db },
  "./templates": { renderNotification: () => ({ telegram: "Synthetic QA", subject: "Synthetic QA", html: "Synthetic QA" }) },
  "./settings": { getNotificationSettings: forbidden }, "./telegram": { sendTelegramMessage: forbidden }, "./email": { sendEmail: forbidden },
});
const lifecycle = sourceModule<typeof import("../src/lib/payments/transitions")>("src/lib/payments/transitions.ts", {
  "@prisma/client": { Prisma }, "@/lib/prisma": { prisma: db }, "@/lib/payments/money": money,
  "@/lib/order-status": orderStatus, "@/lib/notifications/orders": { emitOrderEvents: forbidden },
  "@/lib/payments/initialization-state": flags, "./acceptance": acceptance, "@/lib/order-number": numbers,
  "@/lib/notifications/outbox": outbox,
});
const base = { customerName: "Synthetic QA", customerEmail: "qa@example.invalid", customerPhone: "000", shippingAddress: "QA", city: "QA", postalCode: "000", subtotal: "199.00", total: "199.00" };
const createAttempt = () => {
  const reference = `pay_${crypto.randomUUID().replaceAll("-", "")}`;
  return db.order.create({ data: { ...base, number: null, checkoutAcceptance: "PROVISIONAL", paymentReference: reference, checkoutKeyHash: crypto.randomBytes(32).toString("hex"), paymentMethod: "card_online", paymentProvider: "mono", paymentMode: "live", paymentStatus: "PENDING", paymentInvoiceId: `qa-${reference}`, paymentNextCheckAt: new Date(0) } });
};
const createCod = () => db.$transaction(async (tx) => tx.order.create({ data: { ...base, paymentMethod: "cod", number: await numbers.allocateOrderNumber(tx), checkoutAcceptance: "ACCEPTED", acceptedAt: new Date() } }), { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 10000, timeout: 10000 });

async function verify() {
  const cluster = await db.$queryRaw<{ data_directory: string }[]>`SHOW data_directory`;
  assert.equal(resolve(cluster[0].data_directory), resolve(directory, "data"));
  assert.equal((await db.order.findUniqueOrThrow({ where: { id: "qa-history-numeric" } })).checkoutAcceptance, "LEGACY");
  assert.equal((await db.orderItem.findUniqueOrThrow({ where: { id: "qa-history-item" } })).orderId, "qa-history-numeric");
  assert.ok(await db.order.findFirst({ where: { AND: [acceptance.operationalOrderWhere, { number: "3DK-QA-OLD" }] } }));
  console.log("PASS real PG: historical numeric/3DK paid/fulfilled orders and OrderItem retained through expansion.");

  const attempts = await Promise.all(Array.from({ length: 8 }, createAttempt));
  const evidence = (order: typeof attempts[number]) => ({ provider: "mono", reference: order.paymentReference!, invoiceId: order.paymentInvoiceId!, status: "PAID" as const, providerStatus: "success", modifiedAt: new Date(), amount: 19900, currency: 980, errorCode: null });
  await Promise.all([...attempts.map((order) => lifecycle.applyPaymentEvidence(evidence(order))), ...attempts.map(createCod)]);
  const numbered = await db.order.findMany({ where: { checkoutAcceptance: "ACCEPTED" }, orderBy: { number: "asc" } });
  assert.deepEqual(numbered.map((order) => order.number), Array.from({ length: 16 }, (_, index) => String(index + 8).padStart(4, "0")));
  assert.ok(numbered.every((order) => order.status === "PENDING"));
  console.log("PASS real PG: 16 concurrent COD/online transactions produced 0008–0023 exactly; abandoned attempts consume none; payment never PROCESSING.");

  for (let iteration = 0; iteration < 12; iteration++) {
    const order = await createAttempt(); const paid = evidence(order);
    const snapshot = { invoiceId: paid.invoiceId, reference: paid.reference, status: "success", amount: 19900, ccy: 980, modifiedDate: paid.modifiedAt.toISOString() };
    const reconciliation = sourceModule<typeof import("../src/lib/payments/reconciliation")>("src/lib/payments/reconciliation.ts", {
      "@/lib/prisma": { prisma: db }, "@/lib/payments/mono": { queryMonoInvoice: async (id: string) => { assert.equal(id, snapshot.invoiceId); return snapshot; } },
      "@/lib/payments/mono-state": adapter, "@/lib/payments/transitions": lifecycle, "@/lib/payments/initialization-state": flags,
      "@/lib/payments/initialization": { markInitializationUncertain: forbidden }, "./acceptance": acceptance,
    });
    const webhook = sourceModule<typeof import("../src/app/api/payments/mono/webhook/route")>("src/app/api/payments/mono/webhook/route.ts", {
      "next/server": { NextResponse }, "@/lib/payments/mono": { parseMonoSnapshot: () => snapshot, verifyMonoSignature: async () => true, queryMonoInvoice: forbidden },
      "@/lib/payments/mono-state": adapter, "@/lib/payments/transitions": lifecycle,
    });
    const post = () => webhook.POST(new Request("https://shop.example.invalid/webhook", { method: "POST", body: JSON.stringify(snapshot) }));
    const responses = await Promise.all([post(), reconciliation.reconcilePendingPayments(), post()]);
    assert.equal((responses[0] as Response).status, 200); assert.equal((responses[2] as Response).status, 200);
    const accepted = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    assert.equal(accepted.checkoutAcceptance, "ACCEPTED"); assert.ok(accepted.paidAt); assert.ok(accepted.number);
    assert.equal(await db.orderNotification.count({ where: { orderId: order.id } }), 2);
    await assert.rejects(db.orderNotification.create({ data: { orderId: order.id, event: "ORDER_CREATED", channel: "telegram", payload: {} } }), { code: "P2002" });
  }
  console.log("PASS real PG: 12 concurrent verified-webhook/reconciliation/duplicate races; one acceptance and exactly two distinct channel outbox rows each.");

  const rollbackOrder = await createAttempt();
  const maximum = await db.order.findFirstOrThrow({ where: { checkoutAcceptance: "ACCEPTED" }, orderBy: { number: "desc" } });
  await db.$executeRawUnsafe(`CREATE FUNCTION qa_fail_outbox() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.channel = 'email' THEN RAISE EXCEPTION 'QA_ROLLBACK'; END IF; RETURN NEW; END $$`);
  await db.$executeRawUnsafe(`CREATE TRIGGER qa_fail_outbox BEFORE INSERT ON "OrderNotification" FOR EACH ROW EXECUTE FUNCTION qa_fail_outbox()`);
  await assert.rejects(lifecycle.applyPaymentEvidence(evidence(rollbackOrder)));
  const rolledBack = await db.order.findUniqueOrThrow({ where: { id: rollbackOrder.id } });
  assert.equal(rolledBack.number, null); assert.equal(rolledBack.paidAt, null); assert.equal(rolledBack.checkoutAcceptance, "PROVISIONAL");
  assert.equal(await db.orderNotification.count({ where: { orderId: rollbackOrder.id } }), 0);
  await db.$executeRawUnsafe(`DROP TRIGGER qa_fail_outbox ON "OrderNotification"`);
  await db.$executeRawUnsafe(`DROP FUNCTION qa_fail_outbox()`);
  assert.equal((await createCod()).number, String(BigInt(maximum.number!) + BigInt(1)).padStart(4, "0"));
  await lifecycle.applyPaymentEvidence(evidence(rollbackOrder)); // Authoritative retry recovers the failed transaction.
  assert.equal((await db.order.findUniqueOrThrow({ where: { id: rollbackOrder.id } })).checkoutAcceptance, "ACCEPTED");
  console.log("PASS real PG: forced second-channel insertion failure rolls back PAID, number and first outbox row together; number reusable; verified retry recovers.");

  const order = await createAttempt();
  for (const data of [{ checkoutAcceptance: "LEGACY" as const }, { number: "9999" }, { checkoutAcceptance: "ACCEPTED" as const, number: "9999" }, { checkoutLocale: "xx" }, { paymentReference: null }]) {
    const constraint = "checkoutLocale" in data ? "Order_checkout_locale_check" : "Order_checkout_acceptance_check";
    await assert.rejects(db.order.update({ where: { id: order.id }, data }), (error: Error) => error.message.includes(constraint));
  }
  for (const [data, constraint] of [[{ channel: "sms" }, "OrderNotification_channel_check"], [{ state: "BROKEN" }, "OrderNotification_state_check"], [{ attemptCount: -1 }, "OrderNotification_attemptCount_check"]] as const) {
    await assert.rejects(db.orderNotification.create({ data: Object.assign({ orderId: order.id, event: "ORDER_CREATED", channel: "telegram", payload: {} }, data) }), (error: Error) => error.message.includes(constraint));
  }
  await assert.rejects(db.order.create({ data: { ...base, paymentMethod: "cod", number: "0007" } }), { code: "P2002" });
  await assert.rejects(db.order.update({ where: { id: order.id }, data: { paymentReference: attempts[0].paymentReference } }), { code: "P2002" });
  await assert.rejects(db.order.update({ where: { id: order.id }, data: { checkoutKeyHash: attempts[0].checkoutKeyHash } }), { code: "P2002" });
  await assert.rejects(db.order.update({ where: { id: order.id }, data: { paymentInvoiceId: attempts[0].paymentInvoiceId } }), { code: "P2002" });
  const outboxOrder = attempts[0];
  await assert.rejects(db.order.delete({ where: { id: outboxOrder.id } }), (error: Error) => error.message.includes("OrderNotification_orderId_fkey"));
  console.log("PASS real PG: acceptance/locale/channel/state/nonnegative CHECKs, reference/retry/invoice/outbox unique constraints and audit FK deletion restriction.");
}
verify().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => { await db.$disconnect(); globalThis.fetch = savedFetch; });
