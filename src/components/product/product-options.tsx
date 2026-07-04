"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Minus, Plus, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/utils";
import { useCartStore } from "@/store/cart-store";
import { useLangStore } from "@/store/lang-store";

type OptionValue = { id: string; value: string; priceModifier: number };
type Option      = { id: string; name: string; values: OptionValue[] };

export function ProductOptions({
  productId, name, slug, basePrice, image, stock, options,
}: {
  productId: string;
  name:      string;
  slug:      string;
  basePrice: number;
  image:     string;
  stock:     number;
  options:   Option[];
}) {
  const [selected, setSelected] = useState<Record<string, OptionValue>>(() =>
    Object.fromEntries(options.map((o) => [o.name, o.values[0]]))
  );
  const [quantity, setQuantity] = useState(1);
  const addItem  = useCartStore((s) => s.addItem);
  const openCart = useCartStore((s) => s.openCart);
  const { t } = useLangStore();
  const currency = "UAH";

  const finalPrice = useMemo(() => {
    const mod = Object.values(selected).reduce((s, v) => s + (v?.priceModifier ?? 0), 0);
    return basePrice + mod;
  }, [selected, basePrice]);

  const cartLineId = useMemo(() => {
    const key = Object.values(selected).map((v) => v?.id).join("-");
    return `${productId}-${key}`;
  }, [productId, selected]);

  function handleAddToCart() {
    if (stock <= 0) {
      toast.error("Товару немає в наявності");
      return;
    }
    addItem({
      id:        cartLineId,
      productId,
      name,
      slug,
      price:     finalPrice,
      image,
      quantity,
      options:   Object.fromEntries(Object.entries(selected).map(([k, v]) => [k, v.value])),
    });
    toast.success(`${name} ${t.cart.addedToCart} 🎉`);
    openCart();
  }

  return (
    <div className="mt-6 space-y-6">
      {/* Опции (размер, цвет и т.п.) */}
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

      {/* Количество + цена */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-3 rounded-full border border-ink/15 px-4 py-2">
          <button
            onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            className="transition-colors hover:text-pink-600"
          >
            <Minus size={16} />
          </button>
          <span className="w-6 text-center font-medium tabular-nums">{quantity}</span>
          <button
            onClick={() => setQuantity((q) => Math.min(stock, q + 1))}
            disabled={quantity >= stock}
            className="transition-colors hover:text-pink-600"
          >
            <Plus size={16} />
          </button>
        </div>
        <span className="text-2xl font-semibold text-pink-600">
          {formatPrice(finalPrice * quantity, currency)}
        </span>
      </div>

      <Button size="lg" className="w-full text-base" onClick={handleAddToCart} disabled={stock <= 0}>
        <ShoppingBag size={18} />
        {stock > 0 ? t.product.addToCart : "Немає в наявності"}
      </Button>
    </div>
  );
}
