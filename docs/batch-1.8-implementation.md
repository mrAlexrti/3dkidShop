# Batch 1.8 Stage 1B — local Color + Size implementation

> Combined release update, 2026-11-22: the implemented Materials/Unicode divider,
> coarse-pointer card animation and Admin/category deletion safeguards are described
> in [batch-1.8-addendum-ui-safety.md](batch-1.8-addendum-ui-safety.md). The original
> report is retained verbatim under docs/review/archive/batch18-before-addendum.
> Variant identities, checkout/payment hashes and historical readers are unchanged.
> The active combined SQL/model/manifest supersede the variants-only artifacts.

## Outcome and boundaries

**Implementation: PASS locally. Production migration/deployment/activation: BLOCKED.**

Branch: `feat/batch-1.8-color-size-variants`. Baseline/unchanged HEAD:
`76621cf01ebe482bfee9a80aaed4a4b5b9dfed22`.
The eight Stage 1A/1A.5 artifacts are preserved and extended. This report supersedes
their historical statements that the native application bridge was not implemented.
No existing database URL, Neon instance, owner backup, real product/order, payment,
notification service or Blob store was used for verification. No infrastructure or
environment settings were changed. Everything remains unstaged/uncommitted/unpushed.

## Model and safety corrections

The actual Prisma schema now matches the review model. The additive changes are:

| Entity | Change |
| --- | --- |
| Enums | `ProductOptionMode`: LEGACY/SIMPLE/SIZE/COLOR/COLOR_SIZE; `ProductOptionKind`: COLOR/SIZE |
| Product | `optionMode` defaults LEGACY, DB-managed `variantRevision`, variants relation |
| ProductOption | Nullable typed kind; unique product/kind and product/id; original identities retained |
| ProductOptionValue | Nullable retirement time; unique option/id; original price/modifier data retained |
| ProductVariant | Stable ID/product, unique canonical combination key, absolute Decimal(10,2) price, explicit availability, retirement and timestamps |
| ProductVariantSelection | Immutable variant/product/option/value tuple, composite ownership foreign keys, one value per dimension |
| OrderItem | Nullable native variant FK, composite product/variant ownership with RESTRICT; existing Product FK and serialized snapshot retained |

Simple products use Product.price; native option products use only their configured
full combination price. Native SIZE keeps the old size-ID cart wire and identity,
but accepted new orders store the native FK and version-2 snapshot. Color modes use
the new versioned selection wire. LEGACY is never converted automatically; old
full size prices and null-price modifier rows retain their previous interpretation.

`docs/review/batch-1.8-variants.sql` is still **NOT APPROVED FOR PRODUCTION EXECUTION**.
It accepts only a newly created, named disposable loopback fixture database with
an explicit synthetic-test sentinel. No executable Prisma migration was installed.
There are no misleading schema-push or seeding instructions in the review artifacts.

Corrections verified on PostgreSQL 18.7 / Prisma 5.22:

- All table/type/function references are qualified to `public` or `pg_catalog`;
  DDL and trigger functions use a restricted search_path. A hostile shadow schema
  does not redirect writes, including under a nonowner application role.
- Composite FKs enforce product/group/value ownership. Stable IDs, kinds and
  selection tuples cannot be changed into a different combination. Retired tuples
  retain their unique key and restore with their original IDs.
- Deferred guards validate final transaction state, including mode/dimension
  shape, exact canonical key and current selection availability/retirement.
- Child writers lock their Product parent and increment its revision. Admin
  checks the expected revision under FOR UPDATE; checkout obtains sorted Product
  FOR SHARE locks before resolving prices and selection state. Two actual sessions
  were observed waiting on PostgreSQL locks in both race directions.
- **Confirmed Prisma defect:** a deferred constraint failure at COMMIT can roll
  back PostgreSQL while Prisma's interactive transaction resolves successfully.
  Every relevant successful application write callback ends with
  `SET CONSTRAINTS ALL IMMEDIATE`, after its last write and before return. This
  includes create/update/delete/archive Product and createOrder. No SQL follows
  the flush within those callbacks. Failed/no-write early returns schedule nothing.
- Prisma 5 cannot express the overlapping composite selection ownership cleanly
  through nested variant create. The writer creates variants then explicitly
  batches their selection inserts in the same transaction; deferred checks see
  the complete graph at the final flush.
