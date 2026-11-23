# Batch 1.8 — Final local evidence and Production read-only preflight

Prepared 2026-11-22 on feat/batch-1.8-color-size-variants. No Production connection,
backup, snapshot, branch creation, SQL write, commit, push, merge or deployment.

> Operator handoff: use the guarded collector and concise procedure in
> [batch-1.8-production-preflight-handoff.md](batch-1.8-production-preflight-handoff.md)
> to obtain a shareable sanitized JSON report. The manual psql commands below remain
> reference instructions. The collector was tested offline only; no Production
> connection was executed by the agent. The current combined inventory is 117 paths.

> Confirmed architecture: StikerSuite / production / neondb / public, with
> neondb_owner, is the ONE shared application database for Production and Preview.
> The collector's -SharedDatabase profile records this once. A separate audit role
> is not required for the guarded read-only collector; endpoint and active-deployment
> verification remain. Do not reopen a separate-application-database investigation.

## Disposition

Latest owner execution (2026-11-22): Production collector run
d7684441a5ac425ea66b678b3e601d5e succeeded with COLLECTED/exit 0. Its complete
sanitized report has now been reviewed: matching schema fingerprint, 6 products,
19 images, one option/two absolute-priced values, no Prisma ledger and six idle
sessions. TLS is resolved. The earlier unavailable-access/TLS paragraphs below
are retained as history, not current blockers. Backup remains unexecuted; follow
[the fresh backup and isolated restore handoff](batch-1.8-fresh-backup-handoff.md).
That workflow is PREPARED only and requires owner approval before either mode.

2026-11-22 TLS follow-up: the owner's first collector attempt reached no SQL
evidence and returned B18_PREFLIGHT_TLS_VERIFICATION_FAILED. The old sanitized
report contains no subtype, so its exact peer-certificate failure cannot be
recovered. Local inspection confirmed missing OpenSSL default CA file/directory,
despite populated Windows ROOT stores. The collector now uses a private temporary
public-only Windows ROOT bundle with verify-full, and emits fixed sanitized TLS
subtypes. Eleven offline groups and PowerShell syntax PASS. The final migration,
manifest and pinned read-only SQL are unchanged; the 12/12 rehearsal remains valid.
See the handoff's TLS correction for evidence, limitations and the exact retry
command. A successful owner-run Production TLS connection is still pending.

| Area | Result |
| --- | --- |
| Final restored-baseline rehearsal | PASS — actual sanitized report independently read, twelve gates PASS |
| Final artifact identity | PASS — six report hashes, manifest hashes and actual file hashes agree |
| Source-level legacy compatibility | PASS with the conditions below; existing local PostgreSQL/application evidence retained |
| Live Neon identity/schema/history/counts/permissions | COLLECTED — successful owner-run report reviewed; schema matches and all existing table ownership/runtime checks pass |
| Writer readiness | Still requires operator review — six idle sessions are point-in-time evidence, not proof all shared/old writers are drained |
| Fresh independent backup and verification | Procedure prepared; NOT EXECUTED and requires explicit owner approval |
| Release inventory | PASS — read-only preparation had 114 paths; operator handoff adds three, now 117; all prior paths preserved, index empty |
| Production migration/release | BLOCKED pending live evidence, approved fresh backup and explicit owner approval |

The implementation is ready for an operator-run READ-ONLY Production preflight.
This is not Production migration or release approval. No further complete local
migration rehearsal is needed while the verified artifacts remain unchanged.

## Verified local evidence

Source: C:\Users\alexa\AppData\Local\3dkid-batch18-rehearsal-results\7440421df00445fbb844b210f1c4d5de\result.json.
Run: 2026-11-22T12:52:46.6994833Z to 2026-11-22T12:52:55.0519484Z.
The JSON contains Overall=PASS, empty ErrorCode, null SqlFailure and
FiveProductsMatched=true. The owner reports process exit 0; the JSON itself has
no separate exit-code property. Its SHA-256 is
623fd7e0637622ff2f47ad0012087a5e6e0614efe1fd487b51bc7d10b5726fc2.

