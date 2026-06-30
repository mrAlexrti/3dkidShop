"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Minus, Plus, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/utils";
import { useCartStore } from "@/store/cart-store";

type OptionValue = { id: string; value: string; priceModifier: number };
type Option = { id: string; name: string; values: OptionValue[] };

export function ProductOptions({
  productId,
  name,
  slug,
  basePrice,
  image,
  options,
}: {
  productId: string;
  name: string;
  slug: string;
  basePrice: number;
  image: string;
  options: Option[];
}) {
  const [selected, setSelected] = useState<Record<string, OptionValue>>(() =>
    Object.fromEntries(options.map((o) => [o.name, o.values[0]]))
  );
  const [quantity, setQuantity] = useState(1);
  const addItem = useCartStore((s) => s.addItem);
  const openCart = useCartStore((s) => s.openCart);

  const finalPrice = useMemo(() => {
    const modifier = Object.values(selected).reduce((sum, v) => sum + (v?.priceModifier ?? 0), 0);
    return basePrice + modifier;
  }, [selected, basePrice]);

  const cartLineId = useMemo(() => {
    const optionsKey = Object.values(selected)
      .map((v) => v?.id)
      .join("-");
    return `${productId}-${optionsKey}`;
  }, [productId, selected]);

  function handleAddToCart() {
    addItem({
      id: cartLineId,
      productId,
      name,
      slug,
      price: finalPrice,
      image,
      quantity,
      options: Object.fromEntries(Object.entries(selected).map(([k, v]) => [k, v.value])),
    });
    toast.success(`${name} добавлен в корзину`);
    openCart();
  }

  return (
    <div className="mt-6 space-y-6">
      {options.map((option) => (
        <div key={option.id}>
          <h3 className="mb-2 text-sm font-semibold">{option.name}</h3>
          <div className="flex flex-wrap gap-2">
            {option.values.map((value) => (
              <button
                key={value.id}
                onClick={() => setSelected((s) => ({ ...s, [option.name]: value }))}
                className={`rounded-full border px-4 py-2 text-sm transition-colors ${
                  selected[option.name]?.id === value.id
                    ? "border-pink-500 bg-pink-500 text-white"
                    : "border-ink/15 hover:border-pink-400"
                }`}
              >
                {value.value}
              </button>
            ))}
          </div>
        </div>
      ))}

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-3 rounded-full border border-ink/15 px-3 py-2">
          <button onClick={() => setQuantity((q) => Math.max(1, q - 1))}>
            <Minus size={16} />
          </button>
          <span className="w-6 text-center text-sm">{quantity}</span>
          <button onClick={() => setQuantity((q) => q + 1)}>
            <Plus size={16} />
          </button>
        </div>
        <span className="text-2xl font-semibold text-pink-600">{formatPrice(finalPrice * quantity)}</span>
      </div>

      <Button size="lg" className="w-full" onClick={handleAddToCart}>
        <ShoppingBag size={18} /> Добавить в корзину
      </Button>
    </div>
  );
}