- Complete Product deletion cascades through its native children when no order
  exists. Required historical Product references and the new variant FK prevent
  unsafe deletion. Archival retains both order history and media references.
- New native OrderItems must match current locked price, product orderability,
  exact selection and frozen bilingual snapshot. Captured v2 price/quantity/
  product/variant/snapshot fields are immutable. Existing v1/flat snapshots and
  NULL native FKs survive expansion unchanged.
- Injected DDL failure rolls the entire additive transaction back to the original
  14-table synthetic baseline. Successful DDL has an empty Prisma relational diff;
  triggers, CHECKs and deferrability are additionally tested directly.

## Admin behavior

The new controlled editor supports explicit Color/Size flags, independent UA/EN
labels and notes, manually added allowed combinations, absolute prices,
availability, retirement and restoration. It does not generate a Cartesian matrix.
Saved tuples cannot be reassigned; retire and add a different tuple instead.
Restoring a known tuple resolves to the original identity even if submitted without
its variant ID. Retiring a value also retires affected combinations in the draft.
Changing option modes requires confirmation and retires incompatible combinations.

Legacy products keep the existing size editor until the administrator explicitly
chooses conversion. Existing valid size IDs are retained; a group that cannot be
safely recognized as the legacy size group is rejected for conversion. Unpriced
modifiers are not silently converted into purchasable sizes.

All submitted state, including gallery order/IDs, labels, prices and descriptions,
remains in the form after validation, network or stale-editor errors. Errors use
centralized UA/EN strings, identify nested fields, and focus the invalid control
after pending controls are enabled again. Existing upload/save blocking remains.

Bounds: 40 active choices per dimension, 200 active combinations, 160 values and
400 combinations per submitted page; JSON input capped at 500,000 characters.
All active combinations plus 20 retired combinations and 20 retired values are
shown per history page, including needed referenced values. Omitted retired rows
are preserved. History navigation explicitly warns about discarding unsaved edits.
Native save transactions have a bounded 30-second timeout, not unlimited retries.

**Separate rollout gate:** `PRODUCT_VARIANTS_ENABLED` must equal the literal
`true` to create/convert/edit native configurations. It defaults off. The server
enforces it as well as the UI. No setting was created or changed. Gate-off bridge
code still reads/checks existing native products/orders and supports ordinary
metadata edits and archival; it does not strand pending native payments. Rollback
must retain this bridge once native data exists. Tests explicitly enable the gate
only in synthetic action fixtures; the real getter's default-off behavior is tested.

## Storefront, catalog, cart and payment behavior

- Detail pages expose only configured choices. All applicable choices are required;
  missing, unavailable and retired combinations cannot be added. A color change
  clears an incompatible size with a localized explanation. Price and quantity
  limits update together. Gallery/lightbox/GIF behavior is retained.
- Cards retain one cart button and no quantity stepper. Option products navigate
  to details. Native option prices show the minimum available configured price;
  no available price produces no purchasable offer and no base-price substitution.
  Native option products do not display misleading product-level oldPrice discounts.
- Catalog price sorting uses effective legacy/native prices in SQL **before**
  pagination. Counts, page IDs and relation reads share a Repeatable Read snapshot;
  NULL offers sort last and IDs break ties. This is covered by real SQL fixtures,
  independently of the legacy catalog test adapter.
- Color selections use strict `{version:2, variantId, values:{COLOR,SIZE?}}` data.
  Different variants remain separate lines; identical combinations merge subject
  to existing line, quantity, integer and total limits. Conflicting tuples for one
  variant ID, unknown versions or mixed old/new selection formats fail closed.
- Persistence uses `stikr-cart-v2`, isolating new color lines from old tabs that
  still write `stikr-cart`. One-time import retains legacy IDs, quantities and
  outstanding price reviews; the original key is never destroyed. Invalid,
  oversized, partially importable or unknown-version records raise a visible
  recovery state and block checkout rather than silently discarding selections.
  Storage failures similarly block checkout and support an in-memory write retry.
- Persisted images remain local placeholders until bounded authoritative
  reconciliation. Native lookups fetch selected IDs in a batched consistent read;
  unavailable/retired/missing variants remain visible and block checkout. Network
  errors retain selections and keep checkout unverified. Price changes require
  explicit review; cart edits invalidate readiness and supersede stale responses.
