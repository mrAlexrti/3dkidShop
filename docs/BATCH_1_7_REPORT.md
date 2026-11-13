# Batch 1.7 local implementation report

Branch: `batch-1-7-mono-novapay-stock`.
Accepted base: `9f03f97f467e0de3b9abc9d04a65f6ec309da50b`.
Release candidate prepared for the user-approved commit and branch push. The user
confirmed Neon Production and authorized the exact reviewed additive SQL only after
a successful push and matching read-only preflight. This document records release
preparation before database execution; the execution result is reported separately.
Production deployment/promotion, main merge, environment edits and real external
transactions remain unapproved. No runtime change followed the successful checks.

## Print-on-demand availability

Product.isActive retains publication/visibility semantics. Product.isOrderable is
an independent required boolean, default false, labelled `Доступно до замовлення` /
`Available to order`. Admin edits a checkbox; the products table shows orderability
separately from publication. Numeric stock editing is removed from normal Admin
forms/actions. Forged stock form data is ignored rather than persisted.

Published unavailable products remain visible with ordering disabled. Homepage,
catalog, related/featured products and the product page pass an explicit boolean.
Product size selection and trusted prices still apply. Product quantity controls
and cart do not cap quantities using legacy stock. Checkout checks positive integer
quantities, the existing 100-line request bound, PostgreSQL Int representability and
the existing Decimal total range; there is no new commercial quantity maximum.

Order acceptance obtains actual PostgreSQL `FOR SHARE` locks on parameterized,
consistently ordered Product IDs, reloads product/options/prices, and creates Order
inside the same transaction. It requires isActive + isOrderable and valid selected
size ownership/pricing. Normal Admin product edits acquire a Product write lock
before updating size records. Concurrent POD orders can share the read locks.
The SQL/query contract is covered by isolated mocks; actual PostgreSQL locking has
not been exercised because DB operations are not approved.

No runtime source under `src` reads or writes Product.stock. No reservation enum,
marker, consumption, decrement, restoration or payment-driven availability mutation
remains in application code or active tests. Legacy stock is preserved in Prisma
only for the one-time compatibility mapping and expand/migrate/contract rollout.
Physical column removal is technical debt for a later batch after all deployed
versions have migrated; old code must not resume stock-based behavior after cutover.

## Schema, exact SQL and database gate

Local Prisma/client preparation adds only:

```prisma
// Product
isOrderable Boolean @default(false)

// Order: nullable, no defaults
paymentInvoiceId      String?
paymentProviderStatus String?
paymentModifiedAt     DateTime?
paymentExpiresAt      DateTime?
paymentNextCheckAt    DateTime?
paymentErrorCode      String?

@@unique([paymentProvider, paymentInvoiceId])
@@index([paymentProvider, paymentNextCheckAt])
```

Existing fields have not been renamed, dropped or had their types changed. Historical
Order rows will retain NULL in all six additions; no order backfill is planned.
Product.isOrderable is populated from legacy stock exactly once during migration:
positive -> true, zero/negative -> false, including hidden products. Publication,
legacy stock values, totals, order history and existing payment snapshots stay intact.

The exact unapplied file is [batch-1-7-additive.sql](../prisma/changes/batch-1-7-additive.sql):

```sql
BEGIN;
ALTER TABLE "Product" ADD COLUMN "isOrderable" BOOLEAN;
UPDATE "Product" SET "isOrderable" = ("stock" > 0);
ALTER TABLE "Product"
  ALTER COLUMN "isOrderable" SET DEFAULT false,
  ALTER COLUMN "isOrderable" SET NOT NULL;
ALTER TABLE "Order"
  ADD COLUMN "paymentInvoiceId" TEXT,
  ADD COLUMN "paymentProviderStatus" TEXT,
  ADD COLUMN "paymentModifiedAt" TIMESTAMP(3),
  ADD COLUMN "paymentExpiresAt" TIMESTAMP(3),
  ADD COLUMN "paymentNextCheckAt" TIMESTAMP(3),
  ADD COLUMN "paymentErrorCode" TEXT;
CREATE UNIQUE INDEX "Order_paymentProvider_paymentInvoiceId_key"
  ON "Order" ("paymentProvider", "paymentInvoiceId");
CREATE INDEX "Order_paymentProvider_paymentNextCheckAt_idx"
  ON "Order" ("paymentProvider", "paymentNextCheckAt");
COMMIT;
```

