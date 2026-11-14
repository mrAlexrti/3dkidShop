// Real components/source with installed React and isolated browser boundaries. No new dependencies.
import assert from "node:assert/strict";
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import * as icons from "lucide-react";
import * as utils from "../src/lib/utils";
import * as validation from "../src/lib/validations/checkout";
import * as paymentStates from "../src/lib/payments/payment-state";
import { translations } from "../src/lib/i18n";
import type { OrderResult as ResultComponent } from "../src/components/checkout/order-result";
import * as reference from "../src/lib/order-reference";
import type { CheckoutForm as FormComponent } from "../src/components/checkout/checkout-form";
import type { PaymentResultState } from "../src/lib/payments/payment-state";
import { sourceModule } from "./source-module";

const Link = (props: React.AnchorHTMLAttributes<HTMLAnchorElement>) => React.createElement("a", props);
const Button = (props: React.ButtonHTMLAttributes<HTMLButtonElement>) => React.createElement("button", props);
type Element = React.ReactElement<Record<string, unknown>>;
const savedGlobals = { fetch, setTimeout, clearTimeout, window: globalThis.window };
async function verify() {
  let orderReads = 0;
  const { default: resultPage } = sourceModule<{ default: (args: { searchParams: Promise<Record<string, string>> }) => Promise<React.ReactElement<{ initialState: PaymentResultState }>> }>("src/app/(shop)/checkout/success/page.tsx", {
    "react/jsx-runtime": jsxRuntime, "@/lib/i18n-server": { getT: async () => translations.en },
    "@/components/checkout/order-result": { OrderResult: () => null }, "@/lib/payments/payment-state": paymentStates,
    "@/lib/payments/order-result": { validOrderResultToken: (_number: string, token: string) => token === "isolated-valid" },
    "@/lib/prisma": { prisma: { order: { findUnique: async ({ where }: { where: { number: string } }) => {
      orderReads++;
      return { paymentProvider: "liqpay", paymentStatus: where.number === "paid-order" ? "PAID" : "PENDING", status: "AWAITING_PAYMENT", paidAt: where.number === "paid-order" ? new Date() : null };
    } } } },
  });
  const denied = await resultPage({ searchParams: Promise.resolve({ order: "paid-order", token: "invalid", payment: "success", email: "sent" }) });
  assert.equal(denied.props.initialState, "unavailable"); assert.equal(orderReads, 0);
  const paidPage = await resultPage({ searchParams: Promise.resolve({ order: "paid-order", token: "isolated-valid" }) });
  const pendingPage = await resultPage({ searchParams: Promise.resolve({ order: "pending-order", token: "isolated-valid", payment: "success" }) });
  assert.equal(paidPage.props.initialState, "paid"); assert.equal(pendingPage.props.initialState, "pending");
  assert.notEqual(paidPage.key, pendingPage.key, "Changing orders must remount local result state instead of retaining an earlier paid state.");
  for (const locale of ["ua", "en"] as const) {
    const t = translations[locale];
    const bindings = {
      "@/lib/payments/checkout-session": { onlineCheckoutKey: async () => "qa-key", rememberCheckoutResult: () => {}, completeCheckoutCart: () => {} }, "@/store/cart-store": { useCartStore: { getState: () => ({ items: [], clear: () => {} }) } }, "@/lib/order-reference": reference,
      "react/jsx-runtime": jsxRuntime, "lucide-react": icons, "@/components/ui/button": { Button },
      "@/store/lang-store": { useLangStore: () => ({ t, locale }) }, "next/link": { default: Link, __esModule: true },
    };
    const { OrderResult } = sourceModule<{ OrderResult: typeof ResultComponent }>("src/components/checkout/order-result.tsx", { ...bindings, react: React });
    for (const state of ["confirmed", "pending", "paid", "failed", "cancelled", "expired", "unknown", "review", "unavailable"] as PaymentResultState[]) {
      const html = renderToStaticMarkup(React.createElement(OrderResult, { initialState: state, number: "3DK-isolated", token: "isolated" }));
      const title = state === "confirmed" ? t.success.title : state === "paid" ? t.statuses.payment.PAID : state === "pending" ? t.statuses.payment.PENDING : t.success[`${state}Title`];
      assert.ok(html.includes(title)); assert.ok(html.includes('role="status"'));
      assert.equal(/lucide-(?:circle-check|check-circle)/.test(html), state === "confirmed" || state === "paid");
      if (state === "pending") assert.ok(!html.includes(t.success.paidTitle) && !html.includes(t.success.title));
      if (locale === "en") assert.doesNotMatch(html, /[А-Яа-яІіЇїЄєҐґ]/);
    }
    for (const outcome of ["online", "offline", "failed", "redirect-error"] as const) {
      const log: string[] = [];
      const payment = { provider: "mono", pageUrl: "https://pay.mbnk.biz/isolated" };
      const { CheckoutForm } = sourceModule<{ CheckoutForm: typeof FormComponent }>("src/components/checkout/checkout-form.tsx", {
        ...bindings,
        react: { useState: (initial: unknown) => [initial, () => {}], useMemo: (fn: () => unknown) => fn() },
        "react-hook-form": { useWatch: () => "np_warehouse", useForm: () => ({ register: () => ({}), handleSubmit: (fn: unknown) => fn, setValue: () => {}, control: {}, formState: { errors: {} } }) },
        "@hookform/resolvers/zod": { zodResolver: () => ({}) }, "@/lib/validations/checkout": validation,
        "@/lib/utils": utils, "@/store/cart-store": { useCartStore: () => ({ items: [], total: () => 123, clear: () => log.push("clear") }) },
        "next/navigation": { useRouter: () => ({ push: (url: string) => log.push(`route:${url}`) }) },
        "./use-np-lookups": { useCitySearch: () => ({ cities: [] }), useWarehouses: () => ({ warehouses: [] }) },
        "@/lib/actions/create-order": { createOrder: async () => outcome === "failed" ? { success: false, error: "isolated-error" } : { success: true, emailSent: false, orderNumber: "3DK-isolated", resultUrl: "/checkout/success?isolated-token", ...(outcome === "offline" ? {} : { payment }) } },
        sonner: { toast: { message: () => log.push("message"), success: () => log.push("success"), error: () => log.push("error") } },
      });
      globalThis.window = { location: { assign: (url: string) => { assert.equal(url, payment.pageUrl); log.push("gateway-submit"); if (outcome === "redirect-error") throw new Error("isolated-redirect-error"); } } } as unknown as Window & typeof globalThis;
      const form = CheckoutForm({ onlineCardEnabled: true }) as Element;
      await (form.props.onSubmit as (data: unknown) => Promise<void>)({});
      if (outcome === "online") assert.deepEqual(log, ["message", "gateway-submit"]);
      if (outcome === "offline") assert.deepEqual(log, ["clear", "success", "route:/checkout/success?isolated-token"]);
      if (outcome === "failed") assert.deepEqual(log, ["error"]);
      if (outcome === "redirect-error") assert.deepEqual(log, ["message", "gateway-submit", "error"], "Failed handoff must retain the cart.");
    }
  }
  // Exercise actual polling effect with fake time and fetch; never contact a network.
  for (const outcome of ["paid", "failed", "network-error"] as const) {
    const timers: (() => Promise<void>)[] = [];
    let effect: (() => (() => void) | undefined) | undefined;
    let observed: unknown = "pending"; let calls = 0;
    globalThis.setTimeout = ((fn: () => Promise<void>) => { timers.push(fn); return timers.length; }) as unknown as typeof setTimeout;
    globalThis.clearTimeout = (() => { timers.length = 0; }) as typeof clearTimeout;
    globalThis.fetch = async (_input, init) => {
      assert.equal(init?.cache, "no-store"); assert.ok(init?.signal); calls++;
      if (outcome === "network-error") throw new Error("isolated-offline");
      return Response.json({ state: calls === 1 ? "pending" : outcome });
    };
    const { OrderResult } = sourceModule<{ OrderResult: typeof ResultComponent }>("src/components/checkout/order-result.tsx", {
      "@/lib/payments/checkout-session": { onlineCheckoutKey: async () => "qa-key", rememberCheckoutResult: () => {}, completeCheckoutCart: () => {} }, "@/store/cart-store": { useCartStore: { getState: () => ({ items: [], clear: () => {} }) } }, "@/lib/order-reference": reference,
      react: { useState: (initial: unknown) => [initial, (value: unknown) => { observed = value; }], useEffect: (callback: typeof effect) => { effect = callback; } },
      "react/jsx-runtime": jsxRuntime, "lucide-react": icons, "@/components/ui/button": { Button },
      "@/store/lang-store": { useLangStore: () => ({ t: translations.en }) }, "next/link": { default: Link, __esModule: true },
    });
    OrderResult({ initialState: "pending", number: "3DK-isolated", token: "isolated" });
    const cleanup = effect!();
    while (timers.length) await timers.shift()!();
    assert.equal(observed, outcome === "network-error" ? "pending" : outcome);
    assert.equal(calls, outcome === "network-error" ? 10 : 2);
    cleanup?.();
  }
  console.log("PASS payment UI UA/EN: nine distinct states, no pending success icon/copy; online handoff without success navigation; offline confirmation retained; failed handoff retains cart; bounded pending polling, paid/failed updates, network errors stay pending. Isolated browser boundaries only.");
}
verify().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => {
  globalThis.fetch = savedGlobals.fetch; globalThis.setTimeout = savedGlobals.setTimeout; globalThis.clearTimeout = savedGlobals.clearTimeout; globalThis.window = savedGlobals.window;
});
