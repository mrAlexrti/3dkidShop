# Batch 1.7 revised gate: print-on-demand orderability

This document supersedes the availability, stock lifecycle and schema portions of
the earlier Batch 1.7 audit. Mono security, payment normalization, Nova Poshta
hardening and the other previously stated restrictions continue to apply.

## Approval and implementation state

The user approved the product boolean, six payment fields, two indexes and one-time
mapping. These are reflected in the local schema/SQL and application code. At the
release preparation checkpoint the migration is not yet applied. The later release
instruction confirms Neon `StikerSuite` / `production` / `Default` and authorizes
read-only preflight plus the exact SQL only after this branch is committed/pushed.
Production deployment remains unapproved. Implementation/test results and the
release target are in [BATCH_1_7_REPORT.md](BATCH_1_7_REPORT.md).

All earlier inventory-coupled draft logic has been removed from application code
and active tests. Product.stock remains only legacy schema/migration data and inert
regression fixtures. Runtime source has no dependency on it. The audit tables below
record the pre-change uses and their replacements, not unfinished implementation.

## Revised business model

| Publication | Global orderability | Storefront |
| --- | --- | --- |
| `isActive = true` | `isOrderable = true` | Visible; ordering enabled when valid size selection/pricing requirements are met |
| `isActive = true` | `isOrderable = false` | Visible; localized temporarily-unavailable message and disabled ordering |
| `isActive = false` | Either value | Hidden; rejected at checkout |

Publication and manufacturing availability are separate. Do not add
`isOrderable: true` to storefront visibility queries. Global orderability overrides
all future variant combinations. Prices, existing option ownership/selection and
positive-integer quantity remain server-validated. No payment/order/delivery event
changes the legacy numeric stock field.

## Exact Prisma proposal

Existing Product fields remain unchanged:

```prisma
stock    Int     @default(0)    // Legacy compatibility data only.
isActive Boolean @default(true) // Publication only.
```

Proposed Product addition:

```prisma
isOrderable Boolean @default(false)
```

Use a required boolean in the final model. A temporary nullable column exists only
inside the migration transaction while existing values are mapped. The conservative
default applies to future inserts that omit the field; Admin explicitly sets a
checkbox. New product forms should start with orderability unchecked so publishing
and accepting manufacture orders are deliberate independent choices. There is no
runtime NULL/fallback-to-stock state after the migration commits.

Keep exactly these Order additions, all nullable with no defaults:

```prisma
paymentInvoiceId      String?
paymentProviderStatus String?
paymentModifiedAt     DateTime?
paymentExpiresAt      DateTime?
paymentNextCheckAt    DateTime?
paymentErrorCode      String?

@@unique([paymentProvider, paymentInvoiceId])
@@index([paymentProvider, paymentNextCheckAt])
```

No reservation enum, reservation field, stock timestamps, quantity inventory model,
new variant schema, rename, drop or historical field type change is proposed.
Existing Order payment fields keep their existing types and semantics. The new
Order fields stay NULL for historical orders; no order backfill is planned. Persist
only bounded provider identifiers/status/error codes and timestamps, not payloads,
card data or secrets.

## Existing-product mapping and exact SQL proposal

Map every existing Product, including hidden products:

- `stock > 0` -> `isOrderable = true`.
- `stock <= 0` -> `isOrderable = false`.
- Do not modify `stock` or `isActive`.

The mapping preserves the old product-level positive-stock ordering gate at the
cutover. It deliberately removes quantity caps: after migration a product with
legacy stock 1 can accept quantity 10 if globally orderable. Existing size
selection/pricing restrictions still apply. Current cards permit ordering when
their optional stock prop is missing; production page mappings do supply stock,
and the replacement should require an explicit boolean rather than retaining that
implicit allow behavior.

Exact unapplied SQL, also saved for review in
`prisma/changes/batch-1-7-additive.sql`:

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

