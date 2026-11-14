# Batch 1.7.4A — final release gates and operator runbook

Local verification date: 2026-11-14. Starting commit:
`cf7334bc84ce007f3d4fa6a205a342c1ce83d485`, branch
`feat/batch-1.7.4-checkout-acceptance`. Production branch:
`redesign-3dkid-v2`. No commit, push, deployment, live scheduler activation,
existing-database migration, payment, TTN or notification was performed.

## Gate assessment

| Gate | Result | Evidence / remaining condition |
| --- | --- | --- |
| 1. Explicit payment retry | PASS | Merchant-verified terminal-only recovery, stable successor identity, no invoice creation on result display, refreshed verification at submission, previous audit retained; source/UI/cart tests. |
| 2. Disposable real PostgreSQL | PASS locally | PostgreSQL **18.2**, Prisma **5.22.0** installed locally. Expansion from the pinned pre-batch schema, empty Prisma schema diff, concurrent numbering, real webhook/reconciliation races, outbox uniqueness, rollback and CHECK/FK/unique/history tests. Production PostgreSQL version, data volume and pooler remain separate release prerequisites. |
| 3. Production scheduler/capacity | NOT VERIFIED | Repository default branch verified remotely as `main`. Existing five-minute template is inactive and unsuitable as the sole recovery/alerting mechanism. A one-minute external runner and exact activation procedure are prepared below. Production runtime budget, expected load, scheduler host, alert routing and observed recurring runs have not been verified. |
| 4. Migration/rollback readiness | NOT VERIFIED | SQL/schema agreement and a synthetic expansion rehearsal pass. Read-only preflight/monitor SQL and the operational procedure below are prepared. Production schema inventory, backup restore, representative lock timings and old-instance drain have not been executed/verified. |
| 5. Local regression/static/build checks | PASS | Commands/results below. No claim of live provider or Production integration verification. |

**Release remains blocked on gates 3 and 4.** The conditional procedure below is
for review and a separate approval; it is not an instruction to deploy now.

## Changes since the reviewed commit

- Terminal result display retains its original browser checkout identity and cart.
  It does not silently generate a replacement identity. UA/EN result pages offer
  an explicit “Start a new payment attempt” button only for eligible provisional
  failures/cancellations/expiry. Pending, uncertain, paid, refunded, REVIEW,
  missing-invoice and historical orders cannot use this recovery path.
- The button calls a server action using the existing v2 result capability. The
  server queries Mono with the merchant token, checks invoice/reference/amount/UAH
  through the existing transition, then rereads persisted eligibility. A stale,
  conflicting or unavailable snapshot fails closed. The action creates no invoice.
- The successor key is HMAC-derived from the immutable predecessor reference and
  original key hash, with a separate domain. Multiple tabs/clicks share one
  successor. The browser installs it only on an explicit click matching its stored
  attempt. Checkout re-verifies the predecessor with Mono before creating a new
  attempt. Replays of an existing successor return that existing attempt.
  A mismatched successor key is rejected. All product/pricing validation remains.
- The predecessor is never deleted, renumbered, or overwritten with the successor.
  Later confirmed money remains recoverable on its original record. A merchant
  terminal snapshot is a point-in-time fact: a later contradictory success must
  still be investigated, especially when the customer separately paid a successor.
  No client-side mechanism can guarantee a provider never revises an earlier
  terminal result. Unknown invoices are never recreated by this feature.
- Paid return clears only the matching, unchanged cart/revision. Failure, pending,
  expiry and retry preparation preserve the cart. Missing browser storage or an
  expired capability requires support/status recovery; there is no unsafe fallback.
  V1 historical signed links and their status-response shape remain compatible.
- Reconciliation errors now produce HTTP 503, while outbox recovery still runs
  independently. Authenticated responses include aggregate due and overdue counts.
  The prepared monitor checks response shape, provider errors, REVIEW, UNKNOWN and
  work overdue by ten minutes, rather than treating any HTTP 200 as healthy.
- No Prisma schema or expansion SQL change was necessary for this follow-up.
  Two additional SQL files contain **read-only**, operator-only inspections.

