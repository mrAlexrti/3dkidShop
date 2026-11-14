"use server";

import { verifiedPaymentRetry } from "@/lib/payments/retry";

export async function preparePaymentRetry(reference: string, token: string) {
  try {
    const key = await verifiedPaymentRetry({ reference, token });
    return key ? { key } : null;
  } catch { return null; }
}
