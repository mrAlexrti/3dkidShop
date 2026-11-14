// Read-only localhost QA. Never submit checkout, carrier documents, notifications or a payment.
import assert from "node:assert/strict";
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { getOrderResultPath } from "../src/lib/payments/order-result";
import { paymentResultState } from "../src/lib/payments/payment-state";
import { isOnlinePaymentAvailable } from "../src/lib/payments/online-payment";
import { translations } from "../src/lib/i18n";

loadEnvConfig(process.cwd());
const db = new PrismaClient();
const base = process.env.VERIFY_BASE_URL ?? "http://127.0.0.1:3014";
assert.equal(new URL(base).hostname, "127.0.0.1");
const visible = (html: string) => html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, "").replace(/<!--[\s\S]*?-->/g, "").replaceAll("&#x27;", "'");
async function page(path: string, locale: "ua" | "en") {
  const response = await fetch(`${base}${path}`, { headers: { cookie: `locale=${locale}` }, redirect: "manual" });
  assert.equal(response.status, 200); return visible(await response.text());
}
async function verify() {
  const order = await db.order.findFirstOrThrow();
  assert.ok(order.number);
  const path = getOrderResultPath(order.number);
  const query = path.split("?")[1];
  const api = await fetch(`${base}/api/payments/status?${query}`);
  assert.equal(api.status, 200); assert.deepEqual(await api.json(), { state: paymentResultState(order) });
  assert.match(api.headers.get("cache-control")!, /no-store/);
  const denied = await fetch(`${base}/api/payments/status?order=${order.number}&token=invalid`);
  assert.equal(denied.status, 404); assert.deepEqual(await denied.json(), { state: "unavailable" });
  for (const locale of ["ua", "en"] as const) {
    const t = translations[locale];
    const invalid = await page(`/checkout/success?order=${order.number}&payment=success&email=sent`, locale);
    assert.ok(invalid.includes(t.success.unavailableTitle)); assert.ok(!invalid.includes(t.success.paidTitle));
    const html = await page(path, locale);
    const state = paymentResultState(order);
    assert.ok(html.includes(state === "confirmed" ? t.success.title : t.success[`${state}Title`]));
    assert.ok(!html.includes(order.customerEmail) && !html.includes(order.customerPhone), "Status-only page must not expose customer details.");
    const home = await page("/", locale);
    const account = home.match(/<button[^>]*class="sf-icon-button"[^>]*disabled=""[^>]*>/)?.[0];
    assert.ok(account?.includes(t.nav.accountUnavailable)); assert.ok(!home.includes('href="/account"'));
    const login = await page("/login", locale);
    assert.match(login, /autocomplete="username"/i); assert.ok(login.includes('type="password"'));
    assert.doesNotMatch(login, /name="(?:otp|totp)"|Google Authenticator/);
    const delivery = await page("/delivery-payment", locale);
    assert.equal(delivery.includes(t.pages.deliveryPayment.card), isOnlinePaymentAvailable());
  }
  const admin = await fetch(`${base}/admin`, { redirect: "manual" });
  assert.equal(admin.status, 307); assert.match(admin.headers.get("location")!, /\/login/);
  if (!isOnlinePaymentAvailable()) {
    const callback = await fetch(`${base}/api/payments/liqpay/callback`, { method: "POST", body: new URLSearchParams({ data: "isolated-invalid", signature: "isolated-invalid" }) });
    assert.equal(callback.status, 503);
  }
  console.log(JSON.stringify({ result: "PASS UA/EN localhost production: authoritative capability-protected status; forged browser success denied; no PII; explicit disabled account; login without TOTP; unauthenticated admin protected; truthful payment availability", onlineAvailable: isOnlinePaymentAvailable(), counts: { products: await db.product.count(), images: await db.productImage.count(), categories: await db.category.count(), orders: await db.order.count(), orderItems: await db.orderItem.count() } }));
}
verify().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => db.$disconnect());
