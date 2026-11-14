import type { Prisma } from "@prisma/client";
import { INITIALIZATION_MARKERS } from "./acceptance";

// Complement of operational visibility for provider-backed records. The null
// number case also exposes inconsistent imported records without accepting them.
export const paymentAttemptsWhere: Prisma.OrderWhereInput = {
  paymentProvider: { not: null },
  OR: [
    { checkoutAcceptance: { in: ["PROVISIONAL", "REVIEW"] } },
    { checkoutAcceptance: "LEGACY", paymentProvider: "mono", paymentErrorCode: { in: INITIALIZATION_MARKERS } },
    { number: null },
  ],
};

export const paymentAttemptSelect = {
  id: true, number: true, createdAt: true, customerName: true, total: true,
  checkoutAcceptance: true, paymentProvider: true, paymentStatus: true, paidAt: true,
  paymentReference: true, paymentInvoiceId: true, paymentProviderStatus: true,
  paymentExpiresAt: true, paymentModifiedAt: true, paymentNextCheckAt: true, paymentErrorCode: true,
} satisfies Prisma.OrderSelect;

type Snapshot = { paymentStatus: string | null; paidAt: Date | null; paymentProviderStatus: string | null; paymentErrorCode: string | null };
export type AttemptState = "awaiting" | "processing" | "failed" | "cancelled" | "expired" | "unknown" | "paid_unaccepted" | "refunded";
// Make each predicate false (rather than SQL UNKNOWN) on null, so priority
// exclusions below match the labels even for legacy/partially initialized rows.
const equal = (field: Exclude<keyof Snapshot, "paidAt">, value: string): Prisma.OrderWhereInput => ({ AND: [{ [field]: { not: null } }, { [field]: value }] });
const rules = [
  { key: "refunded", where: equal("paymentStatus", "REFUNDED"), matches: (row: Snapshot) => row.paymentStatus === "REFUNDED" },
  { key: "paid_unaccepted", where: { OR: [equal("paymentStatus", "PAID"), { paidAt: { not: null } }] }, matches: (row: Snapshot) => row.paymentStatus === "PAID" || Boolean(row.paidAt) },
  { key: "failed", where: equal("paymentStatus", "FAILED"), matches: (row: Snapshot) => row.paymentStatus === "FAILED" },
  { key: "expired", where: { AND: [equal("paymentStatus", "CANCELLED"), { OR: [equal("paymentProviderStatus", "expired"), equal("paymentErrorCode", "INVOICE_EXPIRED")] }] }, matches: (row: Snapshot) => row.paymentStatus === "CANCELLED" && (row.paymentProviderStatus === "expired" || row.paymentErrorCode === "INVOICE_EXPIRED") },
  { key: "cancelled", where: equal("paymentStatus", "CANCELLED"), matches: (row: Snapshot) => row.paymentStatus === "CANCELLED" },
  { key: "unknown", where: { OR: [equal("paymentStatus", "UNKNOWN"), { AND: [{ paymentProviderStatus: { not: null } }, { paymentProviderStatus: { notIn: ["created", "processing"] } }] }, equal("paymentErrorCode", "UNEXPECTED_HOLD"), { AND: [{ paymentStatus: { not: null } }, { paymentStatus: { notIn: ["PAID", "REFUNDED", "FAILED", "CANCELLED", "PENDING"] } }] }] }, matches: (row: Snapshot) => row.paymentStatus === "UNKNOWN" || (row.paymentProviderStatus !== null && !["created", "processing"].includes(row.paymentProviderStatus)) || row.paymentErrorCode === "UNEXPECTED_HOLD" || (row.paymentStatus !== null && !["PAID", "REFUNDED", "FAILED", "CANCELLED", "PENDING"].includes(row.paymentStatus)) },
  { key: "processing", where: equal("paymentProviderStatus", "processing"), matches: (row: Snapshot) => row.paymentProviderStatus === "processing" },
] satisfies { key: AttemptState; where: Prisma.OrderWhereInput; matches: (row: Snapshot) => boolean }[];

export const ATTEMPT_FILTERS = ["all", "awaiting", "processing", "failed", "cancelled", "expired", "unknown", "review", "paid_unaccepted", "refunded", "unscheduled"] as const;
export type AttemptFilter = typeof ATTEMPT_FILTERS[number];
export function attemptState(row: Snapshot): AttemptState {
  return rules.find((rule) => rule.matches(row))?.key ?? "awaiting";
}
export function attemptStatusWhere(filter: AttemptFilter): Prisma.OrderWhereInput {
  if (filter === "all") return {};
  if (filter === "review") return { checkoutAcceptance: "REVIEW" };
  if (filter === "unscheduled") return { paymentNextCheckAt: null };
  const index = rules.findIndex((rule) => rule.key === filter);
  return { AND: [index < 0 ? {} : rules[index].where, { NOT: { OR: rules.slice(0, index < 0 ? rules.length : index).map((rule) => rule.where) } }] };
}

export const ATTEMPT_REASONS = [
  "INVOICE_INITIALIZING", "INVOICE_CREATE_UNCERTAIN", "INVOICE_INITIALIZATION_INVALIDATED", "INVOICE_CREATE_FAILED",
  "INVOICE_EXPIRED", "INITIALIZATION_EXPIRED", "UNEXPECTED_HOLD", "UNKNOWN_PROVIDER_STATUS", "REFUND_RECONCILIATION_REQUIRED",
  "REFUND_BEFORE_ACCEPTANCE", "LATE_PAYMENT_REVIEW", "FULFILLMENT_REVIEW_REQUIRED", "INCONSISTENT_PAYMENT_STATE",
  "RECONCILIATION_UNAVAILABLE", "PAYMENT_FAILED", "ADMIN_CANCELLED",
] as const;
export function attemptReason(code: string | null): typeof ATTEMPT_REASONS[number] | "none" | "provider_failure" | "other" {
  if (!code) return "none";
  if (ATTEMPT_REASONS.includes(code as typeof ATTEMPT_REASONS[number])) return code as typeof ATTEMPT_REASONS[number];
  return /^PROVIDER_\d{1,10}$/.test(code) ? "provider_failure" : "other";
}

export type AttemptSearchParams = Record<string, string | string[] | undefined>;
export function parseAttemptFilters(params: AttemptSearchParams) {
  let invalid = false;
  const one = (key: string) => { const value = params[key]; if (Array.isArray(value)) invalid = true; return typeof value === "string" ? value.trim() : ""; };
  const rawStatus = one("status");
  const status = ATTEMPT_FILTERS.includes(rawStatus as AttemptFilter) ? rawStatus as AttemptFilter : "all";
  if (rawStatus && status === "all" && rawStatus !== "all") invalid = true;
  const q = one("q").slice(0, 101);
  if (q && !/^[A-Za-z0-9_-]{1,100}$/.test(q)) invalid = true;
  const from = one("from"); const to = one("to");
  const day = (value: string) => {
    if (!value) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) { invalid = true; return null; }
    const date = new Date(`${value}T00:00:00.000Z`);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value || date.getUTCFullYear() < 2000 || date.getUTCFullYear() > 9998) { invalid = true; return null; }
    return date;
  };
  const start = day(from); const end = day(to);
  if (start && end && start > end) invalid = true;
  const rawPage = one("page");
  const page = /^\d{1,6}$/.test(rawPage) && Number(rawPage) > 0 ? Number(rawPage) : 1;
  return { status, q, from, to, page, invalid, start, end: end ? new Date(end.getTime() + 86400000) : null };
}
