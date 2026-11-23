# Batch 1.8 Stage 1D — local Production migration rehearsal

Initial review: 2026-11-18. Execution resumed: 2026-11-19.
Latest connectivity attempt and independent favicon completion: 2026-11-21.
Branch: `feat/batch-1.8-color-size-variants`.
Unchanged HEAD/Production baseline: `76621cf01ebe482bfee9a80aaed4a4b5b9dfed22`.

**Latest disposition (owner confirmation received 2026-11-22): Stage 1D COMPLETE.
The final November 21 local rehearsal exited 0 with all twelve checks PASS,
including NativeIntegrity, DeferredFailure, MigrationRollback and SourceUnchanged.
The final successful result-file path was not provided in this turn; this records
the owner's confirmation, not a newly read JSON report. No further full local
rehearsal is required for the unchanged migration body. See section 15.**
The authentication-blocked summaries and earlier execution records below are
historical and are superseded by that operator evidence, not deleted or rewritten.

**Overall: BLOCKED — the supplied local cluster is ready, but the resumed
connection using the owner-specified password file was rejected by password
authentication. No clone, migration or rollback was executed.**

The owner authorized setting PGPASSFILE to
`C:\Users\alexa\AppData\Local\3dkid-restore-pgpass.conf` on resumption. It was passed
only as a PostgreSQL client environment setting. The file was not inspected,
printed or modified, and no password value was requested, retrieved by the agent,
stored or exposed. No project environment file, credential manager or Production
connection was consulted. The PostgreSQL client used the configured file internally
as authorized; its authentication rejection is the current execution blocker.

## 1. Owner decision and scope

The owner has chosen eventual testing on the existing Production website.
**Separate Preview database isolation is no longer a release requirement.** This
supersedes the isolation prerequisite in the historical Stage 1C report; that
report is preserved unchanged. Shared-database writer verification, schema-first
deployment and safe handling of existing orders remain necessary. No Production
migration or deployment is authorized by this stage.

The original 57 changed/untracked files, including the guarded review SQL, are
preserved. Four files are added, bringing the combined total to **61**:

```text
docs/batch-1.8-migration-rehearsal.md
docs/review/batch-1.8-production-candidate.sql
docs/review/batch-1.8-neon-preflight-readonly.sql
scripts/verify-batch18-migration-artifacts.mjs
```

## 2. Verification matrix

| Verification area | Status | Evidence / remaining requirement |
| --- | --- | --- |
| Branch and existing work preservation | PASS | Correct branch/baseline, empty index and content fingerprints of all 57 existing files |
| Existing cluster startup | PASS | Started only the specified existing PG18 data directory with pg_ctl; pg_isready reports accepting connections on 127.0.0.1:55432 |
| Authenticated local access | BLOCKED | Initial attempts required authentication; resumed libpq connection with the authorized PGPASSFILE returned PASSWORD_AUTHENTICATION_REJECTED |
| Original restored baseline protection | PASS for no SQL execution; data comparison BLOCKED | No authenticated query or migration reached restore_3dkid_batch18. No initdb, recreation, ALTER DATABASE or data edit. Baseline contents could not be independently inspected |
| Original guarded SQL/body preservation | PASS, offline | Original guard retained; candidate's additive/trigger body matches it, including identity, locking, retirement, FK and snapshot safeguards |
| Prisma/schema agreement | PASS, offline | Prisma 5.22 validates; actual/review models agree; offline generated additive DDL matches the preserved candidate prefix |
| Candidate target/manifest protection | PASS, source inspection | Rejects protected baseline and any non-local target; explicit expected DB/role/schema fingerprint required before DDL. Runtime negative tests BLOCKED |
| Candidate PostgreSQL syntax/execution | BLOCKED | New wrapper/preflight SQL has not been parsed/executed by PostgreSQL. Previous original-body PG18 evidence is not proof of this complete candidate |
| Fresh clone of restored data | BLOCKED | No disposable database created because authentication failed |
| Tables/columns/indexes/FKs/triggers/deferrability | BLOCKED on restored baseline | Expected changes specified below; no new observed catalog counts claimed |
| Five-product/data preservation | BLOCKED | Owner-reported five products; no before/after fingerprints or authenticated record counts collected |
| Legacy/native/revision/order application verification | BLOCKED on restored baseline | Stage 1B evidence retained separately; no new real-baseline application proof |
| Injected migration failure / full rollback | BLOCKED | Procedure prepared; not executed in a disposable restored-data clone |
| Read-only Neon preflight / Production execution | BLOCKED, not authorized | Artifacts/instructions only. No Neon connection or Production SQL |
| Native writes / Blob cleanup | Default off in code | No activation, approval-scope or environment change; external settings not inspected |

Owner-reported baseline, **not independently verified in this stage**:
14 tables, 31 indexes, 11 foreign keys, 5 products, 0 product options and 0 orders.
The reported full restore is accepted as owner context; it does not substitute
for the blocked migration rehearsal.

## 3. Cluster actions actually performed

Only these existing-cluster lifecycle commands were run (plus metadata status):

```powershell
& 'C:\Program Files\PostgreSQL\18\bin\pg_ctl.exe' `
  -D 'C:\Users\alexa\AppData\Local\3dkid-pg18-restore' `
  -l 'C:\Users\alexa\AppData\Local\3dkid-pg18-restore\stage1d-start.log' `
  -o '-h 127.0.0.1 -p 55432' -w start

& 'C:\Program Files\PostgreSQL\18\bin\pg_ctl.exe' `
  -D 'C:\Users\alexa\AppData\Local\3dkid-pg18-restore' status

& 'C:\Program Files\PostgreSQL\18\bin\pg_isready.exe' `
  -h 127.0.0.1 -p 55432 -t 3
