"use client";

import { useState } from "react";
import { Minus, Plus, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/utils";
import { useCartStore } from "@/store/cart-store";
import { useLangStore } from "@/store/lang-store";
import { productLineId, sizeLabel, type SizeVariant } from "@/lib/product-variants";

export function ProductOptions({ productId, name, slug, basePrice, image, isOrderable, variants }: {
  productId: string; name: string; slug: string; basePrice: number; image: string; isOrderable: boolean; variants: SizeVariant[];
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const addItem = useCartStore((state) => state.addItem);
  const { t, locale } = useLangStore();
  const selected = variants.find((variant) => variant.id === selectedId);
  const validPrices = variants.flatMap((variant) => variant.price == null ? [] : [variant.price]);
  const unitPrice = variants.length ? selected?.price ?? (validPrices.length ? Math.min(...validPrices) : null) : basePrice;
  const ready = isOrderable && (!variants.length || (selected != null && selected.price != null));
  function add() {
    if (!ready || unitPrice == null) return;
    addItem({ id: productLineId(productId, selected?.id), productId, name, slug, price: unitPrice, image, quantity,
      ...(selected ? { variant: { id: selected.id, labelUa: selected.labelUa, labelEn: selected.labelEn } } : {}) });
  }
  const note = selected && (locale === "en" ? selected.noteEn || selected.noteUa : selected.noteUa);
  return <div className="sf-product-options mt-6 space-y-5">
    {variants.length > 0 && <fieldset className="space-y-3" aria-describedby="size-selection-help">
      <legend className="mb-2 text-sm">{t.product.size}</legend>
      <div className="flex flex-wrap gap-2">
        {variants.map((variant) => <button key={variant.id} type="button" aria-pressed={selectedId === variant.id} disabled={variant.price == null}
          onClick={() => setSelectedId(variant.id)} className={`rounded-full border px-4 py-2 text-sm disabled:opacity-40 ${selectedId === variant.id ? "border-pink-500 bg-pink-500 text-white" : "border-ink/15 hover:border-pink-400"}`}>
          {sizeLabel(variant, locale)}
        </button>)}
      </div>
      <p id="size-selection-help" className="text-sm text-ink/60">{selected ? note : t.product.chooseSize}</p>
    </fieldset>}
    <div className="flex flex-wrap items-center gap-4">
      <div className="sf-quantity-control flex items-center gap-3 rounded-full border border-ink/15 px-4 py-2">
        <button type="button" aria-label={t.cart.decrease} disabled={quantity <= 1} onClick={() => setQuantity((value) => Math.max(1, value - 1))}><Minus size={16} /></button>
        <span className="w-6 text-center tabular-nums">{quantity}</span>
        <button type="button" aria-label={t.cart.increase} disabled={!Number.isSafeInteger(quantity + 1)} onClick={() => setQuantity((value) => value + 1)}><Plus size={16} /></button>
      </div>
      <p className="text-2xl text-pink-600" aria-live="polite" aria-atomic="true">
        {variants.length > 0 && !selected && unitPrice != null && <span className="mr-2 text-sm">{t.product.from}</span>}
        {unitPrice == null ? t.product.sizeUnavailable : formatPrice(unitPrice * quantity, "UAH")}
      </p>
    </div>
    <Button type="button" size="lg" className="w-full text-base" onClick={add} disabled={!ready}>
      <ShoppingBag size={18} />{!isOrderable ? t.product.unavailable : variants.length && !selected ? t.product.chooseSize : t.product.addToCart}
    </Button>
  </div>;
}
