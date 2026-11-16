# Batch 1.7.5A — safe saved-media cleanup

Stage 1 implementation on `fix/batch-1.7.5a-media-cleanup`, based on
`794e99d0a0fe5572aee330d561e7e2f116090425`. No release or live storage operation
is part of this stage. This document includes the Stage 1 safety correction
requested after Stage 2 stopped for missing browser-media retention guarantees.

## Retention guarantee and stale clients

The initial implementation checked current database references but made old
objects immediately eligible for deletion. A persisted cart or already-served
page could still contain the previous URL. Inactive/deleted cart products also
kept that old image indefinitely. Database locks cannot track those browser
references, and cache invalidation cannot rewrite pages already delivered.

The corrected policy is:

- Current clients discard persisted image URLs during legacy/current hydration,
  mutations, loading and failed verification. Cart persistence writes a local
  placeholder instead of a remote URL. Cart page, drawer and checkout summary
  additionally gate image rendering on verification of the current cart revision.
- Successful reconciliation supplies current authoritative product images.
  Deleted/inactive products remain unavailable lines with a local placeholder;
  IDs, selected variants, quantities and shopper intent remain intact. Offline
  reconciliation preserves the cart and blocks checkout. Broken image requests
  use the existing local fallback.
- Superseded saved assets remain stored for **at least 30 days** after the
  successful mutation. Eligibility starts no earlier than the first enabled,
  isolation-approved worker observation of the committed candidate. A quiet or
  disabled worker therefore retains files longer; it cannot shorten the window.
  Registration/deadline checks use the same database clock, so application-server
  clock differences cannot authorize an early deletion. Clock lookup failures
  retain the asset.
- After 30 days, a candidate is only eligible. The worker must still recheck all
  current authoritative references and commit the retirement fence before `del()`.
  Reuse cancels an unclaimed candidate inside the saving transaction. A later
  removal starts a new full window, including removal of a final shared reference.
- No finite retention period guarantees permanent availability for URLs embedded
  in indefinitely cached pages, old application code, saved documents or external
  direct links. Those URLs may eventually stop resolving after eligible cleanup.
  Guaranteeing zero broken historical URLs requires retaining all prior objects
  forever (or an equivalent permanent media-serving archive); this batch does not
  offer that guarantee. The current client fallback contract and 30-day minimum
  are the intended tradeoff.

Current `OrderItem` records have no dedicated image URL snapshot, and the current
notification renderer does not embed product images. No order data is modified.
Future order media snapshots or other media-bearing tables must participate in
reference protection before cleanup may run. If historical/imported data in
other fields or payloads embeds media that must remain available, inventory and
protect it before activation; the worker cannot infer every external reference.

## Save and deletion protocol

Product create/update/delete, category media mutations and saved storefront
content mutations participate in one PostgreSQL transaction-scoped advisory lock
(`175501, 1`). Transactions explicitly use Read Committed isolation so reads
after waiting for the lock see the latest committed references.

An update reads the old main-image and hover URLs inside that transaction. The
existing main-image helper still updates the same gallery record; it does not
recreate galleries, sizes or products. Removed saved references are enqueued in
the same transaction as the successful mutation. Product deletion collects all
gallery and hover URLs before deleting the product. Validation, authorization,
foreign-key, variant, image, queue or commit failures roll back the mutation and
queue together. No Blob call is made inside a database transaction.

After a successful mutation, Next.js `after()` schedules a bounded cleanup pass.
New candidates have no retention start time until a worker observes them after
commit. That pass records the durable timestamp and returns without deleting.
Legacy version-1 immediate candidates receive a new full 30-day window as well.
Each candidate is re-read under the same advisory lock. Cleanup scans every
saved product image (including galleries and inactive products), product hover
URL and description, category image and description, non-internal `SiteContent`
value, and Review avatar/text. Shared URLs are retained. URL query/fragment
aliases, supported HTTP aliases, and URLs embedded in text, JSON or percent-encoded content are treated
conservatively as references. None of these checks fetches remote content.

