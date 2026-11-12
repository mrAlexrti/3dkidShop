# Batch 1.6 — status and notification foundation

Branch: `batch-1-6-status-notifications`, based on accepted commit
`c3e49cbee68b5f0930b654b76d68cd20b670d624`.

## Inspection and implementation plan

Inspected Prisma, checkout/action/result flows, LiqPay callbacks, Nova Poshta
creation/sync, Admin order controls, notification transports/templates, SiteContent,
and existing isolated regression scripts before implementation.

Findings:

- `Order.status` is an enum containing `PENDING`, `AWAITING_PAYMENT`, `PROCESSING`,
  `SHIPPED`, `DELIVERED`, `PAID`, `COMPLETED`, `CANCELLED`.
- Existing payment fields are `paymentMethod String`, `paymentProvider String?`,
  `paymentMode String?`, `paymentStatus String?`, `paidAt DateTime?`.
- Existing delivery fields include `novaPoshtaTtn String?`, `novaPoshtaTtnRef String?`,
  `novaPoshtaStatus String?`, `novaPoshtaStatusCode String?`,
  `novaPoshtaCreatedAt DateTime?`, `novaPoshtaSyncedAt DateTime?`,
  `novaPoshtaDeliveredAt DateTime?`, `novaPoshtaCodStatus String?`,
  `novaPoshtaCodStatusCode String?`, `novaPoshtaCodAmount Decimal?`,
  `novaPoshtaError String?`.
- There is no persisted order locale, independent confirmation action, status
  history, notification log, or outbox. The callback already used compare-and-set;
  Admin and cron did not. Creation emailed offline customers; sandbox checkout
  returned before notifications. Status notifications were Telegram-only.
- `SiteContent` already supports settings through `key String @unique` and
  `value String @db.Text`. Existing content writes are allowlisted, so a dedicated
  validated JSON settings key can coexist without exposing it to content editing.

Plan implemented: reuse these fields; add pure status projections and translations;
derive semantic events from before/after snapshots; centralize templates and
dispatch; persist independent boolean channel settings in SiteContent; add
compare-and-set to Admin/cron/TTN persistence; verify using isolated mocks.

**No Prisma schema changes, migrations, db push, seeds, settings saves, historical
order updates, or other business-record writes were performed during this batch.**
No database mutation command is needed to use the code. The Admin form writes
settings only when an authorized owner submits it after running this version.

## Status compatibility

`src/lib/status.ts` is the normalized read/event boundary:

| Axis | Source | Compatibility |
| --- | --- | --- |
| Order | Existing enum | PENDING/AWAITING_PAYMENT → NEW; PROCESSING/PAID/SHIPPED/DELIVERED → PROCESSING; terminal order states remain terminal. |
| Payment | Existing payment snapshot and paidAt | Provider PAID needs paidAt. Failed/cancelled/refunded override historical paidAt. Unknown strings remain UNKNOWN. Legacy online flags without a validated provider snapshot remain pending. Offline COD payment uses paidAt. |
| Delivery | TTN, raw tracking snapshot, deliveredAt | A TTN alone means TTN_CREATED. Old SHIPPED/DELIVERED enum values alone do not establish carrier facts. A return snapshot overrides an older delivery timestamp. |

Historical rows, including the existing 2+ orders, are neither rewritten nor
backfilled. Their original enum and provider snapshots remain available. Admin
shows the three projections separately and retains an existing legacy enum value
as a disabled current selection until the owner explicitly chooses an order stage.
Editable order stages are NEW (persisted PENDING), PROCESSING, COMPLETED, CANCELLED.
There is no reliable independent CONFIRMED state/action in the current schema;
its event/type/translation is reserved and never inferred from payment.

Batch 1.4's validated callback, payment mode/provider snapshots, sandbox/live
guards, result capability and payment transition compatibility are retained.
Legacy PAID/DELIVERED/COMPLETED enum updates in payment/cron remain compatibility
writes; consumers use normalized axes rather than interpreting that enum as all
three statuses. New TTN creation no longer writes SHIPPED to the order enum.
Admin edits cannot mark payment paid or delivery shipped by selecting those old
enum aliases. Admin completion alone never establishes a payment fact.