- Existing simple/size checkout identity serialization remains byte-for-byte
  compatible. Color identities include exact stable IDs and distinct versioned
  material. Legacy pending sessions retain their original storage namespace; new
  color sessions use a separate namespace and both return readers remain supported.
  Unreadable pending state cannot silently mint a replacement invoice.
- Existing valid Mono retries resolve before current catalog repricing, so a valid
  attempt remains replayable after variant retirement. Actual action tests prove
  one mocked invoice across a retry, and reject a changed-color retry. Pending
  payments do not clear carts; only an exact paid matching cart/revision may clear.
- Checkout resolves authoritative prices inside the Product-lock transaction,
  stores native FK plus immutable v2 UA/EN snapshots, and rejects stale quotes.
  Existing v1/flat snapshot readers remain intact. Mono provider/reconciliation,
  COD accounting, delivery and notification implementations were not refactored.

## Application database role and rollout prerequisites

The runtime role must be a **nonowner**, not superuser, not a role capable of
disabling triggers or changing `session_replication_role`, and not a member of the
deployment owner role. No CREATE on public/untrusted schemas, table/type/function
ownership, ALTER, TRUNCATE or trigger-bypass permission. Use a separately approved
migration owner. Trigger functions are SECURITY INVOKER, with fixed search_path.

The runtime role needs USAGE on public and the option enums, EXECUTE on the reviewed
guard functions, and the table privileges required by existing application actions:
catalog configuration/image CRUD; Order SELECT/INSERT/UPDATE; OrderItem
SELECT/INSERT with no ordinary UPDATE/DELETE; notification SELECT/INSERT/UPDATE;
SiteContent and category operations including the existing media-retirement ledger.
Product SELECT/UPDATE permission is also necessary for parent locks/epochs.
Historical Order/OrderItem/notification DELETE should remain denied. Exact grants
must be inventoried against all existing application paths before rollout; the
fixture's broad remaining-table CRUD is a test convenience, not a recommended
Production grant script. The nonowner test proves qualified guards work and schema
creation/history deletion are denied. It does not verify the live role.

Blocking checklist before any Production execution:

1. Restore the owner's independent dump completely into a separately authorized
   isolated target and record evidence. Readable archive contents are not restore
   proof. Never restore over a database containing newer orders.
2. Authorize read-only live target/schema/drift/role/consumer inventory separately.
   Verify PostgreSQL version, actual public schema, trigger privileges and all
   Production/Preview database consumers. Isolation has not been established here.
3. Review a new target-specific additive migration artifact and lock/maintenance
   window. Keep the guarded local SQL guarded; do not simply remove its protections.
   Preserve all integrity functions/triggers and final-flush requirements.
4. Apply approved expansion first with all existing products LEGACY. This app
   requires the added columns/tables; **do not deploy it against the old schema**.
   Regenerate the matching Prisma client in the release build.
5. Deploy the mode-aware bridge with native writes still disabled. Drain all old
   Admin/checkout/import/direct writers, including Preview consumers of a shared
   DB. SQL guards reject unsafe native order insertions but cannot make an old
   storefront understand new products or stop every stale ordinary-field overwrite.
6. Confirm exact deployment versions, environment/database isolation, app role,
   native tests and the separate manual QA register. Assess hosted connection pool,
   interactive transaction/function duration and catalog-query performance.
7. Separately approve native-write activation; only then explicitly convert
   reviewed products under revision locks. Never infer business configuration from
   labels or modifiers. No startup/build/request automatically converts products.
8. Before native data, roll back app only if old compatibility remains established;
   retain additive schema. After native products/orders exist, roll back only to
   a mode-aware bridge retaining v2 readers, prices, FKs, session keys and snapshots.
   Never drop schema, rewrite completed payments or delete historical orders.

Stable color IDs can later receive an additive filament FK/mapping. Translated
labels are not identities. No filament directory or inventory behavior is included.
Blob cleanup remains default-off, with its independent scope/isolation blockers;
variant activation grants no cleanup authorization.

## Executed verification

Tests use synthetic fixtures. External effects are mocked; these results are not
live integration QA. The original 17 Pending Manual QA scenarios are untouched.
New scenarios are in [the variant manual register](batch-1.8-manual-qa.md).

