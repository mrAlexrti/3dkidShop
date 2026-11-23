# Batch 1.8 — Windows operator handoff (read-only only)

Prepared on feat/batch-1.8-color-size-variants. The final corrected migration
rehearsal is complete: 12/12 PASS, with the current six artifact hashes. This
handoff does not repeat it, execute Production SQL, create backups/snapshots/
branches, grant permissions, change settings or authorize a release.

## Confirmed shared-database quick start

The owner confirms ONE application database shared by Production and Preview:
project StikerSuite, Neon branch production, database neondb, role neondb_owner,
schema public. Do not investigate or invent separate application databases.

Use the confirmed profile:

```powershell
Set-Location -LiteralPath 'C:\Users\alexa\OneDrive\Документы\stikr-shop'
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\operator\batch18-production-preflight.ps1 -SharedDatabase
```

This fills the confirmed project/branch DISPLAY NAMES, database, public schema and
neondb_owner for audit/runtime/proposed-migration privilege inspection. It does not
invent provider IDs or require them again; supplied IDs still receive format checks.
The generic mode below retains its original required project/branch ID checks.

Only these metadata inputs remain necessary: DirectHost (bare direct Neon hostname),
VercelHost (host of the active deployment's URL), DeployedCommit (verified active
SHA) and BaselineFingerprint (the local 32-hex schema fingerprint from step 3).
Then type READONLY and enter the neondb_owner password only in the secure prompt.
If the fingerprint is already in $baselineHash, pass -BaselineFingerprint $baselineHash
to avoid entering it again. The expected deployed SHA remains
76621cf01ebe482bfee9a80aaed4a4b5b9dfed22. No full URL or password is an argument.

neondb_owner is acceptable for this collector; a separate audit role is NOT mandatory.
It is a privileged role, not a read-only role. The pinned SQL, explicit read-only
transactions and child-only read-only default constrain THIS collection; no role,
grant or global setting is changed. Using the same name for the proposed migration
role only inspects its permissions and does not authorize a migration.

Endpoint/TLS, database/role/schema/primary identity, active-deployment, source-hash,
fingerprint, output sanitization and credential-lifecycle checks remain. Project/
branch mapping remains an explicit operator attestation. Shared Preview deployments
are other potential writers to the SAME database; this is not a request for database
isolation. No Production check is executed by preparing this profile.

## TLS correction after the first operator attempt (2026-11-22)

The operator's sanitized run a8d315db19044d689838d274c8649f7d was BLOCKED with
B18_PREFLIGHT_TLS_VERIFICATION_FAILED before any SQL evidence was collected.
The previous classifier discarded the detailed message, so that report CANNOT
establish whether the peer failed hostname, issuer, expiry or another TLS check.
No agent connection to Neon was made to recreate it.

Confirmed LOCAL configuration defect: PostgreSQL 18.7 uses OpenSSL 3.5.9. Its
compiled default CA file C:\Program Files\Common Files\SSL\cert.pem and CA
directory C:\Program Files\Common Files\SSL\certs do not exist. SSL_CERT_FILE,
SSL_CERT_DIR, OPENSSL_CONF and OPENSSL_MODULES were absent in the diagnostic
process. Both Windows ROOT views contain 66 certificates. This demonstrates a
local OpenSSL trust-source gap; it does not prove the exact discarded peer error.

