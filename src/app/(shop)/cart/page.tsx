"use client";

import Image from "next/image";
import Link from "next/link";
import { Minus, Plus, Trash2, ShoppingBag } from "lucide-react";
import { useCartStore } from "@/store/cart-store";
import { useLangStore } from "@/store/lang-store";
import { formatPrice } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";

export default function CartPage() {
  const { items, removeItem, updateQuantity, total } = useCartStore();
  const { t, locale } = useLangStore();
  const currency = locale === "ua" ? "UAH" : "USD";

  if (items.length === 0) {
    return (
      <div className="container-shop flex flex-col items-center py-32 text-center">
        <ShoppingBag size={52} className="text-pink-200" />
        <h1 className="mt-6 font-display text-3xl">{t.cart.empty}</h1>
        <p className="mt-2 text-ink/60">{t.cart.emptyDesc}</p>
        <Link href="/catalog" className="mt-6">
          <Button size="lg">{t.cart.toCatalog}</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="container-shop py-10">
      <h1 className="font-display text-3xl">{t.cart.title}</h1>

      <div className="mt-8 grid gap-10 lg:grid-cols-3">
        {/* Товары */}
        <ul className="lg:col-span-2 space-y-4">
          <AnimatePresence>
            {items.map((item) => (
              <motion.li
                key={item.id}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0, marginTop: 0 }}
                className="glass flex gap-4 rounded-xl2 p-4 shadow-soft"
              >
                <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-lg bg-white">
                  <Image src={item.image} alt={item.name} fill className="object-cover" />
                </div>
                <div className="flex flex-1 flex-col justify-between min-w-0">
                  <div>
                    <Link
                      href={`/product/${item.slug}`}
                      className="font-medium hover:text-pink-600 transition-colors line-clamp-2 leading-snug"
                    >
                      {item.name}
                    </Link>
                    {item.options && (
                      <p className="text-xs text-ink/40 mt-0.5">
                        {Object.entries(item.options).map(([k, v]) => `${k}: ${v}`).join(", ")}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 rounded-full border border-ink/10 px-3 py-1">
                      <button onClick={() => updateQuantity(item.id, item.quantity - 1)}>
                        <Minus size={14} />
                      </button>
                      <span className="w-5 text-center text-sm tabular-nums">{item.quantity}</span>
                      <button onClick={() => updateQuantity(item.id, item.quantity + 1)}>
                        <Plus size={14} />
                      </button>
                    </div>
                    <span className="font-semibold text-pink-600">
                      {formatPrice(item.price * item.quantity, currency)}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => removeItem(item.id)}
                  className="self-start rounded-full p-1.5 text-ink/30 hover:text-pink-600 hover:bg-pink-50 transition-colors"
                >
                  <Trash2 size={17} />
                </button>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>

        {/* Итог */}
        <div className="glass h-fit rounded-xl2 p-6 shadow-soft">
          <h2 className="font-display text-xl mb-4">{t.cart.total}</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between text-ink/60">
              <span>{t.cart.subtotal}</span>
              <span>{formatPrice(total(), currency)}</span>
            </div>
            <div className="flex justify-between text-ink/60">
              <span>{t.cart.shipping}</span>
              <span className="text-green-600">{t.cart.freeShip}</span>
            </div>
          </div>
          <div className="mt-4 flex justify-between border-t border-pink-100 pt-4 text-lg font-semibold">
            <span>{t.cart.total}</span>
            <span className="text-pink-600">{formatPrice(total(), currency)}</span>
          </div>
          <Link href="/checkout">
            <Button size="lg" className="mt-5 w-full">
              {t.cart.checkout}
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
