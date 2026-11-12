import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getNovaPoshtaDocumentStatuses } from "@/lib/novaposhta";
import { notifyOrderStatusChanged } from "@/lib/notifications/orders";
import { getOrderStatusAfterNovaPoshtaSync } from "@/lib/order-status";
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

function normalizedText(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

// Explicit legacy text fallbacks, not a provider-code mapping. Unknown phrases
// (including negated positives) must not establish delivery or payment facts.
const DELIVERED_TEXT_STATUSES = new Set(["отримано", "доставлено", "получено", "delivered", "received"]);
const COD_PAID_TEXT_STATUSES = new Set(["оплачено", "отримано", "получено", "перераховано", "зараховано", "paid", "received"]);

function isDeliveredStatus(status: { status: string; statusCode: string }) {
  return normalizedText(status.statusCode) === "9" || DELIVERED_TEXT_STATUSES.has(normalizedText(status.status));
}

function isCodPaidStatus(status: { codStatus: string; codStatusCode: string }) {
  // No verified numeric COD-paid mapping exists here. Retain a text-code fallback
  // only when the provider supplies no status text; never override negative text.
  const text = normalizedText(status.codStatus) || normalizedText(status.codStatusCode);
  return COD_PAID_TEXT_STATUSES.has(text);
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
    include: { items: true },
  });

  const ttns = orders.map((order) => order.novaPoshtaTtn).filter(Boolean) as string[];
  if (ttns.length === 0) {
    return NextResponse.json({ success: true, checked: 0, updated: 0, errors: 0, orderStatusChanged: 0 });
  }

  const result = await getNovaPoshtaDocumentStatuses(ttns);
  if (!result.success) {
    return NextResponse.json(
      { success: false, checked: ttns.length, updated: 0, errors: ttns.length, orderStatusChanged: 0, error: result.error },
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

    const deliveredNow = isDeliveredStatus(status);
    const codPaidNow = isCodPaidStatus(status);
    const deliveredAt = status.deliveredAt ?? order.novaPoshtaDeliveredAt;
    const paidAt = order.paidAt ?? (codPaidNow ? new Date() : null);
    const nextOrderStatus = getOrderStatusAfterNovaPoshtaSync({
      currentStatus: order.status,
      isDelivered: Boolean(deliveredAt) || deliveredNow,
      isPaid: Boolean(paidAt),
    });
    if (nextOrderStatus !== order.status) orderStatusChanged += 1;

    const updatedOrder = await prisma.order.update({
      where: { id: order.id },
      data: {
        status: nextOrderStatus,
        paidAt,
        novaPoshtaStatus: status.status || null,
        novaPoshtaStatusCode: status.statusCode || null,
        novaPoshtaDeliveredAt: deliveredAt,
        novaPoshtaCodStatus: status.codStatus || null,
        novaPoshtaCodStatusCode: status.codStatusCode || null,
        novaPoshtaCodAmount: status.codAmount,
        novaPoshtaSyncedAt: new Date(),
        novaPoshtaError: null,
      },
      include: { items: true },
    });

    await notifyOrderStatusChanged({
      order: updatedOrder,
      previousStatus: order.status,
      nextStatus: updatedOrder.status,
      source: "Нова Пошта",
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
