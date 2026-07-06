import { OrderStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getNovaPoshtaDocumentStatuses } from "@/lib/novaposhta";
import { readServerEnv } from "@/lib/server-env";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DEFAULT_SYNC_LIMIT = 50;

function getCronSecret() {
  return readServerEnv("CRON_SECRET");
}

function getSyncLimit() {
  const parsed = Number(readServerEnv("NP_STATUS_SYNC_LIMIT"));
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_SYNC_LIMIT;
  return Math.min(Math.floor(parsed), 100);
}

function isAuthorized(request: Request) {
  const secret = getCronSecret();
  if (!secret) return false;

  const authorization = request.headers.get("authorization") || "";
  return authorization === `Bearer ${secret}`;
}

function statusByTtnKey(ttn: string) {
  return ttn.replace(/\D/g, "");
}

function normalizedText(...values: Array<string | null | undefined>) {
  return values.filter(Boolean).join(" ").toLowerCase();
}

function isDeliveredStatus(status: { status: string; statusCode: string }) {
  const text = normalizedText(status.status);
  return (
    status.statusCode === "9" ||
    text.includes("отримано") ||
    text.includes("доставлено") ||
    text.includes("получено") ||
    text.includes("delivered") ||
    text.includes("received")
  );
}

function isCodPaidStatus(status: { codStatus: string; codStatusCode: string }) {
  const text = normalizedText(status.codStatus, status.codStatusCode);
  return (
    text.includes("оплач") ||
    text.includes("отриман") ||
    text.includes("получен") ||
    text.includes("перерах") ||
    text.includes("зарах") ||
    text.includes("paid") ||
    text.includes("received")
  );
}

function getNextOrderStatus(
  currentStatus: OrderStatus,
  status: { status: string; statusCode: string; codStatus: string; codStatusCode: string },
) {
  if (currentStatus === OrderStatus.CANCELLED || currentStatus === OrderStatus.COMPLETED) return currentStatus;
  if (isDeliveredStatus(status)) return OrderStatus.COMPLETED;

  if (isCodPaidStatus(status) && (currentStatus === OrderStatus.PENDING || currentStatus === OrderStatus.PROCESSING)) {
    return OrderStatus.PAID;
  }

  return currentStatus;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      {
        success: false,
        error: getCronSecret() ? "Unauthorized sync request." : "CRON_SECRET is not configured.",
      },
      { status: getCronSecret() ? 401 : 503 },
    );
  }

  const limit = getSyncLimit();
  const orders = await prisma.order.findMany({
    where: {
      novaPoshtaTtn: { not: null },
    },
    orderBy: [{ novaPoshtaSyncedAt: "asc" }, { createdAt: "desc" }],
    take: limit,
    select: {
      id: true,
      number: true,
      status: true,
      novaPoshtaTtn: true,
    },
  });

  const ttns = orders.map((order) => order.novaPoshtaTtn).filter(Boolean) as string[];
  if (ttns.length === 0) {
    return NextResponse.json({ success: true, checked: 0, updated: 0, errors: 0 });
  }

  const result = await getNovaPoshtaDocumentStatuses(ttns);
  if (!result.success) {
    return NextResponse.json(
      { success: false, checked: ttns.length, updated: 0, errors: ttns.length, error: result.error },
      { status: 502 },
    );
  }

  const statusesByTtn = new Map(result.statuses.map((status) => [statusByTtnKey(status.ttn), status]));
  let updated = 0;
  let errors = 0;
  let orderStatusChanged = 0;

  for (const order of orders) {
    const ttn = order.novaPoshtaTtn;
    if (!ttn) continue;

    const status = statusesByTtn.get(statusByTtnKey(ttn));
    if (!status) {
      errors += 1;
      await prisma.order.update({
        where: { id: order.id },
        data: {
          novaPoshtaSyncedAt: new Date(),
          novaPoshtaError: "Nova Poshta did not return status for this TTN.",
        },
      });
      continue;
    }

    const nextOrderStatus = getNextOrderStatus(order.status, status);
    if (nextOrderStatus !== order.status) orderStatusChanged += 1;

    await prisma.order.update({
      where: { id: order.id },
      data: {
        status: nextOrderStatus,
        novaPoshtaStatus: status.status || null,
        novaPoshtaStatusCode: status.statusCode || null,
        novaPoshtaDeliveredAt: status.deliveredAt,
        novaPoshtaCodStatus: status.codStatus || null,
        novaPoshtaCodStatusCode: status.codStatusCode || null,
        novaPoshtaCodAmount: status.codAmount,
        novaPoshtaSyncedAt: new Date(),
        novaPoshtaError: null,
      },
    });
    updated += 1;
  }

  return NextResponse.json({
    success: true,
    checked: ttns.length,
    updated,
    errors,
    orderStatusChanged,
  });
}