```

The data-directory version marker is 18. Startup reported an old PID/startup state
and performed normal recovery/checkpoint work before becoming ready. The server
was subsequently confirmed running at exactly the requested directory/port and
left running. Startup naturally changes cluster control/WAL/checkpoint files;
this is not a claim that the entire data directory is byte-identical. No application
data SQL was executed, and no authenticated comparison of its contents was possible.
No initdb or database recreation was attempted.

Initial connection attempts used psql -X -w, explicit 127.0.0.1:55432, the supplied database,
an empty passfile, cleared inherited PG/connection variables and no project URL.
The locally guessed role names restore_owner/postgres both required authentication.
No further role guesses, password retrieval or authentication-policy changes were
attempted after that result. Database work remains stopped.

### Resumed connection verification — 2026-11-19

The owner subsequently supplied the PGPASSFILE path above and authorized local
database execution. A read-only baseline metadata request failed before SQL
execution. A focused readiness/SELECT-1 probe then established:

| Actual resumed check | Result |
| --- | --- |
| pg_isready at 127.0.0.1:55432 | PASS — accepting connections |
| psql -X -q -w, user postgres, database restore_3dkid_batch18, supplied PGPASSFILE | FAIL — PASSWORD_AUTHENTICATION_REJECTED; client exit 2 |
| Authenticated read-only SELECT | BLOCKED — authentication failed before query execution |
| Fresh disposable clone / migration / rollback / five-product comparison | BLOCKED — not attempted |

Inherited PG/connection variables were cleared in the child environment; only the
authorized local connection and passfile settings were supplied. No alternate
role, password source, authentication-policy edit or credential workaround was
attempted. No database or clone was created. Only sanitized failure classification
was emitted; raw client diagnostics and credential contents were not printed.
Independent operator verification of this exact host/port/user/database/file
combination is needed before another execution attempt; do not send password
values or password-file contents to the agent.

## 4. Migration candidate and preservation contract

The candidate is `docs/review/batch-1.8-production-candidate.sql`.
It is **NOT APPROVED FOR PRODUCTION EXECUTION** and is not installed under
prisma/changes or executed automatically by application/build scripts.

This revision intentionally permits only LOCAL_REHEARSAL mode on fresh databases
named batch18_rehearsal_<hex>, at 127.0.0.1:55432. It explicitly rejects
restore_3dkid_batch18 before DDL and rejects Production regardless of session
settings. A separately authorized, target-specific execution revision is still
required after successful rehearsal and live read-only preflight. Do not merely
remove this candidate's guards to make it run remotely.

The candidate requires expected database, role and a reviewed 32-character schema
fingerprint. The matching fingerprint expression in the read-only preflight hashes
table/column definitions, constraints, indexes, enums, non-internal triggers and
function definitions without printing function bodies or row data. A fingerprint
is a drift detector, not an authentication mechanism or owner authorization.
The actual restored fingerprint is currently **unknown** because access is blocked;
never fill it with an invented value or automatically accept a Production mismatch.

Preconditions additionally require the reported exact baseline table set,
31 indexes/11 FKs and no partial native schema. The entire original additive body
is retained, including qualified names, restricted search_path, immutable IDs,
parent-row locks, revision triggers, deferred validators, retirement rules and
native-order insertion/snapshot guards. The original guarded review file remains
unchanged.

The wrapper retains a single BEGIN/COMMIT, 5-second lock timeout and 30-second
statement timeout. It asserts post-migration object counts, five guard functions,
eleven triggers, two validated deferred ownership FKs, empty variant tables,
LEGACY/revision-zero products and NULL new legacy fields. It ends with explicit
SET CONSTRAINTS ALL IMMEDIATE. It changes no feature flags, product modes,
availability, media URLs, payments or historical order data.

Expected delta, **not an observed Stage 1D result**:

| Object | Before (owner-reported) | Expected after |
| --- | --- | --- |
| Public application tables | 14 | 16 |
| Indexes including PK/unique indexes | 31 | 42: nine explicit additions plus two new PK indexes |
| Foreign keys | 11 | 16 |
| New columns | None | Product.optionMode/variantRevision; ProductOption.kind; ProductOptionValue.retiredAt; OrderItem.productVariantId |
| New enum types | None | ProductOptionMode and ProductOptionKind |
| New guard functions / triggers | Not inspected | Five named functions / eleven new triggers |
| New CHECKs | None of the new names | Three: price bounds, variant-ID format and revision nonnegative |
| Selection ownership FKs | None | Two NO ACTION, DEFERRABLE INITIALLY DEFERRED; remaining native ownership/history FKs retain reviewed actions |
| Existing products | 5 | Same five IDs and all pre-existing field values; new mode LEGACY and revision 0 |
| Product options / orders | 0 / 0 | 0 / 0 in the clean migration clone; no fixtures there |

## 5. Separate local rehearsal procedure — not executed

### 5.1 Authentication and data-handling stop conditions

Do not give Codex a password or connect it through a Production secret. The owner
has authorized the local PGPASSFILE client workflow, but that connection currently
fails authentication. An operator must verify it independently. Do not weaken
pg_hba.conf, switch real restored data to trust, extract saved credentials or grant
new roles automatically. No password-handling workaround is included here.

Run only against the supplied existing cluster, with explicit loopback host/port,
an approved existing local role and no inherited project connection URL. Verify
cluster/data-directory identity first. Keep any clone data and comparison manifests
outside Git/shared folders and inaccessible to Vercel/app/schedulers. Capture only
sanitized result codes, metadata and aggregates; PostgreSQL error/COPY diagnostics
can contain values and must not be printed to shared logs. Do not start the app,
payment workers, notification senders or Blob operations against restored data.

### 5.2 Fresh clones; no source recreation or overwrite

Use a maintenance connection to postgres, never restore into the source database.
For each attempt generate a new name. The following template is for an operator
after the authentication blocker is resolved; it was **not** run:

```powershell
$qaBin = 'C:\Program Files\PostgreSQL\18\bin'
$qaRole = '<approved-existing-local-role>' # role name only; no password here
$qaTarget = 'batch18_rehearsal_' + [guid]::NewGuid().ToString('N')
& "$qaBin\createdb.exe" -h 127.0.0.1 -p 55432 -U $qaRole -w `
  --maintenance-db=postgres --template=restore_3dkid_batch18 $qaTarget
if ($LASTEXITCODE -ne 0) { throw 'Fresh clone creation failed; STOP.' }
```

