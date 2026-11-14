// Browser storage/cart only; no server, DB, provider or network access.
import assert from "node:assert/strict";
import { sourceModule } from "./source-module";
import * as cart from "../src/lib/cart-items";
import type { CartItem } from "../src/types";
const savedStorage = globalThis.localStorage; const savedWindow = globalThis.window;
const storage = new Map<string, string>();
globalThis.localStorage = { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => { storage.set(key, value); }, removeItem: (key: string) => { storage.delete(key); } } as Storage;
globalThis.window = { location: { origin: "https://shop.example.invalid" } } as Window & typeof globalThis;
const session = sourceModule<typeof import("../src/lib/payments/checkout-session")>("src/lib/payments/checkout-session.ts", { "@/lib/cart-items": cart });
const items: CartItem[] = [{ id: "qa", productId: "qa", name: "QA", slug: "qa", image: "qa", price: 199, quantity: 1 }];
const ref = "pay_" + "a".repeat(32);
async function verify() {
  let cleared = 0;
  const key = await session.onlineCheckoutKey({ customer: "PRIVATE_CUSTOMER", delivery: "qa" }, items);
  assert.equal(await session.onlineCheckoutKey({ delivery: "qa", customer: "PRIVATE_CUSTOMER" }, [{ ...items[0], price: .01, name: "changed display" }]), key);
  assert.ok(![...storage.values()].join("").includes("PRIVATE_CUSTOMER"));
  session.rememberCheckoutResult(key, `/checkout/success?attempt=${ref}&token=qa`);
  for (const state of ["pending", "unknown", "review", "unavailable"]) session.completeCheckoutCart(ref, state, items, () => cleared++);
  assert.equal(cleared, 0);
  session.completeCheckoutCart("pay_other", "paid", items, () => cleared++); assert.equal(cleared, 0);
  session.completeCheckoutCart(ref, "paid", items, () => cleared++); assert.equal(cleared, 1);
  storage.clear(); const revised = await session.onlineCheckoutKey({}, items, 1); session.rememberCheckoutResult(revised, `/checkout/success?attempt=${ref}`);
  session.completeCheckoutCart(ref, "paid", items, () => cleared++, 2); assert.equal(cleared, 1, "Editing and restoring identical cart contents must not clear a new purchase");
  assert.notEqual(await session.onlineCheckoutKey({}, items, 2), revised); storage.clear();
  session.completeCheckoutCart(ref, "paid", items, () => cleared++); assert.equal(cleared, 1);
  for (const state of ["failed", "cancelled", "expired"]) {
    const retry = await session.onlineCheckoutKey({}, items); session.rememberCheckoutResult(retry, `/checkout/success?attempt=${ref}`);
    session.completeCheckoutCart(ref, state, items, () => cleared++); assert.equal(cleared, 1);
    assert.equal(await session.onlineCheckoutKey({}, items), retry, "Terminal display must retain identity until explicit retry");
    assert.equal(session.explicitPaymentRetry("pay_other", "b".repeat(64), "qa-token"), false);
    assert.equal(session.explicitPaymentRetry(ref, "b".repeat(64), "qa-token"), true);
    assert.equal(await session.onlineCheckoutKey({}, items), "b".repeat(64));
    assert.deepEqual(session.checkoutRetrySource("b".repeat(64)), { reference: ref, token: "qa-token" });
    assert.equal(session.explicitPaymentRetry(ref, "c".repeat(64), "qa-token"), false, "Duplicate click cannot rotate the successor identity");
    storage.clear();
  }
  const editedKey = await session.onlineCheckoutKey({}, items); session.rememberCheckoutResult(editedKey, `/checkout/success?attempt=${ref}`);
  session.completeCheckoutCart(ref, "paid", [{ ...items[0], quantity: 2 }], () => cleared++); assert.equal(cleared, 1, "Paid return must preserve newer cart edits");
  const oldKey = await session.onlineCheckoutKey({}, items); session.rememberCheckoutResult(oldKey, `/checkout/success?attempt=${ref}`);
  const newKey = await session.onlineCheckoutKey({ customer: "different purchase" }, items); assert.notEqual(newKey, oldKey);
  session.completeCheckoutCart(ref, "paid", items, () => cleared++); assert.equal(cleared, 1);
  console.log("PASS checkout cart: stable retry identity, no stored customer form data, handoff/pending/failure retention, matched PAID clear once, newer cart/purchase protection.");
}
verify().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => { globalThis.localStorage = savedStorage; globalThis.window = savedWindow; });
