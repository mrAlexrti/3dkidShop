"use server";

import { verifiedPaymentRetry } from "@/lib/payments/retry";
import { customerSession } from "@/lib/customer/session";
import { customerPost } from "@/lib/customer/security";
import { prisma } from "@/lib/prisma";
import { validAttemptResultToken } from "@/lib/payments/order-result";
import { reconcileCartPayment } from "@/lib/payments/cart-checkout";
import { paymentResultState } from "@/lib/payments/payment-state";

export async function preparePaymentRetry(reference: string, token: string) {
  try {
    const key = await verifiedPaymentRetry({ reference, token }, (await customerSession())?.id ?? null);
    return key ? { key } : null;
  } catch { return null; }
}

export async function checkOwnedPayment(reference: string, token: string) {
  if (!await customerPost() || !validAttemptResultToken(reference, token)) return null;
  const customer = await customerSession();
  if (!customer) return null;
  try {
    const order = await prisma.order.findFirst({ where: { paymentReference: reference, customerId: customer.id, paymentProvider: "mono" },
      include: { cartPurchase: true } });
    if (!order) return null;
    const result = order.cartPurchase ? await reconcileCartPayment(order, "status", customer.binding) : { kind: "settled", order };
    return { state: paymentResultState(result.order), number: result.order.checkoutAcceptance === "ACCEPTED" ? result.order.number : null,
      ...(result.kind === "reusable" && result.order.paymentPageUrl ? { pageUrl: result.order.paymentPageUrl } : {}),
      retry: result.kind === "retry" };
  } catch { return null; }
}
