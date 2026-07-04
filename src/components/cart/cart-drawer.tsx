"use client";

import { AnimatePresence, motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { X, Minus, Plus, Trash2 } from "lucide-react";
import { useCartStore } from "@/store/cart-store";
import { useLangStore } from "@/store/lang-store";
import { formatPrice } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export function CartDrawer() {
  const { items, isOpen, closeCart, removeItem, updateQuantity, total } = useCartStore();
  const { t } = useLangStore();
  const currency = "UAH";

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeCart}
            className="fixed inset-0 z-[60] bg-ink/30 backdrop-blur-sm"
          />

          {/* Drawer */}
          <motion.aside
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 280 }}
            className="fixed right-0 top-0 z-[70] flex h-full w-full max-w-sm flex-col bg-cream shadow-2xl"
          >
            {/* Шапка */}
            <div className="flex items-center justify-between border-b border-pink-100 p-5">
              <h2 className="font-display text-xl">{t.cart.title}</h2>
              <button
                onClick={closeCart}
                className="rounded-full p-2 hover:bg-pink-50 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Список товаров */}
            <div className="flex-1 overflow-y-auto p-5">
              {items.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full py-16 text-center">
                  <span className="text-5xl mb-4">🛒</span>
                  <p className="text-sm text-ink/50">{t.cart.empty}</p>
                </div>
              ) : (
                <ul className="space-y-4">
                  {items.map((item) => (
                    <motion.li
                      key={item.id}
                      layout
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      className="flex gap-3"
                    >
                      <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-white shadow-soft">
                        <Image
                          src={item.image}
                          alt={item.name}
                          fill
                          className="object-cover"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium line-clamp-2 leading-snug">{item.name}</p>
                        {item.options && (
                          <p className="mt-0.5 text-xs text-ink/40">
                            {Object.entries(item.options).map(([k, v]) => `${k}: ${v}`).join(", ")}
                          </p>
                        )}
                        <p className="mt-1 text-sm font-semibold text-pink-600">
                          {formatPrice(item.price, currency)}
                        </p>
                        <div className="mt-2 flex items-center gap-2">
                          <div className="flex items-center gap-2 rounded-full border border-ink/10 px-2 py-0.5">
                            <button
                              onClick={() => updateQuantity(item.id, item.quantity - 1)}
                              disabled={item.quantity <= 1}
                              className="rounded-full p-0.5 transition-colors hover:bg-pink-50 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              <Minus size={13} />
                            </button>
                            <span className="w-5 text-center text-sm tabular-nums">{item.quantity}</span>
                            <button
                              onClick={() => updateQuantity(item.id, item.quantity + 1)}
                              className="rounded-full p-0.5 hover:bg-pink-50 transition-colors"
                            >
                              <Plus size={13} />
                            </button>
                          </div>
                          <button
                            onClick={() => removeItem(item.id)}
                            className="ml-auto rounded-full p-1.5 text-ink/30 hover:text-pink-600 hover:bg-pink-50 transition-colors"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                    </motion.li>
                  ))}
                </ul>
              )}
            </div>

            {/* Итого + кнопка */}
            {items.length > 0 && (
              <div className="border-t border-pink-100 p-5 space-y-3">
                <div className="flex items-center justify-between text-sm text-ink/60">
                  <span>{t.cart.subtotal}</span>
                  <span>{formatPrice(total(), currency)}</span>
                </div>
                <div className="flex items-center justify-between font-semibold text-base">
                  <span>{t.cart.total}</span>
                  <span className="text-pink-600">{formatPrice(total(), currency)}</span>
                </div>
                <Link href="/checkout" onClick={closeCart}>
                  <Button className="w-full mt-1" size="lg">
                    {t.cart.checkout}
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
