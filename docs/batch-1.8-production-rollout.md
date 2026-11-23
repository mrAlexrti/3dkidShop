# Batch 1.8 — Production preflight and deployment preparation

Prepared 2026-11-22 on feat/batch-1.8-color-size-variants. No release action taken.

> Current update: the owner's guarded Production read-only preflight succeeded
> (d7684441a5ac425ea66b678b3e601d5e, COLLECTED/exit 0). The complete sanitized
> evidence confirms current 6-product data and the matching baseline schema.
> TLS is resolved. Backup/restore execution and release remain unauthorized and
> unexecuted. Use [the fresh backup handoff](batch-1.8-fresh-backup-handoff.md) for
> the PREPARED owner-executed snapshot-consistent backup/local verification modes.
> Older unavailable-preflight statements below are retained as preparation history.

> Final combined readiness attempt: local application/artifact/regression checks
> PASS. The final corrected restored-baseline run 7440421df00445fbb844b210f1c4d5de
> is independently verified: 12/12 PASS, current six hashes match, SourceUnchanged
> PASS. No further local migration rehearsal is required for these unchanged files.
> Live Neon preflight/backup/release remain unexecuted and approval-gated. See
> [the current read-only preflight report](batch-1.8-production-readonly-preflight.md).
> The operator script now binds all six manifest artifacts and preserves category
> row digests in addition to product/media digests, and reports safe source lines.
> The three corrected SQL hashes below supersede the failing hashes. Earlier
> statements about unchanged SQL/operator describe the earlier
> preparation only. No Production step is authorized or executed.

> COMBINED ADDENDUM: this runbook now targets Materials + category RESTRICT together
> with variants and favicon. The previous variants-only report/SQL are archived
> under docs/review/archive/batch18-before-addendum. Old Production SQL hashes are
> superseded by docs/review/batch-1.8-addendum-manifest.json. See
> [the addendum evidence/inventory](batch-1.8-addendum-ui-safety.md).
**Preparation PASS; live preflight, target binding and write approval BLOCKED.**

## Confirmed evidence and current findings

Current final evidence: the successful report for run
7440421df00445fbb844b210f1c4d5de was read and independently validated against all
six current artifact bytes. All twelve gates and SourceUnchanged PASS; the owner
reports exit 0. This closes the corrected combined local rehearsal requirement.
Its counts are restored-backup counts, not current live Production counts. Live
access is unavailable; no .env/credential discovery or live connection was attempted.
The paragraphs below retain the earlier preparation history; the latest complete
assessment and operator sequence are in batch-1.8-production-readonly-preflight.md.

The owner confirms the final November 21 local PostgreSQL 18.7 rehearsal exited 0
with all twelve checks PASS, including native integrity, legacy history, deferred
failure, migration rollback and source preservation. Stage 1D is COMPLETE. The
successful result-file path was not supplied in this turn, so this is recorded as
owner-confirmed evidence, not a newly read result. Earlier failed runs are retained
as history. That completion predates the combined addendum. The changed SQL now has fresh owned
PostgreSQL 18 synthetic migration, rollback and concurrency PASS evidence. The
protected restored baseline was not modified or connected; run the updated operator
clone rehearsal before live approval. The original variant guard bodies remain
unchanged; three nullable fields and the stronger category hierarchy FK are new.

Read-only Git verification on November 22:

- Remote redesign-3dkid-v2 and local feature HEAD:
  76621cf01ebe482bfee9a80aaed4a4b5b9dfed22.
- Remote main: 3bf9ce0955040535db1e42ea161d0d27a80fb160.
- Feature branch has not been pushed; the existing implementation remains local.
- Before preparation, 69 files were modified/untracked, with an empty index.

No Neon/Vercel administrative connector or approved live database connection
handle is available. No .env, credential file, live secret or Production database
was opened to obtain access. Thus live schema, migration history, product/order
counts, role permissions and active writers are **UNVERIFIED**, not assumed to
match the November 17 backup. No Vercel settings were inspected or changed.

Repository findings:

- There is no prisma/migrations directory; earlier changes use reviewed manual
  SQL in prisma/changes. Build is next build; postinstall is prisma generate.
  There is no repository build-time migrate-deploy hook. Effective Vercel commands
  remain unverified and must be checked separately.
