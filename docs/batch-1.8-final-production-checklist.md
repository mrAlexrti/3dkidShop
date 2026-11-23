# Batch 1.8 — Fresh six-product rehearsal and final release checkpoints

Current result: **LOCAL READINESS PASS; NO-GO for live execution until owner approval
and the operational checks below.** The fresh six-product rehearsal is complete:
12/12 PASS. No repeat rehearsal is needed for the unchanged SQL.
This final review made no Neon connection, Production write, new backup, commit,
push, merge or deployment. SQL/manifest hashes and implementation are unchanged.

## Evidence independently verified

- Backup: BACKUP_CREATED; restore: RESTORE_VERIFIED. All fourteen table counts and
  aggregate complete-row digests match; archive SHA-256 recomputed successfully.
- Archive: ce4aca760e8c4a0ea479341b68ff793e3b472a99b175b2cdc3673cc22566984b.
- Backup start: 2026-11-22T20:57:55.5071909Z; completion: 20:58:48.4333684Z.
- The unchanged two-hour migration gate expires at 2026-11-22T22:57:55.5071909Z.
  This is 00:57:55.5071909 Europe/Kyiv on November 23. Validity must be checked at
  actual execution; neither the restore nor rehearsal restarts this two-hour clock.
- Verified restore: batch18_backup_verify_bded0676ab034ceeb0fc874a2b409005.
- Restore report SHA-256: 09e255d31eec1f4060109d0a9059162cdf4062d295f6ccfbd293f52ade91a3cb.
- Fingerprint: c7068acb15096ec556a1d5e1e80ec559; 6 products, 5 categories,
  19 images, 1 option / 2 option values, 9 reviews, 28 SiteContent rows, 1 User,
  zero orders and zero orphaned relationships/invalid objects.
- Fresh rehearsal: c2dcde0cd13042de9c100a40f78842b3, 2026-11-22T21:53:19.5262655Z
  to 21:53:36.2627836Z, Overall PASS, owner-confirmed exit 0, no ErrorCode/SqlFailure.
  Report SHA-256: 2e98c42aa11622b3511dcc8f6780446c74ecb645db49ba41f5ec1780907bf9f6.
  ProductsMatched=true, ExpectedProducts=6, correct source/archive binding, all six
  recorded hashes agree with the current approved artifacts and manifest.

The prior twelve-gate PASS is valid evidence for the older five-product reference.
The fresh result supersedes the prior local authentication blocker and adds actual
execution against the current six-product reference. SourceUnchanged PASS verifies
that fresh reference's before/after schema and complete original data. Neither
reference was a migration target; the older five-product reference was not used.

## GO / NO-GO decision and exact order

**GO: technical/local release readiness. NO-GO: live execution until explicit owner
approval, confirmed maintenance/writer conditions, unexpired verified backup and
media/disabled-feature attestations.** Git staging/release and DDL need their
respective approvals. This document is a prepared runbook, not authorization.

1. Confirm the owner-approved maintenance window and media hold; keep native
   writes/cleanup off in BOTH environments. Accept queued-write risk or obtain a
   separately approved traffic-control plan. Recheck current Git baselines.
2. If necessary, execute the guarded backup renewal + isolated Restore commands
   below with separate approval. Verify the resulting reports/SHA and bind the
   latest backup START time. Do not rerun the completed migration rehearsal.
3. Execute the explicitly approved DDL/postflight command block below. It checks
   backup age, target/hash, current locks/transactions, post-schema and permissions.
   STOP before Git deployment if migration/commit outcome or postflight is uncertain.
4. Execute the exact-inventory Git block only after separate Git approval. Review
   all staged changes, create ONE release commit and push the feature AFTER schema
   success. Inspect any auto-Preview for this SHA without database test writes.
5. Obtain Production release approval for that exact SHA, then fast-forward/push
   Production using the guarded continuation. Verify remote Production/main and
   clean working tree; require Vercel Production Ready for that exact SHA/domain.
6. Perform safe manual QA and record evidence; then explicitly end maintenance.
   Leave all 17 deferred scenarios pending until actually tested. Do not activate
   native modes, convert products or enable cleanup as part of this release.

## Completed fresh local rehearsal

The owner ran the existing runner with -FreshProductionRestore. Do not rerun this
completed rehearsal unless the approved SQL materially changes or new evidence
requires it. The earlier operator command/authentication blocker is closed.

Before cloning, the fresh mode pins the exact successful restore report and binds
its archive SHA/fingerprint, all fourteen counts and all fourteen data digests to
the current local source. It creates three unique batch18_rehearsal_<guid> clones
using CREATE DATABASE WITH TEMPLATE from that source; only current-process-owned
clones may be written. If a source connection blocks cloning, stop and close only
the operator's own sessions manually; do not terminate backends or change the source.

