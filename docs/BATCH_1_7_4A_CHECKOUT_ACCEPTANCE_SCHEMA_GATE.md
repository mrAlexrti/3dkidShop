# Batch 1.7.4A — Local implementation report

Implementation was authorized after review of the proposal preserved below.
Work remains local and uncommitted on `feat/batch-1.7.4-checkout-acceptance`,
starting from clean HEAD `983fed0cf1e7dfacb4eb62dd4a7869611b14dddf`.
Production is `redesign-3dkid-v2`; neither it nor `main` was modified.
No migrations/SQL, live acquiring, carrier documents, notifications, production
scheduler/configuration changes, commits, pushes, merges or deployments occurred.

Follow-up: a dedicated read-only Admin **Спроби оплат / Payment Attempts** page now
provides visibility into unaccepted/review attempts. See
[Payment Attempts diagnostics report](BATCH_1_7_4A_PAYMENT_ATTEMPTS_DIAGNOSTICS.md)
for its inspection findings, filters, permissions, retention assessment and tests.
The acceptance implementation manifest below records the earlier implementation
phase; the diagnostics report lists the additional follow-up files.

## Implemented behavior

The original defect was acceptance at Mono invoice attachment: checkout allocated
a business number, Admin exposed every Order, and attachment cleared the only
provisional marker and called notifyOrderCreated before payment. The inspected
architecture and original proposal remain archived below for comparison.

The implementation keeps the existing Order/OrderItem snapshots, Zod validation,
Product shared locks, integer-money server pricing, and advisory numbering key.
New online records explicitly use PROVISIONAL with number=null, a random immutable
`pay_<128-bit hex>` paymentReference and persistent retry-key/payload hashes.
Only the unique checkout creator calls invoice/create. Matching retries replay
the same attempt/result/validated hosted URL; changed input with the same key is
rejected. Uncertain creation is never automatically recreated. Failed and rejected
new attempts are retained, including items, references and audit state.

Authenticated server financial evidence is shared by signed Mono webhook and
merchant-status reconciliation. Amount, UAH currency, reference, invoice and
provider/mode are checked before acceptance. First acceptance conditionally updates
the previous snapshot, acquires the unchanged transaction-scoped advisory lock,
allocates the final numeric number under READ COMMITTED, stores PAID/paidAt/
acceptedAt/ACCEPTED, and inserts two unique ORDER_CREATED channel rows in the same
transaction. No external sends run in that transaction. A failed outbox insert
rolls the acceptance and number back for a safe provider/scheduler retry.
Payment never starts PROCESSING. COD still accepts/numbers/notifies immediately.

CAS includes acceptance and number alongside existing financial/operational state.
Ordinary duplicate/newer-identical webhooks and competing reconciliation do not
allocate another number or event. Equal-time disagreements require an authenticated
current-status snapshot to resolve. Conflicting or stale verified PAID evidence
retains paidAt and review diagnostics rather than silently losing the money fact.
Merchant-cancelled/incompatible/refunded attempts cannot silently become normal
orders; refund-before-acceptance enters REVIEW. Historical financial transitions
and separately configurable notifications retain their existing dispatcher.

Admin dashboard counts/recent orders/revenue, order list/details, status mutations, shared
Admin/Telegram work action and TTN creation exclude PROVISIONAL/REVIEW and the
old initialization-marker exceptions. Historical numbered LEGACY orders remain
compatible; their numbers, Mono reference fallback, items and LiqPay handlers are
preserved. No historical notification backfill/replay is performed.

Customer results support a distinct `payment-attempt:v2` HMAC domain tied to the
immutable reference. Existing `order-result:v1` links remain valid. Status endpoints
return state and, after acceptance, the final business number; they never query
Mono or write payment state. Return/client payment flags grant no authority.
Before PAID, no business number or normal confirmation is shown. UA/EN result
copy and mobile classes are retained. The cart stays at hosted handoff; only a
server-confirmed paid result matching the reference, contents and persisted cart
revision clears it. Revision changes prevent accidental reuse/clearing after
editing, clearing and rebuilding an identical cart or starting another purchase.

## Initial Telegram and durable delivery

Normal new online acceptance queues only ORDER_CREATED, one Telegram row and
one customer-email row. It does **not** queue/dispatch an initial PAYMENT_PAID
message. Telegram creation contains `Нове замовлення` and `Оплата: Оплачено`, with
the existing work callback and Admin link. The regression test counts all actual
mocked Telegram sends and asserts exactly one initial message in total.

Outbox uniqueness is `(orderId,event,channel)`. Payload is a rendered acceptance
snapshot stored in PostgreSQL; no payload/hosted URL/customer/token is logged or
exposed through recovery endpoints. Existing DB/application access controls must
protect this table; no public payload/replay endpoint was added. The restrictive
FK prevents deleting an accepted order's delivery audit by cascade.

Workers claim due rows with state/attempt/time CAS, dispatchId and a 60-second
lease. Acknowledged sends retain provider receipt and sentAt. Configuration/settings
failures and explicit retryable rejection are definitely unsent and use exponential
backoff (one minute, capped at one hour), at most eight attempts. Disabled channels,
missing customer email and sandbox are SUPPRESSED. Permanent rejection, ambiguous
transport/5xx, exhausted retries and expired SENDING leases remain UNKNOWN for
operator review. A receipt-write failure after delivery also becomes UNKNOWN.
UNKNOWN is never automatically resent. Exactly-once external transport cannot be
promised after a lost response; ordinary event/worker retries cannot resend SENT.

Design refinements: settings are read at dispatch, not in the payment transaction,
so a settings outage cannot lose financial acceptance. Channel disable suppresses
the queued row permanently; later enable does not replay it. Only initial new
online acceptance uses this outbox; existing COD/historical/subsequent-event
delivery remains compatible and best-effort. No general notification refactor.

## Schema and prepared migration

`prisma/schema.prisma` now has nullable unique Order.number; CheckoutAcceptance
(LEGACY, PROVISIONAL, ACCEPTED, REVIEW, default LEGACY); acceptedAt; unique
paymentReference and checkoutKeyHash; checkoutPayloadHash; checkoutLocale;
paymentPageUrl; acceptance/createdAt index; and OrderNotification with JSON payload,
delivery state/attempt/schedule/lease/receipt fields, unique event/channel key and
due-delivery index. Existing OrderItems and provider/invoice uniqueness are intact.

