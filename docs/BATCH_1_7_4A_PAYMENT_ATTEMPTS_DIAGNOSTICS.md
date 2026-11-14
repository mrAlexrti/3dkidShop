# Batch 1.7.4A — Payment Attempts visibility and diagnostics

Local, read-only follow-up on `feat/batch-1.7.4-checkout-acceptance`.
The existing uncommitted acceptance implementation was inspected and preserved.
No additional schema change or migration is required. The previously prepared
1.7.4A expansion remains unexecuted and is still a release prerequisite.
No production/database connection, payment, notification, TTN, scheduling change,
commit, push, merge or deployment was performed.

## Behavior found before this change

Technical attempts are existing `Order` rows with `OrderItem` snapshots, not a
separate PaymentAttempt table. New online checkout creates PROVISIONAL, null
business number, stable paymentReference, retry identity and server-priced items.
Invoice initialization binds invoice ID, expiry and reconciliation schedule.
Provider status, normalized financial status, paidAt, timestamps and error code
remain on the same row. REVIEW expresses unresolved acceptance/financial cases.

There was no separate Admin diagnostics/review interface. Operational Orders,
dashboard count/revenue/recent orders, work and TTN operations excluded these
records. Cron reported aggregate REVIEW and notification UNKNOWN counts only.
That left unscheduled and long-lived attempts without a usable Admin record view.

Reconciliation selects Mono records with paymentNextCheckAt <= now and claims a
five-minute lease. It queries merchant invoice status and invokes the existing
guarded financial transition. New known pending/unknown invoices keep scheduled
checks. Failed/cancelled known invoices receive hourly follow-up until seven days
past invoice expiry, then REVIEW with no destructive cleanup. Valid delayed
webhooks remain eligible afterwards. Local elapsed time alone is not expiry proof.

Records can remain indefinitely:

- Missing-invoice uncertain initialization becomes UNKNOWN/REVIEW with no next
  check; there is no assumed provider lookup-by-reference API.
- Definitely rejected invoice creation is retained as FAILED/REVIEW without a
  next check. A refusal to initialize an invoice does not prove any debit occurred.
- Failed/expired/cancelled attempts that finish the follow-up horizon remain REVIEW.
- Refund-before-acceptance and some late/conflicting money cases require review;
  known paidAt is preserved even when acceptance is unsafe.
- Known pending/unknown invoices can continue polling indefinitely if the provider
  never gives a consistent final result. A scheduler outage leaves due rows waiting.
- Old initialization markers can remain indefinitely. Historical orders without
  those markers retain their existing operational compatibility classification.

## Added interface

Admin navigation now includes **Спроби оплат / Payment Attempts**, at
`/admin/payment-attempts`, separate from Orders. A server-side service calls the
existing requireAdmin guard before COUNT or SELECT; existing middleware also
protects the route. Missing session and non-ADMIN roles cannot read records.

The page is dynamic and read-only. Its only form is a GET filter form. There are
no payment/acceptance mutation buttons, TTN links, reconciliation triggers,
notification actions or normal order-detail links for attempts.

The listing includes provider-backed PROVISIONAL/REVIEW records, legacy Mono
initialization-marker records, and unnumbered inconsistent records. Normal
ACCEPTED/numbered orders, compatible historical orders and COD are excluded.
Unmarked historical online orders are not reclassified or hidden by this change.

Visible fields are creation time, internal ID, customer name, amount/currency,
provider, financial state plus an independent REVIEW badge, safe payment reference
and invoice ID, expiry, last provider update, next reconciliation and translated
reason. Mono currency is UAH because existing acceptance validates currency 980;
no currency column was invented. Unknown provider currencies display unavailable.

The data layer uses an explicit Prisma select and constructs a separate DTO.
Hosted payment URLs, capabilities/tokens, retry/payload hashes, email, phone,
shipping address, item/notification payloads and raw provider responses are neither
selected for this page nor serialized into its output. Only customer name is
shown, as requested. Provider/state/error text is mapped to centralized copy;
unrecognized error strings never render verbatim. References/IDs are bounded and
restricted to their expected identifier alphabet. No additional logging is added.