The EXACT pinned local candidate is executed, preserving its localhost/name/role/
fingerprint guards. Its preserved DDL/trigger body is byte-identical to the final
Production migration. The Production-specific approval wrapper intentionally
refuses local databases and is not executed on the clones.

```text
ca8393bd1add06f51412d6e3096faf63b6c22e8359f884cab6aa3d7af517bf72  local candidate
94917c516f6eac8c0562f97748c967784598077e08f9ff8620e7044a16834f84  Production wrapper
bba3801a7af4aef9f989c10b351e4a0230d8119621b6b0a43b09022b64bb044c  Production verification
```

| Gate | Actual fresh-source result |
| --- | --- |
| ServerIdentity | PASS |
| Baseline | PASS |
| FreshClones | PASS |
| CandidateGuards | PASS |
| Migration | PASS |
| SchemaIntegrity | PASS |
| SixProducts | PASS |
| LegacyHistory | PASS |
| NativeIntegrity | PASS |
| DeferredFailure | PASS |
| MigrationRollback | PASS |
| SourceUnchanged | PASS |

The report is at %LOCALAPPDATA%\3dkid-batch18-rehearsal-results\c2dcde0cd13042de9c100a40f78842b3\result.json.
The three owned clones are batch18_rehearsal_c27d96d5832c4baf84e856467eedc3c3,
batch18_rehearsal_435e1a37c4ef4f6fb590fa8e5bf6a773 and
batch18_rehearsal_092eb44d069e4adfb26e49dd3fad572e. Retain them and the reports.

SchemaIntegrity validates nullable Materials fields, enums, precise price types,
indexes, FK actions, Category parent RESTRICT, deferred constraints and exact guard
function bodies/context/trigger enablement. Existing legacy/native/history/deferred
failure and injected transaction rollback tests run on disposable clones only.
Counts and all-table digests cover unchanged original data, including real size
prices. Newly added variant/materials/selection columns are excluded ONLY from
the legacy row projection; their definitions/defaults are checked separately.
Real orders remain zero in this reference; historical-order tests use synthetic
fixtures, not claims of Production orders or payments.

## Ownership and ACL interpretation

OwnerAclRestoreTested=false is an explicit limitation: local pg_restore used
--no-owner --no-privileges. Local postgres owns the restored objects, so a local
migration PASS cannot prove Neon role membership, ownership or future runtime grants.
The already collected Production preflight established effective neondb_owner
ownership/runtime permissions on the fourteen original tables and schema/language
privileges at that time. It did not test permissions on nonexistent new tables.