- The new Prisma reads require the additive schema even with native writes off.
  Schema expansion must precede every deployment using this client.
- PRODUCT_VARIANTS_ENABLED requires the literal value true; native configuration
  writes are default-off in code. Blob cleanup is also default-off. External
  values have not been independently verified.
- The official favicon files src/app/favicon.ico, icon.png and apple-icon.png
  and all existing Batch 1.8 implementation files are preserved for the release.
- .github/workflows/novaposhta-sync.yml is an existing scheduled consumer of the
  Production endpoint; it was read but not invoked or modified. Inventory also
  includes payment recovery/callbacks, admin actions, old deployments and direct
  tooling. Database sessions alone cannot establish a complete writer inventory.

## Prepared artifacts and limits

| Artifact | Purpose |
| --- | --- |
| docs/release/batch-1.8-production-preflight.sql | Strict read-only repeatable-read catalog/count/role/history/writer inventory |
| docs/release/batch-1.8-restored-fingerprint-readonly.sql | Optional single read-only metadata comparison with the protected restored baseline; not another rehearsal |
| docs/release/batch-1.8-production-migration.sql | Separate, unbound Production-specific manual migration; NOT APPROVED FOR EXECUTION |
| docs/release/batch-1.8-production-verify.sql | Read-only cutover/post-migration guard and runtime-permission verification |
| scripts/verify-batch18-production-preparation.mjs | Offline package checks; never connects to a database |

The pre-addendum review SQL, candidate and reports are retained in the audit
archive. Active review/local/Production SQL and local operator pins now include
the combined addendum. The read-only preflight fingerprint expression is unchanged. Do not run batch18-rehearse.ps1 against Production.
The new Production file preserves the exact active combined candidate DDL/trigger body,
original postconditions and final SET CONSTRAINTS ALL IMMEDIATE / COMMIT.
Production-only target/backup/maintenance wrapper checks have offline coverage.
The combined schema/trigger body has executed PostgreSQL coverage in a new private
synthetic cluster; this is not a claim of executing the Production wrapper or
the new restored-baseline clone rehearsal.

The Production wrapper requires a bound database, migration role, approved current
schema fingerprint, direct endpoint, approval reference and a fresh archive's
SHA-256/time. It rejects local rehearsal names, replicas, pooled endpoints, an
unexpected Prisma ledger, insufficient effective ownership and unreviewed server
versions. The prepared gate requires PostgreSQL 18, matching the rehearsal. A dump
made by pg_dump 18 does not establish the live server major: if Neon is another
major, STOP for compatibility review, not an automatic server upgrade.