After the retention deadline, when no reference remains, cleanup **commits a permanent retirement marker
before calling Blob**. Every participating writer refuses to attach a retired
URL. A save that gets the lock first protects its new reference; a cleanup claim
that gets the lock first prevents reattachment. This closes the check/delete
race across app instances and permits safe retries after uncertain network or
database results. A retired file must be uploaded again to obtain a fresh URL;
the product form explains this in Ukrainian and English.

## Storage scope and private state

Only HTTPS public Blob URLs with the exact app-generated UUID filename pattern
under `3dkid/product-media/image/` or `3dkid/product-media/animation/` qualify.
The hostname must match the store ID in the server's configured
`BLOB_READ_WRITE_TOKEN`. An optional existing `BLOB_STORE_ID` must agree if set.
The SDK receives that same explicit token. External Cloudinary/Supabase URLs,
other stores, other prefixes and unknown legacy filename patterns are retained.
No additional credential is required. HTTP aliases can protect an existing Blob
reference or cancel pending retirement; they do not qualify as deletion
candidates. SDK deletion always receives the canonical approved HTTPS URL.

## Safe activation in a future release

Destructive cleanup is **disabled by default**. Writer guards and durable queue
creation work without activation. `PRODUCT_MEDIA_CLEANUP_ENABLED=true` is an
explicit server-only opt-in for the worker; never use a `NEXT_PUBLIC_` variable.
No environment setting was changed in Stage 1.

Before an operator enables it in an authorized future release:

1. Deploy this version with cleanup disabled, then drain old media-writing
   requests/deployments and disable any older writers connected to this database.
2. Confirm that every saved reference to objects in this dedicated Blob prefix
   belongs to **one authoritative reference database**, and every active writer
   uses the same locking/retirement protocol. A reference scan of one database
   cannot protect references in another database. The worker's database role
   must see every relevant row; separate schemas or row-level visibility limits
   must not hide references from cleanup.
3. Audit **all** Production/Preview/Development connections and other applications
   or credentials using the store. Production and Preview currently receive Blob
   connection variables; this is NOT proof of matching databases or isolation.
   This implementation requires a dedicated store for one deployment environment
   and one authoritative reference database. Separate stores for independent
   environments/databases before activation. Do not approve a shared store.
4. Inventory historical/imported media references and accept the documented
   30-day/browser-fallback policy. If permanent historical URLs are required,
   leave cleanup disabled. Review/import missing reference protections first.
5. Only after independently verifying these facts, create a server-only
   `PRODUCT_MEDIA_CLEANUP_SCOPE` approval in the intended environment through an
   authorized release. Its JSON shape is:

   ```json
   {"exclusiveStore":true,"environment":"production","storeId":"<store-id>","databaseFingerprint":"<sha256>"}
   ```

   `storeId` is the lowercase public Blob hostname's first segment (without
   `store_`). `environment` must exactly match the runtime `VERCEL_ENV`, one of
   `production`, `preview`, or `development`. `databaseFingerprint` is lowercase
   SHA-256 of `JSON.stringify([url.hostname.toLowerCase(), url.port || "5432",
   url.pathname, url.username, url.search])`, where `url = new URL(DATABASE_URL)`
   and `url.searchParams.sort()` is called first. The protocol must be PostgreSQL.
   Compute this offline inside authorized server configuration; never print the
   connection string, credentials or token. The authority password is excluded;
   role and all query parameters are bound conservatively, including schema and
   search-path settings. Host, port, path, role or query changes require renewed
   approval, even for aliases/transport settings of the same physical database.
6. Explicitly set `PRODUCT_MEDIA_CLEANUP_ENABLED=true` only in that verified
   scope. A missing/malformed approval, nonexclusive declaration, mismatched
   store/database/environment, or missing enable flag prevents worker activity.
   Copying Production approval/connection variables into Preview does not pass
   the environment check. No approval or environment variable was configured in
   this stage. If isolation cannot be established, leave BOTH controls absent.

The scope approval is an operator attestation bound to the current configuration,
not independent discovery of every consumer of a storage token. The worker
cannot scan another environment's database or query Vercel project connections.
Do not issue the approval if another environment might reference the store.
Previously shared stores require an authorized isolation/migration plan or must
remain excluded from cleanup; this stage provisions or migrates nothing.