createdb must fail on an existing target. Never use DROP DATABASE, --clean,
--if-exists, initdb, ALTER DATABASE on the source, or a restore over an existing DB.
Template copying can fail if other sessions use the source or ownership is
insufficient. Stop; do not terminate other sessions, change source permissions or
force a copy. A template clone copies actual restored schema/data, not a schema
regenerated from Prisma. Ownership/global roles are not newly provisioned.

Create separate fresh targets for clean success, injected rollback and behavioral
fixtures. Do not run application behavior tests against restore_3dkid_batch18 or
pollute the clean success clone with synthetic orders/products.

### 5.3 Before-image and clean migration

1. In a read-only session on the protected source, obtain metadata, all fourteen
   table counts and private product-ID/digest pairs. Do not print names, contact
   details, credentials or row JSON. Confirm 14/31/11 and 5/0/0; any difference stops
   the reviewed run. Record the schema fingerprint from the reviewed preflight.
2. Obtain the same evidence on the new clean clone. Exact schema, counts and all
   five product digests must match before any migration. Do not read secret-bearing
   User/Account/Session rows; aggregate counts suffice there.
3. Inspect the actual source schema against baseline/model definitions, not counts
   alone. Set the reviewed nonsecret session assertions in the clone connection:

```sql
SELECT set_config('batch18.execution_mode','LOCAL_REHEARSAL',false);
SELECT set_config('batch18.expected_database','<fresh-clone-name>',false);
SELECT set_config('batch18.expected_role','<reviewed-local-role>',false);
SELECT set_config('batch18.expected_schema_fingerprint','<reviewed-32-hex-fingerprint>',false);
```

4. In that same psql session run the candidate using -X and ON_ERROR_STOP=1,
   with explicit host/port/user and the fresh target. For example, an operator
   settings file containing only the assertions above can precede the candidate:

```text
psql -X -w -h 127.0.0.1 -p 55432 -U <local-role> -d <fresh-clone>
  -v ON_ERROR_STOP=1 -f <private-nonsecret-settings.sql>
  -f docs/review/batch-1.8-production-candidate.sql
```

5. A zero exit code is necessary but insufficient. From a new read-only connection,
   verify 16/42/16, exact new column definitions/defaults/nullability, FK actions,
   all relevant index readiness/validity, three CHECK definitions, five qualified
   function definitions/search_path/invoker behavior and eleven trigger events/
   timing/enabled states. Inspect pg_constraint.condeferrable/condeferred/convalidated
   for both named selection ownership FKs. Compare definitions to the reviewed body.
   An empty Prisma relational diff alone does not inspect these SQL-only safeguards.
6. Compare all original table counts and every original product ID/digest against
   the before-image. Before digest expression: md5(to_jsonb(p)::text). After:
   md5((to_jsonb(p)-'optionMode'-'variantRevision')::text). Return only ID/digest
   pairs privately; record only **5/5 matched** and aggregate discrepancies in the
   report. Verify all five mode/revision values are LEGACY/0. Repeat the source
   read-only fingerprints to establish it was not changed by the rehearsal.

### 5.4 Failure injection and rollback

Use a second fresh source clone, never the clean migrated target or source.
First test missing/wrong manifest rejection and confirm no DDL persisted. Do not
execute a negative migration test against the protected source even though its
guard would reject it.

Copy the candidate to a private temporary file, replacing **only the final
COMMIT statement** with this deliberate failure followed by COMMIT:

```sql
DO $$ BEGIN RAISE EXCEPTION 'B18_REHEARSAL_FORCED_ROLLBACK'; END $$;
COMMIT;
```

Run with the same reviewed local settings and ON_ERROR_STOP=1. Require nonzero
exit; disconnect ensures rollback. From a new session confirm the pre-migration
schema fingerprint, 14 tables/31 indexes/11 FKs, absence of all new native types/
tables/columns/functions/triggers and exact original row/product digests. Do not
report rollback PASS merely because an exception occurred. Repeat application
invalid-write tests with final constraint flush: Save must reject before any
post-save effects, with previous fields unchanged. Preserve the successful
candidate file; do not inject errors into it in place.

### 5.5 Application/behavior matrix on the third disposable clone

Prepare synthetic fixtures only in the third clone. The clean migration clone
and source retain their original five records. Required execution evidence:

- Read all five actual restored products via the new Prisma/public projection;
  verify unchanged LEGACY pricing/options. Test an ordinary clone-only legacy
  update in a transaction that is explicitly rolled back; verify original fields
  and revision afterward. Never convert the five restored products as a fixture.
- Add synthetic simple and explicit-size fixtures with a deliberately unrelated
  legacy modifier, v1/flat order snapshots before expansion, then verify them
  after migration. Real baseline contains no orders, so historical compatibility
  cannot be inferred from its empty Order table.
- Test SIMPLE, SIZE, COLOR and sparse COLOR_SIZE with full prices; missing,
  unavailable and retired combinations; same-ID restore and duplicate/ownership
  rejection. Use actual configuration helpers, not a parallel reference model.
- Verify child writes advance DB revision, stale editor comparison under parent
  lock rejects, direct epoch reset fails, and two actual sessions coordinate
  checkout SHARE/Admin UPDATE locks in both directions.
- Verify authoritative native order prices/FKs/v2 snapshots, immutable captured
  history, full product cascade without orders and blocked deletion with history.
  Run actual checkout actions only with explicitly mocked provider/notification
  delivery; no real payment or notification is permitted.
- Verify deferred bad combinations fail at the final SET CONSTRAINTS ALL IMMEDIATE
  and do not falsely report a successful Prisma Save. Do not rely on COMMIT-only
  error propagation. Retain the existing final-flush implementation.
- Recheck legacy hash goldens, paid-only cart clearing and Mono retry identity;
  mocked retry must create one invoice, while different colors differ.

Existing scripts/rehearse-batch18-variants.mjs and its guarded tests create their
own synthetic cluster; **do not weaken their target assertions or point them at
the source**. A clone-specific application-test adapter must preserve explicit
loopback/new-name checks, exact run ownership and mocked effects before it is run.
No such restored-clone execution or test adapter was validated in this blocked
stage. Prior Stage 1B tests remain prior evidence, not these new PASS results.