The endpoint setting is an operator assertion, not independent Neon attestation.
Bind psql -h to the SAME hostname verified in the Neon console for the approved
Production project/branch/database, and verify TLS. SQL cannot independently prove
that two branches with identical database/role names are the same Neon branch.
Use the direct administrative endpoint, following
[Neon's migration connection guidance](https://neon.com/blog/prisma-dx-improvements).

Fourteen original tables are locked in a fixed order using SHARE ROW EXCLUSIVE,
followed by the fingerprint check and DDL. This deliberately blocks writes during
the short approved maintenance transaction, including auth/catalog/checkout
writes. Existing lock_timeout=5s and statement_timeout=30s remain. Busy writers,
long transactions or a statement exceeding its timeout abort and roll back; do not
increase timeouts blindly. Administrative/schema writers must be frozen externally:
table locks do not prevent someone creating a new unrelated table in public.

Expected schema delta: 14→16 public tables, 31→42 indexes, 11→16 FKs; two enum
types, Product.optionMode/variantRevision/materials/materialsEn/materialsDivider, ProductOption.kind,
ProductOptionValue.retiredAt, OrderItem.productVariantId, ProductVariant and
ProductVariantSelection, five guard functions and eleven user triggers.
Category_parentId_fkey changes SET NULL to RESTRICT in the same transaction;
total FK/index counts do not change for this replacement. No descendant detachment
or product cascade is permitted. Materials are initially NULL without backfill. Existing
rows are not converted, repriced or backfilled; options/orders may have grown since
backup. Counts of all fourteen original tables are compared under the lock.
The five original products are not assumed to be the entire current catalog.

## Operator read-only preflight — can be run before write approval

For operator-executed collection with a sanitized JSON report, prefer
scripts/operator/batch18-production-preflight.ps1 and follow
[the Windows handoff](batch-1.8-production-preflight-handoff.md). It pins the exact
existing read-only SQL below and adds metadata attestation, secure child-only
authentication, read-only guards and report sanitization. It never creates backups
or authorizes migration. The manual commands below remain reference instructions.

Use a fresh, private Windows PowerShell -NoProfile session in the repository root.
Enter passwords only at libpq's interactive -W prompt. Do not paste URLs, use
transcripts, pass passwords in arguments, or save credentials/reports/backups in Git.
Fill ONLY these nonsecret names from the approved Neon Production console:

```powershell
$pgBin = 'C:\Program Files\PostgreSQL\18\bin'
$approvedDirectHost = '<console-verified-direct-host>'
$productionDb = '<approved-database-name>'
$auditRole = '<existing-authorized-audit-role>'
$migrationRole = '<approved-migration-role>'
$appRole = '<actual-effective-application-role>'
if ($approvedDirectHost -notmatch '^ep-[a-z0-9-]+[.][a-z0-9.-]+[.]neon[.]tech$' -or $approvedDirectHost -like '*-pooler.*') { throw 'Verify the approved direct endpoint first.' }
foreach ($name in @($productionDb,$auditRole,$migrationRole,$appRole)) {
    if ($name -notmatch '^[A-Za-z_][A-Za-z0-9_-]{0,62}$') { throw 'Fill and review nonsecret target names first.' }
}
Remove-Item Env:PGPASSWORD,Env:PGSERVICE,Env:PGSERVICEFILE,Env:PGHOSTADDR -ErrorAction SilentlyContinue
$env:PGSSLMODE = 'verify-full'
$env:PGSSLROOTCERT = 'system'
$env:PGCONNECT_TIMEOUT = '10'
$env:PGPASSFILE = Join-Path $env:TEMP ('batch18-no-passfile-' + [guid]::NewGuid().ToString('N'))
$env:PGAPPNAME = '3dkid_batch18_readonly_preflight'
$env:PGOPTIONS = '-c default_transaction_read_only=on -c statement_timeout=30s -c lock_timeout=5s'
$auditConnection = @('-h',$approvedDirectHost,'-p','5432','-U',$auditRole,'-d',$productionDb,'-W')
& "$pgBin\psql.exe" -X @auditConnection -v ON_ERROR_STOP=1 -v VERBOSITY=sqlstate -v "expected_database=$productionDb" -v "connection_role=$auditRole" -v "application_role=$appRole" -v "migration_role=$migrationRole" -f '.\docs\release\batch-1.8-production-preflight.sql'
if ($LASTEXITCODE -ne 0) { throw 'Read-only preflight failed; stop and review without raw diagnostics.' }
```

If system CA verification is unavailable, use an operator-approved CA certificate
outside Git; do not disable certificate/hostname checking. The audit role must be
authorized for aggregate counts and required catalog visibility. This preparation
does not create roles, grant permissions or solicit credentials. Close the private
shell when finished; in finally remove PGOPTIONS, PGSSLMODE, PGSSLROOTCERT,
PGCONNECT_TIMEOUT, PGPASSFILE and PGAPPNAME. No password is stored by these commands.

Review all output as metadata/counts only. Migration-name/checksum output deliberately
omits Prisma logs; active sessions omit SQL/parameters and hash application_name.
Missing roles, incomplete pg_stat_activity visibility, RLS-limited counts or failed
queries are blockers, not evidence of an empty/idle database. Confirm counts with
an appropriately authorized role. Record total products/options/order items/orders,
priced/unpriced/modifier-only values, owners, validated constraints, enabled triggers,
valid/ready indexes, schema hash and live PostgreSQL version. Do not print records.

If the final rehearsal's original-schema hash was not retained, use the exact same
fingerprint expression read-only on the protected local restored database. This
collects missing metadata only and performs no clone, migration or new rehearsal:

```powershell
$env:PGSSLMODE = 'disable' # ONLY for the explicitly guarded local loopback instance.
try {
    & "$pgBin\psql.exe" -X -W -h 127.0.0.1 -p 55432 -U postgres -d restore_3dkid_batch18 -v ON_ERROR_STOP=1 -v VERBOSITY=sqlstate -f '.\docs\release\batch-1.8-restored-fingerprint-readonly.sql'
    if ($LASTEXITCODE -ne 0) { throw 'Baseline metadata unavailable; stop comparison.' }
} finally { $env:PGSSLMODE = 'verify-full' }
```

Do not simply copy an unexpected live hash into the approval manifest to bypass
drift. Compare it with the rehearsed schema and inventory. Business record-count
growth is expected and is not schema drift. New/changed schema, functions, RLS,
constraints, indexes, extensions or partial native objects require review. If the
fingerprints differ, obtain a safe schema-object diff and classify it before any
DDL; a material migration change requires renewed targeted verification.

## Prisma history and role gates

The preflight checks for public._prisma_migrations and outputs only migration
names, checksums and completion/rollback flags. No ledger query writes anything.

- **Ledger absent:** continue the repository's established reviewed manual-SQL
  workflow. Record exact SQL SHA-256, target identity, pre/post schema hashes,
  backup SHA/time, operator, approval reference and release SHA in the private
  operational release record. This SQL does not silently create a Prisma ledger.
- **Ledger present:** STOP. The prepared migration refuses execution. Reconcile
  its contents and missing repository history first. Do not mark a migration
  applied, fabricate checksums, initialize a baseline or run migrate deploy against
  populated tables in this stage. Prisma 5 baselining/resolve is a separately
  reviewed history write, not read-only preflight or drift repair. See the
  [Prisma baselining concept](https://www.prisma.io/docs/orm/v7/prisma-migrate/workflows/baselining).
- Never run db push, migrate dev/reset, seeds or introspection that overwrites the
  working schema. prisma generate creates code; it does not apply DDL.

Migration role must effectively own/alter existing tables, have public USAGE/CREATE
and plpgsql USAGE. Neon ownership is not established by a role merely being named
owner; preflight checks effective membership. Runtime access to new tables/functions
must be reviewed before deployment. The postflight checks each needed privilege
individually; comma-separated has_table_privilege input would test ANY, not ALL.

If the application role differs and approved default privileges do not cover the
new objects, prepare narrowly scoped grants on the two new tables and validator
function, with explicit owner authorization. Do not auto-grant/revoke or change
Vercel credentials here. Missing runtime privileges block deployment; a postflight
error after migration COMMIT cannot roll that schema change back. Runtime ownership,
schema CREATE, or ability to disable guards is an additional blocker for native
activation until a separately approved role/writer plan addresses it.

Conditional grant proposal ONLY if preflight proves it necessary and the owner
explicitly approves it; replace the role identifier with the reviewed runtime
role. This is a separate Production permission write, not part of read-only
preflight and not automatically included in the migration file:

```sql
GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public."ProductVariant", public."ProductVariantSelection"
TO "<approved-runtime-role>";
GRANT EXECUTE ON FUNCTION public.batch18_validate_product(text,text)
TO "<approved-runtime-role>";
```

Do not grant ownership, schema CREATE, superuser, bypass-RLS or trigger-disable
capabilities as a deployment workaround. Review existing/default function ACLs
and role inheritance before deciding whether these proposed grants are sufficient.

## Fresh independent backup — required immediately before approved DDL

Commands in this section require explicit owner approval to create a NEW backup;
an isolated verification restore requires its own approval too. Neither action
was performed during the read-only preparation. No snapshot or branch is created.

Preserve the prior archive and Neon Snapshot. After target/schema approval, obtain
a NEW private full custom-format archive with pg_dump 18, not a schema-only dump.
Use a unique external path and verify exit status, readability, nonzero size and
SHA-256. Keep ACL/owner metadata in the independent backup. Restrict its filesystem
permissions and keep it outside the repository/OneDrive/public artifacts. A fresh
Neon snapshot may supplement, not replace, this independent backup.

```powershell
$backupRole = $migrationRole
$env:PGOPTIONS = '-c default_transaction_read_only=on -c lock_timeout=5s'
$backupDirectory = Join-Path $env:LOCALAPPDATA '3dkid-production-backups'
[void][IO.Directory]::CreateDirectory($backupDirectory)
$backupStartedUtc = [DateTime]::UtcNow.ToString('o')
$backupFile = Join-Path $backupDirectory ('batch18-before-' + [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssZ') + '-' + [guid]::NewGuid().ToString('N') + '.dump')
if (Test-Path -LiteralPath $backupFile) { throw 'Never overwrite a backup.' }
& "$pgBin\pg_dump.exe" -h $approvedDirectHost -p 5432 -U $backupRole -d $productionDb -W --format=custom --lock-wait-timeout=5s --file=$backupFile
if ($LASTEXITCODE -ne 0) { throw 'Fresh backup failed; retain partial file for private review and stop.' }
if ((Get-Item -LiteralPath $backupFile).Length -le 0) { throw 'Backup is empty.' }
& "$pgBin\pg_restore.exe" --list $backupFile | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Archive is not readable.' }
$backupSha256 = (Get-FileHash -LiteralPath $backupFile -Algorithm SHA256).Hash.ToLowerInvariant()
```

Do not output archive contents or customer rows. Archive readability is not a full
restore test; the completed Stage 1D restore/rehearsal evidence remains distinct.
pg_dump takes a consistent snapshot but does not block later writes: restoring it
over new orders would lose subsequent data. Define the maintenance/writer window
and recovery point with the owner. See
[PostgreSQL pg_dump consistency and format](https://www.postgresql.org/docs/18/app-pgdump.html).
The prepared SQL requires a reviewed backup
timestamp within two hours; use the dump START time, and refresh if the window is
missed. A SHA/time assertion is not proof that a backup was actually taken.

## Future migration command — DO NOT RUN before explicit approval

Bind a nonsecret approval manifest to the console-verified endpoint/branch/database,
live role/version/schema inventory, compared baseline hash, archive SHA/start time,
the exact Production SQL SHA and the reviewed source bundle. Placeholders must not
be used as approvals. No actual endpoint or approval reference is inferred here.

```powershell
$approvedSchemaFingerprint = '<reviewed-current-32-hex-schema-hash>'
$approvalReference = '<owner-approved-release-reference>'
$approvedMigrationSha256 = '<owner-approved-64-hex-production-file-sha256>'
$migrationFile = '.\docs\release\batch-1.8-production-migration.sql'
if ((Get-FileHash -LiteralPath $migrationFile -Algorithm SHA256).Hash.ToLowerInvariant() -cne $approvedMigrationSha256) { throw 'Migration hash is not approved.' }
$env:PGOPTIONS = '-c statement_timeout=30s -c lock_timeout=5s'
$env:PGAPPNAME = '3dkid_batch18_approved_migration'
& "$pgBin\psql.exe" -X -W -h $approvedDirectHost -p 5432 -U $migrationRole -d $productionDb -v ON_ERROR_STOP=1 -v VERBOSITY=sqlstate -v "expected_database=$productionDb" -v "migration_role=$migrationRole" -v "approved_direct_endpoint=$approvedDirectHost" -v "approved_schema_fingerprint=$approvedSchemaFingerprint" -v expected_server_major=18 -v production_approved=yes -v "approval_reference=$approvalReference" -v "backup_sha256=$backupSha256" -v "backup_created_utc=$backupStartedUtc" -f $migrationFile
if ($LASTEXITCODE -ne 0) { throw 'Migration failed or commit outcome is uncertain: inspect read-only before any retry.' }
$env:PGOPTIONS = '-c default_transaction_read_only=on -c statement_timeout=30s -c lock_timeout=5s'
& "$pgBin\psql.exe" -X -W -h $approvedDirectHost -p 5432 -U $migrationRole -d $productionDb -v ON_ERROR_STOP=1 -v VERBOSITY=sqlstate -v "expected_database=$productionDb" -v "connection_role=$migrationRole" -v "application_role=$appRole" -v "migration_role=$migrationRole" -f '.\docs\release\batch-1.8-production-verify.sql'
if ($LASTEXITCODE -ne 0) { throw 'Postflight failed; stop deployment and diagnose read-only.' }
```

Do not wrap this file in psql --single-transaction: it already owns BEGIN/COMMIT.
A timeout, permission/target/fingerprint/history mismatch or deferred constraint
failure aborts the transaction. A disconnect around COMMIT creates uncertainty:
never blindly rerun. Inspect actual objects/hash/counts first. The guarded file
intentionally refuses a second application or a partial/previous expansion.

Postflight is a CUTOVER check while catalog writers remain frozen; its revision=0
assertion is not a liveness probe after normal admin editing resumes. Record its
post-schema hash and compare before/after counts. Unfreeze ordinary legacy writers
only through the approved maintenance plan. New guard constraints must remain on.

## Coordinated release and activation sequence

1. Accept the independently verified final twelve-gate rehearsal; then obtain
   current read-only preflight, an explicitly approved fresh verified backup and
   reviewed combined target binding. Inventory
   effective Production/Preview endpoints, Vercel build/install/Node runtime, branch
   mappings, deployment hooks, scheduled functions, admin sessions and direct tools.
   Node >=20 is required by the Blob SDK; actual hosted runtime is still unverified.
2. Obtain explicit owner approval for the exact migration manifest/hash, maintenance
   window and subsequent Git/Vercel workflow. Secure the complete reviewed local
   source bundle so it cannot be lost/changed between DDL and commit.
3. Apply additive DDL, with native writes and Blob cleanup disabled. Run cutover
   verification, compare schema/counts and resolve approved runtime privileges.
4. Only after schema verification, review/stage the explicit approved file list
   (application, tests, SQL/documents and favicon). Include the reviewed text fixtures
   in docs/review/archive: regression checks depend on their exact bytes. Exclude
   credential .env files, .next, caches, private database backup archives/dumps,
   reports containing private values and credentials. The existing .env.example
   template is unchanged. Verify the staged
   diff, make the approved feature commit, and record its exact SHA. No commit has
   been created in this preparation.
5. Re-fetch/recheck Production and main. Require reviewed feature ancestry and the
   approved release SHA; push feature without force, then fast-forward only the
   Production branch through the separately approved workflow. Never change main.
6. Check Vercel Production for THAT commit and its completed Ready/Success status
   and canonical https://www.3dkid.shop mapping. A push or build start is not success.
   Do not use the isolated mocked-build runner as the hosted build command.
7. Verify read-only legacy catalog/product prices, existing sizes, gallery/GIF,
   UA/EN, favicon HTTP/metadata and cart reconciliation/checkout readiness. Do not
   create real orders, invoices, payments or notifications as an implicit smoke test.
8. Verify old writers/deployments are drained or made safe before native activation.
   DB sessions alone are insufficient for serverless/pooled/cold writers. Include
   historical Preview deployments, tabs, jobs, webhooks and direct database users.
9. Native writes require separate approval/control: literal PRODUCT_VARIANTS_ENABLED
   true, suitable runtime privileges, tested mode-aware writers and an approved
   explicit per-product adoption plan. This release does not convert legacy data.
10. Perform separately authorized manual Production QA and monitor errors, locks,
    checkout retries/snapshots and availability. Preserve all existing Pending
    Manual QA statuses until actual evidence is recorded. Blob cleanup stays off.

Vercel normally creates deployments on branch pushes; see
[Vercel Git deployments](https://vercel.com/docs/git). Separate Preview database
isolation is NOT required by this owner decision; that is not permission to assume
every Preview's connection or writer version. A Preview sharing Production must
have schema-first ordering and obey real-data/integration restrictions. A Preview
using another unmigrated database must not receive the new client without its own
approved plan. Identify effective settings without exporting secret values. No
deployment/environment configuration change is authorized by this preparation.

Exact operator-side Vercel checks, read-only:

- Existing project → Settings → Git: verify connected mrAlexrti/3dkidShop and
  Production Branch redesign-3dkid-v2; inspect automatic branch-deployment and
  ignored-build rules and hooks without changing them.
- Settings → Build and Deployment: record effective install/build commands,
  framework, root directory and Node major. Confirm no remote custom command runs
  db push, migrate reset, seeds or an unreviewed migration automatically.
- Deployments: inventory Production, current aliases and older reachable
  Production/Preview URLs by Git SHA, target and role/endpoint mapping. A cold
  deployment can still be a writer even when no DB session is visible.
- Settings → Environment Variables: inspect names/scopes and branch overrides
  without exporting secret values. Privately attest the Production/Preview Neon
  branch/database/role mapping using hostname/branch metadata only. Confirm native
  activation and Blob cleanup flags are unset/false, without changing them. Never
  copy connection URLs, BLOB tokens, SMTP/payment/notification secrets into reports.
- Record functions/jobs/webhook/recovery consumers and their code versions,
  including the unchanged GitHub scheduled endpoint. Confirm the canonical domain
  alias will target the approved completed Production commit. Do not invoke jobs.

## Rollback limits and outstanding blockers

- Before DDL COMMIT: transaction failure rolls expansion back; inspect a lost
  connection read-only before deciding whether COMMIT occurred.
- After additive COMMIT, before native adoption: retain schema. Roll back only to
  a verified legacy-compatible application; do not drop objects automatically.
- After native products/v2 orders exist: retain schema and immutable history;
  rollback requires a mode-aware bridge. Flag=false is not a data rollback.
- Never restore an old archive over newer orders, rewrite paid orders/payments,
  downgrade cart/payment identities, remove required FKs or delete order history.
- A failed hosted deployment leaves schema expanded and native writes off. Diagnose
  or redeploy a compatible application; do not reverse DDL as an automatic reaction.

Outstanding: current live schema/hash/history/permissions/counts/version; matching
rehearsed-baseline fingerprint; fresh private backup and its evidence; exact endpoint
binding and owner approval; runtime privilege plan; effective Vercel build/runtime/
writer inventory; reviewed future feature commit/release SHA and completed hosted
deployment. These do not reopen completed Stage 1D or impose Preview isolation.

Prisma documentation versions have advanced; use the installed pinned 5.22
toolchain here, not newer CLI commands.

## Verification of this preparation

Only focused offline artifact tests, syntax/whitespace and source preservation
checks are run. No existing-cluster/restored-baseline rehearsal, live preflight, backup, Production DDL,
ledger/grant write, commit, push, merge, deployment, environment or infrastructure
change was executed. File hashes below/alongside the report bind the prepared
files, not a claim of Production readiness. All previous implementation and favicon
changes remain uncommitted and unpushed.

Executed preparation checks: seven production-package groups PASS; three existing
migration-artifact groups PASS (including installed Prisma 5 validation); focused
ESLint PASS; all four operator PowerShell command blocks parse successfully without
execution; whitespace/source-preservation checks PASS. The original local operator
and every application/favicon file are unchanged. The addendum's changed application has a fresh isolated production build and
regression verification, and its combined DDL has fresh private synthetic PostgreSQL
execution evidence. Production target wrappers remain unexecuted; no Production
execution claim is made for them.

Prepared SQL SHA-256 (rehash the exact file before binding approval):

```text
94917c516f6eac8c0562f97748c967784598077e08f9ff8620e7044a16834f84  docs/release/batch-1.8-production-migration.sql
64139191343df170888a22af34f298cebd5fe61d8064d9b313ab7362791e0284  docs/release/batch-1.8-production-preflight.sql
bba3801a7af4aef9f989c10b351e4a0230d8119621b6b0a43b09022b64bb044c  docs/release/batch-1.8-production-verify.sql
d43bc1dab2b875e49998204bc41f25c0c4787978431385dbf87f9bdbf721e6a0  docs/release/batch-1.8-restored-fingerprint-readonly.sql
```

This preparation adds the four SQL files, this report and the offline verifier;
it updates only the existing rehearsal report among the preceding 69 files.
The earlier preparation's 75-file inventory is historical; the complete current
combined inventory is in the addendum report. The index remains empty. No production target
or secret is embedded. Request explicit owner approval of the fully bound
migration/backup/role manifest and subsequent Git/Vercel workflow AFTER the missing
operator preflight evidence is reviewed. Do not treat this unbound preparation or
the earlier local approval as authorization for live writes or release.
