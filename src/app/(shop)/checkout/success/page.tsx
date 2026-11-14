import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { validOrderResultToken, validAttemptResultToken } from "@/lib/payments/order-result";
import { paymentResultState } from "@/lib/payments/payment-state";
import { OrderResult } from "@/components/checkout/order-result";
import { getT } from "@/lib/i18n-server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).success.resultTitle, robots: { index: false, follow: false }, referrer: "no-referrer" };
}
export default async function CheckoutSuccessPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const number = typeof query.order === "string" ? query.order : "";
  const reference = typeof query.attempt === "string" ? query.attempt : "";
  const token = typeof query.token === "string" ? query.token : "";
  const order = (reference ? validAttemptResultToken(reference, token) : validOrderResultToken(number, token)) ? await prisma.order.findUnique({
    where: reference ? { paymentReference: reference } : { number }, select: { number: true, checkoutAcceptance: true, paymentProvider: true, paymentStatus: true, paymentMethod: true, status: true, paidAt: true, paymentProviderStatus: true, paymentErrorCode: true },
  }) : null;
  return <OrderResult key={order ? `${reference || number}:${token}` : "unavailable"} initialState={order ? paymentResultState(order) : "unavailable"} number={order && (!reference || order.checkoutAcceptance === "ACCEPTED") ? order.number ?? "" : ""} attempt={order ? reference : ""} token={order ? token : ""} />;
}
