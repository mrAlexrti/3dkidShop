"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CheckCircle2, Clock3, CircleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLangStore } from "@/store/lang-store";
import type { PaymentResultState } from "@/lib/payments/payment-state";

export function OrderResult({ initialState, number, token }: { initialState: PaymentResultState; number: string; token: string }) {
  const { t } = useLangStore();
  const [state, setState] = useState(initialState);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (state !== "pending") return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let attempts = 0;
    async function check() {
      attempts++;
      try {
        const response = await fetch(`/api/payments/status?${new URLSearchParams({ order: number, token })}`, { cache: "no-store", signal: controller.signal });
        const result = await response.json();
        if (controller.signal.aborted) return;
        if (["confirmed", "paid", "failed", "unavailable"].includes(result.state)) { setState(result.state); return; }
      } catch { /* Network failure is not payment failure. Keep the pending state. */ }
      if (!controller.signal.aborted && attempts < 10) timer = setTimeout(check, 3000);
    }
    timer = setTimeout(check, 1500);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [state, number, token, retry]);

  const copy = state === "paid" ? [t.statuses.payment.PAID, t.success.paidDescription]
    : state === "pending" ? [t.statuses.payment.PENDING, t.success.pendingDescription]
    : state === "failed" ? [t.success.failedTitle, t.success.failedDescription]
    : state === "unavailable" ? [t.success.unavailableTitle, t.success.unavailableDescription]
    : [t.success.title, t.success.pending];
  const Icon = state === "paid" || state === "confirmed" ? CheckCircle2 : state === "pending" ? Clock3 : CircleAlert;
  return <div className="container-shop flex flex-col items-center py-24 text-center">
    <Icon size={64} className="text-pink-500" aria-hidden="true" />
    <div role="status" aria-live="polite" aria-atomic="true">
      <h1 className="mt-6 font-display text-3xl">{copy[0]}</h1>
      {number && <p className="mt-3 text-sm text-ink/60">{t.success.order} <span className="text-ink">{number}</span></p>}
      <p className="mt-3 max-w-md text-ink/70">{copy[1]}</p>
    </div>
    {state === "pending" && <Button className="mt-6" variant="outline" onClick={() => setRetry((value) => value + 1)}>{t.success.checkAgain}</Button>}
    <Link href="/catalog" className="mt-8 inline-block rounded-full bg-pink-500 px-7 py-3.5 text-base text-white hover:bg-pink-600">{t.success.continue}</Link>
  </div>;
}