The exact prepared expansion is
`prisma/changes/batch-1-7-4a-checkout-acceptance.sql`. It retains the reviewed CHECKs
and strengthens PROVISIONAL to require a null number. There is no data backfill,
renumbering, delete or migration execution. Prisma Client generation ran locally
only; it is not a database migration. No Prisma migrations baseline was invented.

Rollout order (separate explicit target/execution approval remains required):

1. Rehearse against an approved disposable PostgreSQL target, inspect actual schema
   and number references, establish the existing migration baseline, verify backup
   restoration and concurrent lock/CAS behavior. In-memory tests cannot prove PG.
2. Apply the prepared expansion only in an agreed maintenance window. It uses a
   transaction, 5-second lock timeout and 60-second statement timeout; ALTER and
   ordinary index creation hold table locks. On a large table, split index creation
   into separately reviewed CONCURRENTLY statements outside the transaction and
   stage/validate CHECKs separately. Do not use db push or run this SQL blindly.
3. Run this nullable/reference-aware build in a compatibility phase with the
   existing `ONLINE_PAYMENT_MODE=disabled`, set only through separately approved
   release operations. That configuration blocks new online attempts while old
   invoice callbacks/reconciliation remain available; COD remains available after
   expansion. A checkout traffic gate is also needed while old writers drain.
   Do not enable provisional writers until all operational paths are verified.
4. Quiesce old checkout writers and drain old serverless instances/workers. Switch
   all checkout/webhook/reconciliation readers and writers together, preserving
   provider callbacks or providing verified recovery during any pause. Only after
   old instances drain, separately authorize restoring online mode. Old code
   cannot safely read null numbers or route new references. Preserve old invoice
   references/number-based capabilities and manually inventory old marker records.
5. Configure and verify the scheduler and operational monitoring below before
   releasing checkout. No release may depend on merely having a cron route/template.

Rollback must retain compatible callbacks/reconciliation/outbox for outstanding
attempts. Stop new online creation through an approved compatibility release;
never roll back to a null-unaware build while attempts exist. Do not recreate
invoices, assign fake numbers, reset sent flags, drop receipts or delete attempts.
Restoring NOT NULL is impossible while provisional rows remain. A reverse schema
migration/backup restore requires separate review and can lose later payment facts.

## Scheduler and configuration — not activated

`GET /api/cron/payments` reuses constant-time `Authorization: Bearer CRON_SECRET`
authentication; missing secret fails closed, wrong credentials return 401. Payment
and notification recovery run independently with Promise.allSettled, so provider
failure cannot block old queued messages. Responses expose counters only, including
REVIEW count, UNKNOWN count and due notification backlog; errors return 503.

Operational target: invoke the combined endpoint every **one minute** using a
verified external scheduler. A reviewed five-minute schedule is acceptable only
if its delivery/recovery latency and measured capacity meet business requirements.
Pending/unknown payment checks are due every five minutes. Failed/cancelled known
new invoices get hourly follow-up for seven days beyond invoice expiry, then
REVIEW with no destructive cleanup. Valid later webhooks still work afterwards.
Known ambiguous invoices keep reconciliation; missing-ID uncertainty requires
merchant-side review or a later authenticated webhook. Expiry by clock is not
proof of financial failure. REFUNDED before acceptance stays reviewable.

Each run takes at most three payment attempts and three deliveries, in parallel
between the two recovery functions. Payment calls time out at 15 seconds and
notification calls at five seconds. The route requests maxDuration=60; actual
platform duration/DB latency/queue capacity must be verified before release.
Newly queued acceptance messages may be picked up on the next scheduler invocation.
Measure backlog and increase proven capacity/cadence through reviewed changes;
three rows every five minutes is deliberately conservative, not a scaling claim.

The inactive `.github/workflow-templates/payment-recovery.yml` follows existing
bearer-secret/curl conventions without a default production URL, redirects,
automatic HTTP retries, or response-body/secret logging. It is outside active
workflows and was not dispatched. Activation would require `CRON_SECRET` in the
scheduler and reviewed `PAYMENT_RECOVERY_URL` target. Existing application Mono,
site origin, auth-secret, Telegram and email configuration are reused, unchanged.
Keep the auth secret stable for retry hashes and existing 24-hour result links.