Sanitized local configuration metadata, read without connecting:

| Property | Target |
| --- | --- |
| Source | Local `.env`, line 1; no inherited DATABASE_URL override |
| Engine | PostgreSQL |
| Host | `ep-jolly-cell-ai0scrqk.c-4.us-east-1.aws.neon.tech` |
| Port | `5432` |
| Database | `neondb` |
| Schema | `public` |
| Project / branch / role | User-confirmed `StikerSuite` / `production` / `Default` |
| Environment | Production, explicitly confirmed by the owner |
| Pooled host | `ep-jolly-cell-ai0scrqk-pooler.c-4.us-east-1.aws.neon.tech` |
| Shared endpoint ID | `ep-jolly-cell-ai0scrqk` |

No credentials, username, query parameters or connection-string value were printed.
At this pre-execution release checkpoint no connection, SQL execution, migration,
db push, seed or backfill has run. Target identity and conditional execution are now
approved by the owner. The approved command, not yet executed at this checkpoint,
is `prisma db execute --file prisma/changes/batch-1-7-additive.sql --schema prisma/schema.prisma`
using the installed local CLI. Client generation has already run locally.

For later approved execution: verify the target/backup/drift/trigger behavior and
row counts, pause old checkout/product writers, apply the transaction during an
approved maintenance interval, release matching code, then resume service. The SQL
is single-use and stops on existing objects rather than overwriting edited booleans.
New code must not be deployed against the old schema. ADD/ALTER/UPDATE/index work
can lock the tables; live size/traffic have not been inspected.

Transaction failure rolls back the additions/mapping. After successful adoption,
keep additive fields during rollback and retain pending invoice metadata. Do not
drop columns or recopy between stock and orderability. Use an availability-aware
rollback build; old stock-based code becomes semantically unsafe once booleans or
new products diverge from the legacy field. No automatic rollback SQL is supplied.

## Mono checkout and invoice setup

New card orders are Mono-only, explicitly enabled by server configuration. LiqPay
settings cannot select the new provider. After transactional validation/pricing and
Order creation, the server sends integer kopecks, UAH 980, debit, the public order
reference, a description, customer email, server-derived webhook URL and signed
result URL. Invoice validity is one hour. No optional basket, fiscalization,
tokenization, saved-card or subscription fields are invented.

Only a validated HTTPS `pay.mbnk.biz/<invoiceId>` hosted page is returned. Browser
redirect uses that pageUrl. Apple Pay/Google Pay are left to the hosted page where
supported; no native wallet integration is added. Site origin is configured server
side, never derived from a client Host header. API origin is fixed and upstream
redirects are rejected; credentials never appear in URLs, payloads returned to the
browser, diagnostics or logs.

Invoice identity is persisted before returning the hosted URL. Network/invalid
response/setup failure cancels the unpaid financial/order state through snapshot
compare-and-set, stores a sanitized code and returns localized checkout feedback.
There is no inventory compensation. No blind invoice-create retry is performed:
a timed-out request may have created an invoice. A verified later payment remains
a financial fact and flags a cancelled order for manual review. A failure to persist
cleanup is logged generically and initialization recovery remains scheduled.

## Webhook verification, identity and event ordering

`POST /api/payments/mono/webhook` reads at most 32 KiB of raw bytes, even without a
Content-Length header. It verifies canonical base64 x-sign using ECDSA/SHA-256 over
those exact bytes. Public keys come from Mono's authenticated pubkey endpoint,
are cached per token fingerprint with a 24-hour TTL, use one in-flight fetch and
a 60-second refresh cooldown. Failed verification permits one controlled refresh/
retry; malformed/invalid signatures are rejected. Warm valid deliveries do not
fetch a key each time. Key lookup failures return a retryable service error.

After signature verification, validate bounded identifiers, reference, amount,
currency and the order's provider/mode association. An existing invoice cannot be
replaced by another invoice. For an early webhook or lost create response where
the invoice is not yet bound, a signature/reference alone is insufficient: query
that invoice using this merchant's token and verify its reference/amount/currency
before transactional first binding and application of the current server snapshot.

