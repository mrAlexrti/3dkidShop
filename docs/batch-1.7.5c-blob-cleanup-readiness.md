# Batch 1.7.5C — Blob cleanup readiness and deferred QA

## Decision and boundaries

**Audit outcome: BLOCKED for cleanup activation.** The reviewed application
protocol passes its isolated regression checks, but code and mocks cannot prove
exclusive live storage/database ownership, complete historical references or
controlled deployment/maintenance writers. The operator reports a shared
Production/Preview Blob store. Do not approve that scope or enable deletion.

Branch: `feat/batch-1.7.5c-blob-cleanup-readiness`, created from fetched
`origin/redesign-3dkid-v2` at `d1ac3b153a9d956e400d541e6c9110519956c29e` after
confirming a clean working tree. No prior local work was discarded. This stage
adds documentation, an offline diagnostic and isolated tests; application runtime
code, database schema and dependencies remain unchanged.

Reviewed sources include the [1.7.5A policy](batch-1.7.5a-media-cleanup.md),
[upload setup](vercel-blob-product-media-setup.md), lifecycle/policy/after helpers,
product/gallery/category/content actions, upload authorization/callback, Prisma
schema, notification rendering and maintenance/seed scripts.

**Cleanup safety status:** disabled by default in code; no activation, scope
approval or environment setting was changed. A worker returns before storage or
database work unless the server enable value is exactly `true` after trimming.
It then requires a valid configured store and matching exclusive
store/environment/database approval. Actual deployed values were **not verified**.
The operator must independently confirm that they remain disabled in every
current and callable old environment/deployment.

No live Production/Preview database query or Blob inventory/upload/deletion was
performed. No Vercel/Neon connector was available, and browser/native access
reported unavailable. Authenticated settings were not inspected. No credential
was requested, printed or copied. Public vendor documentation is not evidence
of this project's actual configuration.

## Deferred manual QA

[deferred-manual-qa.md](deferred-manual-qa.md) registers **17 scenarios**, all
**Pending Manual QA**, with prerequisites, expected behavior, batch/release
references and evidence/findings fields. It covers every requested gallery,
upload, form, About/SEO, deletion/archive, cart and physical-mobile scenario,
plus retention/retry integration, slugs and quantity/availability behavior.
Neither successful deployment nor automated browser tests mark live QA complete.

## Reference coverage and writer audit

| Saved source | Cleanup protection and current writer behavior | Finding |
| --- | --- | --- |
| `ProductImage.url`, all rows including galleries/inactive products | Full image projection; product create/update/delete hold the media lock. Gallery synchronization validates ownership and updates retained IDs in the same transaction. | Covered in application protocol; no primary-only scan |
| `Product.hoverGifUrl`, `description`, `descriptionEn` | Product actions check attachment fences and collect old references under the lock. | Covered, including embedded/encoded aliases |
| `Category.imageUrl`, `description` | Create/update/delete participate in the same transaction lock and retirement protocol. | Covered |
| Non-internal `SiteContent.value` | All non-ledger values scanned, including three hero images, eight About fields and future allowlisted copy. Content action accepts only its allowlist and holds the lock. | Covered; About is escaped text but embedded managed URLs still protect objects |
| `Review.avatarUrl`, `text` | Scanned conservatively; no current application Review mutation path was found. | Covered on read; any future writer must join the protocol |
| Current order/notification rendering | No dedicated media URL/image snapshot in `OrderItem`; size snapshot and notification templates do not intentionally attach product images. | No current image writer found; historical/imported payloads remain unverified |
| Browser carts/pages/external documents | Not authoritative DB references; current carts mask unverified remote images, reconcile current media and use placeholders for deleted/inactive/offline/broken states. | Finite retention cannot preserve all historical direct URLs |

`readMediaReferences` projects `ProductImage`, `Product`, `Category`, `SiteContent`
and `Review`; it does not filter out unpublished/archived product references.
Internal queue/fence rows are excluded so the ledger does not protect itself.
Canonical query/fragment aliases, HTTP aliases and supported text/JSON/percent
encoding are treated conservatively, without fetching any URL.

