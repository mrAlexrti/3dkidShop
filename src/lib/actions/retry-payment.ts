"use server";

import { verifiedPaymentRetry } from "@/lib/payments/retry";
import { customerSession } from "@/lib/customer/session";

export async function preparePaymentRetry(reference: string, token: string) {
  try {
    const key = await verifiedPaymentRetry({ reference, token }, (await customerSession())?.id ?? null);
    return key ? { key } : null;
  } catch { return null; }
}