The same provider-neutral transition service handles webhook and reconciliation.
It stores only selected IDs/status/timestamps/sanitized codes, never raw provider
payloads. A strictly newer modifiedDate is required. Older events are no-ops;
identical same-time financial snapshots are duplicates; conflicting same-time
evidence returns a conflict rather than choosing arrival order. Missing/invalid
timestamps cannot overwrite financial state. Snapshot CAS covers financial/order
and fulfillment inputs. Only a persisted winner emits semantic notifications.

## Normalized mapping and payment result

| Provider evidence | Batch 1.6 payment |
| --- | --- |
| created / processing | PENDING |
| unexpected hold | PENDING + review code |
| validated full success | PAID |
| failure | FAILED |
| failure with documented customer cancellation error 8002 | CANCELLED |
| expired | CANCELLED, with localized expired result |
| completed reversed payment | REFUNDED |
| unknown/partial/inconsistent evidence | UNKNOWN/review, or retained prior verified financial fact |

Partial refund/pending cancellation data never proves full refund. A later pending
or failed snapshot cannot erase known paidAt. Refunded history is preserved. No
payment event changes Product.stock or Product.isOrderable. Legacy order enum
helpers and normalized Order/Payment/Delivery separation remain intact.

Result page/API still require the expiring status-only capability and read trusted
DB state. UA/EN render confirmed offline order, verified paid, pending, failed,
cancelled, expired, unknown, unavailable and late-payment review distinctly. Browser
return parameters never authorize success. Pending/unknown polling is bounded and
network failure is not converted into payment failure.

## Expiration reconciliation

`GET /api/cron/payments` uses the existing CRON_SECRET Bearer model and constant-time
comparison. It claims up to 25 due orders using paymentNextCheckAt; five-minute
leases survive worker crashes and failed API queries back off ten minutes. Older
due rows are selected first. Known invoices use Mono's status GET; local wall-clock
expiry does not prove an invoice unpaid or override processing/success. Status
queries validate the same identity/amount/currency and share the transition CAS.
Initialization with no invoice ID has a persisted deadline/grace period; abandoned
setup cancels an unpaid order idempotently. No production scheduler was added.

Operational durability therefore still requires an approved scheduler. Proposed
cadence is five minutes, capacity 25 per invocation; assess volume before activation.
No Vercel configuration or existing NP GitHub workflow was edited or triggered.

## Nova Poshta / NovaPay and legacy LiqPay

COD is an exact allowlist of the current machine method and historical labels.
Only real COD orders request existing Recipient/Money backward delivery, with the
amount from persisted Order.total. Online provider/paid orders and pay-on-pickup
carry no money-return instructions. TTN route ignores client totals, requires ADMIN,
blocks cancelled or unpaid online orders, and preserves existing-TTN short-circuit
and conditional persistence/notification protection.

COD tracking payment inference now requires explicit COD method, no online provider,
an exact positive financial-status text and reliable status source. Card-description
fallback remains diagnostic only; known amount mismatch prevents paid inference.
`unpaid`, `not paid`, `not delivered`, unknown/numeric COD codes remain non-positive.
Delivery and payment remain independent. No new carrier API fields/numeric mappings
or separate NovaPay internet acquiring were added.

Official developer docs returned HTTP 403; exact current backward-money/tracking
field semantics remain a contract-verification limitation. Existing payload fields
were retained conservatively. Service documentation does not establish a separate
NovaPay acquiring requirement. The existing race allowing two outbound carrier calls
before one local TTN save remains; no claim of external exactly-once TTN creation.

Historical LiqPay implementation/callback/diagnostic route remain isolated behind
their sandbox credential validation, independent of active Mono checkout config.
They cannot update Mono orders. No historical payment conversion or destructive
compatibility removal was performed.

## Notifications

Reuse Batch 1.6 ORDER/PAYMENT/DELIVERY events, templates and Admin channel toggles.
Created orders emit existing creation/pending semantics; financial transitions emit
paid/failed/cancelled/refunded events without provider-specific templates. Duplicate
callbacks do not duplicate persisted transitions or semantic notification dispatch.
Sandbox dispatch suppression remains. Tests mock dispatch/transport boundaries.