| Gate | Recorded result |
| --- | --- |
| ServerIdentity | PASS |
| Baseline | PASS |
| FreshClones | PASS |
| CandidateGuards | PASS |
| Migration | PASS |
| SchemaIntegrity | PASS |
| FiveProducts | PASS |
| LegacyHistory | PASS |
| NativeIntegrity | PASS |
| DeferredFailure | PASS |
| MigrationRollback | PASS |
| SourceUnchanged | PASS |

The target was the guarded local PostgreSQL 18.7 instance, 127.0.0.1:55432, source
restore_3dkid_batch18. Three unique new rehearsal-clone names were verified in the
report. No source/rehearsal database was accessed during this preflight preparation.
SourceUnchanged is executed owner evidence, not an inferred result from mocks.

Final identity binding, unchanged in this task:

```text
ca8393bd1add06f51412d6e3096faf63b6c22e8359f884cab6aa3d7af517bf72  docs/review/batch-1.8-production-candidate.sql
94917c516f6eac8c0562f97748c967784598077e08f9ff8620e7044a16834f84  docs/release/batch-1.8-production-migration.sql
bba3801a7af4aef9f989c10b351e4a0230d8119621b6b0a43b09022b64bb044c  docs/release/batch-1.8-production-verify.sql
```

All six entries, including the review schema, review SQL and earlier read-only
fingerprint artifact, match docs/review/batch-1.8-addendum-manifest.json and the
successful report. The local candidate and Production wrapper have the same exact
preserved DDL/trigger body; their target/approval wrappers intentionally differ.
The Production-specific approval wrapper was not executed against Neon or locally.

## Live access and baseline comparison

Tool discovery found no Neon database/administrative connector. The process has no
configured DATABASE_URL, DIRECT_URL or Neon target variables. No project .env,
credential file, key store or Vercel secret was opened to discover access. No live
connection was attempted. The missing prerequisites are:

1. Console-attested Neon Production project and branch, direct endpoint, database
   name and confirmation that the application's schema is public. A database name
   or identical schema alone cannot establish the correct Neon branch.
2. An already authorized audit connection with metadata/count access and sufficient
   activity visibility, plus the actual runtime and proposed migration role names.
3. Authentication through the operator's secure client prompt or an explicitly
   authorized connector. Do not send passwords, tokens or connection URLs to chat.
4. The rehearsed source's schema fingerprint, compared with current live metadata.
   The successful report did not export this fingerprint. Retrieve only that
   metadata using the existing guarded read-only file; no rehearsal repetition is
   required. Do not invent the hash or approve a mismatched live hash blindly.

Read-only local metadata command, for the operator's private fresh session only:

```powershell
$pgBin = 'C:\Program Files\PostgreSQL\18\bin'
Remove-Item Env:PGPASSWORD,Env:PGSERVICE,Env:PGSERVICEFILE,Env:PGHOSTADDR -ErrorAction SilentlyContinue
$env:PGSSLMODE = 'disable' # Only the fixed, explicitly guarded LOCAL endpoint below.
$env:PGPASSFILE = Join-Path $env:TEMP ('batch18-no-passfile-' + [guid]::NewGuid().ToString('N'))
$env:PGOPTIONS = '-c default_transaction_read_only=on -c statement_timeout=30s'
try {
  & "$pgBin\psql.exe" -X -W -h 127.0.0.1 -p 55432 -U postgres -d restore_3dkid_batch18 -v ON_ERROR_STOP=1 -v VERBOSITY=sqlstate -f '.\docs\release\batch-1.8-restored-fingerprint-readonly.sql'
  if ($LASTEXITCODE -ne 0) { throw 'Local baseline fingerprint unavailable; stop comparison.' }
} finally { $env:PGSSLMODE = 'verify-full' }
```

### Exact Production read-only operator command

Run only in a new private PowerShell -NoProfile session in the repository root,
with no transcript. Fill the nonsecret names from the correct Production console.
This block makes no backup, DDL, DML, grants, branch or snapshot changes:

