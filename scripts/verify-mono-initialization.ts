// Legacy initialization compatibility. New checkout/acceptance is covered by
// verify-checkout-acceptance.ts; provider parsing by verify-mono-response-diagnostics.ts.
// All dependencies are isolated; no PrismaClient, .env, HTTP or real notifications.
import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";
import { PaymentMemory, type Row } from "./payment-memory";
import { sourceModule } from "./source-module";
import * as acceptance from "../src/lib/payments/acceptance";
import * as flags from "../src/lib/payments/initialization-state";
import * as money from "../src/lib/payments/money";
import * as stages from "../src/lib/order-status";
import * as numbers from "../src/lib/order-number";
const db = new PaymentMemory();
const forbidden = () => { throw new Error("UNEXPECTED_EXTERNAL_EFFECT"); };
const lifecycle = sourceModule<typeof import("../src/lib/payments/transitions")>("src/lib/payments/transitions.ts", {
  "@prisma/client": { Prisma }, "@/lib/prisma": { prisma: db }, "@/lib/payments/money": money,
  "@/lib/order-status": stages, "@/lib/notifications/orders": { emitOrderEvents: forbidden },
  "@/lib/payments/initialization-state": flags, "./acceptance": acceptance,
  "@/lib/order-number": numbers, "@/lib/notifications/outbox": { enqueueAcceptanceNotifications: forbidden },
});
let removes = 0; let queryPatch: Row = {};
const fixture = (): Row => ({ id: "legacy", number: "0001", checkoutAcceptance: "LEGACY", paymentReference: null,
  status: "PENDING", paymentProvider: "mono", paymentMode: "live", paymentStatus: "PENDING", paidAt: null,
  paymentInvoiceId: null, paymentProviderStatus: null, paymentModifiedAt: null, paymentErrorCode: flags.INVOICE_INITIALIZING,
  paymentExpiresAt: new Date(0), paymentNextCheckAt: new Date(0), total: "199.00", novaPoshtaTtn: null,
  novaPoshtaDeliveredAt: null, novaPoshtaCreatedAt: null, novaPoshtaSyncedAt: null, items: [],
});
const initialization = sourceModule<typeof import("../src/lib/payments/initialization")>("src/lib/payments/initialization.ts", {
  "@/lib/prisma": { prisma: db }, "@/lib/payments/transitions": lifecycle, "@/lib/payments/initialization-state": flags,
  "@/lib/payments/money": money, "./acceptance": acceptance,
  "@/lib/payments/mono": { queryMonoInvoice: async () => ({ invoiceId: "invoice", reference: "0001", amount: 19900, ccy: 980, status: "created", ...queryPatch }), invalidateUnpaidMonoInvoice: async () => { removes++; }, logMonoInitializationError: () => {} },
});
function reset(patch: Row = {}) { db.orders = [{ ...fixture(), ...patch }]; queryPatch = {}; removes = 0; }
async function verify() {
  reset(); assert.equal(await initialization.removeRejectedProvisionalOrder(db.orders[0] as never), true); assert.equal(db.orders.length, 0);
  for (const patch of [{ paidAt: new Date() }, { paymentInvoiceId: "different" }, { status: "PROCESSING" }, { novaPoshtaTtn: "qa" }, { paymentModifiedAt: new Date() }, { paymentNextCheckAt: new Date() }]) {
    reset(); const before = structuredClone(db.orders[0]); Object.assign(db.orders[0], patch);
    assert.equal(await initialization.removeRejectedProvisionalOrder(before as never), false); assert.equal(db.orders.length, 1);
  }
  reset(); await initialization.recoverUnacceptedInvoice("0001", "invoice"); assert.equal(removes, 1); assert.equal(db.orders[0].paymentErrorCode, flags.INVOICE_INVALIDATED);
  for (const patch of [{ status: "success" }, { status: "processing" }, { status: "hold" }, { reference: "wrong" }, { amount: 19800 }, { ccy: 840 }, { invoiceId: "other" }, { finalAmount: 1 }, { cancelList: [{}] }]) {
    reset(); queryPatch = patch; await initialization.recoverUnacceptedInvoice("0001", "invoice"); assert.equal(removes, 0);
  }
  reset(); await initialization.markInitializationUncertain("0001"); assert.equal(db.orders[0].paymentStatus, "UNKNOWN"); assert.equal(db.orders[0].paymentNextCheckAt, null);
  reset({ checkoutAcceptance: "PROVISIONAL", number: null, paymentReference: "pay_" + "a".repeat(32) });
  assert.equal(await initialization.removeRejectedProvisionalOrder(db.orders[0] as never), false);
  await initialization.recoverUnacceptedInvoice(String(db.orders[0].paymentReference), "invoice"); assert.equal(removes, 0); assert.equal(db.orders.length, 1);
  console.log("PASS initialization compatibility: legacy conditional cleanup/races and guarded unpaid invalidation; new attempt retention. New PAID-only lifecycle is tested in verify-checkout-acceptance.ts. No external effects.");
}
verify().catch((error) => { console.error(error); process.exitCode = 1; });
