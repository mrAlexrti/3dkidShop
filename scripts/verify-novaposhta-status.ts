// Actual cron source with fail-closed imports and in-memory orders. No DB or network.
import assert from "node:assert/strict";
import { NextResponse } from "next/server";
import type { Order, Prisma } from "@prisma/client";
import type { NovaPoshtaDocumentStatus } from "../src/lib/novaposhta";
import * as orderStatus from "../src/lib/order-status";
import * as statuses from "../src/lib/status";
import { notificationEvents } from "../src/lib/notifications/events";
import { sourceModule } from "./source-module";
import * as methods from "../src/lib/payments/payment-method";
import * as money from "../src/lib/payments/money";

const originalFetch = globalThis.fetch;
let externalCalls = 0;
const blocked = () => { externalCalls++; throw new Error("EXTERNAL_EFFECT_BLOCKED"); };
globalThis.fetch = blocked;
let telegramMessages = 0;
const notifications = { emitOrderEvents: async (before: Order, after: Order) => { telegramMessages += notificationEvents(before, after).length; } };

const fixture = () => ({
  id: "isolated-np", number: "3DK-isolated-np", status: "SHIPPED", paidAt: null, paymentMethod: "cash_on_delivery",
  novaPoshtaTtn: "00000000000000", novaPoshtaDeliveredAt: null, total: 199, items: [],
} as unknown as Order);
const statusFixture = (): NovaPoshtaDocumentStatus => ({
  ttn: "00000000000000", status: "", statusCode: "", deliveredAt: null,
  codStatus: "", codStatusCode: "", codAmount: null, codStatusReliable: true,
});
let order = fixture();
let providerStatus = statusFixture();
let writes = 0;
const cron = sourceModule<{ GET(request: Request): Promise<Response> }>("src/app/api/cron/novaposhta/route.ts", {
  "next/server": { NextResponse },
  "@/lib/prisma": { prisma: { order: {
    findMany: async () => [{ ...order }],
    updateMany: async ({ where, data }: Prisma.OrderUpdateManyArgs) => {
      assert.equal(where?.id, order.id);
      if (!Object.entries(where ?? {}).every(([key, value]) => JSON.stringify(order[key as keyof Order]) === JSON.stringify(value))) return { count: 0 };
      Object.assign(order, data); writes++;
      return { count: 1 };
    },
  } } },
  "@/lib/novaposhta": { getNovaPoshtaDocumentStatuses: async (ttns: string[]) => {
    assert.deepEqual(ttns, [order.novaPoshtaTtn]);
    return { success: true, statuses: [providerStatus] };
  } },
  "@/lib/notifications/orders": notifications,
  "@/lib/order-status": orderStatus,
  "@/lib/status": statuses,
  "@/lib/payments/payment-method": methods, "@/lib/payments/money": money,
  "@/lib/server-env": { readServerEnv: (name: string) => name === "CRON_SECRET" ? "isolated-cron-secret" : "" },
});

async function sync() {
  const response = await cron.GET(new Request("http://localhost/api/cron/novaposhta", {
    headers: { authorization: "Bearer isolated-cron-secret" },
  }));
  assert.equal(response.status, 200);
  return response.json();
}