| Check | Result and scope |
| --- | --- |
| Prisma 5.22 validation | PASS, complete final schema in disposable directory; generated matching local client without database access |
| PostgreSQL 18.7 rehearsal | PASS, 20 integrity/legacy/deferred/retirement/history/concurrency groups; negative deferred-COMMIT diagnostic reproduced and explicitly corrected |
| Application against real disposable PG | PASS, 9 groups covering actual Product actions, gallery IDs, stale revision, failed Save rollback, reconciliation, SQL sorting, native Mono retry, COD, legacy conversion and delete/archive; provider/auth/cache delivery mocked |
| Two-session concurrency | PASS, separate real sessions observed in Lock wait for both checkout-first and Admin-first races; no mocked proof substituted |
| Nonowner/search_path | PASS, actual role under shadow schema; native writes/guards work, schema creation and history deletion denied |
| DDL rollback | PASS, guard rejects wrong execution and injected failure preserves original synthetic 14-table schema |
| Bounded matrix | PASS, explicitly submitted 20x10/200 combinations committed in 819 ms in the final local run; not a Production SLA |
| Native isolated implementation | PASS, 7 groups: strict identity/merge, reconciliation, migration/old tabs, actual Zustand readiness, snapshots, retired paging, unknown-version preservation; includes default-off rollout test |
| Architecture fixtures | PASS, 8 groups; retained historical counterexamples plus current compatibility assertions |
| Existing cart/checkout | PASS: verify-cart, verify-product-cart-ux (18 groups), verify-checkout-cart, verify-checkout-acceptance (15 categories), verify-checkout-render |
| Existing availability/catalog | PASS: verify-batch17-availability, verify-unified-catalog; native SQL sorting independently tested above |
| Existing media/content | PASS: verify-media-upload (8), verify-media-lifecycle (28), verify-about-content (10); no live Blob operation |
| Native browser | PASS, actual React/DOM at 320/390/1280 in UA/EN: sparse selection, prices/quantity/card routing, separate cart lines, failed Save/network/stale draft preservation, focus, mode-change confirmation, retirement/restore, mobile layout |
| Existing drawer browser | PASS, UA/EN at 390/1280, actual Zustand and readiness/image fallback |
| Existing gallery/Admin browser | PASS, 6 UA/EN runs at 320/390/1280, gallery/carousel/swipe/lightbox/GIF/uploads/form retention/About/archive with service fixtures |
| Existing Admin responsive | PASS, 154 renders using --batch175b; native editor separately exercised above |
| TypeScript / ESLint | PASS, repository noEmit and lint |
| Isolated production build | PASS, Next 15.5.9 compile/type/lint/prerender and build tracing, all 15 pages generated; empty reads, DB writes/connections and provider fetch forbidden |
| Whitespace / scope | Final results below; dependencies, settings, original manual QA and Git refs checked independently |

Reproduction commands (installed local tools; never a project DATABASE_URL):

```text
node scripts/rehearse-batch18-variants.mjs
tsx scripts/verify-batch18-implementation.ts
tsx scripts/verify-batch18-architecture.ts
tsx scripts/verify-cart-drawer.ts <local-Edge-executable> --variants
tsx scripts/verify-cart-drawer.ts <local-Edge-executable> --gallery-admin
tsx scripts/verify-admin-responsive.ts --batch175b
tsc --noEmit
npm run lint
node scripts/verify-build-isolated.mjs
git diff --check
```

The rehearsal creates its own random loopback PostgreSQL cluster and synthetic
databases, sanitizes inherited PostgreSQL connection variables and stops its own
cluster in finally. It never opens the project DATABASE_URL. Disposable fixture
files are retained under the OS temporary directory for inspection. Unit legacy
SourceModule fixtures use an explicit allowlist, a no-op constraint guard and a
catalog adapter; these are not offered as real database evidence. The PG suite
uses the actual guard/configuration/catalog modules and real Prisma transactions.
The isolated build permits only Repeatable Read empty read callbacks and blocks
all Prisma mutations/raw SQL/connections and provider fetches. Its generated
output stays ignored; the temporary generated Next type-reference edit is restored.
One final run compiled successfully but its restoration safety guard rejected a
generated reference mismatch. Only the verified QA-generated path change was
restored; an isolated rerun completed with exit 0 and left the tracked reference
unchanged. The noEmit incremental artifact was moved into ignored local QA cache.

## Limitations and remaining risks

- Production migration, role/consumer/drift inventory, full backup restore, hosted
  concurrency/performance and real operator integration are BLOCKED/NOT TESTED.
  No local test is presented as authorization or proof of those external conditions.
- Physical devices, assistive technology and real payment-return navigation are
  Pending Manual QA; browser fixtures use real DOM but mocked services.