```powershell
$pgBin = 'C:\Program Files\PostgreSQL\18\bin'
$approvedDirectHost = '<console-verified-direct-host>'
$productionDb = '<approved-database-name>'
$auditRole = '<existing-authorized-audit-role>'
$migrationRole = '<proposed-migration-role>'
$appRole = '<actual-application-role>'
if ($approvedDirectHost -notmatch '^ep-[a-z0-9-]+[.][a-z0-9.-]+[.]neon[.]tech$' -or $approvedDirectHost -like '*-pooler.*') { throw 'Verify the direct Production endpoint.' }
foreach ($name in @($productionDb,$auditRole,$migrationRole,$appRole)) {
  if ($name -notmatch '^[A-Za-z_][A-Za-z0-9_-]{0,62}$') { throw 'Review the nonsecret target/role names first.' }
}
Remove-Item Env:PGPASSWORD,Env:PGSERVICE,Env:PGSERVICEFILE,Env:PGHOSTADDR -ErrorAction SilentlyContinue
$env:PGSSLMODE = 'verify-full'
$env:PGSSLROOTCERT = 'system'
$env:PGPASSFILE = Join-Path $env:TEMP ('batch18-no-passfile-' + [guid]::NewGuid().ToString('N'))
$env:PGCONNECT_TIMEOUT = '10'
$env:PGAPPNAME = '3dkid_batch18_readonly_preflight'
$env:PGOPTIONS = '-c default_transaction_read_only=on -c statement_timeout=30s -c lock_timeout=5s'
& "$pgBin\psql.exe" -X -W -h $approvedDirectHost -p 5432 -U $auditRole -d $productionDb -v ON_ERROR_STOP=1 -v VERBOSITY=sqlstate -v "expected_database=$productionDb" -v "connection_role=$auditRole" -v "application_role=$appRole" -v "migration_role=$migrationRole" -f '.\docs\release\batch-1.8-production-preflight.sql'
if ($LASTEXITCODE -ne 0) { throw 'Read-only preflight failed; stop and review sanitized results.' }
```