## Reproduce the disposable PostgreSQL rehearsal

From the repository root, with dependencies installed and PostgreSQL binaries
available, run:

```powershell
$env:BATCH174A_PG_BIN = 'C:/Program Files/PostgreSQL/18/bin'
node scripts/rehearse-checkout-postgres.mjs
```

The runner ignores inherited PostgreSQL connection settings and `DATABASE_URL`.
It creates a new cluster under the OS temporary directory, chooses a fresh
loopback-only port, creates `batch174a_qa`, reconstructs the pinned legacy schema,
inserts synthetic historical fixtures **before** expansion, and applies the exact
prepared SQL only there. It compares that schema to Prisma and runs the actual
application transition, webhook, reconciliation and outbox creation sources with
all provider/delivery effects replaced. A directory marker and server
`data_directory` check protect against accidental use of another cluster. The
private cluster is stopped in `finally`; temporary synthetic fixtures/logs remain
outside Git. No existing PostgreSQL service is started, stopped or connected to.
Windows sandbox token limitations require running this isolated command with the
normal user execution permission. The runner does not accept a database URL.

Measured local assertions:

1. Historical `0007`, `3DK-QA-OLD`, PAID/COMPLETED state, invoice and OrderItem/FK
   survive expansion with LEGACY classification.
2. Eight online acceptances plus eight COD transactions race on PostgreSQL's real
   advisory lock and produce exactly `0008` through `0023`, with no gaps/duplicates.
3. Twelve rounds race two actual webhook handlers against reconciliation. One
   acceptance and one ORDER_CREATED row per channel result. No PROCESSING change.
4. Duplicate outbox insertion fails at the unique index. A trigger deliberately
   fails the second outbox insert: paidAt, number, acceptance and the first insert
   all roll back. The number is reusable, and verified retry recovers the payment.
5. Acceptance/locale/channel/state/nonnegative-attempt CHECKs, number/reference/key/
   invoice unique constraints and outbox deletion FK are exercised on PostgreSQL.
6. Prisma's schema diff after expansion is empty; the additional SQL CHECKs are
   verified separately because Prisma does not model them. Prisma 5 reports some
   PG18 CHECK/FK violations as unknown-request errors; tests assert the actual
   constraint name, rather than assuming a Prisma error-code mapping.

Repeat against the **same PostgreSQL major, Prisma runtime, connection/pooler
configuration and representative data size** as Production in an approved isolated
environment. The local direct-connection result is not evidence about those
uninspected Production characteristics.

## Recovery scheduling decision and capacity

Read-only `git ls-remote --symref origin HEAD` confirmed `refs/heads/main` on this
date. No branch was changed. GitHub scheduled workflows run from the default
branch, have a minimum five-minute interval, and can be delayed/dropped during
load; placing the template only on `redesign-3dkid-v2` is insufficient. See
[GitHub schedule documentation](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).
The existing Nova Poshta workflow is unchanged.

Recommended method: a dedicated, monitored **external one-minute timer**, calling
the production-domain endpoint through `scripts/check-payment-recovery.mjs`.
It is independent of the GitHub default branch and does not require modifying
`main`. No external host/service has been selected or configured by this work.
The old inactive Actions template remains only as reference and now warns about
its capacity/monitoring limits.