## Labels, filters and pagination

Financial labels distinguish awaiting payment, provider processing, failed,
cancelled, provider-confirmed expiry, unknown/reconciliation pending, refunded and
paid-but-unaccepted. REVIEW is a separate badge, so an unresolved failed payment
can show both its failure and the need for manual review. A persisted PAID or
paidAt without operational acceptance produces a prominent investigation warning.
Contradictory/unknown provider data is not relabeled as a confirmed failure.
An expiry timestamp in the past does not change the financial label.

Pagination is server-side, 25 records per page, sorted by createdAt descending and
ID descending for deterministic ties. Count and SELECT use the same visibility
and filter predicate. Out-of-range pages clamp to the last page. A concurrent
acceptance can change the count between reads; refresh resolves that harmless
read-only snapshot difference. Acceptance logic is unaffected.

Filters include all financial labels, REVIEW and no scheduled check. Search is
case-insensitive by internal ID/payment reference, with number fallback only for
legacy rows whose reference is null. Invalid/oversized identifiers, unsupported
statuses, repeated parameters and impossible/reversed dates fail closed with
localized validation and no database reads. Page values are bounded/normalized.
Creation-date filters are inclusive UTC calendar days, using a half-open upper
bound. All displayed timestamps explicitly use UTC; they do not depend on server
timezone. Pagination preserves filters and search. Reset removes the filters.

All copy lives in centralized UA/EN translations. The page reuses Admin glass
containers, typography, forms, sidebar and a contained, keyboard-focusable scroll
region for the wide diagnostic table. No global styles/Admin redesign were added.

## How an administrator uses it

1. Sign in as ADMIN and open **Спроби оплат / Payment Attempts**.
2. Choose failed, cancelled, expired or awaiting to inspect an unsuccessful or
   abandoned checkout. Narrow by creation date or an internal ID/payment reference.
   A waiting attempt with elapsed local expiry still waits for provider evidence.
3. Check **Requires manual review**, **Payment confirmed — order not accepted**,
   and **No scheduled check** routinely. These filters overlap intentionally:
   review is an acceptance flag; no schedule is a recovery fact, not proof of failure.
4. Compare invoice/reference, persisted reason, provider update and next check.
   A past-due check requires scheduler investigation, not another customer payment.
5. Investigate missing-ID uncertainty, late money after cancellation/refund,
   mismatched/inconsistent financial evidence and perpetual unknown states through
   the approved merchant/reconciliation process. This page grants no manual PAID
   or acceptance override and does not make any live provider call.

On ordinary verified full PAID, the existing acceptance transaction updates the
same Order row, allocates the business number under the existing advisory lock,
sets PAID/paidAt/acceptedAt/ACCEPTED and inserts initial notification outbox rows.
It then disappears from Payment Attempts and appears in normal Orders on refresh.
There is no copied second order and no number allocation in the diagnostics code.
Unsafe late-money cases remain visible for investigation instead of being forced
into operations. Payment alone never starts PROCESSING.

## Retention and future archive recommendation

Today unsuccessful records and snapshots remain stored indefinitely. This change
introduces no delete, archive mutation or retention job. Retained identity, invoice
binding, amount/items, financial state, provider timestamps, retry audit and error
markers support deduplication, delayed webhook matching and financial investigation.
Accepted records remain the normal historical order with its payment history.

A conservative future operational proposal is a non-destructive, searchable archive
for independently reconciled, terminal, unpaid attempts after at least 90 days and
explicit policy approval. Keep stable ID/reference/invoice tombstones, financial
evidence and the ability to resolve a valid delayed webhook. Keep unknown, missing-ID,
paid, refunded-with-disagreement and unresolved REVIEW records in an open review
queue regardless of age. Do not use a time horizon to prove that later money is
impossible. Set privacy/accounting retention separately with the owner; this is
an operational archive proposal, not an implemented legal retention policy.

