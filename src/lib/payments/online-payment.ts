import { readServerEnv } from "@/lib/server-env";
import { monoSiteOrigin } from "@/lib/payments/mono";

// New orders are Mono-only. Legacy LiqPay settings cannot select new checkout.
export function getOnlinePaymentConfig(): { provider: "mono"; mode: "sandbox" | "live" } | null {
  const mode = readServerEnv("ONLINE_PAYMENT_MODE");
  return (mode === "sandbox" || mode === "live") && readServerEnv("MONO_ACQUIRING_TOKEN") && monoSiteOrigin()
    ? { provider: "mono", mode } : null;
}
export function isOnlinePaymentAvailable() { return getOnlinePaymentConfig() !== null; }