Batch 1.5.1 rules are preserved: exact normalized delivery/COD positive allowlists,
canonical delivery code 9, no guessed numeric COD-paid codes, no substring matching,
negative COD text taking precedence over a text-code fallback, and provider delivery
dates. A COD snapshot cannot change paidAt for an online-provider order; a refunded
payment's historical paidAt cannot newly complete an order during sync.

Additional delivery text aliases currently supported:

| Stage | Exact aliases (whitespace/case normalized) |
| --- | --- |
| SHIPPED | `прийнято перевізником`, `передано перевізнику`, `handed to carrier` |
| IN_TRANSIT | `у дорозі`, `in transit` |
| ARRIVED | `готово до отримання`, `ready for pickup` |
| RETURNED | `повернуто відправнику`, `returned to sender` |

These are conservative compatibility aliases, **not a verified exhaustive map of
live Nova Poshta responses**. Additional numeric codes and variable-length carrier
phrases are deliberately deferred: the official developer documentation could not
be retrieved in this session. Codes other than the previously accepted 9 remain
unmapped. Refusal, return requested, and reverse-waybill creation are not proof of
a completed return. Thus shipment/transit/arrival/return notifications are emitted
only if a supported exact status is actually observed; many live carrier values
will currently display “status being checked”. Extend the provider boundary using
verified documentation or sanitized fixtures before depending on those stages
for full automation. No intermediate stages are invented when polling skips them.

## Event and channel contract

All configurable events are eligible for both owner Telegram and customer email.
Email also requires a recipient. All events for sandbox orders are suppressed.

| Event | Trigger | Default Telegram / email |
| --- | --- | --- |
| ORDER_CREATED | Newly committed offline order; once in the creation action | on / on |
| ORDER_CONFIRMED | Reserved; no reliable producer or UI toggle yet | off / off |
| ORDER_PROCESSING | Normalized order stage changes to PROCESSING | on / off |
| ORDER_CANCELLED | Normalized order stage changes to CANCELLED | on / off |
| ORDER_COMPLETED | Normalized order stage changes to COMPLETED | on / off |
| PAYMENT_PENDING | New pending order or observed transition to pending | off / off |
| PAYMENT_PAID | Validated online payment or existing COD paidAt transition | on / off |
| PAYMENT_FAILED | Validated failure/error callback | off / off |
| PAYMENT_CANCELLED | Validated cancelled/canceled callback | off / off |
| PAYMENT_REFUNDED | Validated reversal callback | off / off |
| DELIVERY_TTN_CREATED | A TTN is newly persisted or replaced | on / off |
| DELIVERY_SHIPPED | Observed supported carrier-handover transition | off / off |
| DELIVERY_IN_TRANSIT | Observed supported in-transit transition | off / off |
| DELIVERY_ARRIVED | Observed supported ready-for-pickup transition | off / off |
| DELIVERY_DELIVERED | Existing accepted delivery evidence becomes positive | on / off |
| DELIVERY_RETURNED | Observed completed-return transition | off / off |

Payment callbacks emit payment events independently of the legacy order enum,
including failures/reversals where the order enum stays unchanged. They no longer
re-emit ORDER_CREATED. Current online acquiring remains sandbox-only, so these
callbacks still never notify real recipients. When one persisted transition has
several semantic effects, each enabled event is sent independently.

Admin → Content → Notifications contains separate Telegram/email checkboxes per
supported event. Saving uses `notification_settings_v1` with typed boolean JSON,
an ADMIN guard, and an exact event allowlist. Unchecked boxes persist false.
Existing content saves cannot overwrite that key. Missing settings use the table
defaults; malformed settings or DB read failure suppress notification dispatch
instead of falling back to enabled defaults. Settings are read fresh per event
batch; already-in-flight sends are not cancellable by a later settings save.