## Changed files in this follow-up

- `src/app/admin/payment-attempts/page.tsx` (new)
- `src/lib/admin/payment-attempts.ts` (new)
- `src/lib/payments/attempt-diagnostics.ts` (new; pure read/query/view helpers)
- `src/components/admin/admin-sidebar.tsx`
- `src/lib/i18n.ts`
- `scripts/verify-payment-attempts.ts` (new)
- `scripts/verify-admin-responsive.ts` (extends existing isolated QA)
- `docs/BATCH_1_7_4A_PAYMENT_ATTEMPTS_DIAGNOSTICS.md` (new)
- `docs/BATCH_1_7_4A_CHECKOUT_ACCEPTANCE_SCHEMA_GATE.md` (current UI/report cross-reference)

Existing local schema/migration, checkout, financial transitions, reconciliation,
outbox, operational metrics/actions and numbering sources were not changed by
this follow-up. Prior uncommitted Batch 1.7.4A changes remain intact.

## Verification

Each isolated script is run as `node_modules/.bin/tsx.cmd scripts/<name>`.

| Check | Result |
| --- | --- |
| verify-payment-attempts.ts | PASS: actual page/service/requireAdmin/sidebar; denied roles before reads; provisional/REVIEW/legacy and accepted/COD boundaries; financial labels and all status filters; SQL-null-aware predicates; 25-row pagination/ties/date boundaries/search; UA/EN; safe SELECT/DTO/HTML; read-only forms and links |
| verify-checkout-acceptance.ts | PASS: existing 15 acceptance categories, Admin metrics/operational guards, exactly one initial Telegram message; mocked effects |
| verify-order-operations.ts | PASS: unchanged Admin/Telegram work/CAS semantics; mocked effects |
| verify-batch17-cod.ts | PASS: unchanged COD and mocked TTN behavior |
| verify-batch14-payments.ts | PASS: historical payments/result capabilities |
| verify-batch16-notifications.ts | PASS: existing configurable notifications/localization |
| verify-admin-responsive.ts | PASS: 286 UA/EN Admin viewport renders including the new page, long references and paid-review warnings; 44 existing-page desktop comparisons with only the new navigation link normalized |
| `node_modules/.bin/tsc.cmd --noEmit --incremental false` | PASS |
| `npm.cmd run lint` | PASS, clean |
| `node scripts/verify-build-isolated.mjs` | PASS: new dynamic route compiled; lint/types and 15 prerenders; database/provider effects blocked |
| `git diff --check` and untracked-file whitespace checks | PASS; no whitespace errors (no-index exit 1 means new-file differences) |

New-page layout fixtures include long identifiers and paid-review warnings. The
desktop oracle normalizes only the intentional new navigation link; the new page
has no historical screenshot baseline and is excluded from desktop parity claims.
No real database or provider was contacted. Real PostgreSQL query-plan/concurrency
verification remains an approved disposable-environment release prerequisite.

## Remaining operational / release risks

- The existing 1.7.4A expansion/cutover and actual schema verification still require
  separate authorization. This page uses the new fields and must not ship before it.
- A diagnostics page is not a scheduler. Verify authenticated recovery cadence,
  queue capacity, runtime budget and alerts before release; monitor both cron
  failures and due/unscheduled records. The UI reports persisted error reasons,
  not transient provider errors that were never recorded.
- Unknown/missing-invoice and paid-but-unaccepted cases still need an assigned
  operator and merchant investigation. This page intentionally cannot repair them.
- Notification UNKNOWN is a separate delivery audit and still requires protected
  outbox investigation; no payload or resend operation is exposed here.
- Large histories may eventually need a reviewed index/archive/query-plan change.
  No new migration was introduced merely for pagination or reference search.
- Before release, verify real Admin sessions (including logout/non-ADMIN denial),
  browser GET filters and pagination, device table scrolling, accepted-attempt
  disappearance after refresh, historical Orders/COD availability, and data-field
  exclusion against an approved isolated target. No live payment is authorized here.