## 6. Read-only Neon preflight — future operator authorization only

Prepared `docs/review/batch-1.8-neon-preflight-readonly.sql`; it has not been run.
It uses BEGIN READ ONLY, bounded timeouts, explicit identity/approval assertions,
metadata/fingerprint queries and aggregate counts. It does not read pg_authid,
password columns, customer rows, query text or parameters from active sessions.

After separate permission, the operator privately verifies Neon project/branch/
database/schema, actual pooled/direct target and current deployment SHA. Use an
approved read-only session outside recorded credential handling. Set nonsecret
session assertions for readonly_preflight_approved=true, expected_database,
expected_role, application_role and migration_role, then execute the file with
stop-on-error. Do not supply a Production URL or password to Codex.

Review exact schema/fingerprint, table counts, definitions, invalid indexes/FKs,
unexpected prior native objects, server version/extensions, RLS, owners, app-role
privileges/membership/bypass capabilities, migration-role DDL authority and open
transaction age. Verify the runtime role cannot disable guards or rewrite/delete
protected order history. All role names must exist; missing roles/permissions are
blockers, not a reason to grant privileges automatically. Compare to the actual
restored baseline, including definitions, before approving a final SQL revision.

## 7. Controlled Production sequence and rollback

1. Resolve local execution access without Codex handling passwords. Complete and
   sign the restored-baseline success, rollback and behavior matrix, including
   five-product comparison. **This mandatory gate is not yet met.**
2. Separately authorize and perform the read-only Neon target/schema/role preflight.
   Resolve drift, ownership, grant, lock-duration and transaction-pool risks.
3. Review a final target-bound execution revision under prisma/changes, retaining
   every body safeguard and transaction/postcondition check. Bind its target and
   schema fingerprint to approved preflight evidence; review its exact hash and
   application SHA. The current candidate still intentionally refuses Production.
   Obtain explicit owner execution approval and maintenance/stop/rollback plan.
4. Schema migration must precede any deployment of the new Prisma client, including
   an automatic Preview build sharing this database. A native-write flag does not
   remove the bridge's unconditional schema dependency. Native writes and Blob
   cleanup remain off. Use the separately approved SQL, explicit BEGIN/COMMIT and
   stop-on-error; rollback on timeout/failure. No db push, seed, implicit Prisma
   migration-history reset, product conversion or extra permission change.
5. Verify committed metadata, unchanged business counts/digests, LEGACY defaults,
   empty native tables and retained historical orders. Only then authorize later
   commit/push/release stages and deploy compatible application code. A push may
   trigger Preview; it is not a database-free action. Confirm actual deployment
   SHA/status and legacy cart/Admin/catalog/order behavior.
6. Inventory and verify all shared-database writers: Production/Preview aliases,
   old deployments, server actions, imports, scripts and direct SQL. Drain or
   prevent incompatible old writers before native conversion. Preserve existing
   pending-payment callbacks/recovery throughout; do not reprice attempts.
7. Native activation and conversion require a **separate** explicit approval after
   writer verification. Review exact business combinations/product IDs and monitor
   constraints, prices, timeouts, carts and retries. Perform the owner's manual
   live QA under its own permissions. Do not bundle cleanup activation.

Before DDL COMMIT: rollback restores the original schema; prove that locally.
After additive COMMIT but before native data: retain the new schema and roll back
only application code whose legacy compatibility is verified. After any native
products/variants/v2 orders: rollback must use a mode-aware bridge with native
readers, snapshots, identity/session support and server pricing. Flag=false is
not data rollback. Never drop the new schema, downgrade identities, delete orders,
rewrite completed payments or restore an old backup over newer live orders.

## 8. Accepted shared Production/Preview DB risks

Separate Preview DB isolation is **not required** for this batch, per owner.
The following risks are recorded, not converted into a hidden isolation gate:

- Preview actions can mutate the same catalog/orders and trigger real integrations
  if they inherit live settings. A Preview URL or a second database role is not
  data isolation. Avoid integration exercise outside the owner's intended live test.
- Automatic branch deployment before schema expansion can fail new reads/builds.
  Keep migration-before-new-client ordering even if only Production will be tested.
- Old Preview deployments remain mode-unaware writers until verified/drained.
  SQL fences fail closed for invalid native orders but do not repair old UI or
  guarantee graceful old-client behavior.
- Preview schema tooling, fixture scripts and native test data can affect Production
  on a shared connection. Never run clone/test scripts against that target.
- Shared pools, long transactions, locks and stale catalogs can affect live checkout
  during migration/activation. Observe timeouts and define an owner-controlled stop.
- Shared Blob assets and cleanup require their separate cross-environment scope
  safeguards. Cleanup remains disabled; no scope authorization is created.

No Vercel/Neon/Cloudflare settings were read or changed. No live secrets, payments,
notifications, Blob operations, commit, push, merge or deployment occurred.

## 9. Tests and final disposition

Executed offline:

```text
node scripts/verify-batch18-migration-artifacts.mjs
```

PASS — three offline groups: original guard/body preservation and candidate target
checks; matching read-only fingerprint without secret/customer-row queries; Prisma
model validation and exact generated additive DDL comparison. No PrismaClient or
DB SQL is used. This test expressly reports PostgreSQL execution as BLOCKED.
Focused ESLint on the new verifier, tracked/untracked whitespace, changed-file
credential/artifact scanning and all 57 existing-file preservation checks pass.

Current local artifact SHA-256 values (rehash the exact file for any later approval):

```text
a7046eadc6eebc858b139ff8b9fa1c9247e3663ba372f035be1cf31d8cbf1569  docs/review/batch-1.8-variants.sql
691e3774c2e5eaade02e864d14fd8518bdb5e61bf7a86a8731d9c32a9fa4c702  docs/review/batch-1.8-production-candidate.sql
0be460b0027a909716bfc92f05eb71f62ec298fcefa1b9e067d215592882ee8f  docs/review/batch-1.8-neon-preflight-readonly.sql
```

