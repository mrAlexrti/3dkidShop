import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { readServerEnv } from "@/lib/server-env";
import { reconcilePendingPayments } from "@/lib/payments/reconciliation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = readServerEnv("CRON_SECRET");
  if (!secret) return NextResponse.json({ success: false }, { status: 503 });
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(request.headers.get("authorization") ?? "");
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return NextResponse.json({ success: false }, { status: 401 });
  try { return NextResponse.json({ success: true, ...await reconcilePendingPayments() }); }
  catch { return NextResponse.json({ success: false }, { status: 503 }); }
}
