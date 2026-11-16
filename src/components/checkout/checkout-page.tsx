"use client";

import { ProductImage as Image } from "@/components/product/product-image";
import { CartReadiness, CartLineStatus, CartAmount } from "@/components/cart/cart-readiness";
import Link from "next/link";
import { useEffect, useState } from "react";
import { CheckoutForm } from "@/components/checkout/checkout-form";
import { Button } from "@/components/ui/button";
import { useCartStore } from "@/store/cart-store";
import { useLangStore } from "@/store/lang-store";
import { sizeLabel } from "@/lib/product-variants";
import { cartImageSource } from "@/lib/cart-reconciliation";

export function CheckoutPageContent({ onlineCardEnabled }: { onlineCardEnabled: boolean }) {
  const cart = useCartStore();
  const { items } = cart;
  const { t, locale } = useLangStore();
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  if (!mounted) return <div className="container-shop py-20 text-center text-ink/40">{t.common.loading}</div>;
  if (items.length === 0) return <div className="sf-checkout-page container-shop flex flex-col items-center py-32 text-center">
    <h1 className="font-display text-3xl">{t.cart.empty}</h1>
    <p className="mt-2 text-ink/60">{t.cart.emptyDesc}</p>
    <Link href="/catalog" className="mt-6"><Button size="lg">{t.cart.toCatalog}</Button></Link>
  </div>;

  return <div className="sf-checkout-page container-shop py-10">
    <h1 className="font-display text-3xl">{t.checkout.title}</h1>
    <CartReadiness />
    <div className="mt-8 grid gap-10 lg:grid-cols-3">
      <div className="lg:col-span-2"><CheckoutForm onlineCardEnabled={onlineCardEnabled} /></div>
      <aside className="h-fit">
        <div className="glass rounded-xl2 p-6 shadow-soft">
          <h2 className="mb-4 font-display text-lg">{t.checkout.yourOrder}</h2>
          <ul className="space-y-3">
            {items.map((item) => <li key={item.id} className="sf-checkout-item flex items-center gap-3">
              <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-white shadow-soft">
                <Image src={cartImageSource(item, cart)} alt={item.name} fill sizes="56px" className="object-cover" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-sm font-medium leading-snug">{item.name}</p>
                <CartLineStatus id={item.id} />
                {item.variant && <p className="text-xs text-ink/60">{`${t.product.size}: ${sizeLabel(item.variant, locale)}`}</p>}
                <p className="text-xs text-ink/40">× {item.quantity}</p>
              </div>
              <span className="shrink-0 text-sm font-semibold"><CartAmount id={item.id} /></span>
            </li>)}
          </ul>
          <div className="mt-5 flex justify-between border-t border-pink-100 pt-4 font-semibold">
            <span>{t.cart.total}</span><span className="text-pink-600"><CartAmount /></span>
          </div>
        </div>
      </aside>
    </div>
  </div>;
}