NOT RERUN: prior Stage 1B 20 PostgreSQL + 9 application groups, two-session tests,
browser/regression/type/build evidence. These used the earlier synthetic baseline
and cannot establish success on the restored Production schema. No app source
changed in Stage 1D, so another full build would not resolve authentication.

The original 17 deferred manual scenarios and 14 native scenarios remain pending
and unchanged. All work remains **unstaged, uncommitted and unpushed**. The local
cluster remains running; the protected restored database was not recreated or
modified by any SQL from this work. Production execution remains unauthorized.
**STOP after Stage 1D. Overall BLOCKED; no migration success is claimed.**

## 10. Latest resume — 2026-11-21; independent favicon work

The existing cluster was stopped. It was started with pg_ctl using exactly the
supplied PG18 data directory and 127.0.0.1:55432; no initdb or database recreation.
The startup log is outside the data directory. pg_isready confirmed accepting
connections. One non-interactive postgres connection then used the authorized
PGPASSFILE path, with inherited PostgreSQL connection variables cleared and
default_transaction_read_only=on. The password file was not inspected, printed,
copied, edited or exposed. The client rejected password authentication (exit 2).
No further authentication attempts or bypasses were made in this resume.

| Current requested verification | Result |
| --- | --- |
| Local server readiness | PASS |
| Local authentication | FAIL — PASSWORD_AUTHENTICATION_REJECTED |
| Disposable database creation | BLOCKED, not attempted |
| Migration execution / new schema validation | BLOCKED, not executed |
| Five existing products preserved by migration | BLOCKED, no authenticated comparison available |
| Failed migration / transaction rollback rehearsal | BLOCKED, not executed |
| Protected restored baseline | No authenticated SQL reached it; no data/schema writes or recreation |

The independent favicon task was completed despite this blocker. See
[favicon implementation and evidence](batch-1.8-favicon.md) for source provenance,
assets, actual Next metadata/HTTP/Chrome results and the complete current changed
file inventory. TypeScript, ESLint and the isolated production build passed for
that task; these results do not substitute for database migration execution.

This resume preserves all preceding application/SQL changes. Only this existing
report is extended; six favicon-related files are added, for **67 combined files**.
Native writes and Blob cleanup remain default-off, with no activation/configuration
change. No Neon, Production, Vercel, Cloudflare, payment, notification, commit,
push, merge or deployment action occurred. Stop after Stage 1D and favicon work.

## 11. Operator-assisted rehearsal prepared — 2026-11-21

**Prepared and validated offline; NOT EXECUTED.** The previous authentication
failure above remains historical evidence. No new PostgreSQL connection,
password prompt, clone, migration or rollback was attempted during preparation.
Actual migration, five-product preservation and rollback results remain BLOCKED
pending the operator's execution. This script does not authorize Production work.

From the repository root, run in an ordinary interactive Windows PowerShell window:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\operator\batch18-rehearse.ps1"
```

The process-only execution-policy flag is necessary on this workstation because
its default policy rejected script execution during offline verification. It does
not persist a policy change or alter PostgreSQL authentication. Do not dot-source
the script, record a transcript, or enter a Production password. Enter only the
LOCAL postgres password at the secure prompt. An authentication failure stops the
run; the script does not retry passwords or inspect existing credential files.

### Guarded execution and authentication

- The script accepts no host, port, connection-string or database overrides. It
  uses the installed PG18 psql binary, 127.0.0.1:55432 and the postgres role only.
  Before any write, it verifies PostgreSQL 18.7, the exact supplied data directory,
  the expected database, a primary server, and subsequently the same server-start
  timestamp. A mismatched identity fails closed.
- Read-Host -AsSecureString obtains the password once. Each psql process receives
  a child-only PGPASSWORD environment entry; no password appears in arguments,
  SQL, repository files, result JSON or console output. Inherited PG connection
  settings are removed from the child environment. PGPASSFILE points to a private,
  nonexistent path, so existing credential files are not used. No parent process
  environment variables are changed. The BSTR is zero-freed, child environment
  entries are cleared in finally, and the SecureString is disposed at the end.
  As with any environment-based libpq authentication, plaintext exists briefly
  in process memory; this is not a guarantee against a privileged local debugger.
- Connections to restore_3dkid_batch18 are read-only. Source preflight requires
  14 public tables, 31 indexes, 11 foreign keys, five products, zero options and
  zero orders. Unexpected user triggers, event triggers, foreign servers,
  subscriptions, unreviewed extensions or invalid indexes stop execution.
- Three UUID-named batch18_rehearsal_<32 hex characters> databases are cloned
  from the protected baseline: a clean migration, a separate forced-rollback
  target, and a synthetic legacy/native compatibility target. No existing database
  is overwritten or dropped. All mutation helpers require names generated and
  registered by this run. CREATE DATABASE is the only permitted maintenance write.
- All three existing reviewed SQL artifacts are SHA-256 pinned. The original
  guarded SQL and local migration candidate are unchanged. Execution supplies the
  existing LOCAL_REHEARSAL manifest, role, database name and schema fingerprint.
  A missing-manifest negative test must fail without changing its clone.
- Post-migration inspection checks the added columns, enums, index definitions,
  ownership foreign keys, deferred constraints, trigger definitions and stored
  guard bodies. All original table counts, five full product-row hashes, gallery
  rows and product attributes are compared privately; customer rows are not
  printed or included in results. The protected source is checked again at the end.
- A separate clone receives synthetic pre-migration legacy options and v1/flat
  historical orders. Native tests exercise all modes, sparse combinations,
  absolute prices, invalid ownership, stable identities, retirement/restoration,
  revision guards, order acceptance, immutable v2 snapshots, protected historical
  orders and full-product cascades. These behavioral edits are rolled back.
- A malformed native write must fail at SET CONSTRAINTS ALL IMMEDIATE and leave
  its migrated clone unchanged. The independent rollback clone must reach an
  injected B1801 exception immediately before the candidate's final COMMIT and
  retain the original schema fingerprint and data. This injection exists only in
  the in-memory rollback test; it does not edit the migration artifact or its guards.

### Results, inspection and scope

The script prints check names/statuses, safe error codes, generated database names
and a result-file path. It suppresses raw psql diagnostics and customer data.
Sanitized results are retained outside the repository at:

```text
%LOCALAPPDATA%\3dkid-batch18-rehearsal-results\<run-id>\result.json
```

Temporary SQL has private per-user permissions and is removed in finally only
after exact run-directory/ownership checks; it never contains credentials.
Rehearsal databases are deliberately preserved for inspection. There is no
automatic database cleanup option. A failed run may leave partially completed
rehearsal databases; their names are reported for review. Do not delete or recreate
the protected restored baseline. Share the sanitized result JSON and exit status
for the next report update, never a password or credential file.

This is a SQL-level rehearsal. It does not execute application actions, deliver
notifications, invoke Mono, prove a new two-session concurrency run, or replace
the earlier application/browser regressions. Any unexpected baseline or artifact
failure requires review; do not remove safeguards simply to obtain PASS.

Offline verification actually executed:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\verify-batch18-operator.ps1"
```

