import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/actions/require-admin";
import { paymentAttemptsWhere, paymentAttemptSelect, attemptState, attemptStatusWhere, attemptReason, parseAttemptFilters, type AttemptSearchParams } from "@/lib/payments/attempt-diagnostics";
import type { Prisma } from "@prisma/client";

export const ATTEMPTS_PAGE_SIZE = 25;
const identifier = (value: string | null, length: number) => value && new RegExp(`^[A-Za-z0-9_-]{1,${length}}$`).test(value) ? value : null;

// Authorization precedes every query, including COUNT. Explicit select + DTO
// prevent hosted links, capabilities, retry hashes and payloads leaving this layer.
export async function listPaymentAttempts(params: AttemptSearchParams) {
  await requireAdmin();
  const filters = parseAttemptFilters(params);
  if (filters.invalid) return { filters, page: 1, pages: 1, total: 0, attempts: [] };
  const where: Prisma.OrderWhereInput = { AND: [
    paymentAttemptsWhere, attemptStatusWhere(filters.status),
    ...(filters.q ? [{ OR: [{ id: { contains: filters.q, mode: "insensitive" as const } }, { paymentReference: { contains: filters.q, mode: "insensitive" as const } }, { paymentReference: null, number: { contains: filters.q, mode: "insensitive" as const } }] }] : []),
    ...(filters.start || filters.end ? [{ createdAt: { ...(filters.start ? { gte: filters.start } : {}), ...(filters.end ? { lt: filters.end } : {}) } }] : []),
  ] };
  const total = await prisma.order.count({ where });
  const pages = Math.max(1, Math.ceil(total / ATTEMPTS_PAGE_SIZE));
  const page = Math.min(filters.page, pages);
  const rows = await prisma.order.findMany({ where, select: paymentAttemptSelect, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * ATTEMPTS_PAGE_SIZE, take: ATTEMPTS_PAGE_SIZE });
  const attempts = rows.map((row) => ({
    id: row.id, createdAt: row.createdAt, customerName: row.customerName, amount: row.total.toString(),
    currency: row.paymentProvider === "mono" ? "UAH" : null,
    provider: (row.paymentProvider === "mono" ? "mono" : row.paymentProvider === "liqpay" ? "liqpay" : "other") as "mono" | "liqpay" | "other",
    state: attemptState(row), review: row.checkoutAcceptance === "REVIEW",
    reference: identifier(row.paymentReference ?? row.number, 100), invoiceId: identifier(row.paymentInvoiceId, 128),
    expiresAt: row.paymentExpiresAt, modifiedAt: row.paymentModifiedAt, nextCheckAt: row.paymentNextCheckAt,
    reason: attemptReason(row.paymentErrorCode),
  }));
  return { filters, page, pages, total, attempts };
}