sslrootcert=system with sslmode=verify-full is secure when the SSL implementation
has configured roots, but does not promise automatic Windows-store integration.
See [PostgreSQL 18 connection parameters](https://www.postgresql.org/docs/18/libpq-connect.html)
and [OpenSSL default trust locations](https://docs.openssl.org/3.5/man3/SSL_CTX_load_verify_locations/).
OpenSSL also documents a separate Windows-store implementation; simply having it
available is not proof that libpq's default locations use it:
[OpenSSL Windows ROOT store](https://docs.openssl.org/3.5/man7/OSSL_STORE-winstore/).

The collector now snapshots PUBLIC certificate bytes from the existing CurrentUser
and LocalMachine ROOT stores, read-only, into trusted-roots.pem inside its private
per-run output directory. Duplicate certificates are removed. Only the child
psql process receives that explicit PGSSLROOTCERT and PGSSLMODE=verify-full;
inherited SSL_CERT_FILE/DIR overrides are removed from that child only. No private
keys are exported, no remote certificates are trusted automatically, no CA is
downloaded, no certificate store or parent-shell environment is changed, and no
fallback/retry with weaker TLS is available. The temporary public bundle is
removed in finally after the client exits, alongside readonly.sql. Empty or
unreadable ROOT stores block collection. OpenSSL performs certificate checks;
this does not substitute the full Windows chain-policy engine.

The sanitized result now records Tls.Mode, TrustSource, CertificateCount and
BundleSha256, never certificate subjects, certificates, passwords or raw errors.
Fixed error subtypes distinguish TLS_HOSTNAME_MISMATCH,
TLS_ROOT_CONFIGURATION_FAILED, TLS_CLIENT_CERTIFICATE_CONFIGURATION_FAILED,
TLS_ISSUER_NOT_TRUSTED, TLS_CERTIFICATE_EXPIRED / NOT_YET_VALID / REVOKED,
TLS_CHAIN_VERIFICATION_FAILED and generic TLS_VERIFICATION_FAILED. Issuer errors
can mean a missing root OR intermediate; they are not proof of a bad server.
Child LC_ALL=C makes classification independent of the operator's UI language.

Retry from the repository in Windows PowerShell (nonsecret target values from the
owner's report; attest only if the active deployment mapping still matches):

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\operator\batch18-production-preflight.ps1 -SharedDatabase -DirectHost ep-jolly-cell-ai0scrqk.c-4.us-east-1.aws.neon.tech -VercelHost ep-jolly-cell-ai0scrqk.c-4.us-east-1.aws.neon.tech -DeployedCommit 76621cf01ebe482bfee9a80aaed4a4b5b9dfed22 -BaselineFingerprint c7068acb15096ec556a1d5e1e80ec559
```

Only type READONLY and enter the Neon neondb_owner password at the secure local
prompt. Do not paste a password/URL into chat or arguments. The same shared
StikerSuite / production / neondb / public target and role checks remain.
Expected success is COLLECTED, exit 0, with sanitized schema/count/permission
evidence; it is never migration approval. On failure share only result.json.

Validation: PowerShell syntax and 11 offline regression groups PASS, including
synthetic public-CA PEM round-trip/deduplication, empty-root rejection, owned
bundle enforcement, strict TLS, error subtype sanitization, unchanged read-only
SQL hash and all existing target/credential/report guards. A local function-only
ROOT-store read produced 66 deduplicated public certificates. Owner-executed TLS
connection remains REQUIRED; no Production preflight success is claimed.
The installed OpenSSL 3.5.9 library also successfully loaded the resulting public
PEM bundle in a separate local-only probe (UTF-8 filename API, no network or
database). This verifies bundle compatibility, not the Neon peer certificate.

## 1. Establish the active application target privately

1. In Vercel, open the existing 3D Kid project and the deployment actually serving
   www.3dkid.shop. Record its commit; the expected current Production commit is
   76621cf01ebe482bfee9a80aaed4a4b5b9dfed22. A newer Preview or unpromoted Ready
   deployment is not necessarily the active Production deployment. Do not promote,
   redeploy or change anything.
2. Establish the DATABASE_URL version used by THAT deployment using an existing
   authoritative deployment/provisioning/integration record. Project Settings →
   Environment Variables → Production shows current configuration; it alone is
   insufficient if changed after deployment. Vercel documents that environment
   changes do not update earlier deployments:
   [Vercel environment variables](https://vercel.com/docs/environment-variables).
3. If the value is readable Config, inspect it privately without copying it into
   chat, shell history, screenshots, transcripts or files. Record only HOSTNAME,
   database name, decoded role name and schema. Use public when this application's
   URL has no schema override. Never use vercel env pull for this handoff.
4. If it is a write-only Secret (formerly Sensitive), Vercel cannot reveal it after
   creation. Use a trusted original deployment/provisioning record or integration
   binding proving those same nonsecret fields for the active deployment. If that
   evidence is unavailable, STOP; do not reset, replace, redeploy, export secrets
   or add diagnostic application code. See
   [Vercel Config and Secret types](https://vercel.com/changelog/environment-variables-now-use-config-and-secret-types).

Do not send a full URL. Its private structure is ROLE:password at HOST / DATABASE;
only the host, database, role and effective schema are needed by the script.
The script never accepts a connection URL or reads Vercel/.env credentials.

## 2. Match it in Neon

1. Open the existing Neon project that owns that endpoint. Record Project ID from
   its project page/URL. Open the actual matching branch, record its br-... ID;
   a friendly name or default badge is not proof. Neon's branch named main, if used,
   is separate from Git main; do not rename or modify either.
2. Click Connect. Select that branch, its primary read/write compute, the application's
   database and runtime role. Turn OFF the displayed Connection pooling toggle to
   obtain the DIRECT hostname. This changes the displayed connection details, not
   the application's configuration. Copy only the hostname and other nonsecret
   fields, not the password or full connection string.
3. Compare the active Vercel host with the direct host. The only accepted difference
   is the endpoint's -pooler suffix. Endpoint ID AND remaining hostname must match.
   Database, role and effective public schema must match exactly. Do not infer a
   target from product counts or project/branch names. See the official
   [Neon connection details FAQ](https://github.com/neondatabase/website/blob/main/content/faqs/find-database-connection-string-url.md).
4. Identify an EXISTING authorized audit role whose password you already have and
   that can read the metadata and aggregate counts. It may differ from the runtime
   role. Identify the existing proposed migration role too; this handoff does not
   log in as it or grant anything. If credentials/permissions are unavailable, stop
   and obtain authorization through the owner, never paste them in chat.

The script compares the supplied metadata tuple and SQL verifies database/role/
primary/read-only state. SQL cannot independently prove which Neon project/branch
an endpoint belongs to. The report explicitly labels that external mapping as an
OPERATOR ATTESTATION, not independent infrastructure verification.

## 3. Collect the local source fingerprint (metadata only)

Open a fresh Windows PowerShell -NoProfile session. Do not enable transcription.
The following reads only the protected local baseline; it does not rehearse or
migrate anything. Enter the LOCAL postgres password at psql's prompt:

```powershell
Set-Location -LiteralPath 'C:\Users\alexa\OneDrive\Документы\stikr-shop'
Remove-Item Env:PGPASSWORD,Env:PGSERVICE,Env:PGSERVICEFILE,Env:PGHOSTADDR -ErrorAction SilentlyContinue
$env:PGSSLMODE = 'disable'
$env:PGPASSFILE = Join-Path $env:TEMP ('batch18-no-passfile-' + [guid]::NewGuid().ToString('N'))
$env:PGOPTIONS = '-c default_transaction_read_only=on -c statement_timeout=30s'
try {
  & 'C:\Program Files\PostgreSQL\18\bin\psql.exe' -X -q -A -t -W -h 127.0.0.1 -p 55432 -U postgres -d restore_3dkid_batch18 -v ON_ERROR_STOP=1 -v VERBOSITY=sqlstate -f '.\docs\release\batch-1.8-restored-fingerprint-readonly.sql'
  if ($LASTEXITCODE -ne 0) { throw 'Local baseline metadata failed; stop.' }
} finally { $env:PGSSLMODE = 'verify-full' }
```

Record the 32-character lowercase hexadecimal schema fingerprint. Do not substitute
the live hash for it, and do not enter a 64-character SQL file SHA-256 here. The
12/12 successful rehearsal JSON did not retain this schema fingerprint. If the
source server is unavailable, stop; do not initialize or recreate the baseline.

## 4. Run the guarded Production collector

```powershell
Set-Location -LiteralPath 'C:\Users\alexa\OneDrive\Документы\stikr-shop'
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\operator\batch18-production-preflight.ps1
```

It prompts for these NONSECRET metadata fields, in this order:

| Prompt | Value/source |
| --- | --- |
| ProjectId / BranchId | Console-attested Neon project ID / br-... ID |
| DirectHost | Primary direct ep-...neon.tech hostname; no protocol, password, path or -pooler |
| Database | Selected application database in Neon |
| AuditRole | Existing authorized role whose password will be entered securely |
| MigrationRole | Existing proposed DDL role, for privilege inspection only |
| ApplicationRole | Neon runtime role that matches the active Vercel URL username |
| VercelHost / VercelDatabase / VercelRole | Nonsecret fields of the ACTIVE deployment's DATABASE_URL |
| VercelSchema | public; any different schema is rejected for review |
| DeployedCommit | Active Production SHA, expected 76621cf01ebe482bfee9a80aaed4a4b5b9dfed22 |
| BaselineFingerprint | Local 32-hex schema fingerprint from step 3 |

After validation, type READONLY only if the Neon primary and ACTIVE deployment
mapping have been established. Then enter the NEON AUDIT-role password at the
secure local prompt. It is not the local PostgreSQL password. No password or full
URL is a command-line parameter. Do not pass secret values as metadata fields.

The collector pins docs/release/batch-1.8-production-preflight.sql at SHA-256
64139191343df170888a22af34f298cebd5fe61d8064d9b313ab7362791e0284 and runs those
verified checks from the same captured bytes (no reread after hash verification),
verbatim after a read-only identity/RLS/foreign-table/base-table
guard. It forces TLS verify-full, a noninteractive psql child, default read-only
transactions and bounded connection/query/client timeouts. No existing credential
file or parent process PG environment is used/changed. If trust roots/TLS or target
checks fail, stop and share the sanitized code; never disable verification.

Only the password's transient child-process environment is used for authentication.
The BSTR is zeroed and SecureString/child credentials cleared in finally. Raw stdout
and stderr are captured only in memory. A strict CSV header/type/size parser writes
only sanitized metadata, schema hashes, privilege flags and aggregate counts.
Dynamic object/migration/extension/writer labels are hashed. No customer row, SQL
text, password or connection URI is printed or persisted. Temporary SQL contains
no credentials and is removed; no recursive cleanup touches other directories.

## 5. Expected output and what to share

For successful READ-ONLY COLLECTION:

```text
Sanitized report: C:\Users\<you>\AppData\Local\3dkid-batch18-production-preflight\<runid>\result.json
Read-only collection: COLLECTED; exit code: 0
COLLECTED means evidence collected, never migration approval. No backup, DDL, DML or release action.
```

The owner-only result directory disables inherited access; files are private to
the operator and SYSTEM. Its result.json contains:

- Validated nonsecret Target tuple and explicit operator-attestation boundary.
- Evidence.Identity and Fingerprint; table/column/FK/index/trigger/enum metadata
  as approved names/hashes; migration history presence/checksum/status metadata.
- Evidence.Counts[0].jsonb_object_agg: current Product, Category, ProductImage,
  Order and other original table counts. A catalog larger than five is accepted.
- Runtime/migration permissions, existing size-value compatibility counts and
  current activity summaries with dynamic labels hashed.
- Findings for schema/object/version/history/permission/index issues and active
  transactions. Writer visibility, cold/deferred consumers and post-DDL runtime
  grants always require separate operator review. No idle-session count proves
  all writers are drained.
- MigrationApproved=false, always. COLLECTED/exit 0 does not mean every finding
  passed or that a backup/migration/release is approved.

If BLOCKED, the script prints only a fixed B18_PREFLIGHT_... code and, when private
output setup completed, saves a sanitized failure report. Authentication/TLS errors
do not print raw diagnostics or trigger retries. No database write is attempted.
Share only the sanitized result.json or its path/status/findings, not screenshots
of environment values, passwords, full URLs, raw client output or customer data.

Physical/mobile QA, hosted behavior and live integration checks remain pending.
No backup, snapshot, branch, grant, data edit, commit, push, merge, deployment,
native activation or Blob cleanup occurs. Stop after collection and review.

## Preparation verification

Offline tests load function definitions only. Ten groups PASS: PowerShell syntax,
target/pooler/deployment/role/schema mismatch rejection, synthetic SecureString
child lifecycle, read-only SQL guard generation, strict CSV/count conversion,
dynamic text redaction, safe error codes, drift/approval findings and pinned SQL/
cleanup behavior, plus the confirmed shared database/owner-role profile with unchanged
target/read-only guards. No operator main, credential prompt, PostgreSQL client, network
connection or Production check was executed by the agent.