**PASS: seven offline groups on Windows PowerShell 5.1.26100.9711.** They cover
syntax, fixed-instance guards, owned-target restrictions, child environment
authentication/cleanup with a generated fake SecureString, mocked fresh-clone
creation, temporary cleanup ownership and static rollback/lifecycle checks.
No PostgreSQL client process is launched by this verifier. These results are
not evidence that the migration itself passed.

This preparation adds scripts/operator/batch18-rehearse.ps1 and
scripts/verify-batch18-operator.ps1, and appends only this section to the existing
rehearsal report. The preceding 67-file work is preserved, for **69 combined
modified/untracked files**. No application, favicon, migration or dependency file
was changed in this preparation. All work remains unstaged, uncommitted and
unpushed. Neon, Production, existing databases, Vercel/Cloudflare settings and
Blob cleanup activation were untouched. Stop here and await operator results.

## 12. First operator execution and script correction — 2026-11-21

The operator supplied sanitized run 999ffae3684d4143a37aecab0ae4b15d:
ServerIdentity BLOCKED, B18_OP_UNOWNED_WRITE_TARGET, exit 1. Its database list is
empty and all subsequent checks are BLOCKED. This is not a migration PASS.

Root cause: PowerShell variable names are case-insensitive. The script-scope
snapshot initializer `$baseline = $null` overwrote the protected database-name
variable `$script:Baseline`. The ServerIdentity call still bound ReadOnly=true,
but its typed string Database parameter received an empty string. New-PgProcessInfo
then saw a name unequal to both the now-null baseline and postgres, and correctly
called Assert-Clone, which rejected it before a PostgreSQL process was created.
This was a variable identity defect, not a reason to relax the ownership guard.

The snapshot variable and all its consumers are now `$baselineSnapshot`.
`$script:Baseline` retains the literal restore_3dkid_batch18 throughout the run.
Assert-Clone, the baseline write prohibition, process authentication handling,
exact local-instance identity checks and all migration artifacts are unchanged.
No PostgreSQL connection, database creation or migration was executed while fixing
this defect, and no real password or credential file was accessed.

The focused regression first reproduced the original failure (FAIL before the
fix), then passed after the rename. It extracts the actual top-level initializers
and ServerIdentity call from the script AST, executes that call through the real
Invoke-PgSql helper, and mocks only New-PgProcessInfo to stop before process
creation. It verifies the exact restored database name, true read-only flag and
generated identity SQL, and rejects baseline writes and unowned disposable writes.
The process-info tests also reject unowned disposable names in both access modes.
This covers the script initialization/call path missing from the original tests.

Executed verification: **PASS, eight offline safety groups on Windows PowerShell
5.1.26100.9711**, including the new regression, plus PowerShell syntax and whitespace
checks. No actual SQL execution is represented by these results. The next operator
run must use the same command in section 11; it creates new uniquely named targets
and leaves prior result reports untouched. Record its actual results before making
any migration-readiness claim. All work remains unstaged, uncommitted and unpushed.

## 13. LegacyHistory investigation and fixture correction — 2026-11-21

### Actual operator evidence

Read the sanitized result for run 95bdc2880d9341f89753773cd8139993. It records:

| Verification | Operator execution result |
| --- | --- |
| ServerIdentity / Baseline / FreshClones / CandidateGuards | PASS |
| Clean-clone Migration / SchemaIntegrity / FiveProducts | PASS |
| LegacyHistory | FAIL — B18_OP_SQL_23514 |
| NativeIntegrity / DeferredFailure / MigrationRollback | BLOCKED, not reached |
| SourceUnchanged | PASS |
| Overall | FAIL, exit 1 |

The three reported disposable targets remain preserved. This investigation did
not connect to them, alter them, or attempt cleanup. No usable agent-side
authentication was available: the operator's password was process-scoped, and the
earlier passfile workflow had failed. No password was requested/retrieved and no
credential file was inspected or retried. Consequently direct catalog inspection
of the preserved targets is **NOT TESTED**. Do not describe the complete rehearsal
as successful merely because the clean migration passed.

### Precise source-level cause and failing operation

The failing operation is the first `INSERT INTO public."Order"` in
`HistorySeedSql`, during **LegacyHistory / SeedFixtures**, before the compatibility
clone's migration. That insert omitted both number and checkoutAcceptance.
The restored application's existing acceptance schema defaults checkoutAcceptance
to LEGACY and number to NULL. Its independently maintained PostgreSQL constraint,
`Order_checkout_acceptance_check`, requires:

```sql
("checkoutAcceptance" = 'LEGACY' AND "number" IS NOT NULL)
OR ("checkoutAcceptance" = 'ACCEPTED' AND "number" IS NOT NULL AND "acceptedAt" IS NOT NULL)
OR ("checkoutAcceptance" = 'PROVISIONAL' AND "number" IS NULL AND "paymentReference" IS NOT NULL)
OR ("checkoutAcceptance" = 'REVIEW' AND "paymentReference" IS NOT NULL)
```

