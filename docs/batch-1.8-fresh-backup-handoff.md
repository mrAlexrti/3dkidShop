# Batch 1.8 — Fresh backup and isolated restore handoff

Status: **PREPARED** on 2026-11-22. **BACKUP_CREATED: NO. RESTORE_VERIFIED: NO.**
No agent connection to Neon, backup, restore, snapshot, migration, Git release or
deployment occurred. These instructions require owner review and separate approval
before execution. Preparing a script is not that approval.

### First backup attempt: focused diagnostic correction

Owner run 20261122T192504Z_3b45e1a440a14213a724a506139002e8 stopped with
B18_BACKUP_SNAPSHOT_OR_TARGET_FAILED and BackupCreated=false. Its sanitized report
was inspected: tools/TLS setup completed, but SnapshotCapturedUtc is absent.
Therefore pg_dump was never invoked. The old Read-BackupKeeperLine returned that
same code both on stdout EOF and unexpected output, while discarding the already
captured stderr and client exit code. It is impossible to recover the exact SQL
failure or distinguish the evidence read from the snapshot-token read from this
report. A target mismatch, scope guard, lock failure, evidence query error or
snapshot-export error must NOT be asserted without new evidence.

The focused correction instruments that same path; it does not guess or bypass a
database guard. Safe literal progress markers identify BEGIN_TRANSACTION,
TARGET_VERIFICATION, OBJECT_SCOPE_CHECK, TABLE_LOCKS, EVIDENCE_CAPTURE and
SNAPSHOT_EXPORT. The two unchanged target/scope IF checks now occupy separate DO
blocks inside the same read-only transaction, allowing their attempts to be
distinguished. Markers report attempted operations, not successful checks.

On EOF/unexpected output, the reader collects stderr only after bounded process
exit/drain waits and records fixed codes, SQLSTATE where present and the actual
client exit code. Unexpected/blank output still fails closed and is never saved.
FailedOperation and ClientFailure contain only whitelisted operation/category,
numeric exit code and five-character SQLSTATE; no raw stderr/stdout, SQL, record,
URL, password or peer certificate is written. Target guard B18B1 and scope guard
B18B2 are distinguished; arbitrary SQL errors retain their state. PG_DUMP,
SNAPSHOT_CLOSE, ARCHIVE_LIST and timeouts are also identifiable. Input flushing
is explicit; successful preflight/TLS is not repeated or changed.

pg_dump arguments and snapshot lifetime are unchanged: evidence and export occur
in the exporting read-only transaction, pg_dump imports that token, and only a
successful dump permits exporter COMMIT, archive checks and final rename. Any
failure preserves artifacts and closes/kills only owned processes. No migration,
manifest, TLS, credential or restore-integrity safeguard has been weakened.

The underlying owner-run SQL/protocol cause remains **UNDETERMINED** pending one
instrumented operator retry using the existing Backup command below. Do not reuse
or remove the failed run directory. No agent database connection, backup or restore
was performed for this correction. Two focused in-memory regression groups were
added to the existing suite (13 total), reproducing EOF, guard/SQL failures,
protocol errors and successful evidence/export framing without a database/client.

## Evidence already reviewed

### B18B1 target-verification follow-up

The second owner attempt reports TARGET_VERIFICATION / SQLSTATE B18B1 / exit 3,
TARGET_REJECTED and BackupCreated=false. That state originated ONLY in the backup
script's first DO block, before object checks, locks, snapshot export or pg_dump.
Its old predicate was an OR of SIX conditions:

| Rejection condition | Successful preflight comparison |
| --- | --- |
| current_database() is not neondb | Previously verified neondb |
| current_user is not neondb_owner | Previously verified neondb_owner |
| pg_is_in_recovery() is true | Previously verified primary / false |
| server_version_num is not 180007 | Recorded server_version 18.7, corresponding to 180007; raw version_num was not separately reported |
| transaction_read_only is not on | Previously verified on; backup explicitly begins READ ONLY |
| No pg_stat_ssl row for this PID with ssl=true | NOT collected by the successful preflight |

