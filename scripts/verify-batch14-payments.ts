// Isolated actual payment/action/route source. No DB, provider or notification calls.
import assert from "node:assert/strict";
import { NextResponse } from "next/server";
import type { Order, Prisma } from "@prisma/client";
import * as liqpay from "../src/lib/payments/liqpay";
import * as online from "../src/lib/payments/online-payment";
import * as result from "../src/lib/payments/order-result";
import * as states from "../src/lib/payments/payment-state";
import * as orderStatus from "../src/lib/order-status";
import * as validation from "../src/lib/validations/checkout";
import * as variants from "../src/lib/product-variants";
import * as cartItems from "../src/lib/cart-items";
import { translations } from "../src/lib/i18n";
import type { createOrder as Action } from "../src/lib/actions/create-order";
import { sourceModule } from "./source-module";

const saved = { ...process.env };
process.env.AUTH_SECRET = "isolated-order-result-secret-not-deployed";
process.env.LIQPAY_PUBLIC_KEY = "sandbox_isolated_public";
process.env.LIQPAY_PRIVATE_KEY = "sandbox_isolated_private";
process.env.LIQPAY_SANDBOX = "1";
process.env.ONLINE_PAYMENT_MODE = "sandbox";
process.env.NEXT_PUBLIC_SITE_URL = "http://127.0.0.1:3014";
process.env.LIQPAY_DEBUG = "0";
let externalCalls = 0;
const blocked = () => { externalCalls++; throw new Error("EXTERNAL_EFFECT_BLOCKED"); };
type Callback = { POST(req: Request): Promise<Response> };
const fixture = (): Order => ({ id: "isolated", number: "3DK-isolated", status: "AWAITING_PAYMENT", total: { toString: () => "199.00" }, paidAt: null, paymentProvider: "liqpay", paymentMode: "sandbox", paymentStatus: "PENDING", novaPoshtaDeliveredAt: null, items: [] } as unknown as Order);
let order = fixture(); let writes = 0;
const memory = { order: {
  findUnique: async ({ where }: Prisma.OrderFindUniqueArgs) => where.number === order.number || where.id === order.id ? { ...order } : null,
  updateMany: async ({ where, data }: Prisma.OrderUpdateManyArgs) => {
    if (!Object.entries(where ?? {}).every(([key, value]) => JSON.stringify(order[key as keyof Order]) === JSON.stringify(value))) return { count: 0 };
    Object.assign(order, data); writes++; return { count: 1 };
  },
} };
const callback = sourceModule<Callback>("src/app/api/payments/liqpay/callback/route.ts", {
  "next/server": { NextResponse }, "@/lib/prisma": { prisma: memory },
  "@/lib/notifications/orders": { emitOrderEvents: blocked },
  "@/lib/order-status": orderStatus, "@/lib/payments/online-payment": online, "@/lib/payments/liqpay": liqpay,
});
const status = sourceModule<{ GET(req: Request): Promise<Response> }>("src/app/api/payments/status/route.ts", {
  "next/server": { NextResponse }, "@/lib/prisma": { prisma: memory }, "@/lib/payments/order-result": result, "@/lib/payments/payment-state": states,
});
const payload = (changes: Record<string, unknown> = {}) => ({ order_id: "3DK-isolated", public_key: "sandbox_isolated_public", action: "pay", status: "sandbox", amount: "199.00", currency: "UAH", ...changes });
const request = (data: string, signature = liqpay.signLiqPayData(data)) => new Request("http://127.0.0.1/api/payments/liqpay/callback", { method: "POST", body: new URLSearchParams({ data, signature }) });
const post = (changes: Record<string, unknown> = {}) => callback.POST(request(Buffer.from(JSON.stringify(payload(changes))).toString("base64")));
function reset() { order = fixture(); writes = 0; }

