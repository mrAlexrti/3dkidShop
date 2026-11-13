# Batch 1.7.3 — Mono initialization and sequential order numbers

Branch: `batch-1-7-3-mono-checkout-fix`.
Base: Production `redesign-3dkid-v2`, commit
`50af29f299f9f944c3a5e029443c9261ef54fbcf`.
Local preparation only. Leave uncommitted/unpushed; no Production changes.

## Confirmed root cause and diagnostic limits

The base createOrder persisted an Order, immediately called notifyOrderCreated,
then attempted createMonoInvoice. Consequently a rejected invoice had already
produced an accepted-order Telegram/email notification. Retrying created another
order. The Mono wrapper discarded every non-2xx HTTP status as MONO_UNAVAILABLE;
all initialization failures were handled as the same uncertain cancellation.

That ordering/error-handling defect is confirmed in source. The exact upstream
Production rejection is NOT established: no live invoice or merchant API request
was made in this batch. The owner's reported HTTP 200 merchant/details check is
accepted; the real MONO_ACQUIRING_TOKEN was not retrieved, replaced or changed.
Checkout requires a valid email. Omitting customerEmails when an internal caller
supplies an empty email is defensive API handling, not an identified Production cause.

Official contracts rechecked:

- [Current create invoice](https://monobank.ua/api-docs/acquiring/methods/ia/post--api--merchant--invoice--create)
- [Official acquiring API including status/remove](https://api.monobank.ua/docs/acquiring.html)
- [Current invoice invalidation](https://monobank.ua/api-docs/acquiring/methods/ia/post--api--merchant--invoice--remove)
- [PostgreSQL transaction-scoped advisory locks](https://www.postgresql.org/docs/current/explicit-locking.html#ADVISORY-LOCKS)

The new docs portal contains crawler-directed instructions; those were ignored.
API facts were checked against the actual parameter/response documentation and
the official acquiring reference, including remove's empty HTTP 200 response.

## Online acceptance flow

1. Validate checkout and reprice/validate published, orderable products/options on
   the server, preserving Batch 1.7 print-on-demand behavior and Product row locks.
2. In one READ COMMITTED transaction, allocate the numeric number and create a
   provisional Order/items. No Product writes. Persist paymentErrorCode
   `INVOICE_INITIALIZING`, pending payment and the existing reconciliation deadline.
3. Commit the transaction BEFORE any Mono network request. Call invoice/create once.
4. Require a valid invoiceId and exact HTTPS hosted page URL. Atomically attach the
   invoice and claim acceptance by clearing INVOICE_INITIALIZING with compare-and-set.
   The returned Order snapshot includes any verified early financial evidence.
5. Only the claim winner calls notifyOrderCreated, then returns pageUrl. An already
   accepted invoice is harmless and does not claim another notification. Notification
   errors cannot run invoice cleanup or turn an accepted handoff into initialization failure.
6. A verified early webhook can bind/persist payment truth, but cannot clear the
   provisional marker or send premature notifications. If it already confirmed PAID,
   the single acceptance winner subsequently emits the deferred PAYMENT_PAID event
   through the existing independent channel settings, after ORDER_CREATED.

Unexpected hold/unknown/failure/refund evidence and a cancelled or unpaid completed
order cannot become a successful invoice handoff. Taking work is still optional;
payment/delivery do not automatically start PROCESSING. COD retains create -> notify,
without Mono. Backend/historical pickup compatibility remains unchanged and hidden
from the storefront, as in Batch 1.7.2.

## Definite rejection versus uncertainty

| Outcome | Handling |
| --- | --- |
| Checkout configuration absent | Localized error before creating Order or making request |
| Local create validation/configuration rejection | Conditional provisional cleanup; no acceptance notification |
| Documented HTTP 400/403/404/405/429 rejection | Same conditional cleanup; status/category logged safely, no body read/logged |
| Network/timeout/5xx, undocumented/ambiguous HTTP (including 408), invalid 2xx/JSON | Retain Order/items, mark UNKNOWN/review, no ORDER_CREATED or customer creation email |
| Known invoice but bad page URL or failed attach | Retain record, persist/reconcile known ID, attempt only strictly guarded unpaid invalidation |

Cleanup is one conditional Order.deleteMany, protected by the original snapshot:
mono provider/mode, operational PENDING, financial PENDING, INVOICE_INITIALIZING,
no invoice/paidAt/financial modified timestamp/provider status, no TTN/delivery,
unchanged initialization expiry/check time and no carrier creation/sync timestamp.
Any later financial, operational or carrier state makes cleanup lose. Existing FK
onDelete:Cascade removes the deleted provisional Order's items atomically. There
is no bulk cleanup script or deletion of old failed/historical Production orders.

If cleanup cannot prove an untouched record, retain it for review. Uncertain attempts
use `INVOICE_CREATE_UNCERTAIN`, never automatic invoice/create retry. No-ID review
records have no speculative polling request or scheduled create; a crashed provisional
attempt becomes UNKNOWN/review after its local deadline, not clock-inferred financial
failure. Known invoices use existing authenticated status reconciliation.

Unaccepted markers survive provider evidence/reconciliation and suppress notification
dispatch. NULL is the historical/accepted compatibility state; no backfill is needed.

## Known invoice recovery/invalidation

The official POST invoice/remove invalidates an invoice only if it has not been paid;
it is not a refund endpoint. Recovery first queries invoice/status with the unchanged
merchant token and requires exact invoiceId/reference/amount/UAH currency, CREATED
state, no positive finalAmount or cancellation list, and a fresh local unpaid snapshot
without shipment or operational work/completion. PAID/processing/hold/mismatch states
are never invalidated. Provider unpaid enforcement is the final race protection.

On explicit remove HTTP 200, a conditional local update records financial CANCELLED
with `INVOICE_INITIALIZATION_INVALIDATED`; the audit record remains, no order-created
notification is sent, and operational state is unchanged. A racing financial transition
cannot be overwritten. A conflicting pre-bound invoice stays bound; only the separately
verified new unpaid duplicate can be invalidated, without cancelling the bound invoice.

If status/remove or DB recovery is unavailable, keep review state and the known ID
where persistence is available. No-ID ambiguous requests require manual merchant
reconciliation; there is no documented lookup-by-reference assumption. A provider/DB
outage can prevent immediate orphan invalidation; the system never substitutes a refund
or guesses payment failure. No actual query/removal/invoice was performed in tests.

## Safe diagnostics and API payload

MonoError retains only a fixed safe code/category, endpoint identifier and HTTP status;
a schema-validated known invoice ID may be carried internally for recovery. Logs include
only endpoint, category, status and order number. They do not serialize errors, tokens,
headers, raw response bodies, customer data or provider payloads. No upstream error body
is parsed for non-2xx responses. Invalid successful responses are uncertain. Safe categories:
configuration, local_validation, http_rejection, provider_uncertain, transport, timeout,
invalid_response and attachment. The client gets only existing localized payment feedback.

Create remains POST /api/merchant/invoice/create, X-Token, server-repriced integer
kopecks, ccy 980, debit, one-hour validity, trusted redirect/webhook URLs, raw stored
number as merchantPaymInfo.reference, human-readable destination and validated email.
No undocumented parameters, tokenization, native wallets or acquiring credentials added.

## Numeric allocation and presentation

No migration/sequence/counter table. Within the SAME transaction as Order.create:

1. Acquire `pg_advisory_xact_lock(334354, 173)` (cast void to text for Prisma decoding).
2. Read MAX(number::numeric) for `number ~ '^[0-9]+$'` only; historical 3DK-* are ignored.
3. Add using BigInt, padStart(4, '0'), and create before transaction completion releases
   the lock. Explicit READ COMMITTED avoids a stale snapshot after waiting for the lock.
4. Keep Order.number unique as final protection, with bounded collision retry of the
   whole transaction. Product validation/price reads remain inside that transaction.

No numeric rows -> 0001; then 0002; after 9999 -> 10000. Number/result-link technical
length remains at most 100 characters. There is no count()+1 or unlocked MAX+1.
This is sequential allocation, not gapless accounting: retained uncertain attempts consume
numbers; a definitely rejected, deleted highest provisional number may be reused because
no invoice could exist. Concurrent later accepted numbers can leave gaps after cleanup.
No Production query was made to check numeric history; first-number behavior is conditional
on the owner's stated absence of purely numeric rows and is verified with isolated fixtures.

Stored numbers contain digits only. Shared presentation is “Замовлення №0001” / “Order #0001”
across Admin dashboard/list/details, Telegram, email subject/body, result page and destination.
Mono reference stays raw “0001”. Old 3DK-* values and signed status/result links remain
readable and unchanged. Numeric references do not bypass the existing HMAC capability or
Admin authentication. Browser return parameters still cannot establish payment success.

## Verification

All boundaries are mocked or loopback-only. No live PostgreSQL lock/integration test is
claimed; the in-memory model verifies lock-before-MAX, transaction/collision contracts,
serialized concurrent allocations, rollback and cascade semantics. Production untouched.

| Check | Result |
| --- | --- |
| verify-mono-initialization.ts (new) | PASS: acceptance timing/one creation message+email; 3 retries each documented 4xx leave no orders; config/local guards; timeout/network/5xx/408/invalid-200/201; review/no duplicate create; deletion races; early PAID/hold; safe orphan invalidation/mismatch/races/failure; redacted logs; COD; 40 concurrent numeric allocations; old/new capability and UA/EN displays |
| verify-batch17-payments.ts | PASS: Mono invoice/signature/rotation/order identity/money/stale/idempotency/reconciliation; updated numeric allocation and uncertain initialization expectations |
| verify-batch14-payments.ts / verify-batch14-payment-ui.ts | PASS: legacy LiqPay/security/result states and anti-false-success behavior |
| verify-batch16-notifications.ts / verify-order-operations.ts | PASS: independent toggles, shared manual work CAS, terminal/concurrency protection, Telegram callback security |
| verify-batch17-cod.ts / verify-novaposhta-status.ts | PASS: COD compatibility and all 69 classification cases plus normalization |
| verify-checkout-render.ts / verify-storefront.ts / verify-unified-catalog.ts / verify-cart.ts / verify-batch17-availability.ts | PASS |
| verify-responsive.ts | PASS: 216 storefront viewport renders; desktop CSS screenshots identical at 1280/1440 |
| verify-admin-responsive.ts | PASS: 264 viewport renders and 44 desktop comparisons; baseline normalizes only the deliberate order-label changes in this batch in addition to earlier approved control changes |
| TypeScript --noEmit --incremental false | PASS |
| ESLint | PASS, clean |
| Isolated production build | PASS: compilation/lint/types, all 15 prerenders; DB/provider writes and network blocked |
| git diff --check | PASS |

Existing notification delivery remains best-effort, without a new durable outbox. The
acceptance claim prevents duplicate normal dispatch, but a worker crash after claiming
and before delivery can still lose a notification. No automatic re-notification or invoice
retry was introduced. Live acquiring acceptance still requires separately approved testing.

## Exact changed-file manifest

- docs/BATCH_1_7_3_REPORT.md (new)
- scripts/payment-memory.ts
- scripts/verify-admin-responsive.ts
- scripts/verify-batch14-payment-ui.ts
- scripts/verify-batch16-notifications.ts
- scripts/verify-batch17-payments.ts
- scripts/verify-mono-initialization.ts (new)
- scripts/verify-order-operations.ts
- src/app/admin/orders/[id]/page.tsx
- src/app/admin/orders/page.tsx
- src/app/admin/page.tsx
- src/components/checkout/order-result.tsx
- src/lib/actions/create-order.ts
- src/lib/notifications/orders.ts
- src/lib/notifications/templates.ts
- src/lib/order-number.ts
- src/lib/order-reference.ts (new)
- src/lib/payments/initialization-state.ts (new)
- src/lib/payments/initialization.ts (new)
- src/lib/payments/mono.ts
- src/lib/payments/reconciliation.ts
- src/lib/payments/transitions.ts

22 files. No Prisma/environment/dependency/config files or Batch 1.7.1 cart runtime
files changed. No existing failed Production orders deleted; no real DB/SQL/migration,
Mono create/remove/payment, TTN, email/Telegram, Vercel edits, commit, push or main update.
