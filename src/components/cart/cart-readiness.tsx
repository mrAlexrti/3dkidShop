"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useCartStore } from "@/store/cart-store";
import { useLangStore } from "@/store/lang-store";
import { cartTotalMinor } from "@/lib/cart-limits";
import { formatPrice } from "@/lib/utils";

export function CartReadiness() {
  const { t, locale } = useLangStore();
  const { items, checkoutRevision, verification, issues, priceChanges, verifyCart, reviewPrices } = useCartStore();
  useEffect(() => { void verifyCart(locale, true); }, [checkoutRevision, locale, verifyCart]);
  if (!items.length) return null;
  const text = t.cart.reconciliation;
  return <div role="status" aria-live="polite" className="my-3 space-y-2 text-sm text-ink/70">
    {(verification === "idle" || verification === "loading") && <p>{text.checking}</p>}
    {verification === "error" && <><p>{text.failed}</p><button type="button" className="underline" onClick={() => void verifyCart(locale, true)}>{text.retry}</button></>}
    {Object.keys(issues).length > 0 && <p>{text.blocked} <Link className="underline" href="/cart">{t.cart.title}</Link></p>}
    {cartTotalMinor(items) === null && <p>{text.limit}</p>}
    {priceChanges.length > 0 && <><p>{text.priceChanged} {t.cart.total}: <CartAmount /></p>
      <button type="button" className="min-h-11 underline disabled:opacity-40" disabled={verification !== "verified"} onClick={reviewPrices}>{text.review}</button></>}
  </div>;
}

export function CartLineStatus({ id }: { id: string }) {
  const issue = useCartStore((state) => Object.hasOwn(state.issues, id) ? state.issues[id] : undefined);
  const { t } = useLangStore();
  return issue ? <p className="mt-1 text-sm text-red-700">{t.cart.reconciliation[issue]}</p> : null;
}

export function CartAmount({ id }: { id?: string }) {
  const { items, issues } = useCartStore();
  const lines = id ? items.filter((item) => item.id === id) : items.filter((item) => !Object.hasOwn(issues, item.id));
  const minor = cartTotalMinor(lines);
  return <>{(id && Object.hasOwn(issues, id)) || minor === null ? "—" : formatPrice(minor / 100, "UAH")}</>;
}
