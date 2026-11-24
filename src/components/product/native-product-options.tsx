"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { lookupCartProducts } from "@/lib/actions/reconcile-cart";
import { reconcileCart } from "@/lib/cart-reconciliation";
import { Minus, Plus, ShoppingBag } from "lucide-react";
import { useCartStore } from "@/store/cart-store";
import { useLangStore } from "@/store/lang-store";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/utils";
import { productLineId, sizeLabel } from "@/lib/product-variants";
import { cartAfterAddition, requestedSizeId } from "@/lib/cart-items";
import { cartTotalMinor } from "@/lib/cart-limits";
import { needsColor, needsSize, usableCombination, type ProductConfiguration, type OptionValue } from "@/lib/product-configuration";
import type { CartItem } from "@/types";
import { useProductSelection } from "./product-selection";

export function NativeProductOptions({ productId, name, slug, image, isOrderable, configuration: config }: {
  productId: string; name: string; slug: string; image: string; isOrderable: boolean; configuration: ProductConfiguration;
}) {
  const selection = useProductSelection();
  const router = useRouter();
  const submitting = useRef(false);
  const [pending, startTransition] = useTransition();
  const [localColor, setLocalColor] = useState("");
  const color = selection?.color ?? localColor, setColor = selection?.setColor ?? setLocalColor;
  const [size, setSize] = useState(""); const [quantity, setQuantity] = useState(1); const [notice, setNotice] = useState(false);
  const items = useCartStore((s) => s.items), addItem = useCartStore((s) => s.addItem);
  const { t, locale } = useLangStore(); const text = t.variantConfig;
  const available = config.combinations.filter((row) => usableCombination(config, row));
  const complete = (!needsColor(config.mode) || Boolean(color)) && (!needsSize(config.mode) || Boolean(size));
  const row = complete ? available.find((v) => (v.values.COLOR ?? "") === color && (v.values.SIZE ?? "") === size) : undefined;
  const matching = available.filter((v) => (!color || v.values.COLOR === color) && (!size || v.values.SIZE === size));
  const price = row ? Number(row.price) : complete ? null : matching.length ? Math.min(...matching.map((v) => Number(v.price))) : null;
  const value = (id: string) => config.values.find((v) => v.id === id);
  const colorValue = value(color), sizeValue = value(size);
  function candidate(count: number): CartItem {
    const base = { productId, name, slug, image: selection ? selection.images[0]?.url ?? "/images/placeholder.svg" : image, quantity: count, price: price ?? 0 };
    if (needsColor(config.mode) && row && colorValue) return { ...base, id: `${productId}:variant:${row.id}`, selection: { version: 2, variantId: row.id, values: { COLOR: color, ...(size ? { SIZE: size } : {}) } },
      selectionLabels: { COLOR: { labelUa: colorValue.labelUa, labelEn: colorValue.labelEn }, ...(sizeValue ? { SIZE: { labelUa: sizeValue.labelUa, labelEn: sizeValue.labelEn } } : {}) } };
    return { ...base, id: productLineId(productId, size || undefined), ...(sizeValue ? { variant: { id: sizeValue.id, labelUa: sizeValue.labelUa, labelEn: sizeValue.labelEn } } : {}) };
  }
  const within = (count: number) => price !== null && cartAfterAddition(items, candidate(count)) !== null;
  function addSelection() {
    if (submitting.current || !isOrderable || !row || !within(quantity)) return;
    const item = candidate(quantity);
    submitting.current = true;
    startTransition(async () => {
      try {
        const products = await lookupCartProducts({ version: 2, lines: [{
          productId, selection: item.selection, sizeId: requestedSizeId(item),
        }] });
        const verified = reconcileCart([item], products, locale);
        if (verified.issues[item.id] || verified.changed.length) {
          toast.error(verified.issues[item.id] ? t.product.unavailable : t.checkout.errors.priceChanged);
          router.refresh();
          return;
        }
        if (!addItem(item)) toast.error(t.cart.reconciliation.limit);
      } catch { toast.error(t.cart.reconciliation.failed); }
      finally { submitting.current = false; }
    });
  }
  const label = (v: OptionValue) => v.kind === "SIZE" ? sizeLabel(v, locale) : locale === "en" ? v.labelEn?.trim() || v.labelUa : v.labelUa;
  const total = price === null ? null : cartTotalMinor([{ price, quantity }]);
  return <div className="sf-product-options mt-6 space-y-5">
    {(["COLOR", "SIZE"] as const).filter((kind) => kind === "COLOR" ? needsColor(config.mode) : needsSize(config.mode)).map((kind) => <fieldset key={kind} className="space-y-3">
      <legend className="mb-2 text-sm">{kind === "COLOR" ? text.color : text.size}</legend>
      <div className="flex flex-wrap gap-2">{config.values.filter((v) => v.kind === kind && !v.retired && config.combinations.some((r) => !r.retired && r.values[kind] === v.id)).map((v) => {
        const enabled = available.some((r) => r.values[kind] === v.id && (kind === "COLOR" || !color || r.values.COLOR === color));
        return <button key={v.id} type="button" disabled={!enabled} aria-pressed={(kind === "COLOR" ? color : size) === v.id}
          onClick={() => { if (kind === "COLOR") { setColor(v.id); if (size && !available.some((r) => r.values.COLOR === v.id && r.values.SIZE === size)) { setSize(""); setNotice(true); } } else { setSize(v.id); setNotice(false); } }}
          className={`min-h-11 max-w-full break-words rounded-full border px-4 py-2 text-sm disabled:opacity-40 ${(kind === "COLOR" ? color : size) === v.id ? "border-pink-500 bg-pink-500 text-white" : "border-ink/15"}`}>{label(v)}</button>;
      })}</div>
    </fieldset>)}
    {notice && <p role="status" className="text-sm">{text.cleared}</p>}
    {[colorValue, sizeValue].flatMap((v) => v ? [locale === "en" ? v.noteEn || v.noteUa : v.noteUa] : []).filter(Boolean).map((note, i) => <p key={i} className="text-sm text-ink/60">{note}</p>)}
    <div className="flex flex-wrap items-center gap-4"><div className="sf-quantity-control flex items-center gap-3 rounded-full border border-ink/15 px-4 py-2">
      <button type="button" aria-label={t.cart.decrease} disabled={quantity <= 1} onClick={() => setQuantity((q) => Math.max(1, q - 1))}><Minus size={16} /></button>
      <span className="w-6 text-center tabular-nums">{quantity}</span>
      <button type="button" aria-label={t.cart.increase} disabled={!within(quantity + 1)} onClick={() => { if (within(quantity + 1)) setQuantity((q) => q + 1); }}><Plus size={16} /></button>
    </div><p className="text-2xl text-pink-600" aria-live="polite" aria-atomic="true">{!complete && price !== null && <span className="mr-2 text-sm">{t.product.from}</span>}{price === null ? t.product.unavailable : total === null ? "—" : formatPrice(total / 100, "UAH")}</p></div>
    {!available.length && <p role="status" className="text-sm">{text.empty}</p>}
    {price !== null && !within(quantity) && <p role="status">{t.cart.reconciliation.limit}</p>}
    <Button type="button" size="lg" className="w-full text-base" disabled={pending || !isOrderable || !row || !within(quantity)} onClick={addSelection}><ShoppingBag size={18} />{!isOrderable ? t.product.unavailable : !complete ? text.choose : t.product.addToCart}</Button>
  </div>;
}
