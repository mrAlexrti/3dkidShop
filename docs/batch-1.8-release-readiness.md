# Batch 1.8 Stage 1C — pre-release readiness and migration gate

> Latest combined-release review, 2026-11-22: source/artifact/regression checks
> PASS. The final corrected restored-baseline rehearsal is independently verified
> 12/12 PASS with all six current hashes. The local gate is complete; live Neon
> preflight, fresh backup and write/release approval remain outstanding. See
> [the current preflight report](batch-1.8-production-readonly-preflight.md).
> Sections 10–12 retain the earlier failures, corrections and evidence.
> A guarded operator-only collector and Windows procedure are now prepared in
> [the handoff](batch-1.8-production-preflight-handoff.md), with ten offline test
> groups PASS, including the owner's confirmed single shared database profile.
> No Production command was executed; collection is not write approval.
> Sections 1–9 retain the historical Stage 1C evidence and inventory.

Review date: 2026-11-17. Repository: `mrAlexrti/3dkidShop`.
Branch: `feat/batch-1.8-color-size-variants`.
Baseline and unchanged feature HEAD: `76621cf01ebe482bfee9a80aaed4a4b5b9dfed22`.

**Code review PASS. Review-only SQL/model integrity PASS. Push/deployment,
restore rehearsal and Production migration readiness BLOCKED.**

This stage adds this report only. The original 56 changed/untracked files were
reviewed and their content fingerprints checked for preservation. No source or
SQL correction was needed. There are now **57 combined changed/untracked files**,
all unstaged. Stage 1A/1A.5 sections in the architecture report are historical;
the Stage 1B implementation report describes the completed local bridge.

## 1. Readiness matrix and evidence boundaries

| Area | Result | Evidence / limitation |
| --- | --- | --- |
| Source scope and review | PASS | All 56 existing files accounted for below; changes are variant schema/runtime/UI/cart/order compatibility and isolated tests/reports. No dependency, environment, scheduler, provider reconciliation or unrelated source change |
| SQL/model integrity | PASS, review only | Offline Prisma 5.22 validation and generated additive DDL comparison against actual schema; additional SQL guards reviewed; Stage 1B real PostgreSQL evidence reused |
| Application compatibility | PASS locally | Unchanged Stage 1B code; fresh focused identity/cart/availability/default-off regressions pass; previous actual PostgreSQL, browser, type/lint/build evidence retained |
| Backup restore readiness | BLOCKED | Snapshot and readable 14-table custom archive reported by owner; complete isolated restore and comparison evidence absent. Instructions below are prepared, not executed |
| Preview push/deployment safety | BLOCKED | Automatic Git deployment, actual Preview database and branch overrides, integration connections and existing deployment consumers cannot be independently established from this workspace |
| Production migration readiness | BLOCKED | No execution approval, target-specific execution artifact, live drift/role/lock assessment, full restore proof or verified writer/environment inventory |
| Native activation | BLOCKED, default off | Server/UI require literal PRODUCT_VARIANTS_ENABLED=true for native configuration writes; live setting not inspected. Native adoption requires separate approval after bridge rollout and writer drain |
| Blob cleanup | Independently BLOCKED, default off | No lifecycle code/configuration changes; no cleanup enable/scope authorization granted or inspected |
| Live/manual QA | Pending | Original 17 scenarios unchanged; 14 native scenarios remain in batch-1.8-manual-qa.md. Synthetic/browser execution does not count as live QA |

No Neon connection, existing-database query, SQL execution, restore, application
deployment or live integration test was performed in Stage 1C. No secrets were
requested, displayed, pulled from Vercel or put in this document. Git remote refs
were checked read-only: Production remains at the baseline and main remains
`3bf9ce0955040535db1e42ea161d0d27a80fb160`.

## 2. Final review findings

### R1 — schema dependency is unconditional: push is a deployment gate

Disabling native writes is **not** a schema compatibility switch. The new Prisma
client expects added Product fields, OrderItem.productVariantId and new relations.
Home/catalog/detail reads use publicProductInclude and native offer projections;
Admin edit and cart reconciliation read the new fields/relations regardless of the
flag. Price sorting explicitly references public.ProductVariant and optionMode.
Checkout reads the variant graph and inserts the new FK for native option orders.
Even some unrelated Prisma model reads may select added scalar fields implicitly.

Consequently the bridge must not run against an unexpanded database. An isolated
build with empty Prisma read fixtures proves compilation, not schema readiness.
The ordinary `npm run build` is not that isolated fixture runner and may perform
database reads during build/prerender as well as runtime requests later.

