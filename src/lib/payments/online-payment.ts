import { getLiqPayConfigStatus } from "@/lib/payments/liqpay";
import { readServerEnv } from "@/lib/server-env";

// Live acquiring is deliberately unavailable in Batch 1.4. No key-presence bypass.
export function getOnlinePaymentConfig(): { provider: "liqpay"; mode: "sandbox" } | null {
  const config = getLiqPayConfigStatus();
  return readServerEnv("ONLINE_PAYMENT_MODE") === "sandbox" && config.hasPublicKey && config.hasPrivateKey &&
    config.publicKeyLooksSandbox && config.privateKeyLooksSandbox && config.sandbox
    ? { provider: "liqpay", mode: "sandbox" } : null;
}
export function isOnlinePaymentAvailable() { return getOnlinePaymentConfig() !== null; }
