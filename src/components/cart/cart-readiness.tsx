"use client";

import { useEffect } from "react";
import Link from "next/link";
import { refreshAccountCart, useCartStore } from "@/store/cart-store";
import { CART_AUTH_KEY } from "@/lib/customer/guest-cart";
import { useLangStore } from "@/store/lang-store";
import { cartTotalMinor } from "@/lib/cart-limits";
import { formatPrice } from "@/lib/utils";

export function CartSyncStatus() {
  const { accountScope, syncStatus, syncProblem } = useCartStore();
  const { t } = useLangStore();
  if (syncStatus === "loading") return <p role="status" className="my-3 text-sm text-ink/70">{t.cart.sync.loading}</p>;
  if (!syncProblem) return null;
  const retry = () => {
    if (accountScope) void refreshAccountCart(true);
    else window.dispatchEvent(new Event(CART_AUTH_KEY));
  };
  return <div role="status" className="my-3 space-y-2 text-sm text-ink/70">
    <p>{t.cart.sync[syncProblem]}</p>
    {syncProblem === "pending" ? <Link href="/account/sign-in" className="underline">{t.account.signIn}</Link> :
      <button type="button" className="min-h-11 underline" onClick={retry}>{t.cart.reconciliation.retry}</button>}
  </div>;
}

export function CartReadiness() {
  const { t, locale } = useLangStore();
  const { items, checkoutRevision, verification, issues, priceChanges, verifyCart, reviewPrices, migrationError, persistenceError, retryPersistence, accountScope } = useCartStore();
  useEffect(() => { if (accountScope === null) void verifyCart(locale, true); }, [accountScope, checkoutRevision, locale, verifyCart]);
  if (migrationError || persistenceError) return <div role="alert" className="my-3 space-y-2 text-sm text-red-700"><p>{migrationError ? t.variantConfig.migrationError : t.variantConfig.storageError}</p><button type="button" className="min-h-11 underline" onClick={retryPersistence}>{t.variantConfig.retry}</button></div>;
  if (!items.length) return <CartSyncStatus />;
  const text = t.cart.reconciliation;
  return <div role="status" aria-live="polite" className="my-3 space-y-2 text-sm text-ink/70">
    <CartSyncStatus />
    {(verification === "idle" || verification === "loading") && <p>{text.checking}</p>}
    {verification === "error" && accountScope === null && <><p>{text.failed}</p><button type="button" className="underline" onClick={() => void verifyCart(locale, true)}>{text.retry}</button></>}
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