Vercel's GitHub integration deploys pushes by default. Non-production branch pushes
normally create Preview deployments. These facts do not establish this project's
actual settings. [Vercel Git integration](https://vercel.com/docs/git/vercel-for-github),
[Vercel environments](https://vercel.com/docs/deployments/environments).

Local evidence: no vercel.json or .vercel/project.json; package postinstall generates
Prisma client and build invokes Next, without an automatic migration. The only
active repository workflow is the existing Nova Poshta scheduled/manual workflow;
it does not establish Vercel Git settings and was not changed or invoked.
No Vercel metadata-only tool is connected here. Environment files/secrets were not
pulled. Absence of a repository deployment workflow does not disable Vercel's Git
integration or deployment hooks.

**Do not push while this gate is BLOCKED.** A push requires either separately
authorized, verified prevention of automatic deployments for this branch across
all connected projects, or an explicitly verified safe deployment target with its
own already-approved expanded schema, isolated credentials and provider effects
disabled. Source inspection alone establishes neither condition.

### R2 — compatibility, pricing and payment identity: reviewed

- LEGACY is the additive default. Existing group/value IDs and absolute size prices
  remain unchanged. Null-price modifier rows are not implicitly converted. Native
  conversion is explicit, gated and revision-checked. SIMPLE uses base price;
  SIZE/COLOR/COLOR_SIZE use a configured full price with no base fallback.
- Canonical variant identity includes stable dimension/value IDs, not translated
  labels. Repeated identical additions merge; different tuples stay separate;
  retired or invalid tuples fail reconciliation and checkout.
- Effective legacy/native minimum prices are ordered in SQL before LIMIT/OFFSET.
  Page IDs, count and relation reads share Repeatable Read. The currently supported
  active/category/search predicates match the page's count predicates; future
  filter additions must update both paths. Equal prices use ID tie-breaking and
  missing offers sort last. A realistic load plan is still required.
- Checkout holds sorted Product SHARE locks and resolves current selection,
  availability and Decimal-to-minor-unit prices on the server. Admin/child writers
  take Product UPDATE locks, so native price/availability edits cannot slip through
  an accepted checkout transaction. Client prices are at most reviewed quotes.
- The simple/size identity serialization is unchanged. Native SIZE retains old
  size wire IDs; colors have distinct tagged identities. Existing Mono attempts
  replay before catalog repricing and do not generate a second invoice. Payment
  provider, acceptance/reconciliation, COD accounting and notification behavior
  were not refactored. Test invoice/notification effects were mocked.
- New native orders store a variant FK and immutable version-2 bilingual snapshot.
  SQL protects captured identity/name/options/price/quantity. Original Product FK
  remains; v1 and flat historical snapshots remain readable. No historical order
  or completed payment is rewritten during conversion or rollback.

### R3 — cart and Admin reliability: reviewed

New carts use stikr-cart-v2 and import the old key once without destroying it.
Older tabs cannot overwrite the new color selection key. Unknown/partially
importable carts retain original storage and visibly block checkout; storage
failure is a recovery state. Images are placeholders until authoritative
verification. Reconciliation errors preserve selections and block checkout;
mutation/revision/request checks prevent stale responses from winning.
Existing price-review and cart total/quantity limits remain in force.

The controlled configuration editor and existing AdminForm submit handler retain
drafts on validation, network and stale-revision errors. Nested errors focus the
affected control after pending controls are re-enabled. Existing gallery IDs,
manual URLs, uploads and media write locks/retirement are retained. English labels
and notes use existing Ukrainian fallback; new UI strings are centralized UA/EN.
There is still one cart button per catalog card and no catalog quantity stepper.

Known limitations remain: old-tab edits after one-time import are not continuously
merged; exact paid-cart matching may conservatively leave a modified cart intact;
malformed storage needs explicit recovery. Retired history payloads are paged but
Admin/checkout graph reads can grow with lifetime history. Production pool,
transaction-duration and realistic catalog/history performance are not certified
by the small synthetic fixtures.

### R4 — constraints and write completion: reviewed

Prisma 5.22's locally reproduced deferred-COMMIT failure is not assumed to throw.
createProduct, updateProduct, deleteProduct, archiveProduct and createOrder end
their relevant successful write callbacks with SET CONSTRAINTS ALL IMMEDIATE.
No SQL follows that flush within those callbacks. Cache invalidation, media cleanup
scheduling and invoice creation happen after successful transaction resolution.
Failed/no-write early returns cannot authorize unsafe post-save effects.

Other app transactions that update only Orders/payment state, categories or content
do not mutate the new deferred product graph. Future writers must use the same
lock order, expected revision, final flush and role restrictions. Existing seed,
maintenance, old deployments and direct SQL tools are not approved native writers.

## 3. Migration artifact gate

The actual and review Prisma models agree ignoring explanatory comments. Offline
Prisma-generated DDL from the approved baseline to the actual schema agrees with
the review SQL's generated additive portion after removing public qualification,
comments and whitespace. Nothing was applied to a database for this comparison.

| Invariant | Review disposition |
| --- | --- |
| Ownership | Composite variant/product, option/product and value/option FKs; an option value cannot belong to a different product's tuple |
| Uniqueness | Unique product/kind (NULL legacy kinds remain legal), product/canonical key including retired rows, product/id and option/id keys; selection PK permits only one value per group |
| Integrity | SQL-only deferred validation enforces exact canonical tuple, dimension/mode shape, typed groups, value bounds and retirement consistency at final state |
| Locks/epochs | Product UPDATE identity/epoch guard and four child guards; child writes coordinate on Product, cannot move identities, and advance DB revision. Application takes media lock before Product locks and compares expected epoch |
| Retirement | No repurposing or individual hard deletion of persisted native identities; restore resolves the original tuple and ID. Whole-product cascade allowed when history permits |
| Orders/deletion | Native order insertion price/snapshot/availability fence; immutable captured v2 fields; required historical Product reference plus native variant RESTRICT FK; complete product cascade without orders |
| Schema qualification | public-qualified tables/types/functions; pg_catalog function search_path; Prisma connection must target the reviewed public schema |
| Deferred FKs | Selection-to-option and selection-to-value are NO ACTION, DEFERRABLE INITIALLY DEFERRED, enabling a completed whole-product cascade without weakening history protection |
| Transaction handling | BEGIN/COMMIT around DDL; short lock/statement timeouts; mandatory application final constraint flush; prior injected DDL rollback test retained |
| Default safety | All existing products remain LEGACY; added retirement/native order fields NULL; new variant tables initially empty; no business conversion/backfill |

Five new FK constraints, three CHECK constraints, two new enum types, two new
tables, nine explicit indexes plus two new primary-key indexes, five guard/validator
functions and eleven triggers must be accounted for in the final target review.
Prisma's model alone does not represent the CHECKs, trigger bodies or deferrability.
Generating client or synchronizing model tables is not an alternative to preserving
the complete reviewed SQL safeguards.

**Artifact execution status: BLOCKED.** docs/review/batch-1.8-variants.sql remains
prominently NOT APPROVED FOR PRODUCTION EXECUTION. Its loopback/name/synthetic
sentinel guard must stay intact. A new target-specific artifact and separate owner
approval are required; do not remove the guard to make this file run in Production.
Follow the repository's reviewed prisma/changes convention. Do not initialize new
Prisma migration history implicitly, reset, schema-push or seed an existing DB.

Live preflight must inspect public schema, version, existing constraints/triggers,
unexpected object-name collisions, default privileges/RLS, role ownership and all
consumers. The runtime must be a nonowner without superuser, trigger bypass,
replication-role override, schema CREATE/ALTER/TRUNCATE or owner-role membership.
SECURITY INVOKER guards require the corresponding Product/child table privileges,
function EXECUTE and type/schema USAGE. Preserve OrderItem immutability and history
DELETE restrictions. The synthetic role had broad remaining CRUD grants; it is
not a least-privilege Production grant script or proof of live permissions.

DDL/index validation on existing tables can block writes and queue readers behind
locks. Row counts, long transactions, pool behavior and the lock window need actual
assessment. If a concurrent-index phase is needed, review it separately; it cannot
silently replace transactional index creation or run inside that transaction.

## 4. Preview/environment operator checklist

Collect metadata-only evidence, dated and signed by the operator, without copying
connection strings, tokens, password values, customer data or secret screenshots.
All checks below involving live settings/DB need separate authorization.

| Required evidence | What to establish | Current status |
| --- | --- | --- |
| All connected Vercel projects | Correct Git repository, Production branch, branch deployment rules, ignored build rules, deployment hooks and first/Preview target behavior | Unknown |
| Effective branch configuration | Preview defaults plus branch-specific overrides and Marketplace integration bindings; actual build/install commands and Node/Prisma versions | Unknown |
| Production DB identity | Neon project/branch/database/schema and runtime role; pooled/direct endpoints may identify the same DB | Unknown |
| Preview DB identity | Independently compare effective branch target with Production, using provider metadata privately; a different URL, hostname, role or Preview URL is not isolation proof | Unknown |
| Preview schema | Approved expansion exists on a separately approved Preview target before any new build/runtime database read | Unknown |
| Writer inventory | Every active/old Production and Preview SHA, old URLs/aliases/server actions, imports, scripts, scheduled jobs and direct writers | Unknown |
| Provider/storage isolation | Preview cannot send real payments, notifications, TTNs or write/delete shared Production assets; sanitized synthetic fixture data only | Unknown |
| Feature settings | Native writes off, cleanup off, no cleanup scope approval; record booleans/status, never token values | Defaults verified in code only |

Preview settings have their own scopes and can have branch overrides; this does
not imply the underlying database or Blob store is different. Configuration must
be checked for the exact branch and effective deployment. A previously Ready
deployment retains its own configuration/version and remains a consumer until
drained or isolated. [Vercel environment documentation](https://vercel.com/docs/deployments/environments).

If Preview shares Production's unmigrated DB: do not deploy this bridge there.
If it shares a migrated Production DB: it can still write real catalog/orders,
run payment/notification effects, and serve incompatible old clients. Do not use
it for native QA or count it as safely drained. Prefer a separately approved,
isolated Preview database with synthetic data and separate storage/provider setup.
This stage creates no database/store and changes no connections or deployment rules.

## 5. Operator backup restore rehearsal — instructions only

**BLOCKED until an operator executes and records a complete restore. No restore
was attempted here. Do not use the synthetic variant rehearsal runner for a real
backup: it uses trust authentication and diagnostic output intended only for fake
data. Do not start the storefront/Admin/Prisma seed scripts against restored data.**

### 5.1 Prepare a private, disposable target

1. Obtain separate operator authorization for handling the backup. Record archive
   SHA-256, byte size, trusted origin and backup timestamp. Keep the dump, restored
   files and any diagnostic material on encrypted, access-controlled storage
   outside this repository, OneDrive/shared folders and CI artifacts.
2. Use a new isolated VM/container or independently initialized PostgreSQL 18
   cluster with an empty private data directory, dedicated OS account, local
   password and unused loopback port. No existing project DB/service/URL is a
   permissible target. Restrict local access with SCRAM; do not reuse the prior
   synthetic trust cluster. The owner must verify data_directory/port/cluster
   identity on this newly provisioned instance before creating the database.
3. Block all external network egress, including Neon and integration providers;
   bind PostgreSQL only to loopback. Do not mount project environment files or
   Production credentials. No Vercel linkage, scheduler, application server,
   webhook worker, payment/email/Telegram/TTN credentials or extension background
   jobs. A localhost URL on a shared or untrusted machine is not sufficient.
4. Before data restore, suppress PostgreSQL statement/parameter/error-detail logs
   on this private cluster (including log_statement=none, log_min_messages=panic,
   log_min_error_statement=panic, log_error_verbosity=terse, log_duration=off,
   log_min_duration_statement=-1, log_parameter_max_length=0 and
   log_parameter_max_length_on_error=0). Disable external log agents and SQL
   tracing. This intentionally applies only to the disposable rehearsal cluster.
5. Inspect archive metadata privately with pg_restore --list. Confirm the 14
   expected baseline application tables. Review extensions, foreign servers/user
   mappings, subscriptions/publications, event triggers, executable functions and
   scheduled jobs before restore. The dump is trusted executable input, not inert
   data; egress protection remains necessary. Stop on unexpected active integration
   objects. Filtering them without a reviewed completeness assessment is not a
   successful full restore.

Use PostgreSQL 18 client utilities, a fresh shell with all inherited PG* variables,
DATABASE_URL and alternate/direct project URLs removed **from that child shell
only**, and an explicitly specified QA-only PGPASSFILE with restrictive local
permissions. Its entries must cover only the owned loopback cluster. Do not put
the password on the command line or use --dbname with a connection URI.

### 5.2 Create exactly one new database; refuse overwrite

The following are operator templates, not commands executed in Stage 1C. Replace
port and archive path only after the cluster identity checks; the fixed loopback
host must not become a remote/Production hostname.

```powershell
# Fresh isolated shell/VM only; QA-only credentials already provisioned privately.
$qaPgBin = 'C:\Program Files\PostgreSQL\18\bin'
$qaRestorePort = 55432 # operator must select and verify an unused owned port
$qaRestoreDb = 'batch18_restore_' + [guid]::NewGuid().ToString('N')
$qaArchive = 'D:\private-rehearsal\approved-backup.dump'

& "$qaPgBin\createdb.exe" --host=127.0.0.1 --port=$qaRestorePort `
  --username=restore_owner --maintenance-db=postgres --template=template0 `
  --encoding=UTF8 --no-password $qaRestoreDb
if ($LASTEXITCODE -ne 0) { throw 'Fresh database creation failed; STOP.' }
```

createdb must succeed on that newly owned cluster and fail if the name exists.
Never use --clean, --if-exists, DROP DATABASE, --create or a Production connection.
Verify the new target has zero application relations before restore. Keep one
operator/process in control of this private cluster; do not reuse the database
after failure. A retry gets a new generated name; preserve failure evidence only
as sanitized status, not row contents.

### 5.3 Restore atomically without recording data-bearing diagnostics

Run pg_restore with explicit local host/port/user/new database, no URI, no verbose
output, no parallel jobs, no --clean/--create and no trigger-disabling shortcut:

```text
pg_restore --host=127.0.0.1 --port=<owned-port> --username=restore_owner
  --dbname=<fresh-generated-name> --no-password --format=custom
  --single-transaction --exit-on-error --no-owner --no-privileges
  --no-tablespaces <approved-private-archive>
```

Single-transaction mode provides all-or-nothing restore and implies stop on error;
remapping ownership/ACLs avoids importing source roles into the isolated target.
The trusted-archive warning and command behavior are documented in
[PostgreSQL 18 pg_restore](https://www.postgresql.org/docs/18/app-pgrestore.html).

**Do not run the template directly in a recorded terminal.** Error output can
contain COPY rows, unique-key values, SQL literals and customer data. Use an
operator-reviewed wrapper that drains stdout and stderr to a discard sink (for
example two .NET redirected streams asynchronously copied to Stream.Null), waits
for completion, and emits only the exit code and PASS/FAIL. Do not use transcript,
tee, --verbose, pg_restore --file=- or a shell that captures stderr into CI logs.
The private server log suppression in 5.1 must be in place too.

Exit 0 is necessary, not sufficient. On failure record only archive hash, tool
version, local target alias, timestamp, exit code and FAIL. Do not print raw errors
to diagnose the failure. Any subsequent private diagnostic procedure needs its own
data-handling review; no redaction regex can guarantee removal of customer details.
The disposable local ownership/privileges are not evidence of Production role
restoreability; source role/ACL definitions require a separate metadata review.

### 5.4 Read-only verification after restore

Use explicit local connection flags again; psql -X, ON_ERROR_STOP=1 and a read-only
transaction. Never SELECT * from business tables or dump COPY/table data to logs.
Limit output to object metadata and aggregates in the private rehearsal workspace.

```sql
BEGIN READ ONLY;
SET LOCAL search_path = pg_catalog;
SET LOCAL statement_timeout = '60s';

-- Object names/counts only: compare the exact table set to baseline/archive TOC.
SELECT table_name
FROM information_schema.tables
WHERE table_schema='public' AND table_type='BASE TABLE'
ORDER BY table_name;

-- psql only: each generated statement emits a table name and aggregate count.
SELECT format('SELECT %L AS table_name, count(*)::bigint AS row_count FROM %I.%I;',
              table_name, table_schema, table_name)
FROM information_schema.tables
WHERE table_schema='public' AND table_type='BASE TABLE'
ORDER BY table_name
\gexec

-- Definition/validation metadata; no customer rows or parameter values.
SELECT c.relname AS table_name, k.conname, k.contype, k.convalidated,
       k.condeferrable, k.condeferred, pg_get_constraintdef(k.oid) AS definition
FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid
JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND k.contype IN ('p','u','f','c')
ORDER BY c.relname,k.conname;

SELECT c.relname AS table_name, i.relname AS index_name,
       x.indisvalid, x.indisready, pg_get_indexdef(i.oid) AS definition
FROM pg_index x JOIN pg_class c ON c.oid=x.indrelid
JOIN pg_class i ON i.oid=x.indexrelid
JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public'
ORDER BY c.relname,i.relname;
COMMIT;
```

Compare schemas/enums/defaults/nullability, sequences if present, functions,
non-internal triggers, extensions, FK actions/validation and indexes with the dump's
trusted metadata and baseline. All expected indexes must be ready/valid and FKs
validated; unexpected baseline exceptions require review, not silent acceptance.
Do not export full function bodies or object comments to a public report.

Compare all 14 table counts with a trusted count manifest from the backup's
consistent snapshot if available. A TOC does not contain row counts, and fresh
Production counts can differ because the store keeps receiving writes. If no
same-snapshot count manifest exists, record restored counts as observed, identify
the missing comparison evidence and obtain an independently reviewed comparison;
never claim exact source row-count parity from TOC readability alone. This stage
does not authorize querying Production to obtain that evidence.

Only then sign off: archive hash, PostgreSQL/client versions, fresh target alias,
exit status, exact object comparison, aggregate-count comparison/discrepancies,
validated FK/index status, operator/date and no integration effects. No customer
records, credentials or backup file go into Git. Keep the target inaccessible;
its later disposal is a separate explicitly targeted operator action.

## 6. Safe migration/deployment sequence — future approval required

1. **Verified restore:** complete section 5 and resolve discrepancies. Restore
   proof is about recoverability, not permission to change Production.
2. **Authorized read-only live preflight:** approve exact project/branch/database/
   schema/role and collect aggregate drift, object/role/RLS definitions, row/index
   sizes, long transactions, backup/PITR state and expected lock budget. No writes.
3. **Environment/writer inventory:** satisfy section 4 for all Production/Preview
   deployments and direct writers. Prove push is deployment-blocked or safely
   isolated before a later Stage 2 push. A commit/push approval must explicitly
   address automatic Preview consequences; it does not authorize migration.
4. **Final artifact approval:** review the target-specific complete SQL, custom
   guards, pre/postconditions, exact artifact hash and immutable application SHA,
   role grants, maintenance procedure, monitoring, stop conditions and rollback
   build. Never execute the docs/review guarded file as Production migration.
5. **Controlled additive migration:** separately authorized operator, correct
   target and deployment owner, short pre-agreed lock/statement timeouts, explicit
   BEGIN/COMMIT and stop-on-error. Use the reviewed SQL-change tracking convention.
   Do not run Prisma schema push/migrate reset, seeds or product conversion. Keep
   native writes and cleanup off. Record only safe metadata/aggregates. If the
   lock budget is exceeded, roll back and stop; do not retry with looser guards.
6. **Verify expansion then deploy bridge:** confirm added objects/guards, expected
   default LEGACY state, empty variants, NULL new order FKs and unchanged business
   counts/history. Recheck all deferred guards before commit where applicable.
   Deploy code/client only after schema is present on each consuming environment.
   Confirm exact deployment SHA completed; do not infer success from a Git push.
   Do not use the isolated mock build as the hosted deployment build.
7. **Legacy verification:** native writes still off. Check unchanged simple/size
   catalog, sorting/pagination, Admin preservation/gallery, cart import/readiness,
   old snapshot readers and existing Mono retry material. No real orders/payments
   or notifications unless separately approved; isolated mocks first. Preserve
   payment callbacks/recovery for existing attempts throughout cutover.
8. **Drain old writers:** verify active SHA for every server/alias/Preview/import/
   direct writer, remove or isolate old consumers under separate authorization,
   and wait out in-flight actions/transactions. Inventory old browser tabs/server
   actions. Retain DB order-insertion guards, compatible pending-payment return and
   reconciliation services. A deployment's Ready state is not a writer drain.
9. **Separately approved native activation:** explicitly approve the setting change
   for the correct isolated/Production scope, then reviewed product IDs and exact
   business combinations. No bulk conversion, translated-label identity or legacy
   modifier inference. Capture revisions and verify after each reviewed conversion.
   This is not authorized by architecture, migration or deployment approval alone.
10. **Manual QA and monitoring:** collect evidence for existing 17 and separate 14
    native scenarios. Review error/lock/deadlock/transaction-timeout rates, catalog
    query latency, stale editors, cart migration/recovery, snapshot/FK rejection,
    invoice/retry counts and pending-payment recoverability without logging PII.
    Keep Blob cleanup off and its scope approval absent/unchanged.

Additional planning gate: atomic DDL before COMMIT can roll back, but an already
committed additive expansion is retained. Establish incident ownership and compatible
rollback artifact before maintenance; this document schedules no job or deployment.

## 7. Rollback plan

| Point | Safe response | Forbidden shortcut |
| --- | --- | --- |
| Before migration | Stop; retain original app and DB. A code rollback is unnecessary while nothing is deployed | Push into unknown Preview target |
| DDL failure before COMMIT | Transaction ROLLBACK and metadata verification; original app remains. Resolve lock/drift/permission failure before new approval | Continue after errors, partial manual object patching or reduced safeguards |
| Expansion committed, all products still LEGACY and no native orders/config | Retain additive schema. Revert application only to an actually verified legacy-compatible build; verify triggers/permissions and pending attempts. Native flag stays off | Drop schema automatically or restore old DB over newer orders |
| Any native configuration/variant/v2 order exists | Pause further native configuration writes if separately authorized; use a previously tested mode-aware bridge rollback that preserves FK/selection/snapshot/session support. Resolve current in-flight orders before cutover | Returning to pre-1.8 readers/writers, native-to-LEGACY downgrade, deleting variants/orders or repricing attempts |
| Only incompatible old build available after adoption | Stop release/unsafe writes and use separately approved containment while preserving compatible payment callbacks/recovery; obtain a bridge repair | Treating flag=false as data rollback or discarding v2 orders |

Never restore an earlier snapshot over a live database that contains newer orders,
payments or notifications. A disaster-recovery restore is a separate incident plan
with reconciliation and authorization, not an application-release rollback.

## 8. Verification record

Fresh Stage 1C execution:

- PASS: current branch/baseline, 56-file initial inventory, empty Git index;
  read-only remote Production/main refs match approved values.
- PASS: actual/review Prisma model equality; Prisma 5.22 validation and offline
  additive DDL generation/comparison from schema files. No database SQL executed.
  The final offline validation used a new OS temporary directory and dummy
  loopback URL. An initial in-workspace invocation discovered local dotenv via
  Prisma's package-root resolution; it still used an explicit dummy URL, printed
  no credentials and made no DB connection. The final comparison was repeated
  outside that package-root lookup. No dotenv files/settings were modified.
- PASS: verify-batch18-implementation.ts (7 groups, including default-off gate),
  verify-batch18-architecture.ts (8 groups, exact old identity material),
  verify-checkout-cart.ts and verify-batch17-availability.ts. These are isolated
  synthetic fixtures with no provider or database effects.
- PASS: complete changed-file credential/artifact scan, whitespace validation
  including untracked files, preservation fingerprints and unchanged original
  deferred QA register; final inventory below.

Reused Stage 1B execution evidence, **not rerun in Stage 1C**:

- PostgreSQL 18.7: 20 integrity/rollback/legacy/retirement/order-history groups,
  two independent real-session lock races, and 9 actual application integration
  groups with mocked external effects. Review test code confirms the sessions
  were distinct and observed PostgreSQL Lock waits. No migration or cluster was
  started in Stage 1C.
- Existing cart/checkout/retry/render, catalog, media/lifecycle and About suites.
- UA/EN native browser tests at 320/390/1280; existing drawer/gallery/Admin browser
  tests; 154 Admin responsive renders.
- TypeScript, ESLint and isolated Next production build with mutation/network
  effects forbidden. No source changes after that passing evidence; fingerprints
  verify preservation, so a repeat full suite/build was unnecessary.

BLOCKED/NOT EXECUTED: full backup restore, live schema/role/isolation queries,
target-specific migration execution, Vercel settings verification, hosted build,
deployment/writer drain, native activation and manual physical-device/live QA.
The earlier Prisma deferred-COMMIT negative diagnostic is a real reproduced defect
in the original assumption; final-flush application tests provide its correction,
not a claim that COMMIT-only error handling became safe.

## 9. Updated changed-file inventory

The following 56 existing files were reviewed and preserved byte-for-byte during
Stage 1C. Group-specific findings above cover their relevant behavior; tests are
identified as synthetic, real disposable PG or browser rather than interchangeably
counted as live proof. The 57th file is this new report.

### Schema and prior architecture/reports (6)

```text
prisma/schema.prisma
docs/batch-1.8-variant-architecture.md
docs/batch-1.8-implementation.md
docs/batch-1.8-manual-qa.md
docs/review/batch-1.8-variants.prisma
docs/review/batch-1.8-variants.prisma.diff
```

### Review SQL (1)

```text
docs/review/batch-1.8-variants.sql
```

### Application core, writers, serialization and projections (20)

```text
src/lib/actions/create-order.ts
src/lib/actions/products.ts
src/lib/actions/reconcile-cart.ts
src/lib/admin-form-validation.ts
src/lib/admin-variant-history.ts
src/lib/cart-items.ts
src/lib/cart-reconciliation.ts
src/lib/cart-persistence.ts
src/lib/catalog-products.ts
src/lib/i18n.ts
src/lib/payments/checkout-identity.ts
src/lib/payments/checkout-session.ts
src/lib/product-configuration-admin.ts
src/lib/product-configuration.ts
src/lib/product-query.ts
src/lib/product-variants.ts
src/lib/variant-rollout.ts
src/lib/variant-transaction.ts
src/store/cart-store.ts
src/types/index.ts
```

### Storefront and Admin integration (18)

```text
src/app/(shop)/cart/page.tsx
src/app/(shop)/catalog/page.tsx
src/app/(shop)/page.tsx
src/app/(shop)/product/[slug]/page.tsx
src/app/admin/products/[id]/edit/page.tsx
src/app/admin/products/new/page.tsx
src/components/admin/admin-form.tsx
src/components/admin/product-form.tsx
src/components/admin/variant-editor.tsx
src/components/cart/cart-drawer.tsx
src/components/cart/cart-readiness.tsx
src/components/catalog/product-grid.tsx
src/components/checkout/checkout-page.tsx
src/components/home/featured-products.tsx
src/components/product/product-card.tsx
src/components/product/product-options.tsx
src/components/product/native-product-options.tsx
src/components/product/related-products.tsx
```

### Isolated test harnesses and fixtures (11)

```text
scripts/source-module.ts
scripts/verify-build-isolated.mjs
scripts/verify-cart-drawer.ts
scripts/verify-product-cart-ux.tsx
scripts/fixtures/batch18-variant-reference.ts
scripts/fixtures/variants-browser.tsx
scripts/rehearse-batch18-variants.mjs
scripts/verify-batch18-application-postgres.ts
scripts/verify-batch18-architecture.ts
scripts/verify-batch18-implementation.ts
scripts/verify-batch18-postgres.ts
```

### Stage 1C addition (1)

```text
docs/batch-1.8-release-readiness.md
```

No tracked dependency/lockfile, environment, Vercel/Cloudflare, existing SQL change,
migration directory or generated build artifact is added to the change set. The
index remains empty; HEAD, Production and main unchanged. All work remains
**unstaged, uncommitted and unpushed**. Stop after Stage 1C: no Stage 2, schema
execution, restore, push, merge, deployment or activation is authorized here.

## 10. Final combined migration rehearsal and release readiness — 2026-11-22

**Final assessment: BLOCKED.** Source review, SQL/model/manifest consistency and
the rerun isolated regressions PASS. The mandatory rehearsal from the actual
restored baseline has not executed. Synthetic fixtures are not substituted for it.

### Required existing-cluster rehearsal

The existing local cluster was stopped. An authorized attempt to start that same
data directory with pg_ctl failed. Its startup log reported Permission denied
binding both ::1 and 127.0.0.1; PostgreSQL could not create a TCP/IP socket.
pg_isready on 127.0.0.1:55432 reports no response. Read-only listener/reservation
checks did not identify a listener or an IPv4 exclusion covering 55432; this does
not establish the Windows-level cause. No authentication attempt was made, and no
password/credential file was read, requested or changed. No alternate port/server,
authentication bypass, source recreation or existing database cleanup was used.

| Preserved rehearsal gate | Actual final restored-clone result | Missing evidence |
| --- | --- | --- |
| ServerIdentity | BLOCKED | Required endpoint unavailable; server version/data directory/start identity cannot be queried |
| Baseline | BLOCKED | Current 14-table/31-index/11-FK schema, migration history and five-product baseline cannot be freshly verified |
| FreshClones | BLOCKED | No new clone of restore_3dkid_batch18 was created |
| CandidateGuards | BLOCKED | Live rejection/unchanged-clone assertion not executed; offline guard checks PASS separately |
| Migration | BLOCKED | Exact final local candidate not executed against a restored-baseline clone |
| SchemaIntegrity | BLOCKED | Final variant/Materials columns, enums, FK/index/trigger definitions and category RESTRICT not queried on that clone |
| FiveProducts | BLOCKED | Fresh before/after old product/category row digests unavailable |
| LegacyHistory | BLOCKED | Pre-migration fixture/history preservation not rerun on the actual restored schema |
| NativeIntegrity | BLOCKED | Native identities/prices/retirement/history/cascade checks not rerun on that clone |
| DeferredFailure | BLOCKED | Expected deferred-error/rollback assertion not rerun on that clone |
| MigrationRollback | BLOCKED | Injected-failure transaction and recovery assertions not rerun on that clone |
| SourceUnchanged | BLOCKED for fresh digest proof | No source connection or write occurred; fresh before/after digest comparison could not run |

The original restored baseline was not connected to or modified by this task.
All previously created rehearsal databases remain untouched. This is a procedural
preservation guarantee, not a fabricated fresh SourceUnchanged PASS.

### Exact artifacts and audit corrections

No migration SQL, Prisma schema or application source changed during this final
review. The schema delta remains the approved variant extension plus three nullable
Product Materials fields and Category_parentId_fkey ON DELETE RESTRICT. There is
no extraction, conversion, data backfill or automatic legacy-mode change. No actual
baseline schema/data difference could be measured without the required connection.

Final SHA-256 values, unchanged from the addendum manifest:

```text
f37cdbceaca10d56bdccd3ccee75191e677809bf344995a35042f0f18e887509  docs/review/batch-1.8-production-candidate.sql
c692476add8a90143ca88efc077b383eeafe9f4c4dbf3bd07a90e907262ef796  docs/release/batch-1.8-production-migration.sql
```

All six entries in docs/review/batch-1.8-addendum-manifest.json match their exact
file bytes. The reviewed local candidate is the file the operator runs unchanged;
its execution settings are passed separately. The Production-specific wrapper
deliberately rejects local rehearsal targets. It was not executed, patched or
reconstructed to bypass that protection. Its preserved DDL/trigger body is exactly
equal to the candidate body; Production-only approval/backup/role/lock checks have
offline review coverage. **Neither complete final candidate nor Production wrapper
was executed on a restored-baseline clone in this attempt.**

Two verification gaps were corrected in scripts/operator/batch18-rehearse.ps1:
category contents previously had only counts, and the operator pinned only three
of the final manifest's six artifacts. Snapshots now include an ordered category
row digest; preservation rejects same-count category mutation. Before prompting or
connecting, all six pinned hashes must match the manifest and the release/candidate
DDL bodies must match exactly. The original twelve execution gates, exact local
identity, clone ownership and source write prohibitions remain. The matching offline
regression in scripts/verify-batch18-operator.ps1 reproduces the same-count defect
and checks all final pins. **13 offline groups PASS.** This is not a migration fix.

### Fresh executed regression evidence

| Check | Result and boundary |
| --- | --- |
| Private synthetic PostgreSQL 18.7 | PASS: 20 variant integrity groups, 9 actual application groups, 8 addendum groups, real two-session races, Prisma empty relational diff and injected DDL rollback |
| Exact synthetic SQL file used | docs/review/batch-1.8-variants.sql, SHA-256 4c404d4ecb1ed144de4f7886036d0e5f64e7a82e4abe12c344935ac818d05623; not the full final local/Production wrapper |
| Synthetic data boundary | New owned cluster retained at C:\Users\alexa\AppData\Local\Temp\batch18-variant-review-dTLhdp; stopped after PASS; no existing cluster/database targeted |
| Existing isolated regression batch | PASS: architecture, implementation, product/cart UX, availability, checkout/cart/acceptance/render, About, uploads, media lifecycle (29 groups), unified catalog, favicon |
| Materials/Unicode/center-selection/artifact tests | PASS: 5 groups |
| Browser regressions | PASS: addendum, gallery/Admin and native variants; 18 UA/EN runs at 320/390/1280px; coarse-pointer scrolling emulated, visibility simulated, actual keyboard/dialog checks |
| Responsive render regression | PASS: 216 renders; no overflow; desktop CSS screenshots identical at 1280/1440 |
| Prisma 5.22 validation/generated schema diff | PASS; offline and synthetic PostgreSQL evidence only |
| Production artifact checks | PASS: 7 offline groups; final hash/body checks and default-off controls |
| Operator PowerShell syntax/safety | PASS: 13 offline groups; no password prompt, client or migration execution |
| TypeScript / ESLint / isolated production build | PASS; fake read fixtures, DB/provider effects blocked |
| Git/whitespace/file/secret-artifact audit | PASS within the qualifications below |

The implementation review retains server-authoritative prices, unchanged legacy
checkout identities and Mono replay, immutable snapshots, safe cart migration,
gallery IDs/state, Materials localization/preview and single touch GIF activation
with original desktop hover behavior. Server category counts include inactive
products and children; parent row locking and database RESTRICT both protect them.
Product history prevents physical deletion; explicit archival is retained. No
integrity, media retention or deferred-constraint safeguard was weakened.

### Repository, secrets and remaining manual evidence

**107 modified/untracked files; index empty.** No preceding file is missing. The
complete combined inventory remains in batch-1.8-addendum-ui-safety.md. Source and
documentation audit covered 366 existing tracked/changed paths (302 tracked). No
credential literals requiring removal, database dumps, unexpected generated/private
artifacts or new dependencies were found. Known fake fixture credentials and the
documented placeholder database URL were reviewed as synthetic values. Actual
credential .env files are untracked and unstaged; the repository already tracks
the unchanged non-secret .env.example template. Do not describe that template as
absent or remove it to conceal this exception. No secret values are reported here.

Local and independently read remote refs match: Production/feature base
76621cf01ebe482bfee9a80aaed4a4b5b9dfed22; main
3bf9ce0955040535db1e42ea161d0d27a80fb160. No branch switch or ref write occurred.
No commit, push, merge, deployment, Neon SQL, Vercel/Cloudflare change, live storage
operation, payment/notification or real product/category mutation occurred.

All 17 deferred QA and 14 native-variant manual scenarios retain their previous
pending status. Physical iOS/Android, assistive technology, real network/cache/
Save-Data/OS motion preferences, live authenticated uploads/Save and Production
smoke tests remain NOT TESTED. Automated evidence does not mark them PASS.

### Conditional operator sequence — all Production actions remain unexecuted

1. Resolve the local bind failure without changing authentication or protected
   database contents. Start the exact existing PG18.7 cluster and verify
   pg_isready at 127.0.0.1:55432. Do not substitute another instance or port.
2. Run the guarded final operator script below, entering only the LOCAL password
   in its secure prompt. Require all twelve gates PASS, exit 0 and the current
   six-artifact hashes in its sanitized result. Keep all disposable clones and
   the source intact. Supply the sanitized result, never credentials or rows.
3. Only after local evidence is accepted, obtain separately authorized read-only
   Neon evidence using docs/release/batch-1.8-production-preflight.sql: exact branch/
   direct endpoint/version, schema hash/object diff, real counts/options/order
   growth, migration ledger, RLS, role ownership/privileges and active writers.
   Do not assume the backup schema still matches. Ledger/drift/role differences
   require review; do not blindly copy a new fingerprint to pass the guard.
4. Inventory shared Production/Preview databases, deployments, old writers, jobs
   and integration settings. Separate Preview isolation is not a required gate
   for this owner-approved strategy, but all consumers must honor schema-first
   rollout. A feature push can trigger Preview; no new-client deployment before DDL.
5. Immediately before approved DDL, create a NEW independent custom-format
   Production backup. Preserve earlier archives/Snapshot. Record its SHA-256/time
   privately, verify pg_restore --list, and rehearse a restore to a fresh isolated
   target with count/schema/FK/index comparisons and integrations disabled. A
   readable archive list alone does not prove restoration. Never overwrite a DB.
6. Obtain explicit owner approval of the final SQL/hash, backup, direct target,
   current schema fingerprint, migration/runtime roles, maintenance window and
   coordinated Git/Vercel sequence. An approved local implementation is not DDL
   or release approval. Bind only the reviewed unbound manifest parameters.
7. The authorized operator applies the exact Production wrapper with ON_ERROR_STOP
   using the command in batch-1.8-production-rollout.md. Locks/guard/timeout errors
   stop and roll back the transaction; never bypass or weaken a failed check.
   Run the exact read-only production-verify.sql and verify runtime grants.
8. Only after schema verification, use the separately approved commit/push/release
   workflow on the feature and Production branches, with main protected. Verify
   remote release SHA and the Vercel Production deployment for that exact SHA
   reaches Ready/Success. Do not claim readiness for a pending/failed deployment.
9. Verify legacy reads, prices, galleries, favicon, localized Materials, category
   safety and non-destructive cart reconciliation; review order history and pending
   Mono retry state without creating real payments/notifications. Verify old
   writers are drained before separately approved native-mode activation.
10. Perform recorded manual Production/mobile QA and monitoring. Keep Blob cleanup
    disabled and scope approvals unchanged. Do not convert legacy products by default.

Local operator command (not a Production migration command):

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\operator\batch18-rehearse.ps1
```

Rollback: before successful DDL COMMIT, an error rolls back the additive changes
and restores the original category FK in the disposable rollback test. After
COMMIT, retain the expanded schema on application rollback. After native records
or orders exist, retain a mode-aware bridge; do not drop the new schema, rewrite
snapshots, completed payments or restore an old backup over newer business data.
Use separately reviewed forward recovery. No down-migration or restore is executed
by these instructions. **Do not proceed to Production preflight/release on the
basis of this report until the local twelve-gate blocker is resolved.**

## 11. Local PostgreSQL startup recovered; authentication blocked — 2026-11-22

This supersedes section 10's initial attribution of the bind error to port 55432.
The earlier pg_ctl start omitted -o. Reading effective settings using postgres -C
returned port=5432 and listen_addresses=localhost. postmaster.opts recorded the
previous successful explicit -h 127.0.0.1 -p 55432 options. An existing listener
on 0.0.0.0:5432 and [::]:5432 belonged to PID 9460. Both IPv4 and IPv6 excluded
ranges contained only 5357. There was no listener on 55432. Thus the failed default
startup attempted the occupied 5432 endpoint; it was not evidence that 55432 was
reserved or prohibited. No port change, service termination or Windows policy
change was needed.

Recovery used the SAME data directory and explicit original options:

```powershell
& 'C:\Program Files\PostgreSQL\18\bin\pg_ctl.exe' start -D 'C:\Users\alexa\AppData\Local\3dkid-pg18-restore' -l 'C:\Users\alexa\AppData\Local\3dkid-pg18-restore\batch18-final-recovery-start.log' -o '-h 127.0.0.1 -p 55432' -w -t 20
```

The initial 20-second wait timed out, but the server continued startup. Its actual
log showed listening on 127.0.0.1:55432, recovery after an unclean shutdown, a
sharing-violation retry for the startup log, completion of WAL recovery/checkpoint
and then ready to accept connections. No process was killed or PID file removed.
The generic antivirus/backup hint did not identify any security product as the
cause; no security software was disabled. At the final check pg_ctl status showed
the expected data directory/options and PID 23820; pg_isready returned success.

A single non-interactive connection attempted strictly read-only guarded metadata
on restore_3dkid_batch18, using the previously authorized local PGPASSFILE path.
The PostgreSQL client rejected authentication for postgres. The file contents were
not inspected, copied, edited or printed; no password was requested or extracted.
No retry or authentication change followed. Environment settings used for the
client were process-scoped and restored. No SQL statement reached execution.

| Current verification | Result |
| --- | --- |
| Startup cause and recovery | PASS: missing explicit port override identified; existing cluster starts on original 55432 |
| Loopback readiness | PASS: 127.0.0.1:55432 accepting connections |
| Authenticated SQL identity/baseline | BLOCKED: configured local password-file credential rejected |
| Final twelve restored-clone gates | BLOCKED: ServerIdentity, Baseline, FreshClones, CandidateGuards, Migration, SchemaIntegrity, FiveProducts, LegacyHistory, NativeIntegrity, DeferredFailure, MigrationRollback, SourceUnchanged |
| Final SQL/manifest | Unchanged; all six hashes agree; candidate/release DDL bodies agree; no candidate execution |
| Source protection | No baseline SQL write or clone/migration occurred; fresh before/after SQL digest proof remains BLOCKED |

The existing operator script uses a secure interactive LOCAL password prompt and
does not depend on the rejected credential file. Run it in the operator's own
PowerShell session, with the server already ready, then share only its sanitized
result.json path/results. Do not send a password or raw records to chat:

```powershell
Set-Location -LiteralPath 'C:\Users\alexa\OneDrive\Документы\stikr-shop'
& 'C:\Program Files\PostgreSQL\18\bin\pg_isready.exe' -h 127.0.0.1 -p 55432
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\operator\batch18-rehearse.ps1
```

No script port override needs changing: all guards/candidate/connection settings
already target 55432. If the SAME cluster is stopped in a future operator session,
first establish that with pg_ctl status, then use the explicit options below.
Keep a future startup log outside PGDATA to avoid the observed recovery-time
sharing warning, and allow a longer supported startup wait:

```powershell
& 'C:\Program Files\PostgreSQL\18\bin\pg_ctl.exe' status -D 'C:\Users\alexa\AppData\Local\3dkid-pg18-restore'
# ONLY if status reports no server running:
& 'C:\Program Files\PostgreSQL\18\bin\pg_ctl.exe' start -D 'C:\Users\alexa\AppData\Local\3dkid-pg18-restore' -l 'C:\Users\alexa\AppData\Local\3dkid-batch18-local-start.log' -o '-h 127.0.0.1 -p 55432' -w -t 60
```

No unrelated regressions were repeated and no application, schema, migration or
script code changed during this startup-recovery task. Reports only were updated;
the combined inventory remains 107 files, unstaged/uncommitted/unpushed. No Neon,
Production, main/Production Git ref, Windows reservation/firewall/service policy,
Vercel/Cloudflare, Blob or payment/notification action occurred. Existing project
and database contents were not edited. Normal PostgreSQL startup/WAL recovery ran;
fresh proof of restored business data still requires successful authentication.

**Final status: BLOCKED pending operator-authenticated twelve-gate execution.**

## 12. Final candidate 42601 correction and revalidation — 2026-11-22

The owner's sanitized run 8a6a06d6d0174a1d943c7a7f809cfeeb confirms connectivity,
authentication, baseline, fresh clones and guard rejection work. It failed at
Migration with 42601; SourceUnchanged PASS. See
[rehearsal section 18](batch-1.8-migration-rehearsal.md#18-final-candidate-42601--reproduced-and-corrected-2026-11-22)
for the complete twelve-gate record, exact source locations and 18-file correction
inventory. The current combined tree contains 113 modified/untracked files.

The malformed category postcheck in the candidate used a single $ delimiter at
lines 447–451. The Production wrapper repeated it at lines 484–488; the verifier
had an END $; closure at line 50 despite opening with $$. These were generated
artifact defects from JavaScript replacement-string handling of $$. The actual
PowerShell client-settings builder generates valid SQL and passed execution tests.

Only broken delimiters changed in the three SQL files; no schema definition,
constraint, guard body, row transformation or transaction safeguard changed. The
old files/manifest are archived under docs/review/archive/batch18-before-syntax-fix.
The exact archived syntax failures were reproduced in owned PostgreSQL; the
corrected postchecks and complete read-only verifier execute successfully. The
category guard still rejects missing protection, and rollback restores it.

Current SHA-256 values (the manifest/operator pins agree):

```text
ca8393bd1add06f51412d6e3096faf63b6c22e8359f884cab6aa3d7af517bf72  docs/review/batch-1.8-production-candidate.sql
94917c516f6eac8c0562f97748c967784598077e08f9ff8620e7044a16834f84  docs/release/batch-1.8-production-migration.sql
bba3801a7af4aef9f989c10b351e4a0230d8119621b6b0a43b09022b64bb044c  docs/release/batch-1.8-production-verify.sql
```

Fresh results: six PostgreSQL syntax regressions PASS; existing 20 variant,
9 actual application and 8 addendum PostgreSQL groups PASS; combined rollback and
empty Prisma relational diff PASS; 15 offline PowerShell/sanitized-source groups,
7 offline Production artifact groups, 3 Prisma/model artifact groups and focused
ESLint PASS. The new diagnostic maps only exact generated filenames/bounded line
numbers to fixed source identifiers and never logs SQL/rows/credentials. Unknown
errors remain fatal. No application or Prisma schema changes were needed, so
unrelated UI/full-build checks were not repeated.

The owner's cluster, three preserved clones and restored source were not accessed
by this correction. The owner's prior source-preservation PASS remains the actual
evidence; no new full restored-clone success is claimed. **Release status BLOCKED:**
run the existing guarded operator script again, with fresh clones and a secure
LOCAL password prompt, and require all twelve PASS / exit 0 using these hashes.
The Production wrapper remains execution-unapproved. Existing read-only live
preflight, fresh backup, owner approval, writer inventory and schema-first release
requirements remain. Cleanup/native activation remain separately gated/default-off.
All changes remain unstaged, uncommitted and unpushed. No protected branch,
Production database, environment, deployment or live integration was modified.

## 13. Final local gate closed; live preflight outstanding — 2026-11-22

The corrected final restored-baseline run 7440421df00445fbb844b210f1c4d5de is now
independently verified 12/12 PASS, including SourceUnchanged, with all six actual
artifact hashes matching the report and current manifest. The owner reports exit 0.
The full local migration gate is resolved, superseding section 12's pending rerun.
No application, Prisma or SQL changes were necessary during this verification.

The [final Production read-only preflight report](batch-1.8-production-readonly-preflight.md)
records the exact evidence, missing live connection prerequisites, current unknown
schema/roles/history/counts/writers, fresh backup/restore approval gates and exact
operator sequence. The missing source fingerprint can be collected read-only;
there is no need to repeat completed migration execution merely to export metadata.

The current release inventory is 114 paths, with all preceding 113 preserved.
Only four existing report documents and the new preflight report changed in this
task. The staging checklist now explicitly includes required SQL/model text archive
fixtures; only private backup archives/dumps and sensitive/generated artifacts are
excluded. The entire reviewed source set, final manual migration, tests and favicon
assets must be preserved for later approved staging.

Local evidence is READY FOR OPERATOR READ-ONLY PRODUCTION PREFLIGHT. Its execution
is BLOCKED here because no already authorized Neon connection is available. Backup
creation, isolated restore, migration, Git release, Vercel deployment and native
activation still require their respective approvals/evidence. No credentials were
requested or retrieved from project files, no live connection/backup/Production
write occurred, and protected refs remain unchanged.