PostgreSQL documents adding a column without a default, populating its values, then
adding the default/constraints. `SET NOT NULL` validates existing values. The DDL
locks are retained through the transaction. See the official
[modifying tables documentation](https://www.postgresql.org/docs/current/ddl-alter.html)
and [ALTER TABLE reference](https://www.postgresql.org/docs/current/sql-altertable.html).
No DB server version, target, row counts, triggers or live data have been inspected;
the target-specific preflight remains a separately approved step. Updating Product
can fire existing DB triggers if any exist; do not assume unknown triggers absent.

This script is single-use and intentionally fails if expected new objects already
exist. Do not use IF NOT EXISTS or rerun the data mapping to overwrite subsequently
edited booleans. No command to execute it is authorized at this gate.

## Compatibility, cutover and rollback

Before migration, leave the accepted deployed application behavior intact. The new
code requires the new column and must not run against an unmigrated database; do
not add an implicit legacy-stock fallback. The current local draft is under review.

For a later approved cutover, pause checkout and product writes, verify a backup
and intended target, apply the approved SQL transaction, release matching code, then
resume writes. The maintenance interval prevents old code from decrementing stock
or changing numeric availability after the mapping. Do not activate Mono or a new
production scheduler merely because local schema/code preparation is approved.

After migration, the boolean is the sole product-level availability source. Admin
edits the boolean independently of publication. Stock values remain unchanged and
may diverge from orderability intentionally. New inserts default false unless
explicitly set true; all create/import/fixture paths must make their intent explicit.

If this SQL transaction fails, rollback leaves the old schema/data intact. After
successful adoption, retain the additive columns during application rollback.
Do not recalculate stock from the boolean, reverse-copy the boolean into stock,
reapply the initial mapping, or drop payment metadata automatically. A rollback to
old stock-based code can misrepresent availability once booleans have been edited;
pause ordering and use an availability-aware rollback build instead. Pending Mono
invoices still need verified callback/reconciliation handling during rollback.

## Product.stock audit: application changes required

These are the complete direct stock/reservation references found in current
`src`, `prisma` and `scripts`, grouped by their purpose. Source-only references are
distinguished from historical fixtures; no affected DB script has been executed.

| File(s) | Current use | Corrected behavior |
| --- | --- | --- |
| `prisma/schema.prisma` | Legacy integer stock; local payment additions | Keep stock unchanged; propose isOrderable; reservation enum/field removed |
| `prisma/changes/batch-1-7-additive.sql` | Previously proposed reservation DDL | Replaced with the proposed boolean mapping and six payment fields; never execute without approval |
| `src/lib/actions/products.ts` | Validates and writes numeric stock on create/update | Validate the checkbox independently of isActive; write isOrderable; omit stock from normal create/update data so existing stock is preserved and new legacy stock keeps its existing DB default |
| `src/components/admin/product-form.tsx` | Numeric stock input and defaults | Remove numeric input; checkbox UA `Доступно до замовлення`, EN `Available to order`; retain independent publication checkbox |
| `src/app/admin/products/page.tsx` | Stock column/value | Show boolean orderability separately from published/hidden status |
| `src/app/admin/products/[id]/edit/page.tsx` | Passes numeric stock into form | Pass boolean isOrderable instead |
| `src/app/(shop)/page.tsx` | Maps stock into homepage cards | Map explicit boolean; retain isActive-only visibility filter |
| `src/app/(shop)/catalog/page.tsx` | Maps stock into catalog cards | Same; unavailable products remain visible |
| `src/app/(shop)/product/[slug]/page.tsx` | Passes stock into purchase controls and related cards | Pass boolean; preserve published-only product lookup and related-product visibility |
| `src/components/product/product-card.tsx` | Numeric quick-add/aria guards | Explicit boolean guard plus actual disabled ordering; keep product link usable |
| `src/components/product/product-options.tsx` | Numeric availability, quantity cap, Add label | Boolean global guard; retain valid size/price selection; remove stock-based plus-button cap |
| `src/components/catalog/product-grid.tsx` | Optional stock card DTO property | Require explicit boolean orderability |
| `src/components/home/featured-products.tsx` | Optional stock card DTO property | Require explicit boolean orderability |
| `src/components/product/related-products.tsx` | Optional stock card DTO property | Require explicit boolean orderability |
| `src/types/index.ts` | ProductWithRelations.stock field | Replace application availability contract with isOrderable; a legacy stock property, if retained, must be explicitly diagnostic rather than a gate |
| `src/lib/actions/create-order.ts` | Quantity-vs-stock check, conditional decrement and new reservation marker | Reload and require isActive + isOrderable and valid selected size; no stock update, quantity comparison or reservation marker |
| `src/lib/payments/transitions.ts` | New reserve/consume/release coupling and product increments | Delete all product mutations and reservation dependencies; retain financial CAS, invoice binding and semantic payment events |
| `src/lib/actions/orders.ts` | New unpaid-reservation cancellation path | Cancel payment/order conservatively through financial state transitions; no product mutation |
| `src/app/api/admin/orders/[id]/create-ttn/route.ts` | New reservation-release guard | Remove reservation dependency; retain cancelled-order/confirmed-online-payment guards and existing duplicate-TTN protection |
| `src/lib/payments/mono-state.ts` | New comment ties refund review to stock | Describe financial evidence only; keep provider normalization separate from availability |
| `src/lib/i18n.ts` | Stock labels, out-of-stock copy, size shared-stock text and newly added reservation-result copy | Replace active UI copy with orderability/manufacture wording; remove reservation wording; preserve UA/EN parity and normalized payment labels |

Indirect paths inspected:

- `src/store/cart-store.ts`, `src/lib/cart-items.ts`, and
  `src/components/cart/cart-drawer.tsx` contain no stock-based cap. Preserve that.
  Persisted cart entries never authorize availability; checkout revalidates them.
  Use positive safe-integer validation for quantity changes/merges.
- `src/components/checkout/checkout-form.tsx`, `checkout-page.tsx` and
  `src/lib/validations/checkout.ts` do not use stock as an availability authority;
  form errors should surface the server's localized orderability rejection.
- `src/lib/product-variants.ts` and `product-size-admin.ts` contain no stock
  mutations. They provide size ownership, explicit prices, stable value IDs and
  immutable snapshots. Preserve these and prepare their future extension below.
- `prisma/seed.ts` does not currently create products or manipulate stock. Its
  unrelated user/category writes must not be run for this task.

## Regression and maintenance-script changes required

| File(s) | Change |
| --- | --- |
| `scripts/verify-batch17-payments.ts` | Remove reserve/consume/release expectations; keep financial/signature/identity/amount/currency/staleness/URL/cron/notification tests. Assert zero product mutation for every online/offline creation and payment outcome, including refund and setup failure. Add active/orderable combinations and legacy stock 0/1/large invariance. Concurrent POD orders may all succeed; they must not exhaust a product. Keep number collision/uniqueness checks. |
| `scripts/payment-memory.ts` | Remove reservation fixtures and inventory arithmetic as payment behavior; add explicit product booleans. Make product writes fail loudly in payment tests, while allowing deliberate Admin boolean tests in separate mocks. |
| `scripts/verify-order-flow.ts` | Replace real-stock decrement/oversell cases with orderability revalidation and zero stock mutation. Keep its DB integration execution separately gated; do not run its real transactions now. |
| `scripts/verify-unified-catalog.ts` | Replace stock guards with explicit available/unavailable boolean cases; preserve links, sizing, GIF and responsive behavior |
| `scripts/verify-checkout-render.ts` | Replace stock prop/cap fixtures; cover unavailable products and size selection without inventory caps |
| `scripts/verify-responsive.ts`, `scripts/verify-admin-responsive.ts` | Pass explicit booleans; update availability copy/toggle assertions while preserving mobile/desktop layout checks |
| `scripts/verify-size-editor.ts` | Supply checkbox state in Admin form fixture; assert stock is preserved rather than editable; keep size ownership, prices and rollback checks. DB execution stays gated. |
| `scripts/verify-product-search.ts`, `scripts/verify-product-media.ts` | Explicit isOrderable fixture values after migration; stock numbers may remain legacy inert test data. Do not execute their DB operations without separate approval. |
| `scripts/configure-development-size-fixtures.ts` | Existing 49/50 stock assertions are guards on historical protected data, not runtime availability. Preserve those safety guards or label them legacy; do not reinterpret them or run this data-writing script. |

Keep the existing 69 Nova Poshta classification cases, Batch 1.6 semantic
notifications, legacy LiqPay, payment result and cart regressions. Update mocks
where removed reservation imports change. No real payment, carrier or notification
calls are permitted during verification.

## Checkout and payment lifecycle after correction

1. Validate input, positive safe-integer quantities and existing cart-size limits.
   Remove the new draft's arbitrary 1,000,000-unit cap. The existing PostgreSQL
   OrderItem Int range and Decimal total range remain explicit technical
   representability checks, never inventory/business limits.
2. Inside the order-acceptance transaction, reload published products, their
   isOrderable flags and selected size values/prices from the DB. Validate all
   submitted identities belong to the product and configured price-bearing size
   selections are complete. Client labels/prices/availability have no authority.
3. Serialize acceptance against a concurrent Admin availability toggle with
   parameterized, consistently ordered Product row reads using `FOR SHARE` (or an
   equivalent reviewed transactional approach). This permits concurrent POD orders
   and makes the toggle/order-acceptance boundary clear without a fake stock write.
   Existing Admin edits update the Product row before editing sizes; maintain that
   transaction ordering. Do not claim a plain stale pre-transaction read is enough.
4. Reject missing, inactive or not-orderable products with localized errors. Do not
   compare quantity to legacy stock or persist a stock reservation. Accept multiple
   simultaneous manufacture orders without counting down finished units.
5. Calculate integer minor-unit prices and totals from trusted DB values. Generate
   the public order number with cryptographic entropy and unique-constraint retry.
6. Create the order and its immutable item/size/price snapshots. COD and pay-on-pickup
   then follow their existing independent delivery/payment paths; neither calls Mono.
7. For card payment, create and persist the hosted Mono debit invoice. If setup
   fails, use idempotent financial-state CAS to cancel/mark the unpaid order and
   store a sanitized error; return a localized error. No stock compensation exists.
   If success already won, preserve the financial fact. A late payment for a
   cancelled order requires manual order review, with no inventory implication.
8. Webhook/reconciliation validate signature, invoice/reference, amount, currency,
   association and provider modifiedDate before financial transitions. Preserve
   Batch 1.6 normalized statuses and winner-only notifications. No payment outcome
   (including expired/refunded) or Admin order cancellation changes Product.stock
   or Product.isOrderable. Expiry reconciliation remains necessary for payment
   consistency, without any inventory-release duty.

Nova Poshta eligibility remains an explicit payment-method decision. Keep the
existing server-authoritative COD amount, duplicate-TTN protection and negative
text hardening. No new undocumented payload/status assumptions or separate NovaPay
acquiring API are authorized. The official developer portal's HTTP 403 remains an
unresolved exact-contract verification limitation.

## Batch 1.8: concrete combination availability, not per-value flags

Existing structure is Product -> ProductOption (group) -> ProductOptionValue
(stable value ID). Current checkout recognizes size groups with explicit value
prices; cart identity is product + size value ID, and OrderItem.optionsJson stores
an immutable versioned size snapshot. Current size-editing code intentionally
rejects multiple/non-size groups, which must be deliberately extended in 1.8.

Recommended future model, conceptual only:

- A product-scoped variant/combination record with its own stable ID,
  `isOrderable` and canonical combination key.
- Selection rows connect that record to ProductOption groups and
  ProductOptionValue IDs, with at most one selected value per group and ownership
  checks ensuring every value belongs to that product/group.
- Uniqueness per product + canonical sorted option/value identities prevents the
  same combination being entered twice. Labels and array order are not identity.
- Options are dimensions; do not hardcode size/color database columns. Red+Small
  and Red+Medium are distinct records with independent booleans.
- Size-only and color-only products select one dimension. Simple products need
  only the product-level flag. Missing combination management does not activate a
  new restriction in 1.7. Once explicitly enabled in 1.8, a missing/disabled concrete
  combination must fail closed rather than combining independent size/color flags.
- Cart/checkout should carry a combination ID plus selected stable value IDs, both
  revalidated on the server. Preserve existing size-only carts through an explicit
  compatibility adapter. Introduce a versioned immutable multi-option order-item
  snapshot; later option edits/deletions cannot rewrite historical orders.
- Extend the Admin option lifecycle so retiring values cannot orphan live
  combinations or history. Existing size-price behavior stays unchanged in 1.7;
  combined pricing and safe value retirement need review in the 1.8 design.

Effective future orderability is always:

```text
Product.isActive
AND Product.isOrderable
AND selected concrete combination is orderable (when combination management applies)
```

This supports Red+Small enabled, Red+Medium/Red+Large disabled, and all White sizes
enabled, while one Product.isOrderable toggle still stops every combination.
No Batch 1.8 tables or color functionality are proposed for execution now.

## Next database approval

Local schema/code preparation is approved and complete. The exact Neon Production
target and conditional execution of the reviewed SQL are now separately approved.
The release must commit/push before DB preflight, stop on unexpected schema/push/
migration state, and stop again before Production deployment. No migrate/db push or
additional migration is authorized. The final Prisma diff, SQL, expected mapping
and rollback considerations remain unchanged.

Confirmed: no real payment, TTN, NovaPay operation, email or Telegram; no `.env`
changes; no push, deployment, merge, Vercel change or commit. All work remains
uncommitted and the unapplied SQL is a review artifact only.
