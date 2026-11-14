import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { readServerEnv } from "@/lib/server-env";
import { reconcilePendingPayments } from "@/lib/payments/reconciliation";
import { recoverNotificationOutbox } from "@/lib/notifications/outbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = readServerEnv("CRON_SECRET");
  if (!secret) return NextResponse.json({ success: false }, { status: 503 });
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(request.headers.get("authorization") ?? "");
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return NextResponse.json({ success: false }, { status: 401 });
  try {
    // Independent recovery: a provider outage must not block already queued sends.
    const [payments, notifications] = await Promise.allSettled([reconcilePendingPayments(), recoverNotificationOutbox()]);
    return NextResponse.json({ success: payments.status === "fulfilled" && notifications.status === "fulfilled",
      ...(payments.status === "fulfilled" ? payments.value : { paymentsUnavailable: true }),
      notifications: notifications.status === "fulfilled" ? notifications.value : { unavailable: true },
    }, { status: payments.status === "fulfilled" && notifications.status === "fulfilled" ? 200 : 503 });
  }
  catch { return NextResponse.json({ success: false }, { status: 503 }); }
}
