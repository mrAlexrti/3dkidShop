// Actual diagnostics service/page/auth source; fake database/session boundaries.
// No .env, PrismaClient, provider, notification or carrier effects.
import assert from "node:assert/strict";
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import * as icons from "lucide-react";
import { renderToStaticMarkup } from "react-dom/server";
import { sourceModule } from "./source-module";
import * as diagnostics from "../src/lib/payments/attempt-diagnostics";
import { translations } from "../src/lib/i18n";
import { operationalOrderWhere } from "../src/lib/payments/acceptance";

type Row = Record<string, unknown>;
type Truth = boolean | null;
const parts = (value: unknown): Row[] => Array.isArray(value) ? value : [value as Row];
const and = (values: Truth[]): Truth => values.includes(false) ? false : values.includes(null) ? null : true;
const or = (values: Truth[]): Truth => values.includes(true) ? true : values.includes(null) ? null : false;
const scalar = (value: unknown) => value instanceof Date ? value.getTime() : value;
// SQL three-valued logic catches nullable-state filter bugs that a JS-only NOT
// matcher would hide. This is not a substitute for disposable PostgreSQL QA.
function where(row: Row, query: Row): Truth {
  return and(Object.entries(query).map(([key, value]): Truth => {
    if (key === "AND") return and(parts(value).map((entry) => where(row, entry)));
    if (key === "OR") return or(parts(value).map((entry) => where(row, entry)));
    if (key === "NOT") return and(parts(value).map((entry) => { const result = where(row, entry); return result === null ? null : !result; }));
    const actual = scalar(row[key]);
    if (value === null) return actual === null;
    if (typeof value !== "object" || value instanceof Date) return actual == null ? null : actual === scalar(value);
    return and(Object.entries(value as Row).filter(([operator]) => operator !== "mode").map(([operator, operand]): Truth => {
      if (operator === "not" && operand === null) return actual != null;
      if (actual == null) return null;
      if (operator === "not") return actual !== operand;
      if (operator === "in") return (operand as unknown[]).includes(actual);
      if (operator === "notIn") return !(operand as unknown[]).includes(actual);
      if (operator === "gte") return Number(actual) >= Number(scalar(operand));
      if (operator === "lt") return Number(actual) < Number(scalar(operand));
      if (operator === "contains") return String(actual).toLowerCase().includes(String(operand).toLowerCase());
      throw new Error(`Unsupported isolated query operator: ${operator}`);
    }));
  }));
}
const snapshot = (id: string, patch: Row = {}): Row => ({ id, number: null, createdAt: new Date("2026-11-14T12:00:00Z"), customerName: "QA <Customer>", total: "199.00", checkoutAcceptance: "PROVISIONAL", paymentProvider: "mono", paymentStatus: "PENDING", paidAt: null, paymentReference: `pay_${id}`, paymentInvoiceId: `invoice_${id}`, paymentProviderStatus: "created", paymentExpiresAt: new Date("2000-01-01"), paymentModifiedAt: null, paymentNextCheckAt: new Date("2026-11-14T12:05:00Z"), paymentErrorCode: null,
  paymentPageUrl: "https://pay.monobank.ua/PRIVATE_HOSTED_URL", checkoutKeyHash: "PRIVATE_RETRY_HASH", checkoutPayloadHash: "PRIVATE_PAYLOAD_HASH", token: "PRIVATE_CAPABILITY", customerEmail: "PRIVATE_EMAIL", customerPhone: "PRIVATE_PHONE", shippingAddress: "PRIVATE_ADDRESS", notifications: { payload: "PRIVATE_NOTIFICATION_PAYLOAD" }, ...patch });
