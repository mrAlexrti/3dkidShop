// Pure regression: actual reconciliation, synthetic media/configuration; no DB/env.
import assert from "node:assert/strict";
import { reconcileCart, CART_IMAGE_PLACEHOLDER, type CartProduct } from "../src/lib/cart-reconciliation";
import { configuration, photos, ids } from "./fixtures/batch18a-data";
import type { CartItem } from "../src/types";

const pink = configuration.combinations[0];
// Scoped primary first reproduces the release-audit defect.
const images = [photos[1], photos[3], photos[0], photos[2]];
const product: CartProduct = { id: "audit", name: "Fixture", nameEn: "Fixture", slug: "fixture", price: 100,
  image: images[0].url, images, isOrderable: true, variants: [], optionMode: "COLOR_SIZE", configuration };
const line: CartItem = { id: `audit:variant:${pink.id}`, productId: "audit", name: "Fixture", slug: "fixture", price: 199, quantity: 1,
  image: "https://evil.invalid/forged.webp", selection: { version: 2, variantId: pink.id, values: { COLOR: ids.pink, SIZE: ids.small } } };
const original = JSON.stringify({ product, line });
for (const locale of ["ua", "en"] as const) {
  const reconcile = (p = product, item = line) => reconcileCart([item], [p], locale);
  assert.equal(reconcile().items[0].image, photos[1].url);
  const retired: CartProduct = { ...product, configuration: { ...configuration,
    values: configuration.values.map((v) => v.id === ids.pink ? { ...v, retired: true } : v),
    combinations: configuration.combinations.map((v) => v.values.COLOR === ids.pink ? { ...v, retired: true } : v),
  } };
  const result = reconcile(retired);
  assert.equal(result.issues[line.id], "variantUnavailable"); assert.equal(result.items[0].image, photos[0].url);
  assert.equal(result.items[0].id, line.id); assert.deepEqual(result.items[0].selection, line.selection);
  assert.equal(reconcile(product, result.items[0]).items[0].image, photos[1].url, "Restoring the same IDs must restore the color image");
  const simple: CartProduct = { ...retired, optionMode: "SIMPLE", configuration: { mode: "SIMPLE", values: [], combinations: [] } };
  const simpleLine: CartItem = { ...line, id: "audit", price: 100, selection: undefined };
  assert.equal(reconcile(simple, simpleLine).items[0].image, photos[0].url);
  assert.equal(Object.keys(reconcile(simple, simpleLine).issues).length, 0);
  assert.equal(reconcile(simple).items[0].image, photos[0].url, "Old variant line after SIMPLE conversion must also use universal media");
  for (const config of [configuration, { ...configuration, combinations: configuration.combinations.map((v) => ({ ...v, isAvailable: false })) }]) {
    const p = { ...product, configuration: config };
    assert.equal(reconcile(p, { ...line, selection: undefined }).items[0].image, photos[0].url);
    assert.equal(reconcile(p, { ...line, selection: { ...line.selection!, values: { COLOR: ids.blue, SIZE: ids.small } } }).items[0].image, photos[0].url);
  }
  for (const p of [retired, simple]) assert.equal(reconcile({ ...p, images: images.filter((v) => v.colorValueId) }, p === simple ? simpleLine : line).items[0].image, CART_IMAGE_PLACEHOLDER);
  assert.equal(reconcile({ ...product, images: images.filter((v) => v.colorValueId) }).items[0].image, photos[1].url);
  assert.equal(reconcile({ ...product, images: undefined }).items[0].image, product.image, "Older server projections remain compatible");
  assert.equal(reconcile({ ...product, optionMode: "LEGACY" }, simpleLine).items[0].image, photos[0].url);
  console.log(`PASS ${locale}: retirement/restoration, SIMPLE conversion, invalid/unavailable color, universal/placeholder fallback, stable selection and legacy projection`);
}
assert.equal(JSON.stringify({ product, line }), original, "Reconciliation must not mutate gallery, IDs, URLs or input lines");
