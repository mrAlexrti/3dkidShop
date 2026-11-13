import { getLiqPayConfigStatus } from "@/lib/payments/liqpay";

// Historical sandbox callbacks are independent of the active new-checkout provider.
export function getLegacyLiqPayConfig(): { provider: "liqpay"; mode: "sandbox" } | null {
  const config = getLiqPayConfigStatus();
  return config.hasPublicKey && config.hasPrivateKey && config.publicKeyLooksSandbox && config.privateKeyLooksSandbox && config.sandbox
    ? { provider: "liqpay", mode: "sandbox" } : null;
}
