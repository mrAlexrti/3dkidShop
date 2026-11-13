import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validOrderResultToken } from "@/lib/payments/order-result";
import { paymentResultState } from "@/lib/payments/payment-state";

export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  const query = new URL(req.url).searchParams;
  const number = query.get("order") ?? "";
  const token = query.get("token") ?? "";
  const headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };
  if (!validOrderResultToken(number, token)) return NextResponse.json({ state: "unavailable" }, { status: 404, headers });
  const order = await prisma.order.findUnique({ where: { number }, select: { paymentProvider: true, paymentStatus: true, paymentMethod: true, status: true, paidAt: true, paymentProviderStatus: true, paymentErrorCode: true } });
  return NextResponse.json({ state: order ? paymentResultState(order) : "unavailable" }, { status: order ? 200 : 404, headers });
}