Enter credentials only at the local -W prompt and close this private session after
the read-only work. Use an approved CA file if the client cannot load trusted system
roots; do not weaken hostname/certificate verification. See
[PostgreSQL 18 connection verification](https://www.postgresql.org/docs/18/libpq-connect.html).

The prepared SQL runs in a read-only repeatable-read transaction. It emits identity,
public schema definitions as hashes, validated FK/index/trigger state, role privilege
booleans, extension metadata, aggregate counts, migration-ledger status and bounded
activity summaries. It omits customer rows, SQL/parameters and connection secrets.

Review event-trigger/FDW/subscription dependencies and activity visibility too. The
following supplemental queries are review-only instructions, not executed evidence;
use the same approved read-only connection or correctly selected console branch:

```sql
BEGIN READ ONLY;
SELECT count(*) AS enabled_event_triggers FROM pg_catalog.pg_event_trigger WHERE evtenabled<>'D';
SELECT count(*) AS foreign_servers FROM pg_catalog.pg_foreign_server;
SELECT count(*) AS database_subscriptions FROM pg_catalog.pg_subscription
WHERE subdbid=(SELECT oid FROM pg_catalog.pg_database WHERE datname=current_database());
SELECT pg_has_role(current_user,'pg_read_all_stats','USAGE') AS full_stats_role,
       (SELECT rolsuper FROM pg_catalog.pg_roles WHERE rolname=current_user) AS is_superuser;
COMMIT;
```

Missing permissions/hidden activity are unresolved evidence, not zero writers.
Nonzero external/dependency objects require review, not automatic removal or grants.
Inventory Vercel Production/Preview deployments, jobs, admin sessions, callbacks,
payment recovery and direct database tools separately; cold writers need not appear
in pg_stat_activity. No settings or integrations are changed in this preparation.

### Products added after backup

The verified LOCAL source contained 5 products, 5 categories, 5 images and 0 orders.
Current Production counts are UNKNOWN and may be higher in every table. This is
not itself schema drift or a reason to remove new records. The Production migration
does not require five products: it captures all fourteen original table counts
under maintenance locks and compares those same current counts before COMMIT.
Every existing Product receives LEGACY/zero-revision defaults and NULL Materials;
existing prices, descriptions, URLs, options, orders and snapshots are not backfilled.

Compare the live schema hash/object inventory to the rehearsed baseline using the
same read-only expression/search_path. Expected unexpanded structure is 14 public
tables, 31 indexes and 11 FKs, with no Batch 1.8 partial objects. Table counts alone
are insufficient. Review live options, legacy absolute prices/modifier-only values,
RLS, extensions, functions, FK definitions and migration history. If a Prisma ledger
exists, reconcile history explicitly; the migration refuses to fabricate one.
The prepared execution wrapper requires PostgreSQL 18 and effective ownership;
different live versions/roles/schema need review before any write approval.

## Existing deployed application and additive schema

The source for Production Git HEAD 76621cf01ebe482bfee9a80aaed4a4b5b9dfed22 was
reviewed. Local and remote Production/main refs were read independently and match
that Production SHA / main 3bf9ce0955040535db1e42ea161d0d27a80fb160. Actual Vercel
deployment SHA, runtime configuration and all writers remain unverified.

| Path | Compatibility assessment |
| --- | --- |
| Existing simple/size products | Named old columns and option IDs remain; LEGACY default preserves current size-price interpretation and does not convert modifiers |
| Old Admin create/edit | Added columns have nullable/backward-compatible defaults; untyped legacy options remain valid; no implicit conversion |
| Existing orders/Mono attempts | Nullable new variant FK, unchanged legacy/v1/flat snapshots and legacy checkout identity; existing payment retries are preserved |
| Category deletion | Intentional stronger behavior: parents with children now fail via RESTRICT instead of detaching descendants; an old Admin UI may show a generic rejection, without data loss |
| Product deletion/archive | Existing historical-order FK protection and explicit archive fallback retained; no cascade into financial history |
| New application before migration | INCOMPATIBLE: new Prisma reads require expanded columns/tables even when native writes are disabled; schema must precede every new-client deployment |
| Native data and old writers | Do not activate native modes until mode-aware bridge deployment and old-writer verification; old clients/jobs cannot be presumed native-safe |

Existing local execution includes actual legacy writes, snapshots, native and size
pricing, Mono retry, two-session lock coordination and whole-product/history tests.
That evidence does not establish current live values, privileges, load or external
integration behavior. New carts use versioned storage; retain all namespaces on
rollback. After native carts/orders exist, use a mode-aware bridge, not an old UI
that cannot understand them. Native writes and Blob cleanup remain default-off in
code; no effective Production environment setting is asserted or changed.

## Fresh independent backup and recovery — approval required

No archive, database branch or snapshot was created, replaced, restored or deleted.
Obtain explicit approval for NEW backup creation and its isolated verification
restore before running the backup section in batch-1.8-production-rollout.md.
Preserve the previous archive and Neon Snapshot; do not restore either over the
current catalog. Keep backups and private operational evidence outside Git,
OneDrive and public artifacts, in a restricted operator-owned directory.

1. Confirm the approved direct target and a reviewed writer/maintenance window.
   Use a unique filename, refuse overwrite, record UTC dump START and completion
   times and require pg_dump exit 0. Keep the full custom-format archive, including
   ACL/ownership metadata; do not use a schema-only or selected-table export.
2. Require nonzero size, SHA-256 and successful pg_restore --list without exposing
   TOC/records in shared logs. Readability alone is not a complete restore test.
3. With separate explicit restore approval, restore into a NEW empty database in
   an isolated disposable LOCAL environment. Verify host/port/data directory first;
   never target Production, restore_3dkid_batch18 or an existing rehearsal database.
   Do not use --clean or --create. The archive and prior backups remain intact.
4. Use pg_restore --exit-on-error --single-transaction --no-owner --no-privileges
   for the isolated structural/data rehearsal, retaining original ACL metadata in
   the archive for a separate role audit. Do not combine parallel restore with this
   transaction mode. Record only exit status, schema-object and aggregate counts,
   validated FKs/indexes and known safe error identifiers; suppress raw record-bearing
   diagnostics and disable transcripts. No Vercel bindings, payments, notifications,
   credentials or outbound integrations may attach to this verification environment.
5. Compare restored totals against the backup snapshot/evidence, not the old five-
   product fixture or an independently changing live count. Freeze writers for a
   comparable cutover snapshot, or use a separately reviewed snapshot-coordination
   method; independently timed preflight and dump counts can differ legitimately.
6. Require a successful restore/role review, retain the backup hash and recovery
   point privately, and obtain migration approval. The prepared DDL requires the
   reviewed dump START within two hours; refresh with approval if the window expires.

The full dump is a consistent database snapshot; it does not stop later writes.
This procedure follows [pg_dump 18](https://www.postgresql.org/docs/18/app-pgdump.html)
and [pg_restore 18](https://www.postgresql.org/docs/18/app-pgrestore.html). It is a
prepared recovery artifact, not authorization to restore over newer business data.
Before COMMIT, DDL failure rolls back atomically. After COMMIT, retain the expanded
schema on application rollback. After native products/orders exist, retain a
mode-aware bridge and immutable snapshots. Never overwrite newer orders/payments
with an old backup; lost-COMMIT or recovery incidents require read-only diagnosis
and an approved recovery/reconciliation plan.

## Exact owner sequence and current stop

1. Review this final local result and six unchanged artifact hashes. Do not repeat
   completed migration development or rehearsal without a material SQL change.
2. Privately attest the Production target/roles and collect the local baseline
   fingerprint. Run the exact read-only preflight above. Return sanitized metadata,
   current product/category/image/order counts and schema/history/permission/writer
   findings; never credentials, connection URLs or customer records.
3. Review schema drift, role capabilities, RLS/external dependencies and writers.
   Confirm Vercel's actual deployed SHA, Node >=20, build/install commands and
   database/role mapping for all relevant Production/Preview deployments. Separate
   Preview database isolation is not a required gate; consumer inventory still is.
4. Approve fresh independent backup creation and isolated verification, then execute
   and review the evidence. No backup or restore is approved by this document.
5. Obtain explicit owner approval of exact Production SQL/hash, current fingerprint,
   direct target, roles, fresh backup hash/time, maintenance window, complete source
   inventory and the Git/Vercel release plan. Approval values remain unbound.
6. Only then coordinate writers and run the exact atomic Production migration and
   read-only postflight using batch-1.8-production-rollout.md. Resolve approved
   runtime grants; do not loosen any failed target, history or constraint guard.
7. After verified schema expansion, stage only approved paths, verify the cached
   diff, create the approved feature commit, push without force and fast-forward
   Production only through the explicitly approved workflow. Never modify main.
   A feature push may trigger Preview; every new-client target needs schema first.
8. Verify Vercel Production reaches Ready/Success for the exact released SHA and
   canonical domain. A pending/failed deployment is not release success. Preserve
   the schema and forward-fix or use a compatible bridge if application rollback
   is needed; do not drop the new schema.
9. Record non-destructive UA/EN catalog/legacy sizes/gallery/Materials/divider,
   favicon, responsive card/hover/reduced-motion, Admin form and cart-reconciliation
   checks. Review existing order/payment status without creating real orders,
   invoices, notifications or destructive catalog changes. Any live editing or
   integration test needs its own authorization/test-data plan.
10. Verify old writers are drained, then seek separate native-mode adoption approval
    if required. Keep Blob cleanup disabled and scope approvals untouched. Preserve
    all Pending Manual QA entries until actual evidence; physical devices, real
    network/cache behavior and live integrations are not covered by local tests.

**Stop now:** live preflight access/evidence, fresh approved backup and Production
write/Git/deployment approval are outstanding. The local twelve-gate blocker is
resolved. No live access or approval was inferred from that local success.

## Release inventory and verification

Preservation verified: all 113 prior paths remain; only the four existing report documents listed below changed. All application, test, Prisma, SQL/manifest and favicon bytes match the starting snapshot. One new report brings the combined count to 114.

Current task changes:

```text
docs/batch-1.8-addendum-ui-safety.md
docs/batch-1.8-migration-rehearsal.md
docs/batch-1.8-production-readonly-preflight.md
docs/batch-1.8-production-rollout.md
docs/batch-1.8-release-readiness.md
```

The complete combined inventory is below. Required source,
tests, manual migration/review artifacts, all three favicon assets and supporting
docs are present. There is intentionally no new Prisma migrations directory: the
repository's manual SQL workflow must be reconciled with the live ledger before
execution. No dependency, application, Prisma or SQL file changed in this task.
Reviewed text archives under docs/review/archive are required test fixtures and
belong in the approved release; they are not private database backup archives.
Exclude credentials, actual .env files, .next/node_modules/caches, private dumps,
raw local result reports and target/approval records. The existing .env.example
is an unchanged non-secret template. The index is empty; no commit or push exists.

Focused verification performed in this task:

| Check | Result |
| --- | --- |
| Authorized sanitized result and current files | PASS — twelve gates, six actual hashes, unique clone names, source-protection evidence |
| Offline Production package | PASS — seven groups; syntax correction/archive integrity and all artifact guards preserved |
| PowerShell instructions | PASS — two new-report and four rollout command blocks parsed without execution |
| Preservation | PASS — all 113 prior paths remain; 109 byte-identical; only four existing report docs and this new report changed |
| Complete file/security-artifact audit | PASS — 373 tracked/changed paths reviewed; no missing files, credential literals needing removal, dumps or unexpected generated artifacts |
| Git diff/index/refs | PASS — whitespace check; index empty; feature HEAD and local/remote Production/main at their recorded SHAs |
| Application/browser/build suites | Existing PASS evidence reused; source/Prisma/SQL/test/assets are byte-identical, so no unrelated suite rerun |
| Live Neon/Vercel, backup creation/restore, physical devices | NOT EXECUTED; access, approvals or manual evidence still required |

<!-- FINAL_RELEASE_INVENTORY -->

```text
docs/batch-1.8-addendum-ui-safety.md
docs/batch-1.8-favicon.md
docs/batch-1.8-implementation.md
docs/batch-1.8-manual-qa.md
docs/batch-1.8-migration-rehearsal.md
docs/batch-1.8-production-preflight-handoff.md
docs/batch-1.8-production-readonly-preflight.md
docs/batch-1.8-production-rollout.md
docs/batch-1.8-release-readiness.md
docs/batch-1.8-variant-architecture.md
docs/release/batch-1.8-production-migration.sql
docs/release/batch-1.8-production-preflight.sql
docs/release/batch-1.8-production-verify.sql
docs/release/batch-1.8-restored-fingerprint-readonly.sql
docs/review/archive/batch18-before-addendum/README.md
docs/review/archive/batch18-before-addendum/batch-1.8-implementation.md
docs/review/archive/batch18-before-addendum/batch-1.8-migration-rehearsal.md
docs/review/archive/batch18-before-addendum/batch-1.8-production-candidate.sql
docs/review/archive/batch18-before-addendum/batch-1.8-production-migration.sql
docs/review/archive/batch18-before-addendum/batch-1.8-production-rollout.md
docs/review/archive/batch18-before-addendum/batch-1.8-production-verify.sql
docs/review/archive/batch18-before-addendum/batch-1.8-variants.prisma
docs/review/archive/batch18-before-addendum/batch-1.8-variants.prisma.diff
docs/review/archive/batch18-before-addendum/batch-1.8-variants.sql
docs/review/archive/batch18-before-syntax-fix/README.md
docs/review/archive/batch18-before-syntax-fix/batch-1.8-addendum-manifest.json
docs/review/archive/batch18-before-syntax-fix/batch-1.8-production-candidate.sql
docs/review/archive/batch18-before-syntax-fix/batch-1.8-production-migration.sql
docs/review/archive/batch18-before-syntax-fix/batch-1.8-production-verify.sql
docs/review/batch-1.8-addendum-manifest.json
docs/review/batch-1.8-neon-preflight-readonly.sql
docs/review/batch-1.8-production-candidate.sql
docs/review/batch-1.8-variants.prisma
docs/review/batch-1.8-variants.prisma.diff
docs/review/batch-1.8-variants.sql
prisma/schema.prisma
scripts/fixtures/addendum-browser.tsx
scripts/fixtures/batch18-variant-reference.ts
scripts/fixtures/gallery-admin-browser.tsx
scripts/fixtures/gallery-admin-environment.tsx
scripts/fixtures/variants-browser.tsx
scripts/generate-favicons.mjs
scripts/operator/batch18-production-preflight.ps1
scripts/operator/batch18-rehearse.ps1
scripts/rehearse-batch18-variants.mjs
scripts/source-module.ts
scripts/verify-batch18-addendum-postgres.ts
scripts/verify-batch18-addendum.tsx
scripts/verify-batch18-application-postgres.ts
scripts/verify-batch18-architecture.ts
scripts/verify-batch18-implementation.ts
scripts/verify-batch18-migration-artifacts.mjs
scripts/verify-batch18-operator.ps1
scripts/verify-batch18-postgres.ts
scripts/verify-batch18-production-preflight.ps1
scripts/verify-batch18-production-preparation.mjs
scripts/verify-batch18-sql-syntax.mjs
scripts/verify-build-isolated.mjs
scripts/verify-cart-drawer.ts
scripts/verify-favicon.mjs
scripts/verify-media-lifecycle.ts
scripts/verify-product-cart-ux.tsx
src/app/(shop)/cart/page.tsx
src/app/(shop)/catalog/page.tsx
src/app/(shop)/page.tsx
src/app/(shop)/product/[slug]/page.tsx
src/app/admin/categories/page.tsx
src/app/admin/products/[id]/edit/page.tsx
src/app/admin/products/new/page.tsx
src/app/admin/products/page.tsx
src/app/apple-icon.png
src/app/favicon.ico
src/app/icon.png
src/components/admin/admin-form.tsx
src/components/admin/confirm-button.tsx
src/components/admin/delete-button.tsx
src/components/admin/gallery-editor.tsx
src/components/admin/materials-fields.tsx
src/components/admin/product-form.tsx
src/components/admin/size-editor.tsx
src/components/admin/variant-editor.tsx
src/components/cart/cart-drawer.tsx
src/components/cart/cart-readiness.tsx
src/components/catalog/product-grid.tsx
src/components/checkout/checkout-page.tsx
src/components/home/featured-products.tsx
src/components/product/materials-divider.tsx
src/components/product/native-product-options.tsx
src/components/product/product-card.tsx
src/components/product/product-materials.tsx
src/components/product/product-options.tsx
src/components/product/related-products.tsx
src/components/product/use-mobile-card-animation.ts
src/lib/actions/categories.ts
src/lib/actions/create-order.ts
src/lib/actions/products.ts
src/lib/actions/reconcile-cart.ts
src/lib/admin-form-validation.ts
src/lib/admin-variant-history.ts
src/lib/cart-items.ts
src/lib/cart-persistence.ts
src/lib/cart-reconciliation.ts
src/lib/catalog-products.ts
src/lib/i18n.ts
src/lib/media-lifecycle.ts
src/lib/mobile-card-animation.ts
src/lib/payments/checkout-identity.ts
src/lib/payments/checkout-session.ts
src/lib/product-configuration-admin.ts
src/lib/product-configuration.ts
src/lib/product-materials.ts
src/lib/product-query.ts
src/lib/product-variants.ts
src/lib/variant-rollout.ts
src/lib/variant-transaction.ts
src/store/cart-store.ts
src/types/index.ts
```