Before live DDL, confirm those privileges still apply; the Production wrapper
checks effective ownership, public CREATE/USAGE and plpgsql USAGE and aborts if
they are missing. After COMMIT and BEFORE deployment, run the pinned read-only
postflight for neondb_owner: individual SELECT/INSERT/UPDATE/DELETE on both new
tables, validator EXECUTE, exact enabled guards, types/FKs/defaults, expected
object counts and no unintended conversion. Also check schema USAGE, USAGE on
both new enum types, and EXECUTE on all five guard functions using the queries in
[the backup handoff](batch-1.8-fresh-backup-handoff.md#migration-tracking-and-postmigration-permissions).
No new sequences are expected. Missing permissions block deployment; no automatic
GRANT, role creation, ownership change or Prisma ledger write is authorized.

## Git and complete inventory review

Remote refs were fetched and independently checked with ls-remote. Feature HEAD,
local Production and remote Production are ALL
76621cf01ebe482bfee9a80aaed4a4b5b9dfed22. Local/remote main are
3bf9ce0955040535db1e42ea161d0d27a80fb160. The feature is ahead 0 / behind 0,
with all implementation still UNCOMMITTED; there is no remote Batch 1.8 feature
branch yet. A fast-forward is possible AFTER the one reviewed feature commit
(then expected ahead 1 / behind 0), provided Production does not advance. There is
no approved Batch 1.8 release SHA yet; create/approve it only in the authorized Git step.
Merging the current uncommitted feature HEAD alone would release no Batch 1.8 code.

All 121 changed paths were reviewed, including expanded untracked directories:
43 modified tracked + 78 untracked, zero staged. Grouping: 55 application/assets,
1 Prisma schema, 28 tests/operator tools, 37 documentation/review/release artifacts.
No expected path is missing and no unrelated path was identified. The full exact
inventory appears below. Archive review artifacts are intentional historical
evidence, not alternate migration entry points.

Variants, native Admin/storefront selection, catalog sorting, cart migration,
server pricing, legacy Mono identity/retry compatibility, immutable snapshots,
Materials/divider, mobile GIF, confirmations/category RESTRICT and official
favicon assets are present. Checkout/payment identity files are expected variant
integration changes; payment reconciliation, provider APIs, COD accounting and
Nova Poshta/Cloudflare scheduling are not being refactored. Media-lifecycle changes
only extend reference protection to Materials text.

No dependency/lockfile, actual migration-history directory, Vercel/Next host
configuration or scheduler configuration changes were introduced. No database
archive, tracked environment secret, private key, Blob token or other credential
literal was identified by the complete path/content scan and source review.
Known synthetic test credentials/placeholders are fixtures, not live secrets.
Existing .env.example is unchanged. Builds/regressions retain prior evidence;
this review does not rerun a migration or claim physical-device/live QA.

Focused final checks PASS: seven existing migration-preparation/artifact groups,
official favicon asset integrity, syntax of all three prepared PowerShell blocks,
exact 121-path inventory, content/private-artifact scan and git diff --check.
Index remains empty. Git reports pre-existing LF/CRLF working-copy warnings; no
files were renormalized. The future staging block verifies approved SHA-256 values
against STAGED blobs as well, so Git filters cannot silently change pinned artifacts.
All seventeen deferred manual QA entries remain Pending Manual QA.

## Minimal shared-database maintenance procedure

There is no application-wide read-only switch in this release. Do not invent one,
change secrets/configuration, disable constraints or terminate sessions. Use this
short coordinated window and the existing atomic SQL locks:

1. Name one operator and record a UTC window/approval reference. Tell every Admin
   and Preview tester to stop ALL saves, uploads, deletes/archives, size/variant
   edits and direct DB tools. Close their transaction/query tabs; leave both
   verified local reference databases untouched. Freeze unrelated DDL/tools too.
2. In existing scheduler consoles/Actions, inspect in-flight/queued work read-only.
   The repository's Nova Poshta workflow runs approximately at */30 minutes (GitHub
   scheduling can be delayed); payments/notification recovery also has an existing
   cron endpoint. Confirm the external scheduler's actual next run and wait for
   in-flight recovery/shipping/notification jobs to finish. Their external cadence
   is not independently verified here. Do not invoke them manually or change their
   schedules. If a quiet interval cannot be established, STOP and obtain an
   explicit maintenance plan rather than assuming cron is idle.
3. Check active transactions/lock waiters immediately before the approved DDL,
   using existing read-only session metadata (no query text, parameters or client
   addresses). Close only the operator's own idle-in-transaction sessions. Never
   call pg_terminate_backend as an automatic drain. Do not repeat the full completed
   preflight; these are time-sensitive writer/lock observations for the window.
4. Keep normal provider callbacks available; do not drop or manually replay payment
   traffic. The migration takes SHARE ROW EXCLUSIVE on all fourteen application
   tables in a fixed order, rechecks schema/counts under lock, and commits atomically.
   Those locks are the actual database write barrier. Ordinary DML may queue and
   some requests can time out; read-only catalog browsing may continue. lock_timeout
   stays 5 seconds and statement_timeout 30 seconds PER STATEMENT (not a guaranteed
   total outage bound). Any busy writer/timeout/deadlock aborts: STOP, inspect state,
   do not extend limits or blindly retry. Zero customer request failures cannot be
   promised without a separately approved traffic-control plan.
5. Immediately run postflight/permissions while Admin and Preview writes remain
   paused. Do not let product edits advance variantRevision before the cutover
   revision=0 check. After successful postflight, old legacy application writes can
   operate against the additive schema; keep catalog edits paused through the
   approved deployment and quick QA. Native products must still not be created.
6. Push/deploy only after schema success. Preview uses the SAME migrated database;
   do not test-save real records there. Confirm Vercel Ready and exact SHA, perform
   safe QA, then explicitly end the window and resume ordinary legacy Admin work.
   Old writers need a separate drain/compatibility decision before native activation.

Operator attestations still required: no unreviewed DDL/hidden writer, accepted
queued-write risk or approved traffic control, valid backup, and both Production
and Preview variant-native/cleanup flags remain off. Code defaults are verified
off; external environment values were NOT independently inspected. Do not change
those values or cleanup scope as part of these instructions. Preserve all Blob
and Cloudinary object URLs/bytes; hold manual asset deletions too. Database restore
alone is not media recovery. An independent media-copy gap must be explicitly
accepted or separately addressed before release; no Blob operation is performed here.

## Production checkpoints — separate authorization required

1. Fresh-source twelve-gate result is independently verified PASS; do not repeat it.
2. Review ALL writers to the ONE shared Production/Preview database: active and
   old deployment URLs, Admin users, auth/checkout, Mono callbacks/recovery,
   notification workers, Nova Poshta scheduled consumers and direct tools. Arrange
   an explicitly approved maintenance/drain window. Idle sessions from an earlier
   preflight do not prove writers are drained. Separate databases are not required.
