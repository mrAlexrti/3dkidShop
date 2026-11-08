import assert from "node:assert/strict";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { useCartStore as CartStore } from "../src/store/cart-store";
import { sourceModule } from "./source-module";

const values = new Map<string, string>();
const storage = createJSONStorage(() => ({ getItem: (name) => values.get(name) ?? null, setItem: (name, value) => { values.set(name, value); }, removeItem: (name) => { values.delete(name); } }));
const { useCartStore } = sourceModule<{ useCartStore: typeof CartStore }>("src/store/cart-store.ts", {
  zustand: { create }, "zustand/middleware": { persist: (config: Parameters<typeof persist>[0], options: Parameters<typeof persist>[1]) => persist(config, { ...options, storage }) },
});
const cart = () => useCartStore.getState();
const item = { id: "qa-product", productId: "qa-product", name: "QA", slug: "qa", price: 12.5, image: "/images/placeholder.svg", quantity: 1 };
assert.equal(cart().items.length, 0);
cart().addItem(item); cart().addItem(item);
assert.equal(cart().items.length, 1); assert.equal(cart().count(), 2); assert.equal(cart().total(), 25);
cart().addItem({ ...item, id: "qa-product-option", price: 20, options: { Size: "Large" } });
assert.equal(cart().items.length, 2); assert.equal(cart().total(), 45);
cart().updateQuantity(item.id, 3); assert.equal(cart().total(), 57.5);
cart().updateQuantity(item.id, 0); assert.equal(cart().items[0].quantity, 1);
cart().removeItem(item.id); assert.equal(cart().total(), 20);
cart().closeCart(); assert.equal(cart().isOpen, false); cart().openCart(); assert.equal(cart().isOpen, true);
cart().clear(); assert.equal(cart().count(), 0); assert.equal(cart().total(), 0);
console.log("PASS isolated actual cart store: add/merge, option lines, quantity floor, count/totals, removal, drawer state, clear. Browser storage untouched.");
