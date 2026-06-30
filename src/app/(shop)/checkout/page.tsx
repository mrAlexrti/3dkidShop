"use client";

import Image from "next/image";
import { CheckoutForm } from "@/components/checkout/checkout-form";
import { useCartStore } from "@/store/cart-store";
import { formatPrice } from "@/lib/utils";

export default function CheckoutPage() {
  const { items, total } = useCartStore();

  return (
    <div className="container-shop py-10">
      <h1 className="font-display text-3xl">Оформление заказа</h1>

      <div className="mt-8 grid gap-10 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <CheckoutForm />
        </div>

        <aside className="glass h-fit rounded-xl2 p-6 shadow-soft">
          <h2 className="mb-4 font-display text-lg">Ваш заказ</h2>
          <ul className="space-y-3">
            {items.map((item) => (
              <li key={item.id} className="flex items-center gap-3">
                <div className="relative h-14 w-14 overflow-hidden rounded-lg bg-white">
                  <Image src={item.image} alt={item.name} fill className="object-cover" />
                </div>
                <div className="flex-1 text-sm">
                  <p className="line-clamp-1">{item.name}</p>
                  <p className="text-ink/50">x{item.quantity}</p>
                </div>
                <span className="text-sm font-semibold">{formatPrice(item.price * item.quantity)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex justify-between border-t border-pink-100 pt-4 text-lg font-semibold">
            <span>Итого</span>
            <span>{formatPrice(total() >= 30 ? total() : total() + 4.5)}</span>
          </div>
        </aside>
      </div>
    </div>
  );
}