This establishes coverage of **known current media-bearing fields**, not proof
that every arbitrary persisted string in live databases is media-free. Product
names/alt text, option labels/notes, attributes, old order options/comments and
notification payloads are not a universal historical-URL index. An authorized
historical/import audit must establish whether any contains references that the
retention policy must protect. If so, extend authoritative scanning and its
writers before activation; an offline candidate report cannot fix that gap.

### Save, gallery changes and archival

The common transaction-scoped PostgreSQL advisory lock is `(175501, 1)`, with
explicit Read Committed isolation. A waiting writer reads previous media only
after obtaining the lock. `assertMediaAttachable` rejects any retirement marker
and atomically cancels pending reuse candidates. Gallery add/reorder/update and
product/size Save commit together; failed validation/Save/commit cannot leave
retirement work for the failed mutation. The gallery snapshot detects stale
editors, and retained `ProductImage.id` values remain stable.

Registration excludes URLs still referenced by any scanned entity. Reordering
without a removed URL creates no candidate. Removing the last shared reference
can register a new candidate; actual reuse followed by later removal earns a
fresh full window. Category/hero/About saves use the same attachment and reference
checks. Physical product deletion collects every gallery/hover URL after the
protected-order check; FK errors roll back. Archival retains media and registers
no retirement. Upload completion only authenticates provider completion; it does
not save entities, register retirement or delete assets.

### Ownership, retention and retries

- Only canonical HTTPS public Blob URLs with the generated UUID filename pattern
  under `3dkid/product-media/image/` or `.../animation/` qualify. The hostname must
  match the configured read-write token's store. Optional `BLOB_STORE_ID` must
  agree. External Cloudinary/Supabase URLs, other stores/prefixes and unknown names
  are retained. The official `del()` receives that explicit server token.
- The store-ID parsing matches installed `@vercel/blob@2.9.0`'s
  `parseStoreIdFromReadWriteToken` implementation. This is a pinned-SDK contract,
  not an assertion about all future credential formats. An OIDC/token-format or
  SDK change requires a new ownership audit. The existing browser-upload flow
  still needs its read-write token; no authentication migration is included.
- Registration stores `retentionStartedAt: null`. Only an enabled, scope-approved
  worker observing the committed candidate starts the durable clock using
  PostgreSQL `clock_timestamp()`. Eligibility is **at least 30 days after that
  observation**, therefore no earlier than 30 days after the successful Save.
  Disabled/quiet workers retain files longer. App-server clock skew can affect
  scheduling, but the locked DB-time eligibility check cannot shorten retention.
- Legacy immediate jobs receive a fresh clock. Queue/commit/read/clock failures
  retain the object. Restart does not recreate an earlier deadline. No public
  caller or environment knob can shorten the hardcoded minimum through the
  application API. Direct database/provider tampering is outside that guarantee.
- Immediately before a deletion claim, the worker rechecks persisted references
  under the lock and commits a permanent retirement fence. A concurrent writer
  either attaches first and protects the URL, or observes the fence and refuses
  attachment. No SDK deletion occurs inside a database transaction.
- Lease/claim IDs fence finalization. The 60-second lease permits crash recovery;
  uncertain SDK failure retains the marker/job with backoff (one minute to one
  hour). Missing objects finish idempotently. Keep markers permanently, including
  uncertain/deleted ones; never remove them to force reattachment or a retry.
- `after()` runs only following a successful Admin mutation. Failure scheduling
  or running cleanup cannot invalidate that committed Save. There is no cron,
  polling loop, public deletion/retry endpoint or independent queue drainer.