Pending candidates receive fresh reference checks when a successful Admin
mutation triggers an approved worker. Disabling controls stops new passes, not
an already claimed in-flight deletion; retirement markers must remain intact.

The worker uses official server-side `@vercel/blob` `del()` with a three-second
abort signal. It is a `server-only` helper, not a server action or public deletion
endpoint. Upload-completion callbacks remain unchanged and perform no attachment
or deletion. Persistent credentials never enter client modules or responses.

No schema migration is needed. Small JSON queue entries and retirement markers
reuse the existing `SiteContent` table, with reserved internal keys:

- `__product_media_cleanup_queue__:<SHA-256 of canonical URL>`
- `__product_media_retired__:<SHA-256 of canonical URL>`

The ordinary content action accepts only its existing allowlisted keys, so Admin
form submissions cannot edit this ledger. These internal rows are excluded from
reference scans and are never rendered as storefront content. They contain URL
metadata, retry/claim state and hashes, never credentials or file bytes. Keep
retirement markers permanently; deleting one could reopen the reattachment race
with an uncertain or delayed deletion.

## Failures, recovery and limits

- A pass reads at most 100 queue entries and attempts at most four eligible
  candidates. Reference projections are capped at 1,000 rows per scanned model.
  Exceeding a cap, a read error or missing/mismatched configuration retains the
  asset and queue entry. This favors retention when the check is incomplete.
- Claims have a 60-second lease and unique claim ID. Competing workers recheck
  the current lease, and finalization is fenced by the claim ID. Repeated
  unchanged mutations do not reset deadlines or retry state or re-delete completed
  objects. Actual reuse cancels a pending candidate; later removal starts anew.
- Failed/uncertain SDK deletion retains the retirement marker and durable queue.
  Retry backoff increases from one minute to one hour. Already-missing objects
  count as successful cleanup. A failed final database acknowledgement is safe
  to retry after the lease, because the marker committed before the network call.
- When enabled, subsequent successful Admin product/category/content mutations trigger retries.
  `after()` or worker failures do not turn a committed Save into a failure. A
  stopped process leaves durable work for the next trigger. No timer, public
  retry endpoint, new scheduler or infrastructure was introduced.
- Logs contain stable event names and asset hashes only. Investigate persistent
  `media_cleanup_*` warnings and ledger backlog through authorized server-side
  operational access; never print tokens or raw provider exceptions. The private
  `runProductMediaCleanup()` helper can be invoked by a future approved server
  maintenance task, using the same safeguards. This stage does not run it against
  live data.
- Cleanup is opportunistic, not a guaranteed wall-clock job. Quiet stores retain
  pending files until the next Admin mutation. Large backlogs, repeated failures
  in the bounded queue window, or reference counts above the cap require an
  explicitly reviewed maintenance/pagination enhancement. Do not bypass reference
  checks or remove markers to force cleanup.
- Future gallery, Review or other media-writing features must acquire the same
  lock and check retirement before attaching URLs. Review currently has no app
  mutation path. Direct SQL, old deployments, seeds and ad hoc scripts bypass
  application guards; do not run media-writing maintenance or an older writer
  concurrently with cleanup. During a rolling release, drain old mutation
  handlers before enabling cleanup traffic. Raw database writes are outside the
  protocol's concurrency guarantee.
- Blob/CDN cache propagation can temporarily leave a deleted public URL readable;
  cleanup does not promise immediate cache invalidation.

## Never-attached uploads

An upload that was never saved on a product is a separate orphan-upload issue.
This implementation does not enumerate the store or delete those files. A
future cleanup should use an age threshold, produce a reviewable inventory,
compare all saved references, and enroll approved candidates in the same durable
retirement/locking protocol before deletion. Listing an unreferenced URL once
is insufficient evidence for deletion. Never remove shared assets automatically
based solely on one product edit.

## Isolated verification