async function verify() {
  assert.equal(online.isOnlinePaymentAvailable(), true);
  for (const [key, value] of [["ONLINE_PAYMENT_MODE", "disabled"], ["ONLINE_PAYMENT_MODE", "live"], ["LIQPAY_SANDBOX", "0"], ["LIQPAY_PUBLIC_KEY", "live_public"], ["LIQPAY_PRIVATE_KEY", "live_private"]]) {
    const original = process.env[key]; process.env[key] = value;
    assert.equal(online.isOnlinePaymentAvailable(), false);
    assert.equal((await post()).status, 503); assert.equal(writes, 0);
    process.env[key] = original;
  }
  assert.equal(liqpay.isPaidLiqPayStatus("sandbox", "live"), false);
  assert.equal(liqpay.moneyMinorUnits("199.00"), 19900);
  for (const invalid of [199.001, NaN, Infinity, -1, "199junk", "1e2", {}, null]) assert.equal(liqpay.moneyMinorUnits(invalid), null);
  const token = result.createOrderResultToken(order.number);
  assert.ok(result.validOrderResultToken(order.number, token));
  assert.ok(!result.validOrderResultToken("3DK-other", token));
  assert.ok(!result.validOrderResultToken(order.number, token.slice(0, -1) + (token.endsWith("0") ? "1" : "0")));
  assert.ok(!result.validOrderResultToken(order.number, result.createOrderResultToken(order.number, Date.now() - 25 * 3600000)));
  assert.ok(!result.validOrderResultToken(order.number, result.createOrderResultToken(order.number, Date.now() + 3600000)));
  assert.equal((await callback.POST(request("e30=", "invalid"))).status, 401);
  for (const raw of ["null", "[]", "not-json"]) assert.equal((await callback.POST(request(Buffer.from(raw).toString("base64")))).status, 400);
  for (const changes of [{ amount: "198.99" }, { amount: "199.001" }, { currency: "USD" }, { public_key: "another-merchant" }, { action: "hold" }, { amount: undefined }]) {
    reset(); assert.equal((await post(changes)).status, 400); assert.equal(writes, 0);
  }
  assert.equal((await post({ order_id: "3DK-other" })).status, 404);
  for (const changes of [{ paymentProvider: null }, { paymentMode: "live" }, { paymentProvider: "mono" }]) {
    reset(); Object.assign(order, changes); assert.equal((await post()).status, 400); assert.equal(writes, 0);
  }
  reset();
  for (const pending of ["processing", "wait_accept", "hold_wait", "unknown"]) { assert.equal((await post({ status: pending })).status, 200); assert.equal(writes, 0); }
  assert.equal(states.paymentResultState(order), "pending");
  const statusUrl = `http://127.0.0.1/api/payments/status?${new URLSearchParams({ order: order.number, token })}`;
  const pending = await status.GET(new Request(statusUrl));
  assert.deepEqual(await pending.json(), { state: "pending" }); assert.match(pending.headers.get("cache-control")!, /no-store/);
  assert.equal((await status.GET(new Request(statusUrl.replace(token, "invalid")))).status, 404);
  await Promise.all([post(), post()]); assert.equal(writes, 1); assert.equal(order.status, "PAID"); assert.ok(order.paidAt);
  assert.deepEqual(await (await status.GET(new Request(statusUrl))).json(), { state: "paid" });
  await post(); assert.equal(writes, 1, "Duplicate paid callback must be a no-op.");
  await post({ status: "failure" }); assert.equal(writes, 1, "Stale failure cannot undo a confirmed payment.");
  await post({ status: "reversed" }); assert.equal(states.paymentResultState(order), "failed"); assert.ok(order.paidAt, "Reversal preserves historical paid timestamp.");
  assert.equal((await post()).status, 409);
  for (const failed of ["failure", "error", "cancelled", "canceled"]) {
    reset(); await post({ status: failed }); assert.equal(states.paymentResultState(order), "failed"); assert.equal(order.paidAt, null);
    await post({ status: failed }); assert.equal(writes, 1);
  }
  reset(); order.status = "CANCELLED"; assert.equal((await post()).status, 409); assert.equal(writes, 0);
  reset(); order.paymentProvider = null; order.status = "PROCESSING"; assert.equal(states.paymentResultState(order), "confirmed");
  for (const paymentMethod of ["Картка онлайн", "Card online", "LiqPay"]) {
    assert.equal(states.paymentResultState({ ...order, paymentMethod }), "pending", "Unbound legacy online orders must never be mistaken for confirmed offline orders.");
    assert.equal(states.paymentResultState({ ...order, paymentMethod, status: "PAID", paidAt: new Date() }), "pending", "Legacy paid flags need reconciliation; the old callback did not validate amount/currency.");
  }

  let prepared: Prisma.OrderCreateArgs | undefined; let notifications = 0; let transactionCalls = 0;
  const { createOrder } = sourceModule<{ createOrder: typeof Action }>("src/lib/actions/create-order.ts", {
    "@/lib/i18n": { translations }, "@/lib/validations/checkout": validation, "@/lib/order-status": orderStatus,
    "@/lib/product-variants": variants, "@/lib/cart-items": cartItems, "@/lib/payments/online-payment": online,
    "@/lib/payments/order-result": result, "@/lib/payments/liqpay": liqpay,
    "@/lib/notifications/orders": { notifyOrderCreated: async () => { notifications++; return false; } },
    "@/lib/prisma": { prisma: {
      product: { findMany: async () => [{ id: "simple", name: "Server name", price: 123, stock: 3, options: [] }] },
      order: { findUnique: async () => ({ ...prepared?.data, items: [] }) },
      $transaction: async (callback: (tx: unknown) => Promise<unknown>) => {
        transactionCalls++; return callback({ product: { updateMany: async () => ({ count: 1 }) }, order: { create: async (args: Prisma.OrderCreateArgs) => { prepared = args; } } });
      },
    } },
  });
  const checkout = { customerName: "Isolated", customerSurname: "QA", customerEmail: "isolated@example.invalid", customerPhone: "+380000000000", deliveryType: "np_warehouse", npCityName: "QA city", npWarehouseRef: "manual", npWarehouseAddress: "QA address", paymentMethod: "card_online" };
  const items = [{ id: "simple", productId: "simple", name: "Forged", slug: "simple", image: "/images/placeholder.svg", price: 0.01, quantity: 1 }];
  process.env.ONLINE_PAYMENT_MODE = "disabled";
  assert.equal((await createOrder(checkout, items, "en")).success, false); assert.equal(transactionCalls, 0);
  process.env.ONLINE_PAYMENT_MODE = "sandbox";
  const onlineOrder = await createOrder(checkout, items, "en");
  assert.ok(onlineOrder.success && onlineOrder.payment);
  if (onlineOrder.success && onlineOrder.payment) {
    const signed = liqpay.parseLiqPayCallback(onlineOrder.payment.data) as liqpay.LiqPayCallbackPayload & { result_url: string; sandbox: number };
    assert.equal(signed.amount, 123); assert.equal(signed.sandbox, 1); assert.ok(signed.result_url.endsWith(onlineOrder.resultUrl));
    assert.ok(liqpay.isValidLiqPaySignature(onlineOrder.payment.data, onlineOrder.payment.signature));
  }
  assert.equal(prepared!.data.paymentStatus, "PENDING"); assert.equal(prepared!.data.status, "AWAITING_PAYMENT"); assert.equal(notifications, 0);
  const offlineOrder = await createOrder({ ...checkout, paymentMethod: "cash_on_delivery" }, items, "en");
  assert.ok(offlineOrder.success && !offlineOrder.payment); assert.equal(prepared!.data.status, "PROCESSING"); assert.equal(prepared!.data.paymentProvider, undefined); assert.equal(notifications, 1);
  assert.equal(externalCalls, 0);
  console.log("PASS isolated payments: disabled/live guards; signature/data/merchant/reference/amount/currency; pending/paid/failed/reversed; duplicate/concurrent callbacks; sandbox isolation; expiring status-only capability; authoritative online/offline order handoff. Zero real DB/provider/notification calls.");
}
verify().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => { process.env = saved; });