- Each pass considers at most 100 ordered queue rows and four eligible entries;
  each reference projection is capped at 1,000 rows. A cap/error retains media;
  an enqueue scan cap can skip registration. Ten-image galleries can reach the
  image cap sooner than a product count suggests. Quiet stores, immature entries,
  repeated failures and the fixed queue window can delay/starve later entries.
  Volume/backlog evidence and a reviewed pagination/maintenance enhancement may
  be needed; do not bypass checks to improve throughput.
- Disabling the flag stops future passes, not an SDK call/claim already in flight.
  Preserve the fence and investigate uncertain outcomes. Arbitrary storage-console
  deletion, overwrites, provider expiry policies or other token users can bypass
  application retention and must be excluded operationally.

### Older writers and direct mutations: not automatically protected

Application advisory locks cannot compel arbitrary SQL or old code to acquire
them. Concrete paths found outside the lifecycle protocol include
`prisma/seed.ts`, `scripts/backfill-product-translations.ts`,
`scripts/dedupe-categories.ts` and `scripts/configure-storefront-categories.ts`.
Depending on the script, these change descriptions, category media/content or
delete products/categories. They must not run against a cleanup-enabled scope
until separately reviewed/adapted. Some are development-guarded; that is not
proof of a correctly isolated connection or media-write protocol.

`updateNotificationSettings` writes only allowlisted booleans serialized to its
fixed SiteContent key; it cannot attach a media URL or edit ledger keys. It is
therefore not a missing media writer. Checkout/payment paths remain unchanged.

Old deployments, admin database consoles, Prisma Studio, imports, restores,
seeds and ad hoc scripts can still bypass attachment fences. Activation requires
an enforced writer/credential/runbook inventory and draining/disabling old
mutation paths. If this cannot be established, **leave cleanup disabled**. No DB
trigger or migration was added to claim stronger enforcement than exists.

## Production/Preview isolation plan