`scripts/verify-media-lifecycle.ts` loads the real actions and worker with
fail-closed dependency bindings, a serialized transaction/rollback fixture and
mocked Blob SDK. It covers replacements, clearing hover, rollback, shared and
external URLs, concurrent saves, reattachment during deletion, competing workers,
product deletion, bounded scans, retry/commit failures and missing configuration.
It never loads environment files, constructs a real Prisma client or calls live
storage. Existing cart, checkout, media, upload, browser and responsive suites
remain part of regression validation. Production compilation uses only
`scripts/verify-build-isolated.mjs`, which blocks database/provider effects.

This is mock-based concurrency verification; no live PostgreSQL locking or Blob
integration test was run. Any later live test must use an explicitly authorized
nonproduction database and storage store.

### Stage 1 and safety-correction results

All checks passed with Node 24.16.0 and the installed dependencies:

| Check | Result |
| --- | --- |
| `verify-media-lifecycle.ts` | 21 isolated groups, including 30-day deadlines, DB/app clock skew, restarts, reuse, legacy jobs, scope/schema/role isolation, rollback, races and retries |
| `verify-product-cart-ux.tsx` | 18 cart/product/slug groups, including masked hydration and authoritative image refresh |
| `verify-media-upload.tsx` | 8 existing upload groups, mocked SDK/provider verification |
| `verify-cart.ts`, `verify-checkout-cart.ts`, `verify-checkout-render.ts` | Passed |
| `verify-checkout-acceptance.ts` | 15 mocked checkout acceptance categories |
| `verify-batch17-availability.ts`, `verify-unified-catalog.ts` | Passed, UA/EN and availability/size behavior |
| `verify-product-media.ts`, `verify-image-hosts.ts` | Passed in default isolated mode, no remote validation |
| `verify-cart-drawer.ts` | 4 UA/EN desktop/mobile browser scenarios |
| `verify-cart-drawer.ts [Edge path] --media-upload` | 6 UA/EN browser upload scenarios, mocked storage |
| `verify-responsive.ts` | 216 storefront viewport renders |
| `verify-admin-responsive.ts [Edge path] --batch175` | 88 Admin viewport renders and keyboard checks |
| TypeScript / ESLint | Passed, no errors or warnings |
| Isolated production build | Passed; actual DB and provider effects blocked |
| `git diff --check` | Passed |

Changed files (22 total, all original 13 preserved and extended):

- New lifecycle code: `src/lib/media-lifecycle-policy.ts`,
  `src/lib/media-lifecycle.ts`, `src/lib/media-cleanup-after.ts`.
- Guarded mutations: `src/lib/actions/products.ts`,
  `src/lib/actions/categories.ts`.
- Localized recovery: `src/components/admin/product-form.tsx`,
  `src/lib/product-slug.ts`, `src/lib/i18n.ts`.
- Isolated tests: `scripts/verify-media-lifecycle.ts`,
  `scripts/verify-product-cart-ux.tsx`, `scripts/verify-batch17-availability.ts`.
- Documentation: this report and `docs/vercel-blob-product-media-setup.md`.
- Safety correction: `src/lib/cart-reconciliation.ts`, `src/store/cart-store.ts`,
  `src/app/(shop)/cart/page.tsx`, `src/components/cart/cart-drawer.tsx`,
  `src/components/checkout/checkout-page.tsx`, `scripts/verify-responsive.ts`,
  `scripts/fixtures/cart-drawer-browser.tsx`,
  `scripts/fixtures/cart-drawer-environment.tsx`.
- Regression timing correction: `scripts/fixtures/media-upload-browser.tsx`
  waits for the actual 50% progress value rather than assuming the initial
  progress element has already painted it; the assertion remains bounded.

No schema/dependency changes or migrations. The catalog product card/add-to-cart
UX, payment/carrier logic and existing media upload/callback
implementation remain unchanged. No real database/storage operation, Production
configuration change, commit, push or deployment was performed. All 22 files
remain uncommitted on the feature branch at the approved baseline commit. The
retention safety correction resolves the original Stage 2 code/policy blocker;
safe live activation remains blocked until the isolation and rollout
prerequisites above have been independently established.