- Old tabs keep an independent old cart. Their additions after the one-time import
  are not continuously merged; this deliberately prevents ambiguous color downgrades.
  Recovery of malformed/over-limit/future-version storage requires inspection or
  a compatible reader; the original source is preserved and checkout stays blocked.
- Retired rows are preserved indefinitely. Form history payloads are bounded, but
  the Admin edit server currently reads a product's retired metadata before paging;
  assess exceptionally large lifetime histories before a later query optimization.
- Direct SQL/old code must not bypass deployment writer controls. Owners can disable
  database safeguards; the runtime role restrictions are an activation prerequisite.
- Catalog SQL assumes reviewed public schema and trigger-valid data. Its native
  minimum-price query requires load testing against realistic Production volume.
- The local PostgreSQL binaries are Windows PostgreSQL 18; another workstation must
  provide an equally isolated runner rather than reuse an existing connection.

## Changed files and final verification

The full combined Stage 1A/1A.5/1B inventory and final checks are appended below.

### Final inventory

**56 combined files** (including all eight prior gate artifacts):

```text
prisma/schema.prisma
scripts/source-module.ts
scripts/verify-build-isolated.mjs
scripts/verify-cart-drawer.ts
scripts/verify-product-cart-ux.tsx
src/app/(shop)/cart/page.tsx
src/app/(shop)/catalog/page.tsx
src/app/(shop)/page.tsx
src/app/(shop)/product/[slug]/page.tsx
src/app/admin/products/[id]/edit/page.tsx
src/app/admin/products/new/page.tsx
src/components/admin/admin-form.tsx
src/components/admin/product-form.tsx
src/components/cart/cart-drawer.tsx
src/components/cart/cart-readiness.tsx
src/components/catalog/product-grid.tsx
src/components/checkout/checkout-page.tsx
src/components/home/featured-products.tsx
src/components/product/product-card.tsx
src/components/product/product-options.tsx
src/components/product/related-products.tsx
src/lib/actions/create-order.ts
src/lib/actions/products.ts
src/lib/actions/reconcile-cart.ts
src/lib/admin-form-validation.ts
src/lib/cart-items.ts
src/lib/cart-reconciliation.ts
src/lib/i18n.ts
src/lib/payments/checkout-identity.ts
src/lib/payments/checkout-session.ts
src/lib/product-variants.ts
src/store/cart-store.ts
src/types/index.ts
docs/batch-1.8-implementation.md
docs/batch-1.8-manual-qa.md
docs/batch-1.8-variant-architecture.md
docs/review/batch-1.8-variants.prisma
docs/review/batch-1.8-variants.prisma.diff
docs/review/batch-1.8-variants.sql
scripts/fixtures/batch18-variant-reference.ts
scripts/fixtures/variants-browser.tsx
scripts/rehearse-batch18-variants.mjs
scripts/verify-batch18-application-postgres.ts
scripts/verify-batch18-architecture.ts
scripts/verify-batch18-implementation.ts
scripts/verify-batch18-postgres.ts
src/components/admin/variant-editor.tsx
src/components/product/native-product-options.tsx
src/lib/admin-variant-history.ts
src/lib/cart-persistence.ts
src/lib/catalog-products.ts
src/lib/product-configuration-admin.ts
src/lib/product-configuration.ts
src/lib/product-query.ts
src/lib/variant-rollout.ts
src/lib/variant-transaction.ts
```

Final checks: tracked and all 23 untracked files pass whitespace validation;
no credentials matched the local literal scan; no migration directory, dependency,
lockfile, environment/configuration or generated artifact is in the changed set.
The index is empty. The original 17 manual entries remain Pending Manual QA and
their file is byte-unchanged relative to HEAD. There are 14 separate new pending
variant scenarios. Actual/review Prisma models agree ignoring header comments.

Read-only remote verification confirms Production remains
`76621cf01ebe482bfee9a80aaed4a4b5b9dfed22` and main remains
`3bf9ce0955040535db1e42ea161d0d27a80fb160`; matching local refs and feature HEAD
are unchanged. No commit/push/merge/deployment occurred. No Neon or Production
SQL, live Blob operation, environment setting, Vercel or Cloudflare change occurred.
Both native writes and Blob cleanup remain disabled by default in code; live
settings were not inspected. **STOP after Stage 1B; do not apply the review SQL.**
