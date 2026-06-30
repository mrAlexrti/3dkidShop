"use client";

import Image from "next/image";
import Link from "next/link";
import { Minus, Plus, Trash2, ShoppingBag } from "lucide-react";
import { useCartStore } from "@/store/cart-store";
import { formatPrice } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";

export default function CartPage() {
  const { items, removeItem, updateQuantity, total } = useCartStore();

  if (items.length === 0) {
    return (
      <div className="container-shop flex flex-col items-center py-32 text-center">
        <ShoppingBag size={48} className="text-pink-300" />
        <h1 className="mt-6 font-display text-3xl">Корзина пуста</h1>
        <p className="mt-2 text-ink/60">Самое время найти что-нибудь яркое</p>
        <Link href="/catalog" className="mt-6">
          <Button size="lg">В каталог</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="container-shop py-10">
      <h1 className="font-display text-3xl">Корзина</h1>

      <div className="mt-8 grid gap-10 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          {items.map((item) => (
            <motion.div
              key={item.id}
              layout
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass flex gap-4 rounded-xl2 p-4 shadow-soft"
            >
              <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-lg bg-white">
                <Image src={item.image} alt={item.name} fill className="object-cover" />
              </div>
              <div className="flex flex-1 flex-col justify-between">
                <div>
                  <Link href={`/product/${item.slug}`} className="font-medium hover:text-pink-600">
                    {item.name}
                  </Link>
                  {item.options && (
                    <p className="text-xs text-ink/50">
                      {Object.entries(item.options).map(([k, v]) => `${k}: ${v}`).join(", ")}
                    </p>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 rounded-full border border-ink/15 px-3 py-1">
                    <button onClick={() => updateQuantity(item.id, item.quantity - 1)}>
                      <Minus size={14} />
                    </button>
                    <span className="w-5 text-center text-sm">{item.quantity}</span>
                    <button onClick={() => updateQuantity(item.id, item.quantity + 1)}>
                      <Plus size={14} />
                    </button>
                  </div>
                  <span className="font-semibold text-pink-600">{formatPrice(item.price * item.quantity)}</span>
                </div>
              </div>
              <button onClick={() => removeItem(item.id)} className="self-start text-ink/30 hover:text-pink-600">
                <Trash2 size={18} />
              </button>
            </motion.div>
          ))}
        </div>

        <div className="glass h-fit rounded-xl2 p-6 shadow-soft">
          <h2 className="font-display text-xl">Итого</h2>
          <div className="mt-4 flex justify-between text-sm text-ink/60">
            <span>Товары</span>
            <span>{formatPrice(total())}</span>
          </div>
          <div className="mt-2 flex justify-between text-sm text-ink/60">
            <span>Доставка</span>
            <span>{total() >= 30 ? "Бесплатно" : formatPrice(4.5)}</span>
          </div>
          <div className="mt-4 flex justify-between border-t border-pink-100 pt-4 text-lg font-semibold">
            <span>К оплате</span>
            <span>{formatPrice(total() >= 30 ? total() : total() + 4.5)}</span>
          </div>
          <Link href="/checkout">
            <Button size="lg" className="mt-6 w-full">
              Перейти к оформлению
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
