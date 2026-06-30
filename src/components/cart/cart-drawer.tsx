"use client";

import { AnimatePresence, motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { X, Minus, Plus, Trash2 } from "lucide-react";
import { useCartStore } from "@/store/cart-store";
import { formatPrice } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export function CartDrawer() {
  const { items, isOpen, closeCart, removeItem, updateQuantity, total } = useCartStore();

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeCart}
            className="fixed inset-0 z-[60] bg-ink/30 backdrop-blur-sm"
          />
          <motion.aside
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 280 }}
            className="fixed right-0 top-0 z-[70] flex h-full w-full max-w-sm flex-col bg-cream shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-pink-100 p-5">
              <h2 className="font-display text-xl">Корзина</h2>
              <button onClick={closeCart} className="rounded-full p-2 hover:bg-pink-50">
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              {items.length === 0 ? (
                <p className="mt-10 text-center text-sm text-ink/50">Корзина пуста</p>
              ) : (
                <ul className="space-y-4">
                  {items.map((item) => (
                    <li key={item.id} className="flex gap-3">
                      <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-white">
                        <Image src={item.image} alt={item.name} fill className="object-cover" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium line-clamp-1">{item.name}</p>
                        <p className="text-sm text-pink-600 font-semibold">{formatPrice(item.price)}</p>
                        <div className="mt-2 flex items-center gap-2">
                          <button
                            onClick={() => updateQuantity(item.id, item.quantity - 1)}
                            className="rounded-full border border-ink/15 p-1 hover:border-pink-400"
                          >
                            <Minus size={14} />
                          </button>
                          <span className="w-6 text-center text-sm">{item.quantity}</span>
                          <button
                            onClick={() => updateQuantity(item.id, item.quantity + 1)}
                            className="rounded-full border border-ink/15 p-1 hover:border-pink-400"
                          >
                            <Plus size={14} />
                          </button>
                          <button
                            onClick={() => removeItem(item.id)}
                            className="ml-auto rounded-full p-1 text-ink/40 hover:text-pink-600"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {items.length > 0 && (
              <div className="border-t border-pink-100 p-5">
                <div className="mb-4 flex items-center justify-between text-sm">
                  <span className="text-ink/60">Итого</span>
                  <span className="text-lg font-semibold">{formatPrice(total())}</span>
                </div>
                <Link href="/checkout" onClick={closeCart}>
                  <Button className="w-full" size="lg">
                    Оформить заказ
                  </Button>
                </Link>
              </div>
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