Delivery stays best effort after commit, without a durable outbox or automatic
per-channel replay. Async customer email locale still defaults to UA because no
persisted locale field was added. No real email or Telegram was sent.

## Verification

| Check | Result and scope |
| --- | --- |
| Prisma client generation | PASS, local schema/client only; no DB connection |
| `verify-batch17-payments.ts` | PASS: actual Mono/action/webhook/transition/reconciliation code with mocks; invoice request/kopecks/URL, ECDSA valid/invalid/cache/rotation, body/identity/amount/currency, duplicates/staleness/conflicts, unknown/refund/expiry/setup failure/early merchant-bound event, cron auth, orderability/publication/size/legacy quantity independence, zero Product writes, collision/concurrency |
| `verify-batch17-cod.ts` | PASS: trusted COD amount vs forged client body, COD-only money return, online/pickup exclusion, pending-online guard, TTN duplicate/auth, reliable status/amount/method-specific settlement |
| `verify-batch17-availability.ts` | PASS: actual Admin form/action, independent checkbox states, UA/EN, no numeric stock control/write, forged stock ignored and ADMIN auth |
| `verify-novaposhta-status.ts` | PASS: all existing 69 classification cases plus normalization; card-description payment false-positive expectation corrected |
| `verify-batch16-notifications.ts` | PASS: normalized stages/events, settings/channel toggles, locales, sandbox, auth and transition concurrency |
| `verify-batch14-payments.ts` | PASS: historical LiqPay signatures/association/amount/currency/state/idempotency and result-capability compatibility |
| `verify-batch14-payment-ui.ts` | PASS: nine UA/EN result states, no redirect false success, hosted handoff/cart retention and bounded polling |
| `verify-checkout-render.ts` | PASS: actual UA/EN purchase/size/checkout renders with explicit boolean availability |
| `verify-unified-catalog.ts` | PASS: UA/EN cards, boolean guard, size routing, links, GIF and filters/pagination |
| `verify-cart.ts` | PASS: actual cart merge/size identities/quantity/totals/persistence with in-memory storage |
| `verify-storefront.ts` | PASS: UA/EN key parity, SSR/cookie/state/persistence compatibility |
| `verify-responsive.ts` | PASS: 216 viewport renders; UA/EN storefront/product/cart/checkout; no horizontal overflow; desktop CSS screenshots identical |
| `verify-admin-responsive.ts` | PASS: 242 viewport renders and 40 desktop comparisons; UA/EN forms/tables/diagnostics/drawer interactions; strict geometry and <=0.1% raster tolerance after normalizing only the approved availability-control change in historical fixtures |
| TypeScript `tsc --noEmit` | PASS; final checks also use incremental false to avoid tracked QA debris |
| ESLint | PASS; final run clean |
| `node scripts/verify-build-isolated.mjs` | PASS: production compilation, types, lint, 15 prerenders, traces; empty Prisma read fixtures with all DB writes/connections/provider fetch blocked; ignored QA output/config only |
| `git diff --check` + new-file whitespace checks | PASS at final review |

The initial Admin screenshot difference correctly detected the intended stock-to-
orderability control replacement. Historical fixtures now normalize only that
replacement; all other comparisons remain strict. Early build harness output/alias
issues were corrected before the successful final build. Normal build output
cleanup was interrupted to avoid spending time on old browser profiles. The final
QA build uses an ignored output directory and restores its known generated
next-env type-reference change. next.config, package/lockfile and production
deployment configuration remain unchanged. These fixture build artifacts must not
be deployed; build normally after an approved migration against the correct target.

The old DB-backed verify-order-flow runner was retired and delegates to the isolated
actual-source Batch 1.7 suite. Legacy stock-decrement/oversell assumptions are gone.
DB-backed size/media/search maintenance scripts were updated for boolean fixtures
but were not executed. No claims are made about real DB data/locks, live provider
delivery or real device keyboards/touch/carrier data.

## Environment names and remaining manual steps