`notifications/templates.ts` renders all events. UA/EN statuses and event titles
live in the existing `i18n.ts` dictionary. Telegram uses Ukrainian and includes
order/customer/item/TTN context and an Admin URL; customer email escapes supplied
text and retains a signed status-only order link. No raw provider status/payload
enters these templates. Transport errors log only generic messages/status codes,
not provider bodies or potentially credential-bearing error URLs.

Creation email uses the checkout locale passed in memory. Async callback/cron/Admin
emails default to Ukrainian because orders have no persisted locale. No cookie or
invented locale field is used to guess a customer's language.

## Duplicate protection and limits

- Callback: existing compare-and-set wins once; duplicate/stale callbacks are no-ops.
- Admin: identical enum saves do nothing; concurrent stale saves cannot both win.
  Changing between legacy aliases with the same normalized stage emits no event.
- Cron: compare-and-set covers order/payment/tracking snapshots and sync timestamp.
  Only the winner emits; repeated provider snapshots do not re-emit semantic events.
- TTN: an existing TTN returns without creation/notification. A conditional DB write
  prevents competing saves from both emitting TTN_CREATED. Only shipment fields
  are passed into its event snapshot, avoiding duplicate financial events from a
  concurrent payment update.
- Creation: emits after stock/order commit; sandbox handoff still returns first.

This is transition-based, best-effort delivery, not a durable outbox. A crash after
state commit but before sending, a disabled/misconfigured channel, or a transport
failure is not automatically replayed. There is no durable per-channel receipt,
cross-restart retry, or exactly-once external-delivery guarantee. An actual later
transition back into a stage can notify again; there is no lifetime event ledger.
Unknown delivery snapshots are retained as raw snapshots, so a later known stage
can be a new detected transition even if that stage was observed before the unknown
snapshot. No data is disguised as a notification log inside SiteContent.

Concurrent TTN requests can still both reach the carrier before the conditional
save; this batch prevents duplicate local event emission, not duplicate external
waybill creation. Checkout submission deduplication is also outside this batch.
If durable delivery/retry or shipment creation locking becomes required, propose
an additive persistence design and obtain schema/business-write approval first.

## Verification

- `scripts/verify-batch16-notifications.ts`: pure compatibility/negative cases,
  all configurable event/channel enable and disable paths, escaping/locales,
  settings auth/persistence, sandbox suppression, Admin/cron concurrency, TTN
  repeated-request behavior. All database/provider/notification boundaries mocked.
- `scripts/verify-novaposhta-status.ts`: existing 69 hardening cases and provider
  normalization using mock fetch; repeat polling stays stable.
- `scripts/verify-batch14-payments.ts`: existing isolated signature/payment/status,
  callback duplication/concurrency, sandbox and authoritative checkout regressions.
- `scripts/verify-batch14-payment-ui.ts`: UA/EN result rendering, checkout handoff,
  polling and capability access tests; pending/paid headings now use shared labels.
- TypeScript, ESLint, production build, and whitespace diff checks.

No .env edits, secret output, real emails/Telegram, real TTNs/payments, push,
deployment, merge, or Vercel configuration changes were performed.

## Final review before commit

Reviewed all tracked changes and new files, notification callers, defaults,
localization, and transition guards against the accepted Batch 1.5.1 source.
Two focused fixes were made:

- Unknown delivery/order label lookups now reject inherited JavaScript properties
  such as `constructor` and `__proto__`. These values cannot produce an invalid
  normalized delivery stage or notification event.
- The Nova Poshta card now uses the normalized delivery label. Original carrier
  status, code and COD text appear only in collapsed carrier diagnostics, with
  Ukrainian and English labels. Existing unrelated Admin copy was left unchanged.

A newline-only change to `src/lib/email.ts` was removed; that compatibility
re-export is now byte-for-byte unchanged from the accepted version.

Added isolated tests for these unknown values, actual Admin detail rendering in
both locales, and overlapping TTN persistence (one notification winner). No direct
business-code transport bypasses or unrelated feature changes were found. The
best-effort delivery, carrier mapping, locale and external TTN locking limitations
described above remain unchanged.