B18B1 did not encode which operand was true. Source and the old report cannot
prove that the sixth condition actually fired, nor prove the other runtime values
were unchanged between attempts. The precise historical operand remains unknown;
do not label the old attempt a proven wrong-database connection or assert a live
pg_stat_ssl value that was never collected.

There IS a confirmed validation-design defect in the sixth condition: PostgreSQL
[defines pg_stat_ssl](https://www.postgresql.org/docs/18/monitoring-stats.html#MONITORING-PG-STAT-SSL-VIEW)
as backend/WAL-sender connection statistics. Neon has separate client/proxy and
proxy/compute connections, with independently configured backend TLS; see its
[proxy connection handling](https://github.com/neondatabase/neon/blob/main/proxy/src/proxy/mod.rs)
and [compute connection configuration](https://github.com/neondatabase/neon/blob/main/proxy/src/compute/mod.rs).
Consequently a backend ssl=false cannot establish that client-to-proxy TLS was
absent or unverified, including for the unpooled/direct Neon hostname.

Correction is restricted to the backup script: remove that invalid backend-hop
TLS assertion. Client protection remains enforced by PGSSLMODE=verify-full and
the existing explicit public Windows ROOT CA bundle for BOTH keeper and pg_dump.
Host/port/role/database are still fixed, connection overrides and inherited PG
settings are rejected/cleared, and missing roots/TLS failure still stop the client.
No TLS downgrade, target exception, migration SQL or credential change was made.

The remaining five exact rejection conditions are preserved with distinct states:
B18C1 DATABASE_MISMATCH, B18C2 ROLE_MISMATCH, B18C3 IS_REPLICA,
B18C4 VERSION_MISMATCH, B18C5 NOT_READ_ONLY. Reports retain TARGET_VERIFICATION,
that SQLSTATE and exit code with a fixed TARGET_* category. The decoder still
recognizes historical B18B1. Schema fingerprint, full-row preservation, external
object and snapshot-lifetime guards remain unchanged.

The focused offline suite now passes 14 groups. Its added synthetic proxy
counterexample demonstrates the old predicate's false rejection without claiming
a live Neon observation. It also checks all five exact SQL rejection predicates,
their separate sanitized results, and unchanged strict TLS/CA settings. No new
framework or Production check was introduced. One owner Backup retry is needed
to establish whether this correction clears the live blocker. Use the same command
below; do not reuse/delete failed run directories or invoke Restore yet.

The complete sanitized successful preflight d7684441a5ac425ea66b678b3e601d5e was
read locally. Its SHA-256 is
9da26d330884c362d547b867f1153e38c3f4a7ba1f308a94dbb78834de86e9ab.
It finished 2026-11-22T16:30:55.1537572Z with COLLECTED and no ErrorCode.
MigrationApproved remains false. No TLS investigation or live preflight was rerun.

| Evidence | Recorded value |
| --- | --- |
| Confirmed shared target | StikerSuite / production / neondb / public / neondb_owner |
| Direct host | ep-jolly-cell-ai0scrqk.c-4.us-east-1.aws.neon.tech |
| Server / transport | PostgreSQL 18.7, primary, read-only session, verify-full |
| Schema fingerprint | c7068acb15096ec556a1d5e1e80ec559 |
| Application objects | 14 tables, 149 columns, 31 indexes, 11 FKs, 113 constraints, zero user triggers |
| Products / categories / images | 6 / 5 / 19 |
| Product options / values | 1 / 2; both values have absolute prices, no modifier-only values |
| Other counts | 9 reviews, 28 SiteContent rows, 1 User; Account, Session, ProductAttribute, Order, OrderItem and OrderNotification all zero |
| Prisma migration ledger | ABSENT |
| Permissions | Effective ownership and SELECT/INSERT/UPDATE/DELETE true for every existing table; schema CREATE/USAGE and plpgsql USAGE true |
| Role | neondb_owner is not superuser; CREATEDB, CREATEROLE and BYPASSRLS true. It is privileged, not a read-only role |
| Integrity review | All reported indexes valid/ready and constraints validated |
| Other sessions | Six idle sessions; no active transaction age reported at that instant |

All three findings remain relevant: writer/external-consumer visibility review,
new-table runtime permissions after migration, and fresh verified backup plus
explicit owner approval. Idle sessions are not proof that writers cannot return.
Production and Preview share ONE database; no separate-database investigation is
required. Both deployments and old deployments can still write to this database.
SQL does not independently establish Neon project/branch ownership; the endpoint
mapping remains the operator-attested one from the successful preflight.

The old 5-product backup and its restored baseline must remain intact. They are
historical evidence, never a replacement for the current 6-product Production DB.
The final corrected migration rehearsal remains 12/12 PASS; unchanged SQL needs
no repeat rehearsal for this backup preparation.

## Prerequisites and approval checkpoints

1. Owner reviews this handoff and approves **backup execution only**. Confirm the
   active Vercel Production deployment is still commit
   76621cf01ebe482bfee9a80aaed4a4b5b9dfed22 and still uses the attested shared target.
   Do not expose a URL, change secrets or redeploy to establish this.
2. Use Windows PowerShell 5.1+ with PostgreSQL **18.7** psql, pg_dump and pg_restore
   in C:\Program Files\PostgreSQL\18\bin. The workflow checks all three versions.
   Existing Windows ROOT trust handling is reused without changing any store.
3. Use a private console without transcription or terminal recording. Enter only
   the existing Neon neondb_owner password in the secure local prompt. No URL,
   password parameter, credential-file inspection or persistent password is used.
4. Ensure adequate free space and protect the workstation/backup volume (prefer
   BitLocker or an approved encrypted volume). PostgreSQL custom archives are
   compressed, **not encrypted**. They contain private user/session/content data.
   The script gives each run directory only current-user and SYSTEM access.
5. Before local restore, obtain separate owner approval for local verification.
   The existing local server must be running at 127.0.0.1:55432, PostgreSQL 18.7,
   exact data_directory C:\Users\alexa\AppData\Local\3dkid-pg18-restore. Use the
   LOCAL postgres password at its separate secure prompt. Do not use Neon credentials.
   No initdb, cluster recreation or restore into restore_3dkid_batch18 is allowed.
6. Keep Vercel, the application, payment/notification workers and other integrations
   disconnected from the verification database. Do not start Next.js or point an
   application DATABASE_URL at it. The script never starts an app, runs a migration,
   calls an integration or reads an existing database URL. The restored database
   is logically separate in the existing local cluster, not a separate OS sandbox.

The script is tailored to this reviewed baseline. Unexpected extensions, foreign
tables, event triggers, public sequences, external-schema application objects,
schema drift or fewer than the currently recorded catalog minima cause a stop.
Do not bypass a guard to accommodate a changed environment; review it first.
Restoring a logical archive can execute source-defined SQL, so only the archive
created by this approved workflow, matching its private manifest, is accepted.
No arbitrary archive path or remote restore target is supported.

## Commands — execute only after approval

Open a fresh private Windows PowerShell session, then:

```powershell
Set-Location -LiteralPath 'C:\Users\alexa\OneDrive\Документы\stikr-shop'
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\operator\batch18-backup-restore.ps1 -Mode Backup
```

Type exactly **BACKUP CURRENT NEON neondb** after reviewing the target, then enter
the Neon password only in the secure prompt. No additional target inputs are
needed: hostname, database and role are fixed to the verified shared target.

Artifacts are created outside Git under:

```text
%LOCALAPPDATA%\3dkid-batch18-production-backups\<UTC-yyyyMMddTHHmmssZ>_<32-hex-run-id>\
  neondb.dump                 completed custom-format archive
  backup-result.json         sanitized backup evidence, size, SHA-256 and versions
```

The script initially writes neondb.dump.partial. It never overwrites an existing
archive. Only a successful pg_dump, exporting-transaction completion, custom-format
check and pg_restore --list allow renaming to neondb.dump and BACKUP_CREATED.
The temporary public trusted-roots.pem is removed in finally. No password or
complete connection string is written. Failed artifacts are preserved, not reused.

Expected result: `Result: BACKUP_CREATED; exit code: 0`. Record the printed run
directory. A nonzero exit or BLOCKED is a STOP, even if an archive exists. Do not
manually rename a partial archive or treat a TOC listing as proof of restoration.
If cancelled/interrupted, preserve artifacts and use a new run after review.

Inspect only the sanitized report and independently recompute the archive hash:

```powershell
$backupRun = Read-Host 'Paste the printed backup RUN DIRECTORY only (not a URL)'
$backupReport = Get-Content -LiteralPath (Join-Path $backupRun 'backup-result.json') -Raw | ConvertFrom-Json
if ($backupReport.Status -cne 'BACKUP_CREATED' -or -not $backupReport.BackupCreated) { throw 'STOP: backup is not complete' }
$archive = Join-Path $backupRun 'neondb.dump'
$actualHash = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
if ($actualHash -cne $backupReport.ArchiveSha256) { throw 'STOP: checksum mismatch' }
[pscustomobject]@{ Status=$backupReport.Status; Bytes=$backupReport.ArchiveBytes; SHA256=$actualHash; Counts=$backupReport.Evidence.Counts }
```

After separate approval for local verification, in the same private session:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\operator\batch18-backup-restore.ps1 -Mode Restore -RunDirectory $backupRun
```

Type exactly **RESTORE NEW LOCAL ONLY**, then enter the LOCAL postgres password.
The script verifies the exact local server before CREATE DATABASE. It creates a
new template0 database named batch18_backup_verify_<32-hex-id>, records process
ownership, checks that database is empty and verifies identity again. The restore
builder rejects unowned names, --create, --clean and all remote restore requests.
It invokes pg_restore --single-transaction --exit-on-error --no-owner --no-privileges
against only that new local name. If the archive TOC includes a CREATE SCHEMA
public entry, the script first verifies that the new local public schema has no
relations/functions, then removes that empty schema WITHOUT CASCADE so pg_restore
can recreate it. If the TOC has no such entry, the default empty public is retained.
This handles Neon/public ownership differences without --clean or touching any
existing database. No failed or successful verification DB is
automatically deleted; preserve it for inspection. Repeating Restore creates a
different database and report rather than reusing one.

Expected result: `Result: RESTORE_VERIFIED; exit code: 0`. Its sanitized report is:

```text
<backupRun>\restore_<32-hex-id>\restore-result.json
```

Share only these sanitized JSON reports. Never share the dump, raw restored rows,
raw pg_restore diagnostics, credentials, a credential file or full URLs. Reports
contain aggregate table digests, not row identities or customer text; keep them
private outside the repository too. There are no raw stderr or TOC log files.

## Consistency and what restoration proves

The exporter holds BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY, validates
database/role/primary/version/TLS and safe object scope, and locks the fourteen
tables in ACCESS SHARE mode. This permits ordinary DML but prevents conflicting
table DDL until the transaction closes. Within that same snapshot it captures:

- The exact previously reviewed schema fingerprint, object counts and absence of
  a Prisma ledger. The fingerprint covers columns/defaults, constraints, indexes,
  enums, user triggers and function definitions, independent of object OIDs/owners.
- Counts and deterministic aggregate hashes of complete rows for ALL fourteen
  application tables, including products, categories, images, options/values,
  users, orders and SiteContent. No raw rows or per-product IDs leave SQL.
- Explicit orphan counts for ALL eleven existing FK relationships, plus invalid
  index and unvalidated-constraint counts. These must be zero.

pg_export_snapshot supplies the snapshot to pg_dump --snapshot. The exporting
transaction stays open until the dump exits successfully; evidence is not from
an unrelated before/after query. UTC/ISO output, C ordering and fixed float output
make row digests comparable across the two servers. This is a point-in-time view.
The exported token is temporary PostgreSQL transaction state, not a persistent
Neon Snapshot or branch, and creates no control-plane resource.
Later Production changes are intentionally outside that backup. The script accepts
catalog growth but blocks fewer than 6 products, 5 categories, 19 images, 1 option
or 2 option values until reviewed. It never forces counts back to an old backup.

The FULL database custom archive retains original owner/ACL metadata, while the
local verification intentionally skips restoring those owners/grants. Restoration
then rechecks schema fingerprint, 14 tables / 149 columns / 31 indexes / 11 FKs /
113 constraints, zero invalid objects/orphans, and exact counts plus complete-row
aggregate digests for every table. A dropped image, changed product or lost option
fails even if overall product count remains six. FK creation during restore also
validates relationships. pg_restore failure is atomic within the new database;
CREATE DATABASE itself remains and is preserved on failure.

This verifies logical schema/data recovery, not Neon control-plane configuration,
global roles/passwords, historical WAL/PITR, full Windows chain policy or original
owner/ACL restoration. Counts and hashes are consistency evidence, not a signed
attestation against a malicious database administrator. The private manifest and
archive checksum protect this workflow against accidental mismatch/corruption.

Reference: [PostgreSQL 18 pg_dump snapshot/custom format](https://www.postgresql.org/docs/18/app-pgdump.html),
[snapshot export lifetime](https://www.postgresql.org/docs/18/functions-admin.html),
[pg_restore atomic restore and ownership options](https://www.postgresql.org/docs/18/app-pgrestore.html).

## Shared writers, media and recovery policy

Before a later migration, the operator must inventory active Production/Preview
deployments, old deployment URLs, Admin catalog editing, auth, checkout/Mono
callbacks and recovery, notifications and the existing Nova Poshta scheduled
consumer. Six idle sessions at preflight time do not prove all writers absent.
Do not run a real payment/notification as a test. Arrange any maintenance/drain
under separate authorization; this task changes no schedules or configuration.
Do not deploy this Prisma client before the additive schema exists. Native mode
writes remain default-off and require separate approval after old-writer checks.

The database stores media URLs, not Vercel Blob or Cloudinary file bytes. This dump
does NOT back up media. Retain every current referenced asset; automatic Blob
cleanup must stay disabled and assets must not be deleted/replaced during recovery.
A separately authorized future media backup should inventory referenced gallery,
hover, category, hero, review and saved-content assets, copy bytes to encrypted
independent storage, record URL/object identity and checksums, and verify recovery
without overwriting shared assets. Preserve external Cloudinary assets too. No
listing, download, upload, deletion, credential discovery or store change is
implemented/executed here. Document this media-recovery gap before release.

Preserve this fresh archive AND all older backups/snapshots; do not replace them.
After approval, retain an additional verified encrypted copy on independent media
under an agreed retention policy. An archive on the same workstation alone does
not protect against loss of that workstation.

If migration fails before COMMIT, the existing migration's transaction rolls back;
verify this with authorized read-only checks before retrying. Do not restore over
Production. If deployment fails after additive COMMIT but before native activation,
keep the additive schema, assess compatible old-app rollback, and do not drop new
columns/tables or reset data. After native products/orders exist, prefer a forward
fix or compatible application rollback; older applications are not safe native-mode
writers. Restoring an old point-in-time DB would lose subsequent products/orders
and payment state. Disaster recovery must first restore into a NEW isolated target,
compare newer writes/payments, and obtain an explicit reconciliation/cutover plan.
Never automatically restore the old 5-product backup or this fresh backup over live data.

## Migration tracking and postmigration permissions

There is no prisma/migrations directory and the live _prisma_migrations ledger is
absent. The approved Production wrapper explicitly checks that condition and
requires the current schema fingerprint. Do not run prisma migrate deploy, resolve,
db push or invent ledger entries for this backup. Unexpected history/drift requires
review, not bypassing the guard. Original reviewed artifacts and manifest are unchanged:

```text
94917c516f6eac8c0562f97748c967784598077e08f9ff8620e7044a16834f84  Production migration
bba3801a7af4aef9f989c10b351e4a0230d8119621b6b0a43b09022b64bb044c  Production postflight
6b77f16d6554447d1be913df70fcc65d29dd5fd2d34eb22bef8ad524ab06dfbc  Combined manifest
```

After a SEPARATELY approved migration, before deploying application code, execute
the existing docs/release/batch-1.8-production-verify.sql under strict TLS/read-only
authorization with application_role=neondb_owner. It checks every individual
SELECT/INSERT/UPDATE/DELETE privilege for ProductVariant/ProductVariantSelection,
guard definitions, enablement and validator EXECUTE. Local --no-owner/--no-privileges
restoration does not prove these live grants. Also inspect the following read-only
queries as part of that separately authorized postflight (do not run them now):

```sql
BEGIN READ ONLY;
SELECT has_schema_privilege('neondb_owner','public','USAGE') AS schema_usage;
SELECT t.typname,has_type_privilege('neondb_owner',t.oid,'USAGE') AS type_usage
FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
WHERE n.nspname='public' AND t.typname IN ('ProductOptionMode','ProductOptionKind');
SELECT p.proname,has_function_privilege('neondb_owner',p.oid,'EXECUTE') AS executable
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname LIKE 'batch18\_%' ESCAPE '\';
SELECT c.relname,has_sequence_privilege('neondb_owner',c.oid,'USAGE') AS usable,
 has_sequence_privilege('neondb_owner',c.oid,'SELECT') AS readable
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind='S';
COMMIT;
```

Two enum types and five reviewed guard functions are expected. No new sequences
are expected (stable text IDs). A missing object, false privilege or unexpected
sequence blocks deployment; no automatic GRANT or role change is authorized.

## Release checkpoints and preparation verification

1. Owner approves backup only; run Backup, inspect sanitized evidence/checksum.
2. Owner approves local restore; run Restore, require RESTORE_VERIFIED and exit 0.
3. Confirm fresh backup age (the existing migration wrapper allows at most two
   hours), a verified independent copy/media policy, current writer inventory and
   unchanged schema/artifact hashes. If the backup ages out, obtain approval for a
   NEW fresh run. Do not alter timestamps or widen the migration guard.
4. Obtain explicit Production DDL approval bound to the exact migration/hash,
   endpoint, role, approved fingerprint, backup SHA/time and maintenance window.
5. Only then apply the unchanged additive migration and approved read-only postflight.
6. Obtain the separate Git/release approval; review inventory, commit/push/fast-forward
   through the approved workflow without touching main; verify exact Vercel commit
   Ready and legacy catalog, gallery, cart, order snapshots and safe checkout views.
7. Verify old/shared Preview writers before any separately approved native activation.
   Keep Blob cleanup off. Manual QA statuses remain pending without actual evidence.

Preparation validation: scripts/verify-batch18-backup-restore.ps1 runs offline,
loads definitions only and passes 14 groups: helper binding, destination/ownership,
TLS/target/secret restrictions, deterministic evidence, drift/catalog rejection,
restore equality/tampering, exact server guards, guarded empty-public-schema
recreation, custom archive envelope/hash and
snapshot lifetime/approval/finally safety, sanitized EOF/substep/SQLSTATE/exit-code
diagnostics, strict protocol framing and proxy-aware TLS/individual target guards.
These are NOT backup/restore execution
proof. Existing collector regressions and migration-preparation tests are retained.
Actual pg_dump, archive TOC validation, restoration, record equality and new local
DB creation remain NOT EXECUTED until operator approval and execution.