Names only, no values: MONO_ACQUIRING_TOKEN, ONLINE_PAYMENT_MODE, SITE_URL /
NEXT_PUBLIC_SITE_URL, DATABASE_URL, AUTH_SECRET / NEXTAUTH_SECRET, CRON_SECRET.
Existing NP_API_KEY, NP_SENDER_REF, NP_CONTACT_SENDER_REF, NP_SENDER_CITY_REF,
NP_SENDER_ADDRESS_REF, NP_SENDER_PHONE and the existing optional NP settings remain.
Legacy LIQPAY_PUBLIC_KEY, LIQPAY_PRIVATE_KEY, LIQPAY_SANDBOX remain only where
historical sandbox compatibility is required. Existing notification transports use
RESEND_API_KEY, EMAIL_FROM, ADMIN_EMAIL, TELEGRAM_BOT_TOKEN, TELEGRAM_ADMIN_CHAT_ID.
No new separate NovaPay credential is required by the implemented carrier flow.

Release order: commit reviewed files, push this branch, optionally inspect automatic
Preview status read-only, then run approved Production preflight and exact SQL only
if all new columns are absent. Stop on push failure, partial/already-applied schema
or migration error. Read-only verification must confirm column types/defaults,
indexes, mapping totals and unchanged legacy stock. The final response records the
commit, push and actual DB outcome; this preparation document does not presume success.
Still separate: Production promotion/deployment, environment configuration, actual
locking tests on an approved test target, official NP contract verification,
scheduler activation and real external transaction approval.

## Prepared post-deployment smoke plan — not executed

For Production, minimize the gap between migration and the separately approved
deployment: verify Production target -> exact additive SQL -> compatible Prisma
client -> immediate Batch 1.7 deployment/promotion -> smoke tests -> mapping review.
Do not edit availability through the old Production Admin during that interval.
Old code can still decrement stock after the one-time mapping, while new code uses
isOrderable, so a long mixed-version period is unsafe. No Vercel change or promotion
is authorized by this report.

- Admin: product edit shows `Доступно до замовлення`; no numeric stock input;
  publication and orderability remain separate. Exercise toggles only on a separately
  approved QA product/fixture, then restore its flags; no business-data edit is part
  of the current migration authorization.
- Storefront: published/orderable can be added; published/unavailable stays visible
  with ordering disabled; unpublished stays hidden; quantity is independent of legacy
  stock. Inspect both UA/EN and mobile/desktop without creating an order.
- Checkout: verify unavailable-product rejection, trusted server prices, valid Mono
  hosted handoff and no success from return flags. Repeat isolated tests first. A
  hosted-provider handoff check that creates an invoice requires a separately
  approved provider test environment and notification/carrier isolation; do not
  create a real Production invoice/payment or submit a notification-producing order.
- COD: confirm only the COD method gets backward-money instructions and absence of
  an online provider alone never establishes COD eligibility/payment. Use mocked
  requests; no TTN or NovaPay collection operation.
- Historical: inspect authorized existing LiqPay orders read-only without exposing
  customer content; verify normalized Order/Payment/Delivery compatibility. No replay
  of live callbacks or notification delivery.

## Batch 1.8 and limitations

The revised gate documents a future product-scoped combination entity with stable
ID, canonical option-value selection identity and its own orderability. Selection
rows reference generic ProductOption/ProductOptionValue IDs, with one value per
group and same-product ownership checks. This supports product+size+color, size-only
or color-only combinations without hardcoded columns or per-size/per-color-only
availability. Product.isOrderable stays the global override. Missing combinations
fail closed once explicit combination management is enabled. Cart IDs and immutable
order option snapshots need a reviewed compatibility extension. No 1.8 schema or
color feature was implemented.

Other limits: one invoice per order, no checkout submission idempotency key,
no refunds UI/accounting/tokenization/native wallet integration, no durable
notification outbox, in-process public-key cache per warm worker, conservative
manual review for conflicting timestamps/partial refunds/late payment, existing
external TTN creation race, and official NP schema verification still outstanding.

At the preparation checkpoint: no real payment, live webhook, TTN, NovaPay operation,
email or Telegram; no `.env` changes, DB execution, deployment, main merge or Vercel
modification. Commit/push and conditional Production execution are explicitly
authorized by the later release instruction and will be reported with their results.

## Final Prisma diff

