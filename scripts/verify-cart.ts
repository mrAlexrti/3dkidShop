import assert from "node:assert/strict";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { useCartStore as CartStore } from "../src/store/cart-store";
import { sourceModule } from "./source-module";
import * as cartItems from "../src/lib/cart-items";

const values = new Map<string, string>();
const storage = createJSONStorage(() => ({ getItem: (name) => values.get(name) ?? null, setItem: (name, value) => { values.set(name, value); }, removeItem: (name) => { values.delete(name); } }));
const { useCartStore } = sourceModule<{ useCartStore: typeof CartStore }>("src/store/cart-store.ts", {
  zustand: { create }, "zustand/middleware": { persist: (config: Parameters<typeof persist>[0], options: Parameters<typeof persist>[1]) => persist(config, { ...options, storage }) },
  "@/lib/cart-items": cartItems,
});
const cart = () => useCartStore.getState();
const item = { id: "qa-product", productId: "qa-product", name: "QA", slug: "qa", price: 12.5, image: "/images/placeholder.svg", quantity: 1 };
assert.equal(cart().items.length, 0);
cart().addItem(item); assert.equal(cart().isOpen, true); cart().addItem(item);
assert.equal(cart().items.length, 1); assert.equal(cart().count(), 2); assert.equal(cart().total(), 25);
cart().addItem({ ...item, id: "qa-product-small", price: 20, variant: { id: "small", labelUa: "Маленький", labelEn: "Small" } });
assert.equal(cart().items.length, 2); assert.equal(cart().total(), 45);
cart().updateQuantity(item.id, 3); assert.equal(cart().total(), 57.5);
cart().updateQuantity(item.id, 0); assert.equal(cart().items[0].quantity, 1);
cart().removeItem(item.id); assert.equal(cart().total(), 20);
cart().closeCart(); assert.equal(cart().isOpen, false); cart().openCart(); assert.equal(cart().isOpen, true);
cart().clear(); assert.equal(cart().count(), 0); assert.equal(cart().total(), 0);
cart().addItem(item); cart().addItem({ ...item, id: `${item.productId}-` });
assert.equal(cart().items.length, 1); assert.equal(cart().count(), 2);
const size = { ...item, id: "ignored-client-id", price: 20, variant: { id: "small", labelUa: "Маленький", labelEn: "Small" } };
cart().addItem(size); cart().addItem(size);
cart().addItem({ ...size, variant: { id: "large", labelUa: "Великий", labelEn: "Large" }, price: 30 });
assert.equal(cart().items.length, 3);
assert.equal(cart().items.find((line) => line.id === "qa-product-small")?.quantity, 2);
assert.equal(cart().items.find((line) => line.id === "qa-product-large")?.quantity, 1);
assert.equal(cart().total(), 95);
const migrated = cartItems.normalizeCartItems([{ ...item, id: "qa-product-", quantity: 2 }, item, { ...item, id: "qa-product-legacy", options: { Розмір: "Маленький" } }]);
assert.equal(migrated[0].id, item.productId); assert.equal(migrated[0].quantity, 3);
assert.equal(migrated[1].variant?.id, "legacy"); assert.equal(migrated[1].variant?.labelUa, "Маленький");
cart().clear();
console.log("PASS isolated actual cart store: simple/legacy-simple IDs merge, same size merges, different sizes stay separate, selected labels retained, quantity/count/totals/removal/persistence normalization safe. Browser storage untouched.");