For the old fixture all four branches are false. This is a normal, immediate
PostgreSQL CHECK violation (23514), not a Batch 1.8 variant trigger. At this point
the compatibility clone is still on the baseline schema and has no Batch 1.8
triggers. The later migration, seeded-data comparison and snapshot-verification
substeps cannot run after this failed statement. Since the seed runs in BEGIN /
COMMIT with ON_ERROR_STOP, connection exit rolls the failed transaction back;
this rollback is expected from control flow, not a newly executed inspection of
the preserved clone.

The old JSON contains only SQLSTATE, not a constraint name or substep. The exact
constraint diagnosis follows from the checked-in acceptance DDL, Prisma defaults,
fixture values and deterministic phase ordering; no newly captured raw database
error is claimed. The corrected script adds explicit diagnostic evidence for the
next run rather than fabricating it for the old report.

The earlier Stage 1B synthetic harness generated its baseline from Prisma's
datamodel. That does not reproduce this manually added SQL CHECK; the historical
fixtures could therefore pass there and fail on the restored real schema.

### Correction and compatibility impact

Only local synthetic test data and operator diagnostics changed:

- HistorySeedSql explicitly inserts number B18-LOCAL-HISTORY and acceptance LEGACY.
- BehaviorSql's later synthetic order had the same omission; it now uses the
  distinct number B18-LOCAL-NATIVE and acceptance LEGACY. Fixing only the historical
  fixture would leave the same failure waiting in NativeIntegrity.
- Both remain unaccepted, provider-free fixtures with LOCAL_TEST_NO_DELIVERY;
  acceptedAt, invoice/reference fields and notifications are not populated. No
  real application order-number allocator or provider is invoked.
- Existing historical OrderItem JSON, legacy size IDs, absolute size price 199,
  modifier 987.65, missing-price fixture and product prices are unchanged. There
  is no update/rewrite of a real historical order or business record.
- **Application code and migration SQL are unchanged.** All three reviewed SQL
  SHA-256 values in section 9 remain identical. No constraint, trigger, target
  guard, retention setting or baseline protection was weakened.

LegacyHistory now tracks SeedFixtures, CaptureSeededSnapshot, MigrateSeededClone,
CompareSeededData and VerifyHistoricalSnapshots separately. A failure records the
current one in FailureSubstep. psql verbose diagnostics are captured privately in
memory only; the parser exports a SQLSTATE and an allowlisted CHECK/Batch 1.8 guard
name into SqlFailure. DETAIL, CONTEXT, statements, arbitrary identifiers/messages
and row values are never printed or written to results. Unknown identifiers become
UNCLASSIFIED. Verbosity does not enable server logging or change authentication;
the existing connection-local log suppression remains in place. Expected negative
tests do not create a SqlFailure record unless Require-Success actually fails.

### Executed regression evidence and remaining execution

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\verify-batch18-operator.ps1"
```

**PASS: ten offline groups on Windows PowerShell 5.1.26100.9711**, plus syntax and
whitespace checks. The added fixture regression first FAILED on the original
HistorySeedSql, then passed after the correction. It extracts both real fixture
Order inserts and evaluates the small boolean grammar from the actual checked-in
acceptance CHECK (including its LEGACY default). It also confirms that the old
unnumbered fixture is rejected and the corrected provider-free fixtures have
distinct numbers. This is an explicit offline evaluation, **not a PostgreSQL
execution test**. Diagnostic tests verify allowlisted constraint/guard reporting,
SQLSTATE retention, and exclusion of synthetic private row data/unknown messages.
The eight prior ownership, exact-instance, binding and authentication-cleanup
groups continue to pass.

Also rerun: `node scripts/verify-batch18-migration-artifacts.mjs` — **PASS, three
offline groups**, including preserved guard/body hashes, matching read-only
fingerprint and Prisma 5 validation/additive-DDL agreement. Its reminder that it
does not execute PostgreSQL is not a replacement for the operator evidence above.

A **complete fresh local operator rehearsal is required**, because native behavior,
deferred-failure rollback and whole-migration rollback were not reached. Do not
reuse or modify the three preserved databases. The script generates new targets
and preserves those too. From the repository root, the operator should run:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\operator\batch18-rehearse.ps1"
```

No full database rehearsal was automatically rerun during this investigation.
Changed files in this correction are scripts/operator/batch18-rehearse.ps1,
scripts/verify-batch18-operator.ps1 and this report; combined file count remains 69.
All other pre-existing files are preserved. Everything remains unstaged,
uncommitted and unpushed. No Neon, Production, restored-baseline SQL, real payment,
notification, deployment, infrastructure change or Blob cleanup activation took
place. Stop after correction and wait for the next sanitized operator result.

## 14. NativeIntegrity 23001 investigation — 2026-11-21

### Executed operator evidence and exact source trace

Read sanitized run e6d46f9462a043d9804d678f57ab076a. ServerIdentity, Baseline,
FreshClones, CandidateGuards, Migration, SchemaIntegrity, FiveProducts and
LegacyHistory are PASS. NativeIntegrity is FAIL with B18_OP_SQL_23001;
DeferredFailure and MigrationRollback were not reached. SourceUnchanged is PASS.
The old report's FailureSubstep is empty and its constraint Identifier is
UNCLASSIFIED; it does not identify which of the two historical FKs fired first.
The existing restored baseline and all preserved rehearsal databases were left
untouched. No PostgreSQL connection or authentication attempt was made here.

Tracing the actual BehaviorSql identifies **HistoricalOrderDeleteProtection**:

```sql
DELETE FROM public."Product" WHERE id='batch18_operator_color_size';
```

This is the intentional deletion of the synthetic native product after inserting
its immutable OrderItem, checking snapshot immutability and renaming its color.
It is distinct from the later deletion of the unreferenced COLOR fixture. Other
earlier expected-negative tests insert invalid rows or update non-key fields;
their guards/CHECKs/FK inserts do not account for an unhandled RESTRICT delete.