Vercel supports environment-selected store connections and more than one store
per project; a store can also be connected to multiple projects. Those connection
possibilities do not prove isolation. [Vercel Blob documentation](https://vercel.com/docs/vercel-blob#connecting-a-store-to-your-projects).
Neon branches can isolate subsequent database writes while initially copying
their parent's data. Our inference is that copied rows can therefore preserve
the same public Blob URLs; a separate database branch alone does not isolate
media references. [Neon branch documentation](https://github.com/neondatabase/website/blob/main/content/docs/manage/branches.md).

Recommended target, for a future separately authorized configuration change:

| Scope | Blob storage | PostgreSQL / reference policy |
| --- | --- | --- |
| Existing shared assets (`L`) | Retain the existing public store and every URL; no deletion or file movement | Treat all historical Production/Preview/other consumers as unresolved; keep this store outside cleanup |
| New Production media (`P`) | Dedicated public Production store, only approved Production writers | One authoritative Production database/role/schema, complete reference visibility and common retirement ledger |
| Preview media (`V`) | Dedicated public nonproduction store with its own environment-scoped credentials | Independently verified nonproduction DB/Neon branch, synthetic or sanitized fixtures, no Production-asset references |
| Development | Dedicated disposable storage or manual/local fixture URLs | Isolated local/test DB; no Production credentials, approval or writable connections |

This plan does **not** require moving/deleting existing Production files or
rewriting their URLs. Existing public `L` URLs continue to serve after future
upload credentials target `P`/`V`; Next image hosts already support public Blob
URLs. The worker's configured-store check would retain `L` assets and queue
entries when configured for `P`. Do not repurpose/delete legacy markers/jobs.

If the operator wants to keep new Production writes in `L`, that is possible
without migration, but cleanup of `L` remains blocked until **all** legacy and
current other-environment references/consumers are resolved. Disconnecting
Preview, renaming a store or issuing another token for the same store does not
erase those references. The simpler conservative option is to retain `L`
indefinitely and consider cleanup only for newly isolated `P`/`V` objects.

Separate tokens/stores are necessary operational boundaries, not proof that a
Preview DB never contains a Production URL. Manual URL entry, cloned databases
and imports can copy URLs across scopes. Use schema-only/synthetic Preview data,
or a separately authorized sanitization that replaces copied Production URLs
with local placeholders or independently uploaded Preview copies. Original
Production assets stay intact. Audit/reset/restore workflows must maintain that
rule continuously. Do not delete Preview DB rows or rewrite Production data as
part of this stage. If consumers must keep cross-scope managed URLs, the current
exclusive-scope worker is unsuitable; retain those stores or design a reviewed
shared-reference authority before activation.

Do not assume all Preview deployments use one database. Branch-specific Vercel
overrides, custom environments, cloned Neon branches, old deployments, other
projects and developer machines must each be inventoried. Public read access
does not imply a separate writable reference authority. Sharing one DB across
Production/Preview also violates this rollout's one-environment scope policy;
it is not an approved shortcut merely because scans could see both sets of rows.

## Activation blockers and operator checklist

Every item is **unverified/pending** unless identified as a code finding above.
Record evidence privately using redacted aliases/IDs, tester and date. Never send
tokens, connection strings, passwords, OIDC values or unredacted environment
screenshots. This checklist is not authorization to change settings or activate.

1. **B1 — Current controls:** In Vercel, review each Production, Preview,
   branch-specific/custom and Development environment plus callable old
   deployments. Confirm cleanup enable is absent/disabled and no unreviewed scope
   approval exists. Local code defaults do not verify deployed values.
2. **B2 — Store consumers:** From Storage connection metadata, record nonsecret
   store identifiers, public hostnames, connected projects/environments and
   credential types. Include other applications and historical consumers of `L`.
   Check external lifecycle/expiry, manual maintenance and overwrite policies.
3. **B3 — Actual databases:** Privately map each deployed `DATABASE_URL` (including
   branch overrides/injected integration values) to Neon project/branch/endpoint,
   database, role and schema/search path. Verify in Neon Console metadata; a label
   such as "Preview", different pooler hostname or differently formatted URL is
   not proof of a distinct reference database. No Production SQL was run here.
4. **B4 — Cross-environment reference closure:** Obtain separately authorized,
   complete read-only inventories from every database/clone/restore/consumer.
   Search known media fields and historical/imported content. Determine whether
   `L`/`P` URLs survive in Preview or other scopes. Unknown or missing evidence
   blocks activation, even with distinct store credentials.
5. **B5 — Isolation rollout:** Approve a future `L` retention + `P`/`V` plan,
   provision/connect resources only in that later authorized operation, and
   validate effective deployed connections afterward. Changing environment
   variables alone does not retire old deployments or their embedded credentials.
6. **B6 — Writers and visibility:** Inventory and disable/drain old deployment
   writers, CLI/seed/Prisma Studio/import/restore paths and other token users.
   Confirm the worker role sees all relevant rows (including inactive records)
   without RLS/schema/role blind spots. Limit uncontrolled mutation credentials.
7. **B7 — References and scale:** Resolve any media-bearing historical fields
   outside current scans. Record row counts against each 1,000-row cap and queue
   volume against the 100-row/four-entry window. Capacity blockers require a
   reviewed improvement, not a larger undocumented limit or deleted ledger.
8. **B8 — Integration evidence:** Complete applicable deferred QA, including
   callback reachability, physical devices, real isolated PostgreSQL locking,
   restart/retry/fence behavior and scope rejection. Automated mocks are not
   substitutes for these live nonproduction checks.
9. **B9 — Policy/recovery approval:** Accept the minimum 30-day policy and eventual
   loss of indefinitely cached/external URLs. If permanent historical URLs are
   required, retain prior media forever. Define incident response, backups/audit
   retention and monitoring before authorizing deletion.
10. **B10 — Separate activation approval:** Only after the above, in a separately
    authorized release, bind the exclusive store, exact `VERCEL_ENV` and normalized
    database fingerprint using the existing scope protocol. Optional store-ID
    metadata must match the pinned read-write token's store. Review the existing
    [scope fingerprint contract](batch-1.7.5a-media-cleanup.md#safe-activation-in-a-future-release)
    privately. Do not set either control in this stage. A new connection/role/
    schema/consumer or SDK authentication change invalidates prior evidence.

No evidence available here resolves B1–B10. The shared legacy configuration and
unverified DB/consumer topology alone are sufficient to keep activation blocked.

## Safe orphan-upload strategy (proposal only)

A never-saved upload has no successful entity mutation to enroll it in the
existing retirement queue. It cannot be inferred from one missing product URL,
one snapshot, a callback, upload age, filename or store prefix alone.

A future separately authorized implementation should:

1. Inventory the exact managed prefix read-only with complete provider pagination,
   capture object identity/upload time/size and record snapshot provenance. Never
   fetch arbitrary object contents/remote URLs or log credentials.
2. Require at least **30 days since upload** before an object can enter a manual
   review report; retain missing/future/ambiguous age or duplicate identities.
3. Compare all current authoritative references and existing queue/fence state,
   across every relevant environment/database/clone. Incomplete scans, shared
   scopes, live writer uncertainty or existing retirement state exclude enrollment.
4. Produce a restricted, dated report with hashes/canonical public URLs, scope,
   age, reasons and reviewer findings. A candidate means "investigate", not
   "verified never attached" or permission to delete.
5. After explicit review and separate deletion authorization, revalidate provider
   object identity and complete references under the common writer lock. Refuse
   assets that were attached/reused, changed or already have a fence/job. Register
   through the existing guarded retirement protocol, not direct `del()`.
6. Start a **new full 30-day retirement window** after committed enrollment and
   first approved worker observation. Never backdate it from upload time. With
   the proposed 30-day pre-review age, deletion would normally be no earlier than
   about 60 days after upload, plus review/worker delays.
7. At the eventual claim, recheck references and ownership, commit the permanent
   fence, then use official server SDK deletion with durable retry/finalization.
   Recover uncertain outcomes through the same lease/fence mechanism. Audit
   reviewer/scope/report/object hashes, enrollment and outcomes without secrets;
   retain markers and pause on unexplained shared-reference findings.

This future mechanism needs reviewed enrollment/audit provenance, complete
pagination and controlled writers; it is **not implemented** by the diagnostic.
No listing job, public endpoint, scheduler, candidate enrollment or destructive
orphan deletion was introduced.

### Implemented offline diagnostic

`scripts/diagnose-blob-inventory.ts` reads one **explicit local JSON file** and
prints a review-only report. It imports no Blob SDK, Prisma, environment loader
or network client; it never enumerates live storage/DB, writes an input, enqueues
a job or calls a deletion. There is no `--delete`/activation option. Both
`deletionAuthorized` and `activationAuthorized` are always `false`.

Run with installed dependencies:

```powershell
node_modules/.bin/tsx.cmd scripts/diagnose-blob-inventory.ts --help
node_modules/.bin/tsx.cmd scripts/diagnose-blob-inventory.ts path/to/redacted-inventory.json
```

Input shape (illustration only; synthetic host, incomplete snapshots deliberately
prevent candidate qualification):

```json
{
  "version": 1,
  "storeId": "fixturestore",
  "targetEnvironment": "production",
  "expectedSources": ["prod-db", "preview-db"],
  "inventory": {
    "capturedAt": "2026-11-17T00:00:00Z",
    "complete": false,
    "blobs": [{
      "url": "https://fixturestore.public.blob.vercel-storage.com/3dkid/product-media/image/00000000-0000-4000-8000-000000000001.webp",
      "uploadedAt": null
    }]
  },
  "references": [
    {"sourceId":"prod-db","environment":"production","capturedAt":"2026-11-17T00:00:00Z","complete":false,"values":[],"pendingRetirementUrls":[],"retiredUrls":[]},
    {"sourceId":"preview-db","environment":"preview","capturedAt":"2026-11-17T00:00:00Z","complete":false,"values":[],"pendingRetirementUrls":[],"retiredUrls":[]}
  ]
}
```

Supply only nonsecret source aliases and URL-bearing field values, not full user,
order/auth records or connection strings. For each distinct authoritative DB,
`values` must include all paginated fields in the coverage table plus any extra
historical reference fields identified by the operator. Extract queue/fence URLs
into their separate arrays; never include internal ledger JSON as ordinary public
content or reset its clock. `complete` is an operator assertion, not independently
verified completeness. `expectedSources` must enumerate every known scope; the
diagnostic cannot discover omitted databases or external consumers.
Likewise, `snapshotEvidenceComplete: true` means only that the supplied snapshot
declarations passed local consistency/freshness checks; it is not proof that the
live inventory, reference sources or environment scope are actually complete.

Bounds: 5,000,000 input bytes, 10,000 inventory entries, 20 reference sources,
10,000 values/queue URLs/fence URLs per source, 20,000 characters per value and
2,048 per URL. This is deliberately a bounded offline review, not a scalable
provider exporter. Do not truncate a real export and mark it complete. Snapshots
must be no more than 24 hours old and not future-dated for review candidates;
missing declared sources, unexpected source IDs, missing Production/Preview
coverage or incomplete inventory block that qualification. These freshness rules
still cannot close a live concurrency race.

The diagnostic reuses the existing pure URL/reference policy, recognizes aliases
and shared URLs, retains young/unknown/future/duplicate objects, ignores external
or foreign-store URLs, and excludes existing retirement work. A target-store
reference in another environment blocks store-isolation evidence. Only canonical
managed public URLs appear in output; ignored URLs appear as hashes, with no raw
userinfo/query values. Invalid schema/extra secret fields fail with a generic
error, without echoing input or exceptions. Keep real diagnostic inputs/reports
outside Git or under ignored local QA storage; no live inventory is committed.

## Verification and changed files

Automated/local results only; no manual/live QA result is implied:

| Check | Result |
| --- | --- |
| `verify-blob-inventory-diagnostics.ts` | PASS: 9 isolated groups, age boundaries, aliases, shared scopes, ledger preservation, incomplete/stale evidence, ownership, limits, CLI failure/input preservation and no credential/network/mutation path |
| `verify-media-lifecycle.ts` | PASS: all 28 groups; expanded gallery-sharing case explicitly covers About text and Review avatar as well as gallery/product/category/hero; disabled/scope/retention/race/retry regressions retained |
| `verify-cart-drawer.ts [Edge] --gallery-admin` | PASS: 6 automated React/DOM scenarios, 320/390/1280 px × UA/EN; galleries, swipe/lightbox/GIF, uploads, About/form preservation and archive UI; no live/manual QA claim |
| `verify-media-upload.tsx`, `verify-product-cart-ux.tsx`, `verify-unified-catalog.ts` | PASS: 8 upload groups, 18 cart/product groups and UA/EN catalog behavior |
| TypeScript / ESLint | PASS with installed dependencies |
| Isolated production build | PASS: optimized Next build, live DB/provider effects blocked |
| `git diff --check` | PASS |

Changed files:

- `docs/deferred-manual-qa.md` — new deferred evidence register.
- `docs/batch-1.7.5c-blob-cleanup-readiness.md` — this audit, isolation plan, blockers and orphan proposal.
- `scripts/lib/blob-inventory-diagnostics.ts` — new bounded offline analyzer.
- `scripts/diagnose-blob-inventory.ts` — new local-file-only CLI.
- `scripts/verify-blob-inventory-diagnostics.ts` — new isolated tests.
- `scripts/verify-media-lifecycle.ts` — additional shared About/Review cases.

No Prisma migration/dependency change, UI/runtime refactor, environment change,
Production SQL, live Blob operation, Cloudflare change, commit, push, merge or
deployment occurred. All changes remain uncommitted and unpushed on the feature
branch. Production and `main` remain at their preflight SHAs. Cleanup activation
is not authorized by completing or later releasing this readiness batch.