Native Vercel cron is an alternative only after the project's actual plan/cadence,
production Git branch, function duration and alerting are verified. Cron invokes
production deployments and uses the same function runtime limits. Hobby's daily
frequency is unsuitable for this one-minute design; verify current plan details in
[Vercel usage documentation](https://vercel.com/docs/schedules/cron-jobs/usage-and-pricing)
and [cron management documentation](https://vercel.com/docs/schedules/cron-jobs/manage-cron-jobs).
No `vercel.json`, Vercel settings, project variables or active workflows were changed.

Capacity and runtime boundaries from the actual sources:

| Work | Per request | Nominal cadence / bound |
| --- | --- | --- |
| Payment recovery | Up to 3 claimed records, sequential Mono queries | Pending/unknown normally due every 5 min; retry on provider failure after 10 min; terminal audit hourly until the seven-day review boundary. Each Mono request times out after 15 s. |
| Outbox recovery | Up to 3 messages, sequential sends | Individual Telegram/email transport timeout 5 s; safe retry backs off from 60 s to 1 h, maximum 8 claims; unknown delivery never automatically retried. |
| Request | Payment and outbox tasks run concurrently | Route declares `maxDuration = 60`. Three Mono timeouts consume about 45 s before DB overhead; three sends about 15 s. Slow DB/repeated transaction conflicts can exceed this budget. Scheduler request timeout 75 s; no immediate retry. |

One-minute invocation gives theoretical ceilings of **180 payment checks/hour**
and **180 message claims/hour**, before retries, failures, contention or skipped
ticks. Two channel rows per online acceptance means at most **90 online orders/hour**
of outbox throughput, not a guaranteed sustainable rate. At five-minute pending
polling, the payment budget supports roughly **15 continuously pending invoices**
before terminal checks and retries. The five-minute Actions template reduces these
ceilings to 36 checks/messages per hour and roughly three pending invoices. Use
at most half the theoretical capacity as an initial planning budget; measure actual
arrival rates, outstanding invoices and p95/p99 durations before approval.

No larger batch or automatic parallel burst was added. Production capacity is
**NOT VERIFIED** until the owner supplies peak arrival/backlog figures and proves
that the chosen cadence clears them within the ten-minute overdue threshold.
If these bounds are insufficient, stop release and separately review batch/runtime
or queue-worker changes. Do not silently increase request timeouts or call concurrency.

## Exact scheduler activation procedure — approval required, not executed

1. Select an operations-owned Linux host/managed equivalent with outbound HTTPS,
   a supported Node.js runtime (22+), reliable clock, secret storage, service-failure
   alerting and an independent dead-man monitor. Verify the production domain maps
   to `redesign-3dkid-v2` and the intended immutable release. Record actual Vercel
   duration/plan limits, DB pool capacity and load evidence. These are unresolved.
2. Copy only `scripts/check-payment-recovery.mjs` from the approved immutable release
   to `/opt/3dkid-payment-recovery/check-payment-recovery.mjs`; record its SHA256.
   Provision a restricted `payment-recovery` service user. Inject
   `PAYMENT_RECOVERY_URL=https://<reviewed-production-host>/api/cron/payments` and
   `CRON_SECRET` through the host's secret mechanism. A root-owned mode-0600
   `/etc/3dkid/payment-recovery.env` is one option. Use the same secret as the app;
   never put it in Git, shell arguments/history, tracing, URLs or logs.
3. Prepare these units **disabled**, replacing the alert hook with the already
   tested operations alert integration. `OnFailure` below is a required local
   alert unit, not a supplied notification service:

```ini
# /etc/systemd/system/3dkid-payment-recovery.service
[Unit]
Description=3D Kid payment and outbox recovery
OnFailure=payment-recovery-alert@%n.service
[Service]
Type=oneshot
User=payment-recovery
EnvironmentFile=/etc/3dkid/payment-recovery.env
ExecStart=/usr/bin/node /opt/3dkid-payment-recovery/check-payment-recovery.mjs
TimeoutStartSec=90
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true

# /etc/systemd/system/3dkid-payment-recovery.timer
[Unit]
Description=Recover 3D Kid payments every minute
[Timer]
OnCalendar=*-*-* *:*:17
AccuracySec=1s
RandomizedDelaySec=0
Persistent=true
Unit=3dkid-payment-recovery.service
[Install]
WantedBy=timers.target
```

4. On that host run `systemd-analyze verify` for the two unit paths and
   `systemd-analyze calendar '*-*-* *:*:17'`. Prove no overlap: a still-running
   oneshot service must not start twice. Runs exceeding one minute skip a tick;
   include this in capacity measurements. Prove failure alerts and a dead-man
   alert when no healthy completed run is observed for three minutes. Do not
   enable a scheduler whose alert hook is missing. These host checks have not run.
5. In a separate isolated test deployment/database with **mock providers/sinks**,
   test missing/wrong bearer (401; missing configured secret 503), correct bearer,
   provider error 503 while outbox still runs, REVIEW, expired sender lease to
   UNKNOWN, retry, backlog draining and deliberately failed/dead timer alerting.
   The checked-in regression tests cover these application boundaries; actual
   hosting/network/alert integration remains to verify. Never probe the production
   GET with valid credentials before approval: it performs recovery and sends.
6. Only after migration, compatibility deployment, old-instance drain, environment
   review and explicit activation approval: `systemctl daemon-reload`, then
   `systemctl enable --now 3dkid-payment-recovery.timer`. Inspect
   `systemctl list-timers 3dkid-payment-recovery.timer` and restricted service logs.
   Observe at least ten consecutive one-minute executions and one genuine due
   backlog drain. Do not enable online checkout until these observations pass.
7. The runner follows no redirects, retries no HTTP request, bounds the response
   body to 16 KiB, and logs only a fixed healthy/attention message. Alerts must
   inspect the numeric response through this runner, not just HTTP status.
   REVIEW/UNKNOWN cause continuing operator attention, never automatic resend.
   Separate urgent paid-but-unaccepted monitoring uses the SQL below; no payload
   or customer details belong in the alert channel.

## Production migration and rollback runbook — not executed

### Read-only preflight and recovery evidence

1. Obtain separate target-specific Production inspection/migration/deployment
   approvals and appoint a release owner. Verify the exact database host/service,
   schema/search path, PostgreSQL version, application branch, deployed commit,
   Prisma version and pooler mode privately. Do not paste connection strings or
   customer rows into review artifacts. Use a dedicated read-only role and an
   approved `pg_service.conf`/credential manager, not a URL on the command line.
2. Run only `prisma/changes/batch-1-7-4a-preflight-readonly.sql` with `psql -X`,
   `ON_ERROR_STOP=1` and that explicit approved read-only service. It wraps its
   catalog/aggregate reads in `BEGIN READ ONLY` with 2 s lock / 15 s statement
   limits. Archive its restricted schema/aggregate output in operations storage.
   Compare every baseline column/index/enum/FK against the pinned pre-batch schema.
   Check preexisting null/oversized numbers and partial expansion objects. A
   mismatch, partial expansion, wrong target/replica or long transaction is a stop
   condition. Do not run the expansion twice and do not use `IF NOT EXISTS` to
   hide schema drift.
3. Verify managed snapshots and PITR retention, latest successful backup, WAL
   coverage, RPO/RTO and restore permissions. Restore a recent backup into a
   **separate private database**; validate historical numbers/items/payments and
   application reads. Record the recovery point and measured restore duration.
   A backup listing or successful `pg_dump` alone is insufficient. If approved,
   use a version-compatible `pg_dump --format=custom --file=<protected-path>` and
   `pg_restore --list` / isolated `pg_restore --exit-on-error --no-owner`; never
   check backup files into Git. A dump is a consistent database export, not a
   replacement for PITR/global-object recovery; see
   [PostgreSQL pg_dump documentation](https://www.postgresql.org/docs/18/app-pgdump.html).
4. Rehearse this exact expansion on the isolated restored database with the actual
   PostgreSQL major/pooler. Capture table/index sizes, lock wait, full transaction
   time, constraint scan time and historical invariants. SQL/schema agreement has
   passed on synthetic data only. Resolve any `prisma migrate diff` drift privately
   before scheduling the maintenance window; never run a generated drift script
   on Production as an automatic fix.

### Expansion, compatibility deployment and old-instance cutover

1. Record a restricted inventory of existing live/sandbox invoices and their
   provider/status/next-check/initialization markers, including historical online
   orders already notified and unknown-ID attempts. Do not resend historical
   ORDER_CREATED events or backfill outbox receipts. Existing invoices retain
   their original number/reference; old signed links require the same AUTH_SECRET.
   Keep merchant token, webhook URL and result-signing secret intact.
2. Disable online checkout through the approved configuration/cutover mechanism.
   If this requires a deployment before expansion, rebuild the **currently deployed
   pre-expansion artifact** with `ONLINE_PAYMENT_MODE=disabled`; do not deploy the
   new Prisma/application build yet. The expanded-schema compatibility build is
   deployed in step 5 with online checkout still disabled.
   Freeze new checkout writes during schema locks; COD resumes after compatibility
   verification. Do not remove Mono credentials: existing invoice verification
   and webhooks still need them. Stop old recovery/send workers, let in-flight
   invoice initialization/notifications finish, and capture uncertain outcomes.
   If callbacks must be held during a short lock window, return retryable failure;
   never acknowledge-and-drop a confirmed payment. Verify provider retry behavior
   and bounded reconciliation recovery before choosing that ingress policy.
3. With no provisional records yet, apply the expansion to the **approved direct
   primary connection** using `psql -X -v ON_ERROR_STOP=1 -f
   prisma/changes/batch-1-7-4a-checkout-acceptance.sql`. This file already contains
   `BEGIN`/`COMMIT`; do not wrap it in another transaction. It is in `prisma/changes`,
   not a Prisma migrations directory: `prisma migrate deploy` does not apply it.
   Record its SHA256 and successful completion in the operations change ledger.
   Do not use `prisma db push` or `migrate dev`.
4. The file creates the enum, makes `Order.number` nullable, adds default LEGACY
   acceptance/reference/retry/locale/handoff columns and unique/index constraints,
   creates the outbox with restrictive FK/checks, and adds acceptance/locale CHECKs.
   No historical number/reference/item or notification is backfilled. ALTER TABLE
   requires strong table locks, and normal unique/index creation plus CHECK scans
   happen in the same transaction. The 5 s lock / 60 s **per-statement** timeouts
   do not bound the entire transaction. Use a measured maintenance window;
   [PostgreSQL locking documentation](https://www.postgresql.org/docs/18/explicit-locking.html)
   explains lock conflicts. On timeout/error, stop and verify complete rollback
   with read-only catalog checks before any retry; do not extend timeouts ad hoc.
5. Deploy the Batch 1.7.4A compatibility build against the expanded schema with
   online checkout still disabled. It must handle LEGACY invoices, signed v1
   links, historical paid/fulfilled orders, COD and the new lifecycle/outbox.
   New code cannot run against the pre-expansion schema. Old code can coexist
   with expansion only while all records still have numbers. Verify metadata and
   run the aggregate monitor SQL; no new null-number writer is enabled yet.
6. Drain **all** old application versions: active requests, workers, queued jobs,
   stale checkout server actions, skew-protected sessions and direct deployment
   URLs. Promote the intended domain, then block/protect old origins/write paths
   without breaking the stable callback route. Verify this using the actual
   hosting controls; a new deployment alone is not proof of drain. Old generated
   Prisma clients assume non-null numbers and old handlers may accept/notify unpaid
   attempts, so enabling provisional writes before drain is a release blocker.
7. Verify existing in-flight invoices are visible to the new reconciliation path
   or explicitly inventoried for approved operator recovery. Historical unpaid
   numbered orders remain LEGACY; do not silently reclassify or renumber them.
   Unknown-ID invoices cannot be guessed/recreated. Reconcile known outstanding
   invoices through the approved recovery endpoint only after provider/notification
   execution is separately authorized. Preserve all REVIEW and delayed-money facts.
8. Activate and verify the scheduler using the preceding procedure while online
   checkout remains disabled. Verify auth, ten successive runs, latency/capacity,
   alert delivery/dead-man behavior, and historical recovery without duplicate
   creation messages. This step can perform real recovery/sends and needs approval.
9. Only after all gates and separate release approval, enable live online checkout
   on the drained compatibility release. Validate the deployed artifact/config,
   synthetic/sandbox flow where supported and read-only monitoring first. Any real
   financial/notification smoke test requires its own explicit scope. Observe
   acceptance/outbox/backlogs before lifting the maintenance restrictions fully.

### Rollback and operational attention

- Before any new provisional writes, rollback can keep the **expanded schema** and
  return to the inventoried legacy artifact with online checkout disabled, after
  confirming no null-number records/new workers exist. Leave expansion in place.
- Once any PROVISIONAL/REVIEW/outbox records exist, do **not** redeploy the old
  non-null-number application or revert the schema. Disable new online checkout,
  retain a known-good **acceptance-compatible** build for webhooks/reconciliation/
  outbox/Admin and forward-fix. Preserve current AUTH_SECRET/provider credentials,
  provisional audit, issued numbers and all payment truth. Do not mark attempts
  manually paid, manufacture numbers, delete records, or rebuild outbox receipts.
- If a sender may already have delivered, an expired SENDING lease becomes UNKNOWN.
  Never change it to RETRY automatically. An authorized operator must inspect the
  actual provider receipt/message history privately; absent proof of non-delivery,
  do not resend. Operators must own REVIEW/UNKNOWN handling before release.
- A post-cutover backup restore in place can erase payments/notifications received
  after the recovery point. Restore to a separate instance, inventory Mono truth
  and delivery receipts since that point, and review a recovery/merge plan; do not
  rewind Production automatically. A destructive down migration is not supplied.
- Run `prisma/changes/batch-1-7-4a-monitor-readonly.sql` with an approved read-only
  role. Alert urgently on paid-but-unaccepted records, any broken acceptance,
  expired sender leases, UNKNOWN and growing/over-ten-minute backlogs. REVIEW and
  attempts without a scheduled check require human inventory; seven-day terminal
  polling cessation does not authorize deletion or ignoring delayed PAID webhooks.
- Failed/cancelled/expired attempts are retained indefinitely today. Recommend
  restricted audit/archive retention after a separately approved legal/business
  policy; keep references and delayed-payment recovery. No cleanup was implemented.

## Verification commands and results

All provider HTTP, email, Telegram and carrier effects in tests are mocked. Real
PostgreSQL effects occurred exclusively on new private synthetic clusters.

```powershell
# No database connection: explicit dead validation URL overrides local config.
$env:DATABASE_URL = 'postgresql://qa@127.0.0.1:1/validation_only'
node_modules/.bin/prisma.cmd validate --schema prisma/schema.prisma
node_modules/.bin/tsc.cmd --noEmit --incremental false
npm.cmd run lint
node scripts/verify-build-isolated.mjs
node scripts/verify-recovery-monitor.mjs
node scripts/rehearse-checkout-postgres.mjs
git diff --check
```

Run each of these with `node_modules/.bin/tsx.cmd scripts/<name>.ts`:

`verify-checkout-acceptance`, `verify-checkout-cart`, `verify-notification-delivery`,
`verify-payment-attempts`, `verify-batch17-payments`, `verify-mono-initialization`,
`verify-batch14-payments`, `verify-batch14-payment-ui`, `verify-batch16-notifications`,
`verify-order-operations`, `verify-batch17-cod`, `verify-novaposhta-status`,
`verify-mono-response-diagnostics`, `verify-checkout-render`,
`verify-batch17-availability`, `verify-cart`.

Results: 16 isolated regression scripts PASS; monitor tests PASS; private PostgreSQL
rehearsal PASS; Prisma validation PASS; TypeScript PASS; lint PASS; isolated optimized
build PASS; whitespace check PASS. Expected simulated transport failures print
sanitized fixed diagnostics in some tests. Early harness iterations were corrected
for PostgreSQL constraint error mapping, the legacy response shape, and the new
503 health semantics. No unresolved automated failure is being waived.

The isolated build uses empty Prisma read fixtures, blocks connections/writes and
provider fetches, writes only ignored QA output, and restores generated Next type
references. Schema validation may announce loading `.env`; its database URL is
explicitly overridden and `validate` performs no database connection. No values
from environment files are printed or included in artifacts.

Before Production approval, close gates 3/4 with retained operational evidence,
verify UA/EN explicit retry/cart behavior on actual mobile devices, verify the
deployment's supported Node/Prisma/PostgreSQL combination, and rerun the affected
checks on the exact approved immutable release. This document does not certify
Production services or authorize execution of the sequence above.