The current SQL caught only foreign_key_violation (23503) around this DELETE.
PostgreSQL 18 deliberately changed RESTRICT FK violations to restrict_violation
(23001). This is documented in the official
[PostgreSQL 18 compatibility notes](https://www.postgresql.org/docs/18/release-18.html).
The handler therefore let the expected rejection escape and failed the script.
This is a **test exception-dispatch defect**, not evidence of a defective migration
or a reason to remove historical-order protection.

The existing OrderItem-to-Product FK protects the parent. The candidate additionally
uses OrderItem_productId_productVariantId_fkey with ON DELETE RESTRICT, so a parent
delete cascading into ProductVariant must also respect historical item references.
Either OrderItem_productId_fkey or that new composite FK can reject the parent
delete, depending on constraint-trigger order. The old report cannot distinguish
them, and no independent catalog/error inspection is claimed. Both are legitimate
historical dependencies; unrelated ownership FKs must not count as this test's
success.

### Narrow correction and historical retention assertions

The DELETE's own exception block now catches exactly foreign_key_violation OR
restrict_violation, reads CONSTRAINT_NAME with GET STACKED DIAGNOSTICS, and counts
the rejection only for those two named OrderItem FKs. A missing/unknown/unrelated
constraint is rethrown with bare RAISE. No generic integrity-class handler was added,
and there is only one restrict_violation catch in BehaviorSql. A deletion that
unexpectedly succeeds still raises B18_LOCAL_HISTORY_DELETED. CHECK/trigger errors
and unrelated SQLSTATE 23001 failures still terminate the run.

After the expected rejection, SQL now explicitly requires the product, native
variant, order, OrderItem and both variant selections to remain present, with the
item's product/variant/order IDs, price 199, quantity 1 and exact stored snapshot
unchanged. It then verifies archival retains the item. These are new runtime
assertions to be executed by the operator, not newly claimed PostgreSQL PASSes.
The saved immutable snapshot is read into the separate historical-test DO block;
it is never regenerated from the renamed current labels. All blocks still share
the original outer BEGIN / ROLLBACK, without an intermediate COMMIT.

No migration, Prisma model or application file was edited. All three reviewed SQL
artifact hashes remain identical. No FK, CHECK, trigger, price guard, writer lock,
identity rule or default-off setting was weakened. Actual historical orders,
payments and notifications are not accessed or rewritten.

### Sanitized NativeIntegrity progress

BehaviorSql emits fixed SELECT markers before NativeFixtures,
FlushFixtureConstraints, VariantAndOrderAssertions, HistoricalOrderDeleteProtection,
UnreferencedProductCascade and NativeTransactionRollback. These contain no row
values and indicate attempted substeps, not PASS. The private client-output parser
accepts only exact standalone markers from that allowlist and retains the latest
one. Unknown markers and strings embedded in JSON/rows are not exported.

A subsequent unhandled SQL error records that safe substep in FailureSubstep and
exports an allowlisted FK name if available. Outside the SQL body, BehaviorSql and
VerifyNativeRollback are fallback substeps. Generic client error handling still
throws B18_OP_SQL_23001 on any nonzero unhandled result. Raw stdout/stderr, row
details and credentials are not written to the report or console. Expected caught
errors inside the protected-delete assertion do not create a failed SQL result.

### Verification and next operator execution

- **PASS — twelve offline operator groups** on Windows PowerShell 5.1.26100.9711.
  The new regression first FAILED against the original handler because 23001 was
  absent, then passed after correction. It extracts the actual DELETE handler,
  models dispatch for both documented states, verifies the exact FK allowlist,
  rejects unrelated states/constraints and requires retained-history assertions.
  This is an offline model, not a new PostgreSQL concurrency or SQL execution test.
- **PASS — Native progress/diagnostic regression** within those twelve groups:
  safe FK/substep extraction, unknown/embedded marker rejection, private-row
  exclusion, actual marker ordering, and unhandled 23001 still fatal at the client.
- **PASS — three migration-artifact groups**: unchanged original guards/body,
  read-only fingerprint agreement, Prisma 5 validation and additive-DDL agreement.
- **PASS — PowerShell syntax and whitespace checks.** The other 66 existing files
  remain byte-for-byte unchanged. No full application build was repeated because
  this correction does not change application source or dependencies.
- **NOT TESTED in this correction — actual corrected SQL on PostgreSQL.** No full
  rehearsal or database write was automatically executed. The clean migration and
  LegacyHistory PASS evidence above belongs to the operator's prior run; the
  complete NativeIntegrity, DeferredFailure and MigrationRollback still require
  successful operator execution before migration readiness can be claimed.

Changed files: scripts/operator/batch18-rehearse.ps1,
scripts/verify-batch18-operator.ps1 and this report. Combined changed-file count
remains 69; all work is unstaged, uncommitted and unpushed. The next command creates
new disposable databases and preserves every prior database and result report:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\operator\batch18-rehearse.ps1"
```

Stop here and wait for the new sanitized operator result. No Neon, Production,
Vercel/Cloudflare setting, Blob cleanup activation, real payment, notification,
commit, push, merge or deployment operation occurred during this correction.

## 15. Stage 1D completion and Production preparation — 2026-11-22

The owner confirms the final November 21 run passed ServerIdentity, Baseline,
FreshClones, CandidateGuards, Migration, SchemaIntegrity, FiveProducts,
LegacyHistory, NativeIntegrity, DeferredFailure, MigrationRollback and
SourceUnchanged, with exit code 0. Earlier failed-run sections remain historical
records and no longer describe an unresolved local rehearsal blocker. No existing
rehearsal or restored-baseline database was altered or cleaned up in this turn.

Production preparation is documented separately in
[batch-1.8-production-rollout.md](batch-1.8-production-rollout.md), with a separate
read-only preflight, unbound Production migration, cutover verification and optional
read-only baseline fingerprint query under docs/release. The original three review
artifacts and the rehearsed additive/trigger body are unchanged. The Production
wrapper is not execution-approved and has no live target manifest yet. It adds
explicit target/backup/ownership/history checks and controlled maintenance locks.

Current Production schema/roles/counts/writers, fresh backup and explicit write/
release approval remain prerequisites. Separate Preview isolation is not required;
shared-database writer/version inventory remains required. No Production SQL,
Git commit/push/merge, deployment, environment or infrastructure write occurred.
Native activation and Blob cleanup remain separately gated/default-off. No new
local rehearsal was performed or requested for the unchanged schema/trigger body.
