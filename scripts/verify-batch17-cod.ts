import assert from "node:assert/strict";
import { NextResponse } from "next/server";
import { sourceModule } from "./source-module";
import * as methods from "../src/lib/payments/payment-method";
import * as money from "../src/lib/payments/money";
import * as statuses from "../src/lib/status";
import * as orderStatus from "../src/lib/order-status";
import type { Prisma } from "@prisma/client";

const savedEnv = { ...process.env }; const savedFetch = globalThis.fetch;
for (const key of ["NP_API_KEY", "NP_SENDER_REF", "NP_CONTACT_SENDER_REF", "NP_SENDER_CITY_REF", "NP_SENDER_ADDRESS_REF", "NP_SENDER_PHONE"]) process.env[key] = "isolated-cod-fixture";
let calls = 0; let backward: unknown; let admin = true;
globalThis.fetch = async (url, init) => {
  calls++; assert.equal(url, "https://api.novaposhta.ua/v2.0/json/");
  const request = JSON.parse(String(init?.body)); assert.equal(request.modelName, "InternetDocument"); assert.equal(request.calledMethod, "save");
  backward = request.methodProperties.BackwardDeliveryData;
  assert.equal(request.methodProperties.Cost, "199.29");
  return Response.json({ success: true, data: [{ IntDocNumber: "00000000000000", Ref: "isolated-ref" }] });
};
const provider = sourceModule<typeof import("../src/lib/novaposhta")>("src/lib/novaposhta.ts", { "@/lib/payments/payment-method": methods });
const fixture = () => ({ id: "qa", number: "3DK-QA", status: "PROCESSING", paymentProvider: null as string | null, paymentStatus: "PENDING", paidAt: null as Date | null,
  paymentMethod: "cash_on_delivery", customerName: "QA Customer", customerPhone: "+380000000000", total: "199.29", novaPoshtaCityRef: "qa-city", novaPoshtaBranchRef: "qa-branch",
  novaPoshtaTtn: null as string | null, novaPoshtaTtnRef: null, novaPoshtaDeliveredAt: null, novaPoshtaStatus: null, novaPoshtaStatusCode: null,
  novaPoshtaCodStatus: null, novaPoshtaCodStatusCode: null, novaPoshtaSyncedAt: null, items: [] });
let order = fixture();
const route = sourceModule<typeof import("../src/app/api/admin/orders/[id]/create-ttn/route")>("src/app/api/admin/orders/[id]/create-ttn/route.ts", {
  "next/server": { NextResponse }, "@/lib/auth": { auth: async () => ({ user: { role: admin ? "ADMIN" : "MANAGER" } }) },
  "@/lib/novaposhta": provider, "@/lib/notifications/orders": { emitOrderEvents: async () => false },
  "@/lib/prisma": { prisma: { order: {
    findUnique: async () => ({ ...order }), update: async () => {},
    updateMany: async ({ data }: Prisma.OrderUpdateManyArgs) => { Object.assign(order, data); return { count: 1 }; },
  } } },
});
const create = () => route.POST(new Request("https://example.invalid/ttn", { method: "POST", body: JSON.stringify({ codAmount: 0.01, total: 0.01, paymentMethod: "cash_on_delivery" }) }), { params: Promise.resolve({ id: "qa" }) });
async function verify() {
  admin = false; assert.equal((await create()).status, 401); assert.equal(calls, 0); admin = true;
  assert.equal((await create()).status, 200); assert.deepEqual(backward, [{ PayerType: "Recipient", CargoType: "Money", RedeliveryString: "199.29" }]);
  await create(); assert.equal(calls, 1, "Existing TTN does not call the carrier again");
  for (const method of ["pay_on_pickup", "Оплата при отриманні", "Оплата карткою онлайн"]) {
    order = { ...fixture(), paymentMethod: method };
    if (method.includes("онлайн")) Object.assign(order, { paymentProvider: "mono", paymentStatus: "PAID", paidAt: new Date() });
    assert.equal((await create()).status, 200); assert.equal(backward, undefined, "Only COD asks for money return");
  }
  order = { ...fixture(), paymentProvider: "mono" }; const before = calls; assert.equal((await create()).status, 409); assert.equal(calls, before);
  let codAmount: number | null = 199.29; let reliable = true;
  const cron = sourceModule<typeof import("../src/app/api/cron/novaposhta/route")>("src/app/api/cron/novaposhta/route.ts", {
    "next/server": { NextResponse }, "@/lib/status": statuses, "@/lib/order-status": orderStatus,
    "@/lib/payments/payment-method": methods, "@/lib/payments/money": money,
    "@/lib/server-env": { readServerEnv: (key: string) => key === "CRON_SECRET" ? "isolated" : "" },
    "@/lib/notifications/orders": { emitOrderEvents: async () => false },
    "@/lib/novaposhta": { getNovaPoshtaDocumentStatuses: async () => ({ success: true, statuses: [{ ttn: "00000000000000", status: "not delivered", statusCode: "unknown", deliveredAt: null, codStatus: "paid", codStatusCode: "unknown", codAmount, codStatusReliable: reliable }] }) },
    "@/lib/prisma": { prisma: { order: {
      findMany: async () => [{ ...order, novaPoshtaTtn: "00000000000000" }],
      updateMany: async ({ data }: Prisma.OrderUpdateManyArgs) => { Object.assign(order, data); return { count: 1 }; },
    } } },
  });
  for (const method of ["cash_on_delivery", "pay_on_pickup"]) {
    for (const evidence of ["positive", "description-only", "wrong-amount"]) {
      order = { ...fixture(), paymentMethod: method }; reliable = evidence !== "description-only"; codAmount = evidence === "wrong-amount" ? 1 : 199.29;
      await cron.GET(new Request("https://example.invalid/cron", { headers: { authorization: "Bearer isolated" } }));
      assert.equal(Boolean(order.paidAt), method === "cash_on_delivery" && evidence === "positive");
      assert.equal(order.novaPoshtaDeliveredAt, null, "Payment evidence never implies delivery");
    }
  }
  console.log("PASS Batch 1.7 COD: server amount ignores client input; COD-only money return; online-paid/pickup no COD; pending-online TTN blocked; duplicate TTN/auth preserved; method/evidence/amount-specific COD settlement independent of delivery. All carrier/DB/notification effects mocked; existing payload fields only.");
}
verify().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => { process.env = savedEnv; globalThis.fetch = savedFetch; });