```diff
diff --git a/prisma/schema.prisma b/prisma/schema.prisma
index 83dac2a..86b4297 100644
--- a/prisma/schema.prisma
+++ b/prisma/schema.prisma
@@ -84,10 +84,11 @@ model Product {
   price         Decimal            @db.Decimal(10, 2)
   oldPrice      Decimal?           @db.Decimal(10, 2)
   sku           String?            @unique
-  stock         Int                @default(0)
+  stock         Int                @default(0) // Deprecated: compatibility/migration only; remove after verified rollout.
   isFeatured    Boolean            @default(false)
   isNew         Boolean            @default(false)
   isActive      Boolean            @default(true)
+  isOrderable   Boolean            @default(false)
   categoryId    String
   category      Category           @relation(fields: [categoryId], references: [id])
   images        ProductImage[]
@@ -186,6 +187,12 @@ model Order {
   paymentMode             String?
   paymentStatus           String?
   paidAt                  DateTime?
+  paymentInvoiceId        String?
+  paymentProviderStatus   String?
+  paymentModifiedAt       DateTime?
+  paymentExpiresAt        DateTime?
+  paymentNextCheckAt      DateTime?
+  paymentErrorCode        String?
   subtotal                Decimal     @db.Decimal(10, 2)
   shippingCost            Decimal     @default(0) @db.Decimal(10, 2)
   total                   Decimal     @db.Decimal(10, 2)
@@ -202,6 +209,9 @@ model Order {
   novaPoshtaError         String?
   items                   OrderItem[]
   createdAt               DateTime    @default(now())
+
+  @@unique([paymentProvider, paymentInvoiceId])
+  @@index([paymentProvider, paymentNextCheckAt])
 }

 model OrderItem {
```

## Changed-file manifest

59 reviewed release files against the accepted base. Generated QA artifacts are ignored.

```text
A docs/BATCH_1_7_AUDIT_SCHEMA_GATE.md
A docs/BATCH_1_7_PRINT_ON_DEMAND_SCHEMA_GATE.md
A docs/BATCH_1_7_REPORT.md
A prisma/changes/batch-1-7-additive.sql
M prisma/schema.prisma
A scripts/payment-memory.ts
M scripts/verify-admin-responsive.ts
M scripts/verify-batch14-payment-ui.ts
M scripts/verify-batch14-payments.ts
M scripts/verify-batch16-notifications.ts
A scripts/verify-batch17-availability.ts
A scripts/verify-batch17-cod.ts
A scripts/verify-batch17-payments.ts
A scripts/verify-build-isolated.mjs
M scripts/verify-checkout-render.ts
M scripts/verify-novaposhta-status.ts
M scripts/verify-order-flow.ts
M scripts/verify-product-media.ts
M scripts/verify-product-search.ts
M scripts/verify-responsive.ts
M scripts/verify-size-editor.ts
M scripts/verify-unified-catalog.ts
M src/app/(shop)/catalog/page.tsx
M src/app/(shop)/checkout/success/page.tsx
M src/app/(shop)/page.tsx
M src/app/(shop)/product/[slug]/page.tsx
M src/app/admin/products/[id]/edit/page.tsx
M src/app/admin/products/page.tsx
M src/app/api/admin/orders/[id]/create-ttn/route.ts
M src/app/api/cron/novaposhta/route.ts
A src/app/api/cron/payments/route.ts
M src/app/api/payments/liqpay/callback/route.ts
A src/app/api/payments/mono/webhook/route.ts
M src/app/api/payments/status/route.ts
M src/components/admin/product-form.tsx
M src/components/catalog/product-grid.tsx
M src/components/checkout/checkout-form.tsx
M src/components/checkout/order-result.tsx
M src/components/home/featured-products.tsx
M src/components/product/product-card.tsx
M src/components/product/product-options.tsx
M src/components/product/related-products.tsx
M src/lib/actions/create-order.ts
M src/lib/actions/orders.ts
M src/lib/actions/products.ts
M src/lib/i18n.ts
M src/lib/novaposhta.ts
A src/lib/order-number.ts
A src/lib/payments/legacy-liqpay.ts
A src/lib/payments/money.ts
A src/lib/payments/mono-state.ts
A src/lib/payments/mono.ts
M src/lib/payments/online-payment.ts
A src/lib/payments/payment-method.ts
M src/lib/payments/payment-state.ts
A src/lib/payments/reconciliation.ts
A src/lib/payments/transitions.ts
M src/store/cart-store.ts
M src/types/index.ts
```
