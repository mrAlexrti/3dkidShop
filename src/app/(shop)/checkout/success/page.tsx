import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { validOrderResultToken } from "@/lib/payments/order-result";
import { paymentResultState } from "@/lib/payments/payment-state";
import { OrderResult } from "@/components/checkout/order-result";
import { getT } from "@/lib/i18n-server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).success.resultTitle, robots: { index: false, follow: false }, referrer: "no-referrer" };
}
export default async function CheckoutSuccessPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const number = typeof query.order === "string" ? query.order : "";
  const token = typeof query.token === "string" ? query.token : "";
  const order = validOrderResultToken(number, token) ? await prisma.order.findUnique({
    where: { number }, select: { paymentProvider: true, paymentStatus: true, paymentMethod: true, status: true, paidAt: true, paymentProviderStatus: true, paymentErrorCode: true },
  }) : null;
  return <OrderResult key={order ? `${number}:${token}` : "unavailable"} initialState={order ? paymentResultState(order) : "unavailable"} number={order ? number : ""} token={order ? token : ""} />;
}
