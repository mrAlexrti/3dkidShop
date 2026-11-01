"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ShoppingBag } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatPrice } from "@/lib/utils";
import { useCartStore } from "@/store/cart-store";
import { useLangStore } from "@/store/lang-store";
import { toast } from "sonner";
import { getProductName } from "@/lib/product-content";
import { useState, useSyncExternalStore } from "react";
import { httpMediaUrl } from "@/lib/product-media";

const animationQuery = "(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)";
function subscribeAnimationPreference(callback: () => void) {
  const query = window.matchMedia(animationQuery);
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}
const canAnimate = () => window.matchMedia(animationQuery).matches;
const staticOnServer = () => false;

type Props = {
  id: string;
  slug: string;
  name: string;
  nameEn?: string | null;
  price: number;
  oldPrice?: number | null;
  image: string;
  hoverGifUrl?: string | null;
  isNew?: boolean;
  hasOptions?: boolean;
  stock?: number;
  presentation?: "default" | "home";
};

export function ProductCard({ id, slug, name, nameEn, price, oldPrice, image, hoverGifUrl, isNew, hasOptions = false, stock, presentation = "default" }: Props) {
  const router = useRouter();
  const addItem  = useCartStore((s) => s.addItem);
  const { locale, t } = useLangStore();
  const localizedName = getProductName({ name, nameEn }, locale);
  const currency = "UAH";
  const animationAllowed = useSyncExternalStore(subscribeAnimationPreference, canAnimate, staticOnServer);
  const [pointed, setPointed] = useState(false);
  const [focused, setFocused] = useState(false);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const parsedGif = httpMediaUrl.safeParse(hoverGifUrl);
  const gifUrl = parsedGif.success ? parsedGif.data : null;
  const showGif = animationAllowed && (pointed || focused) && gifUrl && failedUrl !== gifUrl;
  const interaction = {
    onPointerEnter: (event: React.PointerEvent<HTMLElement>) => setPointed(event.pointerType === "mouse"),
    onPointerLeave: () => setPointed(false),
    onFocusCapture: (event: React.FocusEvent<HTMLElement>) => setFocused(event.target.matches(":focus-visible")),
    onBlurCapture: (event: React.FocusEvent<HTMLElement>) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
    },
  };
  // The semantic static image stays mounted underneath; no GIF src exists before interaction.
  const animatedOverlay = showGif ? (
    <Image src={gifUrl} alt="" aria-hidden="true" fill unoptimized
      className={`pointer-events-none object-cover ${loadedUrl === gifUrl ? "opacity-100" : "opacity-0"}`}
      onLoad={() => setLoadedUrl(gifUrl)} onError={() => setFailedUrl(gifUrl)} />
  ) : null;

  const handleQuickAdd = (e: React.MouseEvent) => {
    e.preventDefault();
    if (stock !== undefined && stock <= 0) {
      toast.error(t.product.outOfStock);
      return;
    }
    if (hasOptions) {
      toast.message(t.product.chooseOptions);
      router.push(`/product/${slug}`);
      return;
    }
    addItem({ id, productId: id, name: localizedName, slug, price, image, quantity: 1 });
    toast.success(`${localizedName} ${t.cart.addedToCart}`);
  };

  if (presentation === "home") {
    return (
      <article className="sf-product-card" {...interaction}>
        <Link className="sf-product-visual" href={`/product/${slug}`} aria-label={localizedName}>
          <Image src={image} alt={localizedName} fill sizes="(max-width: 680px) 44vw, (max-width: 980px) 42vw, 260px" className="object-cover" />
          {animatedOverlay}
          {isNew && <span className="absolute left-2 top-2 rounded-full bg-pink-700 px-3 py-1 text-xs font-semibold text-white">{t.common.new}</span>}
        </Link>
        <div className="sf-product-body">
          <h3><Link href={`/product/${slug}`}>{localizedName}</Link></h3>
          <div className="sf-product-bottom">
            <div className="sf-product-price">
              <span>{formatPrice(price, currency)}</span>
              {oldPrice && <del>{formatPrice(oldPrice, currency)}</del>}
            </div>
            <button type="button" className="sf-product-add" onClick={handleQuickAdd} aria-label={`${t.product.addToCart}: ${localizedName}`}>
              <ShoppingBag size={20} aria-hidden="true" />
            </button>
          </div>
        </div>
      </article>
    );
  }

  return (
    <motion.div {...interaction} variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } }}>
      <Link href={`/product/${slug}`} className="group block">
        <div className="relative aspect-[4/5] overflow-hidden rounded-xl2 bg-white shadow-soft">
          <Image
            src={image}
            alt={localizedName}
            fill
            sizes="(max-width: 768px) 50vw, 25vw"
            className="object-cover transition-transform duration-500 group-hover:scale-110"
          />
          {animatedOverlay}
          {isNew && (
            <Badge className="absolute left-3 top-3">{t.common.new}</Badge>
          )}
          {oldPrice && (
            <span className="absolute right-3 top-3 rounded-full bg-ink px-3 py-1 text-[11px] font-semibold text-white">
              -{Math.round(100 - (price / oldPrice) * 100)}%
            </span>
          )}

          {/* Кнопка "В корзину" появляется при hover */}
          <div className="absolute inset-x-3 bottom-3 translate-y-14 opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100 [@media(hover:none)]:translate-y-0 [@media(hover:none)]:opacity-100">
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
          <h3 className="text-sm font-medium text-ink line-clamp-2 leading-snug">{localizedName}</h3>
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