let rows: Row[] = [];
let role: string | null = "ADMIN";
let reads = 0; let lastQuery: Row = {};
const auth = sourceModule<typeof import("../src/lib/actions/require-admin")>("src/lib/actions/require-admin.ts", { "@/lib/auth": { auth: async () => role ? { user: { role } } : null } });
const service = sourceModule<typeof import("../src/lib/admin/payment-attempts")>("src/lib/admin/payment-attempts.ts", {
  "@/lib/actions/require-admin": auth, "@/lib/payments/attempt-diagnostics": diagnostics,
  "@/lib/prisma": { prisma: { order: {
    count: async ({ where: query }: { where: Row }) => { reads++; return rows.filter((row) => where(row, query) === true).length; },
    findMany: async (args: Row) => {
      reads++; lastQuery = args;
      assert.deepEqual(args.select, diagnostics.paymentAttemptSelect);
      assert.deepEqual(args.orderBy, [{ createdAt: "desc" }, { id: "desc" }]);
      assert.equal(args.take, 25);
      const selected = rows.filter((row) => where(row, args.where as Row) === true).sort((a, b) => Number(b.createdAt) - Number(a.createdAt) || String(b.id).localeCompare(String(a.id)));
      // Return full malicious fixtures despite SELECT to independently test DTO projection.
      return selected.slice(Number(args.skip), Number(args.skip) + Number(args.take));
    },
  } } },
});
let locale: "ua" | "en" = "en";
const page = sourceModule<typeof import("../src/app/admin/payment-attempts/page")>("src/app/admin/payment-attempts/page.tsx", {
  "react/jsx-runtime": jsxRuntime, "next/link": { default: (props: object) => React.createElement("a", props), __esModule: true },
  "@/lib/admin/payment-attempts": service, "@/lib/payments/attempt-diagnostics": diagnostics,
  "@/lib/i18n-server": { getT: async () => translations[locale], getLocale: async () => locale },
});
const render = async (params: diagnostics.AttemptSearchParams = {}) => renderToStaticMarkup(await page.default({ searchParams: Promise.resolve(params) }));
async function verify() {
  for (const denied of [null, "MANAGER", "CUSTOMER"]) {
    role = denied; const before = reads;
    await assert.rejects(service.listPaymentAttempts({}), /Unauthorized/);
    await assert.rejects(render(), /Unauthorized/);
    assert.equal(reads, before, "Authorization must precede COUNT and row reads");
  }
  role = "ADMIN";
  rows = [
    snapshot("pending"), snapshot("processing", { paymentProviderStatus: "processing" }),
    snapshot("failed", { paymentStatus: "FAILED", paymentProviderStatus: "failure", paymentErrorCode: "PAYMENT_FAILED" }),
    snapshot("cancelled", { paymentStatus: "CANCELLED", paymentProviderStatus: "failure", paymentErrorCode: "PROVIDER_8002" }),
    snapshot("expired", { paymentStatus: "CANCELLED", paymentProviderStatus: "expired", paymentErrorCode: "INVOICE_EXPIRED" }),
    snapshot("unknown", { paymentStatus: "UNKNOWN", paymentErrorCode: "PRIVATE_SECRET_IN_ERROR", paymentInvoiceId: "https://PRIVATE_TOKEN", paymentNextCheckAt: null }),
    snapshot("review", { checkoutAcceptance: "REVIEW", paymentStatus: "UNKNOWN", paymentInvoiceId: null, paymentNextCheckAt: null, paymentErrorCode: "INVOICE_CREATE_UNCERTAIN" }),
    snapshot("paid-review", { checkoutAcceptance: "REVIEW", paymentStatus: "PAID", paidAt: new Date(), paymentProviderStatus: "success", paymentErrorCode: "LATE_PAYMENT_REVIEW" }),
    snapshot("paid-incomplete", { paymentStatus: "PAID", paymentProviderStatus: "success" }),
    snapshot("refunded", { checkoutAcceptance: "REVIEW", paymentStatus: "REFUNDED", paidAt: new Date(), paymentProviderStatus: "reversed" }),
    snapshot("null-financial", { paymentStatus: null, paymentProviderStatus: null }),
    snapshot("future", { paymentStatus: "FUTURE_VALUE", paymentProviderStatus: "future_value" }),
    snapshot("hold", { paymentProviderStatus: "hold", paymentErrorCode: "UNEXPECTED_HOLD" }),
    snapshot("legacy", { number: "3DK-OLD", paymentReference: null, checkoutAcceptance: "LEGACY", paymentErrorCode: "INVOICE_INITIALIZING" }),
    snapshot("accepted", { number: "0001", checkoutAcceptance: "ACCEPTED", paymentStatus: "PAID", paidAt: new Date() }),
    snapshot("historical", { number: "3DK-PAID", checkoutAcceptance: "LEGACY", paymentStatus: "PAID", paidAt: new Date() }),
    snapshot("cod", { paymentProvider: null, checkoutAcceptance: "ACCEPTED", number: "0002" }),
  ];
  const all = await service.listPaymentAttempts({});
  assert.equal(all.total, 14);
  assert.ok(!all.attempts.some((row) => ["accepted", "historical", "cod"].includes(row.id)));
  assert.equal(all.attempts.find((row) => row.id === "pending")?.state, "awaiting", "Past clock expiry must not manufacture a financial failure");
  assert.ok(all.attempts.find((row) => row.id === "review")?.review);
  assert.equal(all.attempts.find((row) => row.id === "legacy")?.reference, "3DK-OLD");
  assert.equal(all.attempts.find((row) => row.id === "unknown")?.reason, "other");
  assert.equal(all.attempts.find((row) => row.id === "unknown")?.invoiceId, null);
  assert.equal(diagnostics.attemptState(snapshot("future-provider", { paymentProviderStatus: "future_value" }) as never), "unknown");
  assert.equal(diagnostics.attemptState(snapshot("conflicting-success", { paymentProviderStatus: "success" }) as never), "unknown");
  assert.equal(diagnostics.attemptState(snapshot("money-after-failure", { paymentStatus: "FAILED", paidAt: new Date() }) as never), "paid_unaccepted");
  const expected: Record<string, string[]> = { awaiting: ["pending", "null-financial", "legacy"], processing: ["processing"], failed: ["failed"], cancelled: ["cancelled"], expired: ["expired"], unknown: ["unknown", "review", "future", "hold"], review: ["review", "paid-review", "refunded"], paid_unaccepted: ["paid-review", "paid-incomplete"], refunded: ["refunded"], unscheduled: ["unknown", "review"] };
  for (const [filter, ids] of Object.entries(expected)) {
    const result = await service.listPaymentAttempts({ status: filter });
    assert.deepEqual(result.attempts.map((row) => row.id).sort(), [...ids].sort(), filter);
  }
  assert.deepEqual((await service.listPaymentAttempts({ q: "PAY_PAID-REVIEW" })).attempts.map((row) => row.id), ["paid-review"]);
  assert.deepEqual((await service.listPaymentAttempts({ q: "3dk-old" })).attempts.map((row) => row.id), ["legacy"]);
  for (const language of ["ua", "en"] as const) {
    locale = language; const html = await render(); const t = translations[language].admin.paymentAttempts;
    const sidebar = sourceModule<typeof import("../src/components/admin/admin-sidebar")>("src/components/admin/admin-sidebar.tsx", {
      react: React, "react/jsx-runtime": jsxRuntime, "lucide-react": icons,
      "next/link": { default: (props: object) => React.createElement("a", props), __esModule: true },
      "next/navigation": { usePathname: () => "/admin/payment-attempts" }, "next-auth/react": { signOut: () => { throw new Error("NO_ACTIONS_IN_DIAGNOSTICS_QA"); } },
      "@/lib/utils": { cn: (...values: unknown[]) => values.filter(Boolean).join(" ") }, "@/store/lang-store": { useLangStore: () => ({ t: translations[language] }) }, "@/components/layout/lang-switcher": { LangSwitcher: () => null },
    });
    const navigation = renderToStaticMarkup(React.createElement(sidebar.AdminSidebar));
    assert.match(navigation, /href="\/admin\/payment-attempts"[^>]*aria-current="page"/);
    assert.ok(navigation.includes(translations[language].admin.nav.paymentAttempts));
    for (const label of [translations[language].admin.nav.paymentAttempts, t.states.awaiting, t.states.processing, t.states.failed, t.states.expired, t.states.unknown, t.states.review, t.paidWarning, t.noCheck]) assert.ok(html.includes(label), label);
    assert.ok(html.includes('method="get"')); assert.ok(html.includes('overflow-x-auto')); assert.ok(html.includes("UAH"));
    assert.ok(html.includes("QA &lt;Customer&gt;"));
    assert.ok(!html.includes('method="post"') && !html.includes("formAction") && !html.includes("create-ttn") && !html.includes("/admin/orders/"));
    if (language === "en") assert.doesNotMatch(html, /[А-Яа-яІіЇїЄєҐґ]/);
    for (const secret of ["PRIVATE_HOSTED_URL", "PRIVATE_RETRY_HASH", "PRIVATE_PAYLOAD_HASH", "PRIVATE_CAPABILITY", "PRIVATE_EMAIL", "PRIVATE_PHONE", "PRIVATE_ADDRESS", "PRIVATE_NOTIFICATION_PAYLOAD", "PRIVATE_SECRET_IN_ERROR", "PRIVATE_TOKEN"]) {
      assert.ok(!html.includes(secret)); assert.ok(!JSON.stringify(all).includes(secret));
    }
  }
  rows = Array.from({ length: 61 }, (_, index) => snapshot(`attempt-${String(index).padStart(3, "0")}`, { paymentReference: `pay_unique_${index}` }));
  rows.push(snapshot("boundary-next-day", { createdAt: new Date("2026-11-15T00:00:00Z") }));
  const page1 = await service.listPaymentAttempts({ from: "2026-11-14", to: "2026-11-14", page: "1" });
  const page2 = await service.listPaymentAttempts({ from: "2026-11-14", to: "2026-11-14", page: "2" });
  assert.equal(page1.total, 61); assert.equal(page1.pages, 3); assert.equal(page1.attempts.length, 25); assert.equal(page2.attempts.length, 25);
  assert.equal(page1.attempts[0].id, "attempt-060"); assert.equal(page2.attempts[0].id, "attempt-035", "Equal creation timestamps require a deterministic ID tie-breaker");
  assert.ok(page1.attempts.every((row) => !page2.attempts.some((next) => next.id === row.id)));
  const last = await service.listPaymentAttempts({ from: "2026-11-14", to: "2026-11-14", page: "999999" });
  assert.equal(last.page, 3); assert.equal(last.attempts.length, 11); assert.equal(lastQuery.skip, 50);
  assert.equal((await service.listPaymentAttempts({ from: "2026-11-15" })).total, 1);
  const links = await render({ from: "2026-11-14", to: "2026-11-14", status: "awaiting", q: "attempt", page: "2" });
  assert.ok(links.includes("page=1") && links.includes("page=3") && links.includes("from=2026-11-14") && links.includes("status=awaiting") && links.includes("q=attempt"));
  for (const invalid of [{ from: "2026-02-30" }, { from: "2026-11-15", to: "2026-11-14" }, { status: "PAID" }, { q: "https://secret.invalid" }, { status: ["failed", "all"] }]) {
    const before = reads; assert.ok((await service.listPaymentAttempts(invalid)).filters.invalid); assert.equal(reads, before);
  }
  rows = []; assert.ok((await render()).includes(translations.en.admin.paymentAttempts.empty));
  const operational = snapshot("paid", { number: "0004", checkoutAcceptance: "ACCEPTED", paymentStatus: "PAID", paidAt: new Date() });
  assert.equal(where(operational, operationalOrderWhere as Row), true);
  assert.equal(where(snapshot("technical"), operationalOrderWhere as Row), false);
  console.log("PASS Payment Attempts: server ADMIN-only reads; provisional/REVIEW/legacy visibility; accepted/COD exclusion; SQL-null-safe labels/filters; stable pagination/UTC date boundaries/search; UA/EN; selected DTO/HTML secret exclusion; read-only controls. No DB/network/payment effects.");
}
verify().catch((error) => { console.error(error); process.exitCode = 1; });
