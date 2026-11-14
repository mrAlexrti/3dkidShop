"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CheckCircle2, Clock3, CircleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLangStore } from "@/store/lang-store";
import type { PaymentResultState } from "@/lib/payments/payment-state";
import { formatOrderReference } from "@/lib/order-reference";
import { useCartStore } from "@/store/cart-store";
import { completeCheckoutCart } from "@/lib/payments/checkout-session";

export function OrderResult({ initialState, number: initialNumber, token, attempt = "" }: { initialState: PaymentResultState; number: string; token: string; attempt?: string }) {
  const { t, locale } = useLangStore();
  const [state, setState] = useState(initialState);
  const [number, setNumber] = useState(initialNumber);
  useEffect(() => {
    if (attempt) { const cart = useCartStore.getState(); completeCheckoutCart(attempt, state, cart.items, cart.clear, cart.checkoutRevision); }
  }, [attempt, state]);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (state !== "pending" && state !== "unknown") return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let attempts = 0;
    async function check() {
      attempts++;
      try {
        const response = await fetch(`/api/payments/status?${new URLSearchParams({ ...(attempt ? { attempt } : { order: number }), token })}`, { cache: "no-store", signal: controller.signal });
        const result = await response.json();
        if (controller.signal.aborted) return;
        if (typeof result.number === "string") setNumber(result.number);
        if (["confirmed", "paid", "failed", "cancelled", "expired", "review", "unavailable"].includes(result.state)) { setState(result.state); return; }
        if (result.state === "unknown") setState("unknown");
      } catch { /* Network failure is not payment failure. Keep the pending state. */ }
      if (!controller.signal.aborted && attempts < 10) timer = setTimeout(check, 3000);
    }
    timer = setTimeout(check, 1500);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [state, number, token, retry, attempt]);

  const copy = state === "paid" ? [t.statuses.payment.PAID, t.success.paidDescription]
    : state === "pending" ? [t.statuses.payment.PENDING, t.success.pendingDescription]
    : state === "failed" ? [t.success.failedTitle, t.success.failedDescription]
    : state === "cancelled" ? [t.success.cancelledTitle, t.success.cancelledDescription]
    : state === "expired" ? [t.success.expiredTitle, t.success.expiredDescription]
    : state === "unknown" ? [t.statuses.payment.UNKNOWN, t.success.unknownDescription]
    : state === "review" ? [t.success.reviewTitle, t.success.reviewDescription]
    : state === "unavailable" ? [t.success.unavailableTitle, t.success.unavailableDescription]
    : [t.success.title, t.success.pending];
  const Icon = state === "paid" || state === "confirmed" ? CheckCircle2 : state === "pending" ? Clock3 : CircleAlert;
  return <div className="container-shop flex flex-col items-center py-24 text-center">
    <Icon size={64} className="text-pink-500" aria-hidden="true" />
    <div role="status" aria-live="polite" aria-atomic="true">
      <h1 className="mt-6 font-display text-3xl">{copy[0]}</h1>
      {number && <p className="mt-3 text-sm text-ink/60">{formatOrderReference(number, locale)}</p>}
      <p className="mt-3 max-w-md text-ink/70">{copy[1]}</p>
    </div>
    {(state === "pending" || state === "unknown") && <Button className="mt-6" variant="outline" onClick={() => setRetry((value) => value + 1)}>{t.success.checkAgain}</Button>}
    <Link href="/catalog" className="mt-8 inline-block rounded-full bg-pink-500 px-7 py-3.5 text-base text-white hover:bg-pink-600">{t.success.continue}</Link>
  </div>;
}