async function verifyProviderNormalization() {
  const keys = ["NP_API_KEY", "NP_SENDER_REF", "NP_CONTACT_SENDER_REF", "NP_SENDER_CITY_REF", "NP_SENDER_ADDRESS_REF", "NP_SENDER_PHONE"];
  const saved = keys.map((key) => [key, process.env[key]] as const);
  let mockRequests = 0;
  try {
    for (const key of keys) process.env[key] = "isolated-not-live";
    globalThis.fetch = async (input, init) => {
      mockRequests++;
      assert.equal(input, "https://api.novaposhta.ua/v2.0/json/");
      const payload = JSON.parse(String(init?.body));
      assert.equal(payload.apiKey, "isolated-not-live");
      assert.equal(payload.modelName, "TrackingDocument");
      assert.equal(payload.calledMethod, "getStatusDocuments", "Shipment creation is never allowed.");
      assert.deepEqual(payload.methodProperties.Documents, [{ DocumentNumber: "00000000000000" }]);
      return Response.json({ success: true, data: [
        { Number: "00000000000000", StatusCode: "9", Status: "Отримано", DateScan: "02.01.2026 12:34:56", RedeliveryStatus: "paid", RedeliveryStatusCode: "unmapped-code", RedeliverySum: "199,00" },
        { StatusCode: "unmapped-code", Status: "not delivered", DateScan: "02.01.2026", RedeliveryStatus: "not paid" },
        { ActualDeliveryDate: "03.01.2026", Redelivery: "1" },
        { RedeliveryNum: "isolated-redelivery" },
        { RedeliveryPaymentCardDescription: "paid" },
      ] });
    };
    const provider = sourceModule<typeof import("../src/lib/novaposhta")>("src/lib/novaposhta.ts", { "@/lib/payments/payment-method": methods });
    const result = await provider.getNovaPoshtaDocumentStatuses(["00000000000000"]);
    assert.ok(result.success);
    const [delivered, negative, redelivery, redeliveryNumber, cardDescription] = result.statuses;
    assert.equal(delivered.statusCode, "9");
    assert.equal(delivered.status, "Отримано");
    assert.equal(delivered.deliveredAt?.getTime(), new Date(2026, 0, 2, 12, 34, 56).getTime());
    assert.equal(delivered.codStatus, "paid");
    assert.equal(delivered.codStatusCode, "unmapped-code");
    assert.equal(delivered.codAmount, 199);
    assert.equal(negative.deliveredAt, null, "DateScan implies delivery only for existing code 9.");
    assert.equal(negative.codStatus, "not paid");
    assert.equal(redelivery.deliveredAt?.getTime(), new Date(2026, 0, 3).getTime());
    assert.equal(redelivery.codStatus, "Очікується післяплата");
    assert.equal(redeliveryNumber.codStatus, "Очікується післяплата");
    assert.equal(cardDescription.codStatus, "paid");
    assert.equal(cardDescription.codStatusReliable, false, "Card description is diagnostic only");
    for (const [status, expected] of [[delivered, "COMPLETED"], [negative, "SHIPPED"], [redelivery, "SHIPPED"], [redeliveryNumber, "SHIPPED"], [cardDescription, "SHIPPED"]] as const) {
      order = fixture(); providerStatus = status;
      // Missing Number fallback is empty for extra synthetic response rows.
      providerStatus = { ...providerStatus, ttn: order.novaPoshtaTtn! };
      await sync();
      assert.equal(order.status, expected);
    }
    assert.equal(mockRequests, 1);
    console.log("PASS provider normalization: code 9/DateScan; ActualDeliveryDate; raw COD code/amount; pending redelivery flags; diagnostic-only card description (mock fetch only).");
  } finally {
    globalThis.fetch = blocked;
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

async function verify() {
  const failures: string[] = [];
  // Text samples exercise legacy semantics; they are not claims about live NP payloads.
  const cases: Array<[string, Partial<NovaPoshtaDocumentStatus>, Order["status"], Partial<Order>?]> = [
    ["paid", { codStatus: "paid" }, "PAID"],
    ["unpaid", { codStatus: "unpaid" }, "SHIPPED"],
    ["not paid", { codStatus: "not paid" }, "SHIPPED"],
    ["delivered", { status: "delivered" }, "DELIVERED"],
    ["not delivered", { status: "not delivered" }, "SHIPPED"],
    ["normalized payment", { codStatus: " \tPAID\n" }, "PAID"],
    ["normalized delivery", { status: " \tDELIVERED\n" }, "DELIVERED"],
    ["normalized negative", { codStatus: " NOT\t PAID ", status: " NOT\nDELIVERED " }, "SHIPPED"],
    ["unknown text", { codStatus: "unrecognized payment", status: "unrecognized delivery" }, "SHIPPED"],
    ["empty", {}, "SHIPPED"],
    ["existing delivery code 9", { statusCode: "9" }, "DELIVERED"],
    ["canonical delivery code takes precedence", { statusCode: "9", status: "not delivered" }, "DELIVERED"],
    ["normalized delivery code", { statusCode: " 9 " }, "DELIVERED"],
    ["unknown delivery code", { statusCode: "unmapped-code" }, "SHIPPED"],
    ["no guessed COD numeric mapping", { codStatusCode: "9" }, "SHIPPED"],
    ["COD text-code fallback", { codStatusCode: " PAID " }, "PAID"],
    ["negative COD text outranks text-code fallback", { codStatus: "not paid", codStatusCode: "paid" }, "SHIPPED"],
    ["unknown COD text outranks text-code fallback", { codStatus: "unknown", codStatusCode: "paid" }, "SHIPPED"],
    ["both positives", { statusCode: "9", codStatus: "paid" }, "COMPLETED"],
    ["negative payment, positive delivery", { statusCode: "9", codStatus: "unpaid" }, "DELIVERED"],
    ["positive payment, negative delivery", { status: "not delivered", codStatus: "paid" }, "PAID"],
    ["negative statuses preserve existing payment", { codStatus: "not paid", status: "not delivered" }, "PAID", { status: "PAID", paidAt: new Date("2026-01-01T00:00:00Z") }],
    ["provider delivery timestamp remains authoritative", { deliveredAt: new Date("2026-01-02T00:00:00Z") }, "DELIVERED"],
    ["stored delivery plus payment", { codStatus: "paid" }, "COMPLETED", { status: "DELIVERED", novaPoshtaDeliveredAt: new Date("2026-01-02T00:00:00Z") }],
    ["stored payment plus delivery", { statusCode: "9" }, "COMPLETED", { status: "PAID", paidAt: new Date("2026-01-01T00:00:00Z") }],
    ["cancelled remains final", { statusCode: "9" }, "CANCELLED", { status: "CANCELLED" }],
    ["completed remains final", {}, "COMPLETED", { status: "COMPLETED", paidAt: new Date("2026-01-01T00:00:00Z") }],
  ];
  for (const text of ["received", "оплачено", "отримано", "получено", "перераховано", "зараховано"]) {
    cases.push([`legacy payment ${text}`, { codStatus: text }, "PAID"]);
  }
  for (const text of ["received", "отримано", "доставлено", "получено"]) {
    cases.push([`legacy delivery ${text}`, { status: text }, "DELIVERED"]);
  }
  for (const text of ["not received", "не оплачено", "неоплачено", "не отримано", "неотримано", "не получено", "неполучено", "не перераховано", "незараховано", "payment will be paid", "paid pending confirmation"]) {
    cases.push([`negative/unknown payment ${text}`, { codStatus: text }, "SHIPPED"]);
    cases.push([`negative/unknown COD text-code ${text}`, { codStatusCode: text }, "SHIPPED"]);
  }
  for (const text of ["undelivered", "not received", "не отримано", "неотримано", "не доставлено", "недоставлено", "не получено", "неполучено", "will be delivered", "delivered pending confirmation"]) {
    cases.push([`negative/unknown delivery ${text}`, { status: text }, "SHIPPED"]);
  }
  // Retain all 69 positive/negative classification expectations, but assert their
  // financial/delivery facts separately from the now-independent operational state.
  for (const [name, status, classification, initial] of cases) {
    order = { ...fixture(), ...initial }; providerStatus = { ...statusFixture(), ...status };
    const originalStatus = order.status;
    const expected = classification === "COMPLETED" ? "COMPLETED" : originalStatus;
    const expectedNotificationCount = originalStatus === expected ? 0 : 1;
    telegramMessages = 0; writes = 0;
    const result = await sync();
    try {
      assert.equal(order.status, expected);
      assert.equal(Boolean(order.paidAt), classification === "PAID" || classification === "COMPLETED");
      if (classification === "DELIVERED") assert.equal(statuses.normalizeDeliveryStage(order), "DELIVERED");
      if (classification === "PAID") assert.equal(statuses.normalizePaymentStage(order), "PAID");
      assert.equal(result.orderStatusChanged, expectedNotificationCount);
      assert.equal(writes, 1);
      assert.equal(order.novaPoshtaStatus, status.status || null);
      assert.equal(order.novaPoshtaStatusCode, status.statusCode || null);
      assert.equal(order.novaPoshtaCodStatus, status.codStatus || null);
      assert.equal(order.novaPoshtaCodStatusCode, status.codStatusCode || null);
      assert.equal(order.novaPoshtaDeliveredAt, providerStatus.deliveredAt ?? initial?.novaPoshtaDeliveredAt ?? null);
      const paidAt = order.paidAt;
      const firstNotifications = telegramMessages;
      const repeated = await sync();
      assert.equal(order.status, expected);
      assert.equal(order.paidAt, paidAt, "Repeated sync preserves the payment timestamp.");
      assert.equal(repeated.orderStatusChanged, 0);
      assert.equal(telegramMessages, firstNotifications, "No duplicate semantic notification.");
      console.log(`PASS ${name} => ${expected}; repeated sync stable`);
    } catch (error) {
      failures.push(name);
      console.error(`FAIL ${name}: expected ${expected}, actual ${order.status}, paidAt=${Boolean(order.paidAt)}, mocked Telegram=${telegramMessages}`, error instanceof Error ? error.message : error);
    }
  }
  assert.deepEqual(failures, [], "Classification regression failures");
  await verifyProviderNormalization();
  assert.equal(externalCalls, 0);
  console.log(`PASS ${cases.length} Nova Poshta cases. Zero real DB/provider/email/Telegram calls.`);
}

verify().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => { globalThis.fetch = originalFetch; });
