"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { ShoppingBag } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatPrice } from "@/lib/utils";
import { useCartStore } from "@/store/cart-store";
import { useLangStore } from "@/store/lang-store";
import { toast } from "sonner";

type Props = {
  id: string;
  slug: string;
  name: string;
  price: number;
  oldPrice?: number | null;
  image: string;
  isNew?: boolean;
};

export function ProductCard({ id, slug, name, price, oldPrice, image, isNew }: Props) {
  const addItem  = useCartStore((s) => s.addItem);
  const { t, locale } = useLangStore();
  const currency = locale === "ua" ? "UAH" : "USD";

  const handleQuickAdd = (e: React.MouseEvent) => {
    e.preventDefault();
    addItem({ id, productId: id, name, slug, price, image, quantity: 1 });
    toast.success(`${name} ${t.cart.addedToCart}`);
  };

  return (
    <motion.div variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } }}>
      <Link href={`/product/${slug}`} className="group block">
        <div className="relative aspect-[4/5] overflow-hidden rounded-xl2 bg-white shadow-soft">
          <Image
            src={image}
            alt={name}
            fill
            sizes="(max-width: 768px) 50vw, 25vw"
            className="object-cover transition-transform duration-500 group-hover:scale-110"
          />
          {isNew && (
            <Badge className="absolute left-3 top-3">{t.common.new}</Badge>
          )}
          {oldPrice && (
            <span className="absolute right-3 top-3 rounded-full bg-ink px-3 py-1 text-[11px] font-semibold text-white">
              -{Math.round(100 - (price / oldPrice) * 100)}%
            </span>
          )}

          {/* Кнопка "В корзину" появляется при hover */}
          <div className="absolute inset-x-3 bottom-3 translate-y-14 opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100">
            <button
              onClick={handleQuickAdd}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-ink/90 py-2.5 text-sm font-medium text-white backdrop-blur"
            >
              <ShoppingBag size={15} />
              {t.product.addToCart}
            </button>
          </div>
        </div>

        <div className="mt-3 px-1">
          <h3 className="text-sm font-medium text-ink line-clamp-2 leading-snug">{name}</h3>
          <div className="mt-1.5 flex items-center gap-2">
            <span className="text-base font-semibold text-pink-600">
              {formatPrice(price, currency)}
            </span>
            {oldPrice && (
              <span className="text-sm text-ink/40 line-through">
                {formatPrice(oldPrice, currency)}
              </span>
            )}
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
