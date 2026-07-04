import { NextResponse } from "next/server";
import { getLiqPayConfigStatus } from "@/lib/payments/liqpay";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    success: true,
    liqpay: getLiqPayConfigStatus(),
  });
}