3. Verify this fresh archive checksum/report and independent protected storage.
   The unchanged migration requires the backup START time to be within two hours.
   If expired, STOP for separately approved backup renewal; do not change its
   timestamp or widen the SQL guard. Do not create another backup automatically.
4. Preserve all current Blob/Cloudinary media. The database archive contains URLs,
   not file bytes. Keep cleanup disabled, do not delete assets, and explicitly
   accept or address the separate media-copy/recovery gap before release.
5. Obtain owner approval bound to SQL hash, endpoint, role, fingerprint, backup
   SHA/time and maintenance plan. Apply additive schema FIRST. New Prisma reads
   need the schema even with native writes disabled; feature push may create a
   Preview against this same database, so schema must precede that push too.
6. Verify schema/permissions/data preservation, then separately approve Git release
   and Vercel deployment. Keep native writes and Blob cleanup off. Confirm exact
   Vercel commit Ready, then perform manual Production QA without real payments.
7. Before separately approved native activation, verify old writers are drained
   and review the privileged runtime role's ability to bypass guards. Deploying
   code is not authorization to convert products or activate native writes.

## Owner-controlled migration commands — NOT authorized to run yet

### If the backup expires: existing guarded renewal only

The current backup START time remains 2026-11-22T20:57:55.5071909Z; its gate ends
at 22:57:55.5071909Z UTC (November 23, 00:57:55 Kyiv). If execution is later, STOP
and obtain approval for renewal and its isolated restore. Do not change timestamps,
reuse partial files, widen the SQL window, restore over Production or create a
Neon Snapshot/branch. In the repository's private PowerShell console:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\operator\batch18-backup-restore.ps1 -Mode Backup
if($LASTEXITCODE -ne 0){throw 'STOP: renewed backup failed'}
$backupRun=Read-Host 'New successful backup RUN DIRECTORY only'
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\operator\batch18-backup-restore.ps1 -Mode Restore -RunDirectory $backupRun
if($LASTEXITCODE -ne 0){throw 'STOP: renewed isolated restore failed'}
```

Use the existing confirmation phrases BACKUP CURRENT NEON neondb and RESTORE NEW
LOCAL ONLY, entering Neon and LOCAL passwords only at their separate secure prompts.
Require BACKUP_CREATED/RESTORE_VERIFIED, exit 0, matching archive SHA, schema, all
fourteen counts/digests, no orphans/invalid objects. Preserve the prior archive,
references, clones and reports. Bind the NEW backup directory, NEW restore report,
NEW SHA and START time to approval/migration variables below; do not reuse the old
ones. If schema or compatibility evidence changes, STOP for review. Unchanged SQL
and compatible data growth do not require repeating the completed migration rehearsal.

### Explicitly approved DDL and postflight

Only AFTER all checkpoints and explicit DDL approval, open a NEW private PowerShell
session in this repository. The following reuses the pinned existing public-CA
helpers; no password/URL is read from environment files. It does not use the backup
client factory for DDL (that factory correctly forbids remote writes).

```powershell
$repo = (Get-Location).Path
$helper = Join-Path $repo 'scripts\operator\batch18-backup-restore.ps1'
$tokens=$null; $errors=$null
$ast=[Management.Automation.Language.Parser]::ParseFile($helper,[ref]$tokens,[ref]$errors)
if($errors.Count){throw 'STOP: operator syntax invalid'}
foreach($definition in $ast.FindAll({param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst]},$true)){
    . ([scriptblock]::Create($definition.Extent.Text))
}
Import-BackupSafetyHelpers $repo
$backupRun=Assert-BackupDirectory (Read-Host 'Owner-approved successful backup RUN DIRECTORY (current or renewed)')
$backup=Get-Content -LiteralPath (Join-Path $backupRun 'backup-result.json') -Raw|ConvertFrom-Json
$restoreReportPath=[IO.Path]::GetFullPath((Read-Host 'Corresponding successful sanitized restore-result.json path'))
$restoreDirectory=[IO.Path]::GetDirectoryName($restoreReportPath)
if([IO.Path]::GetFileName($restoreReportPath) -cne 'restore-result.json' -or [IO.Path]::GetFileName($restoreDirectory) -cnotmatch '^restore_[a-f0-9]{32}$' -or [IO.Path]::GetDirectoryName($restoreDirectory) -ine $backupRun){throw 'STOP: restore report outside approved backup run'}
$restore=Get-Content -LiteralPath $restoreReportPath -Raw|ConvertFrom-Json
if($backup.Status -cne 'BACKUP_CREATED' -or -not $backup.BackupCreated -or $restore.Status -cne 'RESTORE_VERIFIED' -or -not $restore.RestoreVerified -or $restore.SourceArchiveSha256 -cne $backup.ArchiveSha256 -or $backup.Target.Database -cne 'neondb' -or $backup.Target.Host -cne 'ep-jolly-cell-ai0scrqk.c-4.us-east-1.aws.neon.tech' -or $backup.Tls.Mode -cne 'verify-full'){throw 'STOP: backup/restore target or evidence mismatch'}
$backupEvidence=Convert-BackupEvidence ('B18_EVIDENCE='+($backup.Evidence|ConvertTo-Json -Depth 6 -Compress))
$restoreEvidence=Convert-BackupEvidence ('B18_EVIDENCE='+($restore.Evidence|ConvertTo-Json -Depth 6 -Compress))
Assert-BackupEvidenceEqual $backupEvidence $restoreEvidence
Assert-BackupArchive (Join-Path $backupRun 'neondb.dump') $backup.ArchiveSha256
$backupTime=[DateTimeOffset]::Parse($backup.StartedUtc)
if($backupTime -gt [DateTimeOffset]::UtcNow -or $backupTime -lt [DateTimeOffset]::UtcNow.AddHours(-2)){throw 'STOP: backup expired; separate renewal approval required'}
$migration=Join-Path $repo 'docs\release\batch-1.8-production-migration.sql'
if((Get-FileHash -LiteralPath $migration).Hash.ToLowerInvariant() -cne '94917c516f6eac8c0562f97748c967784598077e08f9ff8620e7044a16834f84'){throw 'STOP: migration changed'}
$approval=Read-Host 'Owner-approved nonsecret release reference (not a password or URL)'
if($approval -cnotmatch '^[A-Za-z0-9][A-Za-z0-9._:/ -]{4,120}$'){throw 'STOP: explicit approval reference required'}
if((Read-Host 'After all approvals and writer drain, type APPLY APPROVED BATCH18 SCHEMA') -cne 'APPLY APPROVED BATCH18 SCHEMA'){throw 'STOP: not approved'}
$tlsDirectory=Join-Path $env:LOCALAPPDATA ('3dkid-batch18-approved-tls-'+[guid]::NewGuid().ToString('N'))
New-PrivatePreflightDirectory $tlsDirectory
$ca=Join-Path $tlsDirectory 'trusted-roots.pem'
$pgBin='C:\Program Files\PostgreSQL\18\bin'
$directHost='ep-jolly-cell-ai0scrqk.c-4.us-east-1.aws.neon.tech'
try {
    $roots=Get-PreflightWindowsRoots
    [IO.File]::WriteAllText($ca,$roots.Pem,[Text.UTF8Encoding]::new($false)); $roots=$null
    foreach($key in @([Environment]::GetEnvironmentVariables('Process').Keys)){if($key -like 'PG*'){[Environment]::SetEnvironmentVariable($key,$null,'Process')}}
    $env:PGSSLMODE='verify-full'; $env:PGSSLROOTCERT=$ca
    $env:PGPASSFILE=Join-Path $tlsDirectory 'DO-NOT-CREATE.pgpass'
    $env:PGCONNECT_TIMEOUT='10'; $env:PGAPPNAME='3dkid_batch18_approved_migration'
    $env:PGOPTIONS='-c default_transaction_read_only=on -c statement_timeout=30s -c lock_timeout=5s'
    $writerSql=@'
BEGIN READ ONLY;
SET LOCAL search_path=pg_catalog;
SELECT json_build_object(
 'NonReadTableLocks',(SELECT count(*) FROM pg_locks l JOIN pg_class c ON c.oid=l.relation JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND l.pid<>pg_backend_pid() AND l.mode<>'AccessShareLock'),
 'IdleTransactions',(SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND state IN ('idle in transaction','idle in transaction (aborted)')));
COMMIT;
'@
    $writerRaw=& "$pgBin\psql.exe" -X -q -A -t -W -h $directHost -p 5432 -U neondb_owner -d neondb -v ON_ERROR_STOP=1 -v VERBOSITY=sqlstate -c $writerSql
    if($LASTEXITCODE -ne 0){throw 'STOP: writer metadata unavailable'}
    $writerState=$writerRaw|ConvertFrom-Json
    if($writerState.NonReadTableLocks -ne 0 -or $writerState.IdleTransactions -ne 0){throw 'STOP: active locks/idle transactions need review; do not kill sessions or auto-retry'}
    if((Read-Host 'Confirm Admin/Preview edits and unrelated DDL paused, jobs clear, callbacks retained and queued-write risk accepted: type WINDOW READY') -cne 'WINDOW READY'){throw 'STOP: maintenance not confirmed'}
    # This observation cannot prevent a new writer; migration locks remain the barrier.
    $env:PGOPTIONS='-c statement_timeout=30s -c lock_timeout=5s -c search_path=pg_catalog'
    & "$pgBin\psql.exe" -X -W -h $directHost -p 5432 -U neondb_owner -d neondb -v ON_ERROR_STOP=1 -v VERBOSITY=sqlstate -v expected_database=neondb -v migration_role=neondb_owner -v "approved_direct_endpoint=$directHost" -v approved_schema_fingerprint=c7068acb15096ec556a1d5e1e80ec559 -v expected_server_major=18 -v production_approved=yes -v "approval_reference=$approval" -v "backup_sha256=$($backup.ArchiveSha256)" -v "backup_created_utc=$($backup.StartedUtc)" -f $migration
    if($LASTEXITCODE -ne 0){throw 'STOP: migration failed or commit uncertain; investigate read-only before retry'}
    $env:PGOPTIONS='-c default_transaction_read_only=on -c statement_timeout=30s -c lock_timeout=5s'
    & "$pgBin\psql.exe" -X -W -h $directHost -p 5432 -U neondb_owner -d neondb -v ON_ERROR_STOP=1 -v VERBOSITY=sqlstate -v expected_database=neondb -v connection_role=neondb_owner -v application_role=neondb_owner -v migration_role=neondb_owner -f '.\docs\release\batch-1.8-production-verify.sql'
    if($LASTEXITCODE -ne 0){throw 'STOP: schema committed but postflight failed; do not deploy'}
    $permissionSql=@'
BEGIN READ ONLY;
SET LOCAL search_path=pg_catalog;
SELECT json_build_object(
 'SchemaUsage',has_schema_privilege(current_user,'public','USAGE'),
 'Types',(SELECT count(*) FROM pg_type t WHERE t.typnamespace='public'::regnamespace AND t.typname IN ('ProductOptionMode','ProductOptionKind')),
 'TypeUsage',(SELECT coalesce(bool_and(has_type_privilege(current_user,t.oid,'USAGE')),false) FROM pg_type t WHERE t.typnamespace='public'::regnamespace AND t.typname IN ('ProductOptionMode','ProductOptionKind')),
 'Functions',(SELECT count(*) FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname IN ('batch18_product_guard','batch18_child_guard','batch18_validate_product','batch18_deferred_integrity','batch18_order_snapshot_guard')),
 'FunctionExecute',(SELECT coalesce(bool_and(has_function_privilege(current_user,p.oid,'EXECUTE')),false) FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname IN ('batch18_product_guard','batch18_child_guard','batch18_validate_product','batch18_deferred_integrity','batch18_order_snapshot_guard')),
 'Sequences',(SELECT count(*) FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind='S'));
COMMIT;
'@
    $permissionRaw=& "$pgBin\psql.exe" -X -q -A -t -W -h $directHost -p 5432 -U neondb_owner -d neondb -v ON_ERROR_STOP=1 -v VERBOSITY=sqlstate -c $permissionSql
    if($LASTEXITCODE -ne 0){throw 'STOP: additional permission checks failed'}
    $permissions=$permissionRaw|ConvertFrom-Json
    if(-not $permissions.SchemaUsage -or $permissions.Types -ne 2 -or -not $permissions.TypeUsage -or $permissions.Functions -ne 5 -or -not $permissions.FunctionExecute -or $permissions.Sequences -ne 0){throw 'STOP: runtime permissions/object counts differ; do not deploy or auto-grant'}
} finally {
    foreach($key in @([Environment]::GetEnvironmentVariables('Process').Keys)){if($key -like 'PG*'){[Environment]::SetEnvironmentVariable($key,$null,'Process')}}
    if([IO.File]::Exists($ca)){[IO.File]::Delete($ca)}
    [IO.Directory]::Delete($tlsDirectory)
}
```

Passwords are entered only at psql's native prompt. No password/URL argument or
credential file is used. These commands are NOT executed during this task. They
do not replace operator review of all live findings/permissions and the fresh
rehearsal PASS. The SQL wrapper owns its BEGIN/COMMIT: do not add --single-transaction.
No prisma migrate/db push/resolve is involved; the live migration ledger was absent.

## Git/Vercel handoff — later, only after schema and separate Git approval

Stage ONLY the exact reviewed inventory below; exclude env files, dumps, private
reports, caches and generated artifacts. Do not use git add . The commands stop if
the inventory, clean index, feature parent or remote baselines have changed. These
are future owner-executed commands, not authorization from this document:

```powershell
git fetch origin
if($LASTEXITCODE -ne 0){throw 'STOP: fetch failed; do not rely on stale refs'}
if((git branch --show-current) -cne 'feat/batch-1.8-color-size-variants'){throw 'STOP: wrong feature branch'}
if((git rev-parse HEAD) -cne '76621cf01ebe482bfee9a80aaed4a4b5b9dfed22'){throw 'STOP: unexpected feature commits'}
if((git rev-parse origin/redesign-3dkid-v2) -cne '76621cf01ebe482bfee9a80aaed4a4b5b9dfed22'){throw 'STOP: Production Git baseline changed'}
if((git rev-parse origin/main) -cne '3bf9ce0955040535db1e42ea161d0d27a80fb160'){throw 'STOP: main baseline changed'}
if(@(git diff --cached --name-only).Count -ne 0){throw 'STOP: unexpected staged changes; do not reset them'}
$remoteFeature=@(git ls-remote origin refs/heads/feat/batch-1.8-color-size-variants)
if($LASTEXITCODE -ne 0 -or $remoteFeature.Count -ne 0){throw 'STOP: remote feature appeared or lookup failed; review before push'}
$checklist=Get-Content -LiteralPath '.\docs\batch-1.8-final-production-checklist.md' -Raw
$inventoryMatch=[regex]::Match($checklist,'(?s)<!-- B18_RELEASE_INVENTORY_BEGIN -->\s*```text\r?\n(.*?)```\s*<!-- B18_RELEASE_INVENTORY_END -->')
if(-not $inventoryMatch.Success){throw 'STOP: reviewed inventory missing'}
$approvedPaths=@($inventoryMatch.Groups[1].Value -split '\r?\n'|Where-Object {$_}|Sort-Object -Unique)
if($approvedPaths.Count -ne 121 -or @($approvedPaths|Where-Object {$_ -notmatch '^(src|scripts|prisma|docs)/' -or $_ -match '(^|/)\.\.?(/|$)|\.env|\.(dump|backup|pem|key|pfx|p12)$'}).Count){throw 'STOP: unsafe or changed inventory'}
$actualPaths=@(git -c core.quotepath=false diff --name-only;git -c core.quotepath=false ls-files --others --exclude-standard)|Sort-Object -Unique
if(@(Compare-Object $approvedPaths $actualPaths).Count){throw 'STOP: working-tree inventory differs; preserve and review changes'}
if((Read-Host 'After explicit Git approval, type STAGE REVIEWED BATCH18') -cne 'STAGE REVIEWED BATCH18'){throw 'STOP: staging not approved'}
git --literal-pathspecs add -- $approvedPaths
if($LASTEXITCODE -ne 0){throw 'STOP: staging failed'}
git diff --cached --stat
git diff --cached --check
if($LASTEXITCODE -ne 0){throw 'STOP: staged diff check failed'}
# Confirm pinned artifacts survive Git's text filters, not just working-copy hashing.
@'
const fs=require('node:fs'),crypto=require('node:crypto'),cp=require('node:child_process');
const manifest=JSON.parse(fs.readFileSync('docs/review/batch-1.8-addendum-manifest.json','utf8'));
const pins={...manifest.artifacts,'scripts/operator/batch18-production-preflight.ps1':'ba54b4c49b8438787930bfcfac812b046c2f792510c33d0699ea94f88d804d20','docs/release/batch-1.8-production-preflight.sql':'64139191343df170888a22af34f298cebd5fe61d8064d9b313ab7362791e0284'};
for(const [path,expected] of Object.entries(pins)){const bytes=cp.execFileSync('git',['show',':'+path]);if(crypto.createHash('sha256').update(bytes).digest('hex')!==expected)throw Error('STOP: staged artifact differs: '+path);}
console.log('PASS: staged pinned artifacts retain approved bytes');
'@ | node
if($LASTEXITCODE -ne 0){throw 'STOP: staged hashes differ; do not commit'}
if((Read-Host 'After reviewing the complete staged diff, type COMMIT REVIEWED BATCH18') -cne 'COMMIT REVIEWED BATCH18'){throw 'STOP: commit not approved'}
git commit -m 'feat: add color size variants and product admin improvements'
if($LASTEXITCODE -ne 0){throw 'STOP: commit failed'}
$releaseSha=git rev-parse HEAD
if((git rev-list --left-right --count origin/redesign-3dkid-v2...HEAD) -notmatch '^0\s+1$'){throw 'STOP: expected exactly one release commit and no divergence'}
git push -u origin feat/batch-1.8-color-size-variants
if($LASTEXITCODE -ne 0){throw 'STOP: feature push failed'}
# This push may trigger Preview against the shared migrated database.
# Verify any auto-Preview for this SHA without test writes; stop on failure.
# Obtain the separately approved Production release authorization before continuing.
if((Read-Host "After approval for $releaseSha, type RELEASE APPROVED BATCH18") -cne 'RELEASE APPROVED BATCH18'){throw 'STOP: Production release not approved'}
git checkout redesign-3dkid-v2
if($LASTEXITCODE -ne 0){throw 'STOP: checkout failed'}
git pull --ff-only origin redesign-3dkid-v2
if($LASTEXITCODE -ne 0){throw 'STOP: pull failed'}
git fetch origin
if($LASTEXITCODE -ne 0){throw 'STOP: final fetch failed'}
if((git rev-parse origin/feat/batch-1.8-color-size-variants) -cne $releaseSha){throw 'STOP: remote feature differs'}
if((git rev-parse HEAD) -cne '76621cf01ebe482bfee9a80aaed4a4b5b9dfed22' -or (git rev-parse origin/redesign-3dkid-v2) -cne '76621cf01ebe482bfee9a80aaed4a4b5b9dfed22'){throw 'STOP: Production advanced before merge'}
git merge-base --is-ancestor HEAD $releaseSha
if($LASTEXITCODE -ne 0){throw 'STOP: feature is not a fast-forward'}
git merge --ff-only origin/feat/batch-1.8-color-size-variants
if($LASTEXITCODE -ne 0 -or (git rev-parse HEAD) -cne $releaseSha){throw 'STOP: approved fast-forward failed'}
git push origin redesign-3dkid-v2
if($LASTEXITCODE -ne 0){throw 'STOP: Production push failed'}
$remoteHeads=@(git ls-remote origin refs/heads/redesign-3dkid-v2 refs/heads/main)
if($LASTEXITCODE -ne 0){throw 'STOP: remote verification failed'}
$remoteProduction=@($remoteHeads|Where-Object {$_ -match '\srefs/heads/redesign-3dkid-v2$'})
$remoteMain=@($remoteHeads|Where-Object {$_ -match '\srefs/heads/main$'})
if($remoteProduction.Count -ne 1 -or ($remoteProduction[0] -split '\s+')[0] -cne $releaseSha -or $remoteMain.Count -ne 1 -or ($remoteMain[0] -split '\s+')[0] -cne '3bf9ce0955040535db1e42ea161d0d27a80fb160'){throw 'STOP: remote Production/main differ'}
if(@(git status --porcelain).Count -ne 0){throw 'STOP: working tree not clean; preserve and review unexpected changes'}
```

Before Production push, verify no unexpected remote commits/ancestry change and
the exact owner-approved SHA; stop if the initial baseline is no longer current.
Do not force-push. Verify remote Production equals releaseSha and main unchanged.
In Vercel, inspect the Production deployment for that EXACT SHA and require Ready
and the correct domain. No success claim while Pending/Failed. No environment,
branch binding or cleanup-scope changes are included in these commands.

## QA and rollback

Manual checks after Ready: legacy simple and existing size product labels/prices,
gallery/hover/mobile behavior, Materials/divider, favicon, Admin form preservation,
cart reconciliation and invalid-line blocking, and checkout summary without
submitting real orders/payments. Existing pending manual QA remains pending until
actual evidence is recorded. Native conversion/testing requires separate approval.

Before COMMIT, a migration failure rolls back transactionally; verify actual state
read-only, including ambiguous disconnects around COMMIT. After additive COMMIT
but before native activation, keep the schema and consider a compatible old-app
rollback; do not drop columns/tables or overwrite newer data. After native data or
orders exist, use a forward fix or a compatible bridge release; older writers can
be unsafe. Never restore the old five-product backup or this archive over live
newer products/orders/payments. Disaster recovery starts in a NEW isolated target
with explicit reconciliation and cutover approval. Media URLs also require their
original stored assets. Neither local rehearsal nor this checklist authorizes a
Production write or a variant/cleanup activation.


## Reviewed release inventory — 121 paths

All paths below are relative to the repository root. This is the exact reviewed
source/test/documentation/schema/asset set, including untracked files. Any added,
missing or unrelated path requires review before staging; never discard it.

<!-- B18_RELEASE_INVENTORY_BEGIN -->
```text
docs/batch-1.8-addendum-ui-safety.md
docs/batch-1.8-favicon.md
docs/batch-1.8-final-production-checklist.md
docs/batch-1.8-fresh-backup-handoff.md
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
scripts/operator/batch18-backup-restore.ps1
scripts/operator/batch18-production-preflight.ps1
scripts/operator/batch18-rehearse.ps1
scripts/rehearse-batch18-variants.mjs
scripts/source-module.ts
scripts/verify-batch18-addendum-postgres.ts
scripts/verify-batch18-addendum.tsx
scripts/verify-batch18-application-postgres.ts
scripts/verify-batch18-architecture.ts
scripts/verify-batch18-backup-restore.ps1
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
<!-- B18_RELEASE_INVENTORY_END -->
