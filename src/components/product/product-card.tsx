"use client";

import { ProductImage as Image } from "@/components/product/product-image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Pause, Play, ShoppingBag } from "lucide-react";
import { formatPrice } from "@/lib/utils";
import { useCartStore } from "@/store/cart-store";
import { useLangStore } from "@/store/lang-store";
import { toast } from "sonner";
import { getProductName } from "@/lib/product-content";
import { useRef, useState, useSyncExternalStore } from "react";
import { httpMediaUrl } from "@/lib/product-media";
import { cartAfterAddition } from "@/lib/cart-items";
import { MAX_PRODUCT_IMAGES, photoPosition, swipeDirection, type ProductPhoto } from "@/lib/gallery";
import { useMobileCardAnimation } from "./use-mobile-card-animation";
import { FavoriteButton } from "./favorite-button";

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
  price: number | null;
  oldPrice?: number | null;
  image: string;
  images?: ProductPhoto[];
  hoverGifUrl?: string | null;
  isNew?: boolean;
  hasOptions?: boolean;
  hasColorOptions?: boolean;
  isOrderable: boolean;
};

export function ProductCard({ id, slug, name, nameEn, price, oldPrice, image, images, hoverGifUrl, isNew, hasOptions = false, hasColorOptions = false, isOrderable }: Props) {
  const router = useRouter();
  const addItem  = useCartStore((s) => s.addItem);
  const items = useCartStore((s) => s.items);
  const { locale, t } = useLangStore();
  const localizedName = getProductName({ name, nameEn }, locale);
  const currency = "UAH";
  const candidate = { id, productId: id, name: localizedName, slug, price: price ?? 0, image, quantity: 1 };
  const atLimit = !hasOptions && cartAfterAddition(items, candidate) === null;
  const animationAllowed = useSyncExternalStore(subscribeAnimationPreference, canAnimate, staticOnServer);
  const [pointed, setPointed] = useState(false);
  const [focused, setFocused] = useState(false);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const [index, setIndex] = useState(0); const [browsing, setBrowsing] = useState(false);
  const visual = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);
  const touch = useRef<{ x: number; y: number } | null>(null); const suppressClickUntil = useRef(0);
  const photos = images?.length ? images.slice(0, MAX_PRODUCT_IMAGES) : [{ id: "main", url: image }];
  const active = index % photos.length; const text = t.product.gallery;
  function changePhoto(direction: number) { setIndex((current) => (current + direction + photos.length) % photos.length); setBrowsing(true); }
  const parsedGif = httpMediaUrl.safeParse(hoverGifUrl);
  const gifUrl = parsedGif.success ? parsedGif.data : null;
  const mobileAnimation = useMobileCardAnimation(visual, Boolean(gifUrl && failedUrl !== gifUrl));
  const showGif = active === 0 && ((animationAllowed && !browsing && (pointed || focused)) || (mobileAnimation && !paused)) && gifUrl && failedUrl !== gifUrl;
  const interaction = {
    onPointerEnter: (event: React.PointerEvent<HTMLElement>) => setPointed(event.pointerType === "mouse"),
    onPointerLeave: () => { setPointed(false); setBrowsing(false); },
    onFocusCapture: (event: React.FocusEvent<HTMLElement>) => setFocused(event.target.matches(":focus-visible")),
    onBlurCapture: (event: React.FocusEvent<HTMLElement>) => {
      if (!event.currentTarget.contains(event.relatedTarget)) { setFocused(false); setBrowsing(false); }
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
    if (!isOrderable) {
      toast.error(t.product.unavailable);
      return;
    }
    if (hasOptions) {
      toast.message((hasColorOptions ? t.variantConfig.choose : t.product.chooseSize));
      router.push(`/product/${slug}`);
      return;
    }
    if (!addItem(candidate)) toast.error(t.cart.reconciliation.limit);
  };

  const arrowTarget = "absolute top-1/2 z-10 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-pink-700";
  const controlFace = "grid h-6 w-6 place-items-center rounded-full bg-white/95 text-ink shadow-soft sm:h-8 sm:w-8";

  return (
    <article className="sf-product-card" {...interaction}>
      <div ref={visual} className="sf-product-visual">
      <Link className="absolute inset-0 block" href={`/product/${slug}`} aria-label={localizedName} draggable={false} style={{ touchAction: "pan-y pinch-zoom" }}
        onPointerDown={(event) => {
          suppressClickUntil.current = 0;
          if (event.pointerType === "touch" || event.pointerType === "pen") touch.current = { x: event.clientX, y: event.clientY };
        }}
        onPointerCancel={() => { touch.current = null; }}
        onPointerUp={(event) => {
          const start = touch.current; touch.current = null; if (!start) return;
          const direction = swipeDirection(event.clientX - start.x, event.clientY - start.y);
          if (direction) {
            event.preventDefault();
            if (photos.length > 1) changePhoto(direction);
            suppressClickUntil.current = Date.now() + 500;
          }
        }} onClick={(event) => { if (event.detail !== 0 && Date.now() < suppressClickUntil.current) { event.preventDefault(); event.stopPropagation(); } }}>
        <Image src={photos[active].url} alt={photos[active].alt || localizedName} draggable={false} fill sizes="(max-width: 680px) 44vw, (max-width: 980px) 42vw, 260px" className="object-cover" />
        {animatedOverlay}
        {isNew && <span className="absolute left-2 top-2 rounded-full bg-pink-700 px-3 py-1 text-xs font-semibold text-white">{t.common.new}</span>}
      </Link>
      <FavoriteButton productId={id} productName={localizedName} className="absolute right-1 top-1 z-10" />
      {mobileAnimation && active === 0 && gifUrl !== failedUrl && <button
        type="button" className="absolute bottom-1 right-1 z-10 grid h-11 w-11 place-items-center rounded-full focus-visible:outline focus-visible:outline-pink-700"
        aria-label={`${paused ? text.playAnimation : text.pauseAnimation}: ${localizedName}`} onClick={() => setPaused((value) => !value)}>
        <span className={controlFace}>{paused ? <Play size={14} aria-hidden="true" /> : <Pause size={14} aria-hidden="true" />}</span>
      </button>}
      {photos.length > 1 && <>
        <button type="button" className={`${arrowTarget} left-0`} aria-label={`${text.previous}: ${localizedName}`}
          onClick={(event) => { event.preventDefault(); event.stopPropagation(); changePhoto(-1); }}><span className={controlFace}><ChevronLeft size={16} aria-hidden="true" /></span></button>
        <button type="button" className={`${arrowTarget} right-0`} aria-label={`${text.next}: ${localizedName}`}
          onClick={(event) => { event.preventDefault(); event.stopPropagation(); changePhoto(1); }}><span className={controlFace}><ChevronRight size={16} aria-hidden="true" /></span></button>
        <span className="sr-only" aria-live="polite">{photoPosition(text.position, active, photos.length)}</span>
      </>}
      </div>
      <div className="sf-product-body">
        <h3><Link href={`/product/${slug}`}>{localizedName}</Link></h3>
        {!isOrderable && <p className="mt-2 text-xs text-ink/60">{t.product.unavailable}</p>}
        {isOrderable && atLimit && <p className="mt-2 text-xs text-ink/60">{t.cart.reconciliation.limit}</p>}
        <div className="sf-product-bottom">
          <div className="sf-product-price">
            <span>{hasOptions && price !== null && `${t.product.from} `}{price === null ? "—" : formatPrice(price, currency)}</span>
            {oldPrice && <del>{formatPrice(oldPrice, currency)}</del>}
          </div>
          <button type="button" className="sf-product-add disabled:opacity-50" disabled={!isOrderable || atLimit} onClick={handleQuickAdd} aria-label={`${!isOrderable ? t.product.unavailable : atLimit ? t.cart.reconciliation.limit : hasOptions ? (hasColorOptions ? t.variantConfig.choose : t.product.chooseSize) : t.product.addToCart}: ${localizedName}`} aria-disabled={!isOrderable || atLimit}>
            <ShoppingBag size={20} aria-hidden="true" />
          </button>
        </div>
      </div>
    </article>
  );
}
