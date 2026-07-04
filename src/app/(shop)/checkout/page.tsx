"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { CheckoutForm } from "@/components/checkout/checkout-form";
import { Button } from "@/components/ui/button";
import { useCartStore } from "@/store/cart-store";
import { useLangStore } from "@/store/lang-store";
import { formatPrice } from "@/lib/utils";

export default function CheckoutPage() {
  const { items, total } = useCartStore();
  const { t } = useLangStore();
  const currency = "UAH";
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="container-shop py-20 text-center text-ink/40">
        {t.common.loading}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="container-shop flex flex-col items-center py-32 text-center">
        <h1 className="font-display text-3xl">{t.cart.empty}</h1>
        <p className="mt-2 text-ink/60">{t.cart.emptyDesc}</p>
        <Link href="/catalog" className="mt-6">
          <Button size="lg">{t.cart.toCatalog}</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="container-shop py-10">
      <h1 className="font-display text-3xl">{t.checkout.title}</h1>

      <div className="mt-8 grid gap-10 lg:grid-cols-3">
        {/* Форма */}
        <div className="lg:col-span-2">
          <CheckoutForm />
        </div>

        {/* Краткое summary заказа */}
        <aside className="h-fit">
          <div className="glass rounded-xl2 p-6 shadow-soft">
            <h2 className="mb-4 font-display text-lg">{t.checkout.yourOrder}</h2>
            <ul className="space-y-3">
              {items.map((item) => (
                <li key={item.id} className="flex items-center gap-3">
                  <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-white shadow-soft">
                    <Image
                      src={item.image}
                      alt={item.name}
                      fill
                      className="object-cover"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium line-clamp-2 leading-snug">{item.name}</p>
                    <p className="text-xs text-ink/40">× {item.quantity}</p>
                  </div>
                  <span className="text-sm font-semibold shrink-0">
                    {formatPrice(item.price * item.quantity, currency)}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-5 flex justify-between border-t border-pink-100 pt-4 font-semibold">
              <span>{t.cart.total}</span>
              <span className="text-pink-600">{formatPrice(total(), currency)}</span>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