GitHub's schedule runs on the default branch, has a five-minute minimum, and can
be delayed/dropped. Adding a workflow only on the production feature branch does
not establish recovery; `main` must not be assumed to be production. An approved
external scheduler may be preferable to changing repository branch policy.
See [GitHub schedule documentation](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).
The platform controls the effective function duration; see
[Next.js route configuration](https://nextjs.org/docs/app/api-reference/file-conventions/route-segment-config).

Before release, verify actual authenticated runs and alert on scheduler gaps,
REVIEW/UNKNOWN counts, due backlog and persistent provider errors. Paid-review
attempts are now visible in the dedicated read-only Admin diagnostics section;
notification UNKNOWN payloads still require authorized, protected outbox tooling.
No manual payment/acceptance/replay UI is provided. Never reset UNKNOWN to retry
without establishing delivery outcome and separately authorizing any possible resend.
No automatic deletion/cleanup is implemented.

## Validation and final review

Validation results and exact file manifest are recorded at the end of this document.
All tests used fake fixtures/mocked provider and DB effects or local-only browser
pages; no existing database was queried. The original initialization suite was
re-scoped to preserve legacy cleanup/invalidation checks; new checkout behavior
is exercised through the new acceptance suite and updated provider suite. Old
acceptance-at-attachment assertions were replaced, not silently retained as proof.

## Exact pre-Production checklist

- [ ] Review the final diff, schema, prepared SQL, UNKNOWN policy and compatibility
  artifact/cutover. Obtain separate database-target/execution authorization.
- [ ] Rehearse expansion/rollback and mixed COD/online numbering on disposable
  PostgreSQL, including concurrent CAS conflicts, transaction timeout/rollback,
  numbering collision and advisory locking through the actual pooler.
- [ ] Verify hidden provisional list/count/details and rejection through Admin
  status, Telegram work callback and TTN creation. Verify historical paid/fulfilled,
  numeric/3DK/LiqPay and old result links remain available and unchanged.
- [ ] With mocks and isolated sinks, verify successful/abandoned/failed/cancelled/
  expired/hold/unknown/refunded flows; early PAID; lost/delayed/duplicate/concurrent
  webhook/reconciliation; resubmission; forged return status; exact server totals.
- [ ] Count all initial Telegram messages: exactly one `Нове замовлення`, containing
  `Оплата: Оплачено`, no extra initial PAYMENT_PAID. Check isolated deferred UA/EN
  email, toggles, sandbox, work button and Admin link. Payment must leave PENDING.
- [ ] Test definite rejection/backoff, timeout, crash and receipt-write failure;
  UNKNOWN must remain unsent on ordinary retries and have an operator response plan.
- [ ] Verify UA/EN mobile/desktop return-page polling, expired capabilities, cart
  retention, matched PAID clear and protection of newer/identical rebuilt carts.
- [ ] Verify approved scheduler target, secret, actual cadence, maxDuration support,
  error alerts/backlog capacity and independent outbox recovery. Observe multiple
  real scheduler invocations against the approved non-production mocked target.
- [ ] Re-run automated checks and isolated build on the reviewed release artifact.
  Confirm payload/URL/customer/token redaction and DB permissions. No real service
  testing is authorized here; live acquiring/sinks require separate approval.

## Archived approved proposal and pre-implementation audit

The following sections describe the original inspected baseline and reviewed plan,
not the current implementation status. The implementation report above and final
validation below supersede their approval gates, proposed behavior and file list.

# Batch 1.7.4A — Checkout acceptance: schema review gate (historical)

Status: inspection complete; implementation stopped at the requested migration gate.
Inspected on 2026-11-14, local HEAD `dea1c67`, branch
`feat/batch-1.7.4-checkout-acceptance`. Production is `redesign-3dkid-v2`.

Only this review document was added. Runtime code, Prisma schema and SQL files are
unchanged. No database connection, migration, payment, invoice, TTN, real notification,
environment change, commit, push or deployment was performed. No live data was read.
The actual deployed database schema and scheduler configuration remain unverified.

## 1. Architecture discovered in source

| Area | Actual implementation and consequence |
| --- | --- |
| Checkout entry | `src/components/checkout/checkout-form.tsx` calls the `createOrder` server action, not a checkout REST endpoint. There is no durable checkout idempotency key. Disabling the form during submit protects only that mounted form. |
| Validation | `src/lib/actions/create-order.ts` validates customer/delivery input with Zod; locks Product rows `FOR SHARE` in sorted ID order; checks active/orderable products, quantities and size ownership; derives prices and totals on the server using integer minor units. The transaction writes Order and OrderItem snapshots, with no Product writes. |
| Order creation | Before any Mono request, `createOrder` calls `allocateOrderNumber` and creates a `PENDING` Order/items. Online fields include financial `PENDING`, `INVOICE_INITIALIZING`, expiry and next reconciliation time. COD creates its normal operational order immediately. |
| Invoice | `src/lib/payments/mono.ts` calls merchant invoice/create with debit, UAH/980, server total, one-hour validity, trusted redirect/webhook URLs, and **Order.number as the immutable provider reference**. Only validated HTTPS hosted URLs on the two explicit Mono hosts are returned. |
| Premature acceptance | `acceptPaymentInvoice` in `src/lib/payments/transitions.ts` accepts `PENDING` payment, binds the invoice, clears `INVOICE_INITIALIZING`, and returns `notify: true` to the compare-and-set winner. The server action then calls `notifyOrderCreated` before returning the Mono hosted redirect. PAID is not required. |
| Hosted handoff | The browser calls `window.location.assign(pageUrl)` and clears its cart on successful invoice handoff. It does not wait for PAID. Failed handoff retains the cart. |
| Webhook | `src/app/api/payments/mono/webhook/route.ts` limits raw body size, verifies Mono ECDSA signature, parses the snapshot and applies financial evidence. If an invoice is not yet bound, it queries merchant invoice/status and checks invoice/reference/amount/currency before authenticated binding. |
| Financial transitions | `applyPaymentEvidence` validates provider/mode, invoice binding, amount and currency, rejects older timestamps, treats equal-time disagreements as conflicts, and conditionally updates the previous financial/operational snapshot in a transaction. It records `paidAt` on verified PAID. It does not automatically start PROCESSING. |
| Reconciliation | `src/lib/payments/reconciliation.ts`, invoked by bearer-authenticated `/api/cron/payments`, claims due rows with a five-minute CAS lease, queries merchant invoice/status, and uses the same financial transition function. It queries by number/reference today. FAILED/CANCELLED/PAID generally clear `paymentNextCheckAt`; uncertain and pending states keep polling. |
| Initialization recovery | `initialization.ts` conditionally deletes only a provably untouched, definitely rejected provisional record. Ambiguous creates retain audit state; known invoice recovery checks identity and financial state before attempting unpaid invoice invalidation. Missing-ID uncertainty cannot be recovered by an assumed lookup-by-reference API. |
| Notifications | `notifications/orders.ts` emits semantic events, consults independent channel settings, and calls Telegram/email after the DB transaction. Sandbox and three initialization markers suppress sending. `notifyOrderCreated` emits ORDER_CREATED and, if pending, PAYMENT_PENDING. Only the transition winner dispatches, but no delivery row, retry queue or sent receipt exists. Telegram failures return `{ sent: false }`; the dispatcher does not retain Telegram delivery results. A crash after the DB transition can permanently lose a notification. |
| Telegram text/actions | `notifications/templates.ts` renders `Нове замовлення`, shared payment labels, and `Взяти в роботу` using `ow1:<Order.id>`. Current paid label is `Оплату підтверджено`; the literal requested `Оплата: Оплачено` is not currently rendered. |
| Operational visibility | Admin dashboard count/recent orders and `/admin/orders` query **all Order rows**, with no provisional/acceptance predicate. Details fetch any existing ID. Thus a provisional record is visible immediately after its first transaction commits, even before invoice attachment. `orders/take-into-work.ts` and Admin status actions have no acceptance gate. The TTN API does block unpaid provider-backed orders, but has no independent acceptance check. |
| Customer result | `/checkout/success` and `/api/payments/status` validate a 24-hour HMAC capability tied to number, then read DB state only. Refresh and return query parameters do not write payment state or query Mono. Pending, paid, failed, cancelled, expired, unknown, review and unavailable have distinct localized displays. Even pending results currently display a business order number. |
| Schema history | `prisma/schema.prisma` has mandatory unique `Order.number`, a unique provider/invoice pair and a reconciliation index. It has no acceptedAt, checkout identity, immutable independent payment reference or notification delivery model. There is no `prisma/migrations` directory; prior reviewed SQL is `prisma/changes/batch-1-7-additive.sql`. Its existence does not prove execution against any database. |
| Number allocation | `order-number.ts` acquires transaction-scoped `pg_advisory_xact_lock(334354, 173)`, reads MAX numeric-only number, adds with BigInt and pads to four digits. Creation uses READ COMMITTED and bounded unique-collision retries. Historical `3DK-*` records are excluded from MAX but remain readable. |
| Legacy/scheduling | LiqPay historical callbacks remain separate and use number. The checked-in scheduler workflow invokes Nova Poshta sync only; no checked-in payment scheduler was found. An externally configured payment scheduler may exist; it was not inspected. |

The previous batch intentionally defined acceptance as successful invoice attachment.
Batch 1.7.4A changes that business boundary to verified successful payment.

## 2. Why the migration gate applies

Moving a notification call alone would leave provisional Admin visibility,
consumed business numbers, concurrent resubmission and lost-delivery gaps.
Retaining `paymentErrorCode` as the sole acceptance marker would overload provider
diagnostics and still provide no durable delivery or checkout identity.

With the current mandatory `Order.number`, an Order-based provisional record
cannot exist without a number. Using fake temporary numbers and renaming them
would also break the current provider reference and signed result links. This
proposal explicitly avoids that workaround. A separate attempt aggregate could
leave Order.number mandatory, but duplicates the existing snapshot/payment flow
and requires a larger change. The smaller proposed change reuses Order/items with
nullable business number and a separate immutable payment reference.

The user requires stopping before dependent changes if a migration is essential.
No acceptance implementation or new behavior tests have therefore been added.

## 3. Exact proposed schema changes — review only, NOT applied

The proposed Prisma additions/changes are below; all other existing fields,
OrderStatus values, OrderItem relations and payment indexes remain intact.

```prisma
enum CheckoutAcceptance {
  LEGACY
  PROVISIONAL
  ACCEPTED
  REVIEW
}

// Within existing model Order:
// Replace: number String @unique
// With:
// number String? @unique
// Add:
// checkoutAcceptance CheckoutAcceptance @default(LEGACY)
// acceptedAt         DateTime?
// paymentReference   String? @unique
// checkoutKeyHash    String? @unique
// checkoutPayloadHash String?
// checkoutLocale     String?
// paymentPageUrl     String? @db.Text
// notifications      OrderNotification[]
// @@index([checkoutAcceptance, createdAt])

model OrderNotification {
  id                String   @id @default(cuid())
  orderId           String
  order             Order    @relation(fields: [orderId], references: [id], onDelete: Restrict)
  event             String
  channel           String
  state             String   @default("PENDING")
  payload           Json
  attemptCount      Int      @default(0)
  nextAttemptAt     DateTime? @default(now())
  dispatchId        String?
  leaseUntil        DateTime?
  providerMessageId String?
  lastErrorCode     String?
  createdAt         DateTime @default(now())
  sentAt            DateTime?

  @@unique([orderId, event, channel])
  @@index([state, nextAttemptAt])
}
```

`LEGACY` preserves existing records and permits a compatibility release before the
behavior change. New online attempts must explicitly use PROVISIONAL; new COD
orders explicitly use ACCEPTED and receive a number at creation. acceptedAt is
the actual new acceptance time, never an invented historical timestamp.
PaymentReference is random, immutable, unique and independent of number; null
means the existing record still uses number as its historical Mono reference.
checkoutKeyHash stores a hash of a browser-generated high-entropy retry key;
checkoutPayloadHash is a keyed hash of canonical customer/delivery/product/variant/
quantity input, excluding untrusted client prices. checkoutLocale preserves UA/EN
across server-side acceptance. paymentPageUrl stores only the validated URL so
an identical resubmission can resume the same invoice without recreating it.

The equivalent proposed SQL shape is shown for review, not as an executable
migration file. Index creation/validation must follow the approved cutover plan.

```sql
CREATE TYPE "CheckoutAcceptance" AS ENUM
  ('LEGACY', 'PROVISIONAL', 'ACCEPTED', 'REVIEW');

ALTER TABLE "Order"
  ALTER COLUMN "number" DROP NOT NULL,
  ADD COLUMN "checkoutAcceptance" "CheckoutAcceptance" NOT NULL DEFAULT 'LEGACY',
  ADD COLUMN "acceptedAt" TIMESTAMP(3),
  ADD COLUMN "paymentReference" TEXT,
  ADD COLUMN "checkoutKeyHash" TEXT,
  ADD COLUMN "checkoutPayloadHash" TEXT,
  ADD COLUMN "checkoutLocale" TEXT,
  ADD COLUMN "paymentPageUrl" TEXT;

CREATE UNIQUE INDEX "Order_paymentReference_key" ON "Order" ("paymentReference");
CREATE UNIQUE INDEX "Order_checkoutKeyHash_key" ON "Order" ("checkoutKeyHash");
CREATE INDEX "Order_checkoutAcceptance_createdAt_idx"
  ON "Order" ("checkoutAcceptance", "createdAt");

CREATE TABLE "OrderNotification" (
  "id" TEXT PRIMARY KEY,
  "orderId" TEXT NOT NULL REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "event" TEXT NOT NULL,
  "channel" TEXT NOT NULL CHECK ("channel" IN ('telegram', 'email')),
  "state" TEXT NOT NULL DEFAULT 'PENDING'
    CHECK ("state" IN ('PENDING', 'SENDING', 'RETRY', 'SENT', 'UNKNOWN', 'SUPPRESSED')),
  "payload" JSONB NOT NULL,
  "attemptCount" INTEGER NOT NULL DEFAULT 0 CHECK ("attemptCount" >= 0),
  "nextAttemptAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
  "dispatchId" TEXT,
  "leaseUntil" TIMESTAMP(3),
  "providerMessageId" TEXT,
  "lastErrorCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sentAt" TIMESTAMP(3)
);
CREATE UNIQUE INDEX "OrderNotification_orderId_event_channel_key"
  ON "OrderNotification" ("orderId", "event", "channel");
CREATE INDEX "OrderNotification_state_nextAttemptAt_idx"
  ON "OrderNotification" ("state", "nextAttemptAt");

ALTER TABLE "Order" ADD CONSTRAINT "Order_checkout_acceptance_check" CHECK (
  ("checkoutAcceptance" = 'LEGACY' AND "number" IS NOT NULL)
  OR ("checkoutAcceptance" = 'ACCEPTED' AND "number" IS NOT NULL AND "acceptedAt" IS NOT NULL)
  OR ("checkoutAcceptance" IN ('PROVISIONAL', 'REVIEW') AND "paymentReference" IS NOT NULL)
);
ALTER TABLE "Order" ADD CONSTRAINT "Order_checkout_locale_check"
  CHECK ("checkoutLocale" IS NULL OR "checkoutLocale" IN ('ua', 'en'));
```

Keep existing `Order_number_key` and provider/invoice uniqueness. PostgreSQL unique
indexes permit multiple null numbers. No sequence/counter or rewritten historical
numbers are proposed. Prisma cannot express these CHECK constraints directly;
reviewed SQL must retain them. CUIDs are supplied by Prisma, not a DB default.
The broader acceptance CHECK intentionally permits retained historical numbers on
manually classified review records; application invariants enforce null numbers
for newly created, never-accepted attempts.

## 4. Proposed implementation after schema approval

1. Keep customer/product/variant validation, server pricing, Product shared locks
   and item snapshots. Insert a new online PROVISIONAL record with number=null,
   stable random paymentReference and unique checkoutKeyHash. The transaction
   winner alone performs one invoice/create request after commit. Identical retry
   keys replay the persisted handoff/result; different payloads with the same key
   return a conflict. Do not deduplicate unrelated customers by email/cart content.
   An in-flight duplicate returns pending setup; an ambiguous create never blindly
   creates a replacement invoice. Preserve the audit record even for rejection.
2. Bind the validated invoice/page URL without accepting the business order or
   emitting customer/merchant creation notifications. Reference all new provider
   calls/evidence by paymentReference. Existing invoices continue using number.
3. Feed signed webhooks and merchant status reconciliation into one transaction
   boundary. Require invoice/reference/provider/mode/amount/currency consistency.
   Preserve the authenticated API binding rule for unbound invoices. Never infer
   payment from local time, a redirect, a client field or invoice creation.
4. For new first acceptance, re-read/lock the attempt and reject stale/conflicting
   evidence; resolve equal-time inconsistencies by authenticated status query or
   review. Acquire the **same** advisory key before MAX, in READ COMMITTED, allocate
   the final number and atomically persist PAID, paidAt, acceptedAt, ACCEPTED, and
   unique notification rows. Keep operational status PENDING. Use one consistent
   row-lock -> numbering-lock order; COD must not acquire existing attempt locks
   after taking the numbering lock. Retry the complete transaction on collision
   or retryable concurrency errors. No network I/O inside the transaction.
5. A concurrent webhook/reconciler, duplicate or refresh sees the same accepted
   record and outbox keys. A DB error rolls back payment acceptance, numbering and
   notification creation together. A webhook before invoice attachment can accept
   after authenticated binding; later attachment must preserve that acceptance.
6. Persist a rendered acceptance snapshot in outbox payload, so later operations
   cannot change the creation message's meaning. Telegram ORDER_CREATED must say
   `Оплата: Оплачено` and retain the existing work callback and Admin link. Store
   channel settings outcomes as pending or suppressed; sandbox creates no live
   sends. Customer ORDER_CREATED email is queued only on acceptance and uses the
   stored locale. Preserve independent PAYMENT_PAID settings without producing a
   second new-order event. No broad notification-system refactor is required.
7. A worker claims each due delivery with CAS, a random dispatchId and lease;
   only that dispatchId can record its outcome. Persist provider message ID/sentAt
   on acknowledged success. Retry only definitely unsent/rejected retryable sends
   with bounded backoff; retain permanent failures for review. Return explicit
   delivery outcomes from the adapters instead of swallowing them. Expired
   SENDING leases and transport timeouts become UNKNOWN, not automatic resends.
8. Gate Admin count/recent/list/details, status mutation, work callbacks and TTN
   creation on accepted compatibility records. Existing LEGACY records with the
   three old unaccepted initialization markers remain excluded from operational
   views/actions. REVIEW has a separate diagnostic/reconciliation path; never
   treat it as a normal operational order. Preserve existing paid/fulfilled
   records and merchant work semantics. No COD confirmation buttons/statuses.
9. New result capabilities identify paymentReference with a distinct token domain;
   keep v1 number-based links valid for historical records. Once accepted, return
   the final business number alongside status. No normal order confirmation or
   business number for an unpaid attempt. Retain/restore the online cart until
   server acceptance, with a snapshot/fingerprint guard so a later return cannot
   clear newer cart edits. Preserve responsive UA/EN rendering.

Exactly one accepted record and one durable ORDER_CREATED event are achievable
under database concurrency. The existing Telegram sendMessage adapter has no
idempotency key or receipt recovery mechanism. A DB transaction/outbox cannot
atomically commit an external Telegram send: if Telegram accepted a request but
the response/worker is lost, resending could duplicate it. This proposal prevents
ordinary retry duplicates and records ambiguous sends as UNKNOWN for operator
resolution; it cannot honestly promise unconditional exactly-once external delivery.
No automatic resend of an ambiguous message is proposed.

## 5. Failure, expiry, delayed money and cleanup policy

| Evidence | Business acceptance / audit policy |
| --- | --- |
| created / processing | Remain PROVISIONAL; no creation notification/email/number. Poll known invoice. |
| failure | Persist FAILED; cancellation error 8002 maps to CANCELLED as today. Retain attempt, no acceptance. |
| expired | Persist CANCELLED with provider expired diagnostic; display expired. Retain attempt and binding. |
| hold / unknown / partial or refund inconsistency | Preserve financial diagnostics, keep scheduled checks or REVIEW; never assume PAID. |
| Local timeout, missing create response, clock expiry | Uncertain initialization, not proof of cancellation. Retain record; never retry ambiguous invoice creation automatically. A missing-ID case requires merchant-side review or later authenticated webhook binding. |
| Later authoritative full success after financial failure/expiry | Accept exactly once if never explicitly business-cancelled and evidence is consistent. Do not let a terminal polling policy silently lose delayed money. |
| Success after merchant cancellation, refund, or incompatible fulfillment | Record financial truth/paidAt without reviving work; retain REVIEW with a visible finance diagnostic and reconciliation task. Preserve existing late-payment behavior for historical orders. |
| Refund after acceptance | Keep number, acceptedAt and historical paidAt; preserve refund/fulfillment review semantics and do not emit another creation event. |

For new unaccepted known invoices, a proposed conservative schedule is five-minute
checks while pending/uncertain, then hourly checks through seven days after provider
terminal failure/expiry, then REVIEW for unresolved terminal attempts. Seven days
is a polling policy, **not** proof that later payment is impossible: retain binding,
reference, snapshots and webhook handling afterwards, with a documented operator
review queue. Known PAID acceptance stops acceptance polling; do not broaden refund
polling in this batch. Unknown/partial/refund-conflict evidence remains scheduled
or explicitly reviewed. Missing-ID uncertainty cannot be fixed by polling a number.

No automatic destructive cleanup in 1.7.4A. Do not delete/reuse attempt identities,
checkout keys or bindings merely because validity elapsed. An optional later data
retention policy needs its own review and must preserve late-money reconciliation.
Store only normalized financial evidence; do not log tokens, customer information,
checkout/result capabilities, hosted URLs, outbox payloads or raw provider bodies.

## 6. Migration, compatibility and rollback strategy

1. Separately approve the schema/design and target environment before preparing or
   executing migration tooling. No approval to execute SQL is implied by this
   document or by approval to implement application code.
2. On an approved non-production PostgreSQL target, compare the actual catalog
   with the expected schema, inspect references to Order.number, test lock ordering,
   take/verify a backup, and rehearse SQL/Prisma generation and rollback. Existing
   SQL history requires an explicit baseline strategy; do not assume Prisma migrate
   deploy or db push is safe against an unbaselined production database.
3. Apply expansion under separately approved operational controls. Table ALTERs
   require locks: use bounded lock/statement timeouts and an agreed window. On
   large tables create indexes concurrently outside a transaction and stage CHECK
   constraints as NOT VALID, then validate separately. Never hold a long migration
   transaction around index creation. No historical notification backfill.
4. Deploy a compatibility release that understands null numbers, new references,
   result tokens, acceptance predicates and outbox, but still produces existing
   records. Verify every operational entry point before enabling provisional
   writes. Old application instances cannot safely read null business numbers.
5. Quiesce old checkout writers and drain old functions/webhooks/workers, then
   switch **all** writers/readers to the reviewed acceptance implementation. This
   controlled cutover must prevent old handlers from treating a new attempt as an
   accepted order or clearing its lifecycle state. Do not disable delivery of
   provider callbacks without a recovery plan. No Vercel settings changed here.
6. Leave historical numeric and `3DK-*` numbers and old Mono references unchanged.
   Existing LEGACY orders do not receive another ORDER_CREATED event. Do not infer
   whether an old notification was delivered: no evidence exists. Existing old
   initialization-marker records stay hidden/unaccepted and are inventoried for
   manual review. Before promoting a verified paid old provisional record, persist
   its current number as paymentReference if it is to enter the new lifecycle;
   preserve that number and avoid replaying historical creation notifications.
   Do not mass-hide old pending online orders that may already be in merchant work.
7. Ensure an approved authenticated scheduler actually invokes payment and outbox
   recovery. The endpoint alone is insufficient. Verify scheduling externally;
   do not create/modify a live scheduler in this task.
8. Monitor unresolved paid/review records, due/retry/unknown deliveries, scheduler
   lag and CAS conflicts using identifiers/counters only. Audit before release.

Rollback after new provisional writes is an application compatibility operation,
not simply redeploying the old code. The old build requires non-null number and
uses number for Mono identity; it must not serve these records. Disable new online
attempts through the approved application release while retaining compatible
webhook/reconciliation/outbox handling for existing attempts. Do not renumber,
delete attempts, drop delivery receipts, reset sent flags, or recreate invoices.
`SET NOT NULL` cannot be restored while null-number attempts exist. Keep expansion
columns/table/type until all outstanding payments and deliveries are resolved and
a separate reverse migration is approved. A DB backup restore can also erase
payments received after the backup and is not a routine application rollback.

## 7. Automated verification

Existing isolated source-loader tests were inspected: `source-module.ts` refuses
unbound dependencies; `payment-memory.ts` models serialized transactions/rollback.
They mock all provider, DB and notification effects. This does not prove real
PostgreSQL locking or production scheduler operation.

Baseline commands executed from this branch:

| Command | Result |
| --- | --- |
| `node_modules/.bin/tsx.cmd scripts/verify-mono-initialization.ts` | PASS; explicitly tests the **old invoice-attachment acceptance boundary**, not 1.7.4A compliance |
| `node_modules/.bin/tsx.cmd scripts/verify-batch17-payments.ts` | PASS |
| `node_modules/.bin/tsx.cmd scripts/verify-batch14-payments.ts` | PASS; historical LiqPay/capabilities |
| `node_modules/.bin/tsx.cmd scripts/verify-batch14-payment-ui.ts` | PASS; UA/EN result states |
| `node_modules/.bin/tsx.cmd scripts/verify-batch16-notifications.ts` | PASS |
| `node_modules/.bin/tsx.cmd scripts/verify-order-operations.ts` | PASS; manual work/Telegram callbacks |
| `node_modules/.bin/tsx.cmd scripts/verify-batch17-cod.ts` | PASS; mocked TTN/COD boundaries |
| `node_modules/.bin/tsx.cmd scripts/verify-novaposhta-status.ts` | PASS; 69 carrier cases |
| `node_modules/.bin/tsc.cmd --noEmit --incremental false` | PASS |
| `npm.cmd run lint` | PASS |
| `node scripts/verify-build-isolated.mjs` | PASS; compile, lint/types and 15 prerenders; isolated DB/provider boundaries |
| `git diff --check` plus `git diff --no-index --check -- NUL docs/BATCH_1_7_4A_CHECKOUT_ACCEPTANCE_SCHEMA_GATE.md` | PASS; tracked and new-file whitespace |

Initial sandbox tsx launches failed before tests at Windows `uv_os_get_passwd`
with ENOMEM. The same eight commands passed when rerun with explicit tool approval
outside that sandbox. No test implementation or dependencies were modified.
Build uses the existing isolated runner with empty Prisma read fixtures and blocked
DB writes/connections/provider fetches; a normal production-configured build was
not used. Next may report loading .env; its contents are never printed.

Required new tests **after approval**, not claimed as implemented:

| Requirement | Assertions to add/update |
| --- | --- |
| 1. Successful online payment | Invoice attach leaves null number, PROVISIONAL and no sends; verified full PAID atomically accepts with paidAt and one business number. |
| 2. Abandoned attempt | Not in Admin counts/list/details/work/TTN paths, no confirmation/send, no numeric allocation; audit survives expiry. |
| 3–5. Failed/cancelled/expired | Explicit distinct states, no acceptance/creation event or email; preserve identity/items and delayed-event eligibility. |
| 6. Duplicate webhook | One acceptance/number/outbox key even with retries and newer identical success snapshots. |
| 7. Delayed webhook | Bound and authenticated unbound success, after failed/expired/uncertain initialization; merchant-cancelled late money goes to review. |
| 8. Lost webhook | Due reconciliation accepts the same attempt without a second invoice/create. |
| 9. Concurrent webhook/reconciler | Deterministic interleaving at real CAS/row-lock boundary; one number and notification event, rollback on failure. Add separately approved disposable PostgreSQL verification. |
| 10. Resubmission | Same key/payload replays same attempt/invoice; in-flight, changed-payload, post-PAID and ambiguous-create retries are safe; intentional new key remains separate. |
| 11–12. Telegram timing/dedup | Before PAID zero ORDER_CREATED; acceptance text includes exactly `Оплата: Оплачено`; duplicate workers/retries cannot re-send SENT, failures are retained, timeout/worker crash goes UNKNOWN. Settings/sandbox/email isolation remain. |
| 13. Numbering | Mixed concurrent COD/online acceptance uses existing advisory lock and READ COMMITTED; abandoned attempts consume no number; rollback, collision, 9999->10000 and legacy MAX filtering remain safe. |
| 14. COD | Immediate normal acceptance/number/notification and existing delivery/TTN/settlement behavior; no Mono or new COD statuses/buttons. |
| 15. Historical | Existing paid/fulfilled/numeric/3DK/LiqPay orders and signed links unchanged; no historical creation replay, no hidden existing work. |

Also test forged return/client status, mismatched totals/currency/invoice/reference,
stale/equal-time conflicts, early PAID before attachment, refund/partial evidence,
manual work gates, UA/EN deferred email locale, new/old capability separation,
cart edits during return, mobile presentation and safe diagnostics. Update old
acceptance-at-attach assertions; do not keep a green suite by bypassing dispatch.

## 8. Exact manual checks before a future Production release

These are release prerequisites after implementation, not authorization to perform
live actions. Use a non-production target, mocked providers and isolated sinks;
real acquiring/notification tests require separate explicit authorization.

1. Review/approve schema, UNKNOWN-delivery policy, historical classification and
   cutover/rollback. Verify target/backup/migration baseline without exposing data.
2. Submit online checkout and stop at hosted handoff: attempt has no number;
   normal Admin/dashboard/detail/work/TTN access is unavailable; no merchant or
   customer creation notification. Verify on UA/EN and mobile.
3. Inject authenticated mocked PAID with exact identity/amount/UAH: one accepted
   PENDING order, paidAt and final number; one new-order message in the isolated
   Telegram sink with `Оплата: Оплачено`, correct items/total and work/Admin links;
   customer email goes only to the isolated sink after PAID.
4. Replay webhook, refresh return, run reconciliation concurrently, and resubmit
   the same checkout key: same order/number/invoice, no extra creation delivery.
5. Inject failure/cancellation/expiry/hold/unknown and return without payment:
   correct result state, retained audit, no accepted order/send/number. Then inject
   a valid delayed success; verify one acceptance or explicit late-money review.
6. Suppress webhook and invoke mocked authorized reconciliation; verify recovery
   and verify the separately approved scheduler actually runs it. Test invalid
   scheduler authentication without calling a provider.
7. Simulate definite Telegram rejection, timeout and worker death around send:
   retry only proven-unsent failures; inspect durable UNKNOWN after ambiguity;
   ordinary webhook retries never resend a successful delivery.
8. Concurrent COD and online PAID acceptance on disposable PostgreSQL: numbers
   are unique/sequential under the existing advisory lock; abandoned attempts
   leave no gap; historical numbers remain unchanged. Never claim gapless numbering
   after deleting historical orders; accepted orders must retain their numbers.
9. Verify historical numeric/3DK/LiqPay and paid/fulfilled records, COD creation,
   delivery selection and mocked TTN lifecycle, and explicit `Взяти в роботу` from
   Admin/Telegram. Payment alone must leave PROCESSING untouched.
10. Complete new acceptance tests, TypeScript, lint, isolated build, whitespace and
    final scope review. Rehearse compatibility rollback with outstanding attempts.
    Confirm no unintended live calls, secrets, environment edits, commits or push.

## 9. Changed files and remaining decision

Only `docs/BATCH_1_7_4A_CHECKOUT_ACCEPTANCE_SCHEMA_GATE.md` is changed/added.
The application still has the premature-acceptance defect described above and is
not ready to release as Batch 1.7.4A. Review approval is needed for the proposed
schema and delivery policy before dependent implementation; database execution
remains a separate explicit approval.


## Final validation results (implementation)

Run each script below with `node_modules/.bin/tsx.cmd scripts/<script>`.
All 15 isolated scripts passed; no remaining test failures:

| Script | Final result / coverage |
| --- | --- |
| verify-checkout-acceptance.ts | PASS: all 15 required categories; actual checkout/Mono/webhook/reconciliation/outbox/operational sources; one initial Telegram send TOTAL; deferred EN email; audit of stale/tied PAID, refunds, early/lost create, CAS/duplicate workers, rollback and receipt failure; real Admin list/count/revenue query predicates |
| verify-checkout-cart.ts | PASS: canonical retry input, no stored customer form data, state/reference/revision/content checks, failed/unknown retention, identical rebuilt-cart and new-purchase protection |
| verify-notification-delivery.ts | PASS: actual Telegram/email adapters; receipt, 429, permanent rejection, ambiguous 5xx and transport failure |
| verify-batch17-payments.ts | PASS: signatures/rotation/body limits, money/invoice/reference guards, stale/conflicting evidence, cron auth, server availability/variant pricing, no Product writes, numbering/collision contracts |
| verify-mono-initialization.ts | PASS: legacy conditional cleanup races and guarded unpaid invalidation; new records never deleted by this helper |
| verify-batch14-payments.ts | PASS: historical LiqPay, signed result links, financial transitions and sandbox isolation |
| verify-batch14-payment-ui.ts | PASS: actual UA/EN result states/polling, forged return, hosted handoff/cart retention, COD success |
| verify-batch16-notifications.ts | PASS: historical configurable events, independent channel toggles, localization, escaping and concurrency |
| verify-order-operations.ts | PASS: shared Admin/Telegram manual-work CAS, owner callback validation, replay/terminal/concurrency behavior |
| verify-batch17-cod.ts | PASS: server COD amount and delivery settlement, mocked TTN compatibility/auth/duplicates; no carrier call |
| verify-novaposhta-status.ts | PASS: 69 normalization/carrier cases, all effects mocked |
| verify-mono-response-diagnostics.ts | PASS: two trusted hosted domains, 40 invalid-response cases, redaction and old-validator compatibility |
| verify-checkout-render.ts | PASS: actual optional-size and checkout UA/EN rendering |
| verify-batch17-availability.ts | PASS: existing independent publication/orderability semantics |
| verify-cart.ts | PASS: actual persisted cart merge, variants, counts/totals and revision |

Additional validation:

| Command | Result |
| --- | --- |
| `node_modules/.bin/tsx.cmd scripts/verify-responsive.ts` | PASS: 216 storefront viewport renders, UA/EN, mobile containment and identical 1280/1440 desktop CSS screenshots |
| `node_modules/.bin/tsx.cmd scripts/verify-admin-responsive.ts` | PASS: 264 Admin viewport renders; drawer interactions; 44 desktop geometry/raster comparisons |
| `node_modules/.bin/prisma.cmd generate` | PASS: local generated client only |
| `node_modules/.bin/prisma.cmd validate` | PASS: schema valid; no DB connection |
| `node_modules/.bin/prisma.cmd migrate diff --from-schema-datamodel .next/cache/batch174a-base-schema.prisma --to-schema-datamodel prisma/schema.prisma --script` | PASS: offline datamodel-to-datamodel SQL generation matches the prepared expansion's fields/indexes/FK; reviewed CHECKs are additional SQL constraints; no SQL execution |
| `node_modules/.bin/tsc.cmd --noEmit --incremental false` | PASS |
| `npm.cmd run lint` | PASS, no warnings |
| `node scripts/verify-build-isolated.mjs` | PASS: final source compiled, lint/types checked, 15 prerenders; database/provider effects blocked |
| `git diff --check` and each untracked file's `git diff --no-index --check -- NUL <path>` | PASS: no whitespace errors; no-index exit 1 denotes new-file differences, not a whitespace failure |
| Inactive scheduler YAML parsed with installed `js-yaml` | PASS; five-minute template schedule, no activation |

Initial sandbox tsx startup failed at Windows userInfo/ENOMEM. The test commands
were rerun with explicit tool approval outside that sandbox; their external
effects remained mocked. Initial compatibility harness failures (new imports,
old null defaults and old acceptance assertions) were corrected; final failures: 0.
The isolated build blocks DB connections/writes and provider fetches and restores
its generated Next type-reference change. Ignored QA output is not a release asset.

## Acceptance implementation manifest (before the diagnostics follow-up)

52 files, including this report; no dependency/environment files or
active production scheduling files changed. New and modified files:

```text
.github/workflow-templates/payment-recovery.yml
docs/BATCH_1_7_4A_CHECKOUT_ACCEPTANCE_SCHEMA_GATE.md
prisma/changes/batch-1-7-4a-checkout-acceptance.sql
prisma/schema.prisma
scripts/payment-memory.ts
scripts/verify-admin-responsive.ts
scripts/verify-batch14-http.ts
scripts/verify-batch14-payment-ui.ts
scripts/verify-batch14-payments.ts
scripts/verify-batch16-notifications.ts
scripts/verify-batch17-cod.ts
scripts/verify-batch17-payments.ts
scripts/verify-cart.ts
scripts/verify-checkout-acceptance.ts
scripts/verify-checkout-cart.ts
scripts/verify-checkout-render.ts
scripts/verify-mono-initialization.ts
scripts/verify-notification-delivery.ts
scripts/verify-order-operations.ts
scripts/verify-responsive.ts
src/app/(shop)/checkout/success/page.tsx
src/app/admin/orders/[id]/page.tsx
src/app/admin/orders/page.tsx
src/app/admin/page.tsx
src/app/api/admin/orders/[id]/create-ttn/route.ts
src/app/api/cron/payments/route.ts
src/app/api/payments/liqpay/callback/route.ts
src/app/api/payments/mono/webhook/route.ts
src/app/api/payments/status/route.ts
src/components/checkout/checkout-form.tsx
src/components/checkout/order-result.tsx
src/lib/actions/create-order.ts
src/lib/actions/orders.ts
src/lib/notifications/delivery.ts
src/lib/notifications/email.ts
src/lib/notifications/orders.ts
src/lib/notifications/outbox.ts
src/lib/notifications/telegram.ts
src/lib/notifications/templates.ts
src/lib/order-reference.ts
src/lib/orders/take-into-work.ts
src/lib/payments/acceptance.ts
src/lib/payments/checkout-identity.ts
src/lib/payments/checkout-session.ts
src/lib/payments/initialization-state.ts
src/lib/payments/initialization.ts
src/lib/payments/mono.ts
src/lib/payments/order-result.ts
src/lib/payments/payment-state.ts
src/lib/payments/reconciliation.ts
src/lib/payments/transitions.ts
src/store/cart-store.ts
```

Final scope review: changes are confined to 1.7.4A acceptance, persistence,
notification/recovery, customer cart/result compatibility and their tests/docs.
No COD confirmation buttons/statuses, Admin redesign, product variant features,
filament management, unrelated roadmap or styling changes were introduced.

## Remaining risks / release blockers

- Prepared migration has not run. Actual schema, historical outliers, external
  references, lock duration and compatibility artifact/cutover need target-specific
  review and separate execution approval.
- PostgreSQL/pooler concurrency and transaction timeout behavior are not proven by
  the serialized in-memory model; disposable PG verification is required.
- No production scheduler is configured/verified by this work. Review frequency,
  actual maxDuration, backlog capacity, endpoint/secret and alerts before release.
- UNKNOWN delivery is deliberately manual; no code can prove a timed-out external
  send was absent. The approved operator policy must be operationally owned.
- Missing-ID uncertain invoices and conflicting late-money records require merchant
  review. Seven-day polling expiry never permits deletion or ignoring a later valid
  webhook. Historical old unaccepted markers require an inventory; do not replay
  past creation notifications or assume old delivery receipts exist.
- Result capabilities retain a 24-hour lifetime. Very long outbox outages can leave
  an email's pre-rendered link expired; a customer can replay their retained checkout
  identity for a fresh status capability. No email/notification resend is automatic.
- Native-device keyboard/touch, approved provider/sink integration and final release
  artifact checks remain manual prerequisites in the checklist above. No live
  financial, carrier or notification operation was authorized or performed.

All changes remain unstaged and uncommitted on the implementation branch.
HEAD remains the prior review-document commit; no push/merge/deployment occurred.
