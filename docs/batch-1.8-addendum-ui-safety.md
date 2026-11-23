# Batch 1.8 — Materials, mobile card animation and Admin deletion safety

Implemented locally on 2026-11-22, exclusively on
feat/batch-1.8-color-size-variants. HEAD remains
76621cf01ebe482bfee9a80aaed4a4b5b9dfed22. No commit, push, merge or deployment.

> Final verification update: all application checks below were rerun successfully.
> The operator safety suite now has 15 PASS groups, including source diagnostics,
> category preservation and six-artifact manifest binding. A delimiter-only SQL
> correction has six executed PostgreSQL syntax regressions. The final corrected
> owner restored-clone run is now independently verified 12/12 PASS with matching
> hashes. See [the current preflight report](batch-1.8-production-readonly-preflight.md).

## Outcome

| Workstream | Local result | Evidence boundary |
| --- | --- | --- |
| Materials section | PASS | Actual product actions against isolated PostgreSQL; UA/EN browser forms and storefront component |
| Free Unicode divider | PASS | Grapheme validation, whole-motif geometry and real ResizeObserver preview at 320/390/1280 |
| Mobile GIF activation | PASS | Actual shared coordinator in emulated coarse-pointer browser contexts with programmatic scrolling; desktop hover retained |
| Admin confirmations | PASS | Native dialogs, cancel/close, pending/double-click, named records, archive/retire distinction, real Tab/Escape focus behavior |
| Category deletion protection | PASS | Actual server action and FKs; product/child two-session races in both lock orders |
| Combined SQL | PASS on disposable synthetic PostgreSQL 18.7 | Existing variant/application suites plus combined migration, strict order CHECK, rollback and category races |
| Updated protected-restored-baseline clone rehearsal | NOT TESTED / release gate | No authentication attempt or access to restore_3dkid_batch18 or any existing rehearsal database |
| Live Production/physical-device QA | NOT TESTED | No Neon, Production records, live uploads/deletions or payment/notification effects |

The preceding 75-file implementation was retained. Integration edits are listed
below; untouched files were checked against a starting SHA-256 inventory. Checkout,
payment identity/session code, cart persistence/normalization, native selection
model, favicon assets and publication/orderability rules were not changed by this
addendum. Existing 17 deferred manual scenarios and 14 native manual scenarios
remain pending; automated evidence below does not mark live/manual scenarios PASS.

## Materials data model and workflow

Three optional Product fields, consistent with description/descriptionEn naming:

```prisma
materials        String? @db.Text
materialsEn      String? @db.Text
materialsDivider String? @db.VarChar(128)
```

No extraction, description edit, conversion or backfill occurs. Old records receive
NULL. Materials text is bounded to 12,000 characters per locale by server validation.
Omitted fields from older callers preserve saved values; explicit empty inputs
clear them to NULL. UA/EN values are independent. Empty English content falls back
to Ukrainian, matching existing storefront conventions. With no effective content,
the entire Materials section and its divider are absent.

The existing Admin ProductForm has an optional localized Materials/divider section
with multiline inputs and live motif preview. Its existing non-resetting AdminForm
continues controlling Save, errors, focus, uploads, gallery and variant state.
Typing, validation errors and network failures never save or reset product data.
Field-level server errors remain localized through centralized i18n. No rich-text
editor, Markdown requirement or HTML rendering was introduced.

On product detail, the existing description is followed by the divider, an
automatically bold localized Materials heading and the existing safe paragraph
renderer, then the unchanged price/options/quantity/purchase controls. Stored
markup remains literal text. Other product layout/gallery/metadata behavior remains.

## Unicode divider

The motif is free text, not an enum or predefined list. Emoji, skin tones, flags,
ZWJ families, variation selectors and combining clusters are supported. Validation
allows up to eight graphemes and 128 UTF-16 units, and rejects line/control separators.
Oversized input is preserved with an error rather than cut into partial graphemes.
Server validation and the database VARCHAR bound enforce the limit authoritatively.

The whole motif and motif-plus-spacing are measured using hidden same-font probes.
The number of complete repeats is calculated from actual container width, with
two nonbreaking spaces between motifs and a small rounding allowance. Output is
one text node, capped at 128 repeats; the motif string is never sliced. An oversized
motif that cannot fit once falls back to the line, rather than showing half a glyph.
ResizeObserver plus a coalesced animation frame handles container/font-width changes;
unchanged counts do not render again. The observer/frame/listeners are cleaned up.
A fixed-height decorative region prevents measurement-induced layout shift.
Empty motifs render a subtle horizontal rule. Decorations/probes are aria-hidden.

## Mobile GIF rules

All reusable ProductCards share one document-level coordinator, including catalog,
featured and related cards. It uses primary coarse-pointer/no-hover capability,
not a screen-width assumption. Static semantic images remain mounted underneath.
No animated URL is mounted until an eligible card becomes active.

- IntersectionObserver tracks potentially visible cards; passive scroll/resize
  listeners coalesce evaluation to one animation frame and measure only visible
  candidates. There is no polling and one observer serves the collection.
- Normal eligibility is 60% visible area. For cards larger than the viewport,
  visibility is normalized to the largest actually viewable area, so the threshold
  remains attainable. The closest card center wins.
- A current candidate retains preference unless the distance improvement exceeds
  max(24px, 8% viewport height); a switch stabilizes for 120ms. This avoids rapid
  alternating downloads. Only previous/new active subscribers are updated.
- No eligible card, hidden document, reduced motion, Save-Data or 2G/slow-2G keeps
  the static image. Shared listeners/observer/timer are removed after the last card.
- GIF and animated WebP retain the existing image pipeline, cacheable URL and error
  fallback. No conversion, preload of every GIF, upload UI change or new dependency.
- Manual gallery navigation suppresses animation until existing browsing interaction
  resets it. Arrow/swipe handlers and single-click links were not intercepted.
  The catalog still has one cart button and no quantity stepper.
- Conventional mouse/fine-pointer devices retain hover/focus playback and mouse-leave
  restoration; they do not gain viewport autoplay. Product detail gallery does not
  receive this autoplay behavior.

## Admin confirmation audit

The reusable ConfirmButton uses native dialog/showModal, a named plain-text message,
initial Cancel focus, modal focus containment, Escape/backdrop cancellation, focus
return and body-scroll cleanup. Confirm is destructive-styled. A synchronous ref
and pending state prevent repeat execution and disable controls during processing.
No action is invoked before confirmation or on cancel/close. Errors remain on the
current page; successful deletion/archive refreshes the list.

Audited current permanent/destructive entry points:

| Entry point | Treatment |
| --- | --- |
| Product list delete | Named product confirmation; existing historical-order protection and explicit archive fallback retained |
| Category list delete | Named category confirmation; known product/child dependencies disable the trigger with explanation |
| Saved gallery row removal | Confirmation explicitly says it applies only after successful product Save; no Blob deletion |
| Saved legacy size removal or disabling saved sizes | Same deferred-save confirmation; draft values remain until accepted |
| Persisted native value/combination retirement | Accurate retirement confirmation; stable IDs and history remain |
| Mode changes affecting persisted combinations | Explicit confirmation before existing retirement transition is applied |
| Draft-only image/size/option/combination removal | Local edit without unnecessary permanent-delete prompt |
| Restore retired value/combination | Existing non-destructive restore, no deletion wording |

Product attributes have no standalone deletion UI/action in this repository; their
only cascade is whole-product deletion under existing history/FK safeguards. There
are no other permanent record-delete Admin interfaces in the audited source. Order
status edits, ordinary saves, URL edits and history-navigation warnings retain their
existing semantics. No financial operation was redesigned.

## Category integrity and concurrency

deleteCategory requires Admin, takes the existing media advisory lock and SELECT
FOR UPDATE on the category, then counts ALL directly referencing products and
children, with no isActive/isOrderable filter. A child already protects every
descendant subtree, so a parent with descendants is refused without reassignment.
Structured categoryProducts/categoryChildren/forbidden/notFound/dependency errors
are localized. Foreign-key/RESTRICT races and unknown failures remain safe errors.
No product/child is deleted, archived, detached or moved automatically.

Category.parent changes from onDelete:SetNull to Restrict, preserving onUpdate:Cascade.
Its existing index/identity remains. Product.category's already-RESTRICT behavior
is explicit in Prisma; no extra physical FK change is generated for it. The category
row lock conflicts with FK attachment KEY SHARE locks. The database RESTRICT FK is
also the backstop for older/direct writers that do not use the new action.

Executed two-session tests proved both directions for both dependency kinds:
deletion first blocks a new product/child attachment, then the attachment fails;
attachment first blocks deletion, then deletion observes the committed dependency
and refuses. pg_blocking_pids verified actual waits, not timing-only assertions.
No FK, CHECK or trigger was disabled to obtain a test PASS.

## Media lifecycle and historical data

All successful media-related writes keep the existing transactional retirement
protocol. Materials text in either language joins the conservative authoritative
reference scan, preventing deletion of a shared Blob URL still saved there.
Omitted fields preserve references; clearing the last reference can start normal
retirement, never immediate deletion. The 30-day deadline, durable retries,
environment/store scope authorization and disabled-by-default rollout remain.

Historical product orders block physical deletion; explicit archival preserves
financial values and frozen snapshots. New native retirement behavior is unchanged.
No real Blob upload/delete, orphan cleanup, real order, notification or payment ran.
Shared Production/Preview store isolation is not assumed or activated.

## Exact migration delta and audit preservation

The six original schema/SQL artifacts plus the preceding implementation, rehearsal
and Production rollout reports are copied unchanged under
docs/review/archive/batch18-before-addendum. Its README marks them historical and
non-executable for this combined release. The active paths remain the authoritative
ones; docs/review/batch-1.8-addendum-manifest.json records current SHA-256 values.

Relative to the archived variants-only SQL, the schema delta is exactly:

```sql
ALTER TABLE public."Product"
  ADD COLUMN "materials" TEXT,
  ADD COLUMN "materialsEn" TEXT,
  ADD COLUMN "materialsDivider" VARCHAR(128);
ALTER TABLE public."Category" DROP CONSTRAINT "Category_parentId_fkey";
ALTER TABLE public."Category" ADD CONSTRAINT "Category_parentId_fkey"
  FOREIGN KEY ("parentId") REFERENCES public."Category"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
```

This excerpt documents the addendum delta, not a standalone approved migration.
The active combined SQL includes it with all original variant DDL, identity/price/
deferred-integrity/revision/parent-lock/order guards inside the same transaction.
The five SQL guard-function bodies are byte-identical to the archive. Regenerated
Prisma DDL was explicitly schema-qualified; execution caught and corrected an enum
qualification error before the final PASS. No guard was weakened as a workaround.

Counts remain 14→16 tables, 31→42 indexes, 11→16 FKs. The parent FK replacement has
zero net FK count. There are now twenty newly inspected columns across expanded
tables, instead of seventeen. Local candidate/Production checks require initially
NULL Materials and validated RESTRICT category FKs. The operator's preservation
hash excludes the three new NULL fields while checking the complete old product
row; separate assertions check the new fields. Target guard, source protection and
final SET CONSTRAINTS ALL IMMEDIATE remain. No database migration was applied to
the restored baseline, an existing rehearsal database or Neon.

## Executed verification

| Check | Result |
| --- | --- |
| Prisma 5.22 schema/model validation and generated additive diff agreement | PASS |
| Existing PostgreSQL variant integrity/revision/retirement/history/two-session suite | PASS — 20 groups |
| Actual PostgreSQL product/admin/catalog/cart/COD/Mono retry integration | PASS — 9 groups; providers mocked |
| New PostgreSQL addendum integration | PASS — 8 groups; Materials persistence/clear/errors, categories, four real concurrency races, history/archive |
| Combined migration failure/rollback | PASS — separate fresh database; new fields/tables absent again, original SET NULL FK and five synthetic products restored |
| Five pre-existing synthetic products after combined migration | PASS — exact descriptions/prices retained, three new fields NULL |
| Prisma relational drift after combined SQL | PASS — empty diff |
| Addendum pure/static tests | PASS — 5 groups, including archived hashes and unchanged guard bodies |
| Existing migration-artifact tests | PASS — 3 groups |
| Production-package offline checks | PASS — 7 groups; no Production execution |
| Operator PowerShell safety/syntax suite | PASS — 12 offline groups; no password prompt/connection |
| New browser fixture at 320/390/1280, UA/EN | PASS — six runs; actual React/DOM, native dialogs, real Tab/Escape, coarse-pointer capability, programmatic scroll, reduced motion; visibility simulated |
| Existing gallery/Admin browser fixture | PASS — six runs; gallery, uploads, validation, About, dialogs/archive |
| Existing native variants browser fixture | PASS — six runs; sparse selection, cart lines, state preservation, retire/restore/mode confirmation |
| Existing responsive suite | PASS — 216 renders, no horizontal overflow; desktop CSS screenshots unchanged at 1280/1440 |
| Cart/product UX, architecture, implementation, availability, checkout/cart/acceptance/render, About, upload, unified catalog and favicon suites | PASS — all twelve invoked suites |
| Media lifecycle | PASS — 29 groups, including new UA/EN Materials shared references and 30-day clearing behavior |
| TypeScript / full ESLint / isolated production build | PASS |
| git diff --check / untracked source whitespace / secret-artifact review | PASS |

Representative reproducible local commands (PowerShell, repository root):

```powershell
node scripts/rehearse-batch18-variants.mjs
npx.cmd tsx scripts/verify-batch18-addendum.tsx
node scripts/verify-batch18-migration-artifacts.mjs
node scripts/verify-batch18-production-preparation.mjs
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/verify-batch18-operator.ps1
npx.cmd tsx scripts/verify-cart-drawer.ts 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' --addendum
npx.cmd tsx scripts/verify-cart-drawer.ts 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' --gallery-admin
npx.cmd tsx scripts/verify-cart-drawer.ts 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' --variants
npx.cmd tsc --noEmit --incremental false
npx.cmd eslint .
node scripts/verify-build-isolated.mjs
git diff --check
```

The PostgreSQL command creates a new private synthetic cluster on a dynamically
chosen loopback port, verifies ownership, stops only that cluster and retains it
for inspection. The successful combined run retained
C:\Users\alexa\AppData\Local\Temp\batch18-variant-review-VzetVF. It does not
connect to port 55432 or any existing database. The PowerShell verifier is offline
and uses fake commands; it does not execute the interactive operator rehearsal.
The twelve existing regression suites and verify-responsive.ts also passed.
The isolated build blocks DB writes/connections and provider fetch, uses empty read
fixtures and a separate ignored output directory, and restores its generated type
reference. It is not the hosted deployment build command.

Transient test failures (fixture backend PID bigint cast and missing test-fixture
TypeScript annotations) were corrected; final results above refer to the passing
reruns. No failing test was removed or safety guard bypassed.

## Manual QA and release gates

Pending Manual QA: real iOS/Android browser scrolling/taps and constrained tall
viewports; actual GIF/WebP cache/network behavior; real OS reduced-motion/Save-Data;
brand-font rendering of the owner's chosen motif; live authenticated Admin Save /
upload persistence, named category errors and form state; assistive technology;
Production migration/permissions/writer verification. Physical-device and live
integration tests were NOT performed. Existing pending QA registers are unchanged.

Before release: rerun the updated guarded operator rehearsal against NEW disposable
clones of the protected restored baseline, then obtain current read-only Neon schema/
role/writer evidence, review differences, take a fresh independent private backup,
bind the new combined manifest and obtain explicit owner approval. The prior
variants-only SQL/hash approval cannot apply to the combined addendum. Keep schema-
before-code ordering for every consumer of the shared database. Node runtime and
effective Vercel commands/settings remain external operator checks. Separate Preview
database isolation is not imposed, but old-writer and integration safety still apply.

After combined DDL COMMIT, retain the expanded schema on application rollback.
After native products/orders exist, use a mode-aware bridge; never remove variant
schema, rewrite snapshots or restore an old archive over newer orders. The stricter
category FK remains safe for older code, though an old UI may give a generic error.
Native activation and Blob cleanup require separate authorization and stay default-off.

No main/Production branch, Neon, Vercel/Cloudflare settings, live storage or customer
records were changed. All work remains unstaged, uncommitted and unpushed. Stop
after the combined addendum; no Production migration or release is started.

## Complete changed-file inventory

Initial addendum inventory: **107 files** (75 existing local files retained, 32 additional changed paths). At that stage, 49 original files were byte-identical and 26 received integration/test/documentation edits. No original file was lost.

After the syntax correction the inventory was **113 files**: the six added paths were
the SQL syntax regression helper and five historical archive files under
docs/review/archive/batch18-before-syntax-fix. Existing SQL/manifest, rehearsal tests
and reports received the corrections documented in readiness section 12. The full
current file list below includes these additions and the new Production read-only
preflight report: **114 files at that preparation stage**. The guarded operator
handoff now adds one collector, its offline tests and the handoff document:
**117 combined files**. No application, Prisma or existing SQL file was changed;
earlier counts and test results remain historical. The full list below is current.

The checkout, cart, native identity/transaction and favicon paths listed in the preservation audit were SHA-256 identical to their starting versions. The nine historical SQL/model/report copies are byte-identical to the starting versions. The index remains empty. No dependency/lockfile, environment, generated build artifact or Prisma migration-history directory was added.

Intentional edits to previously changed paths:

```text
prisma/schema.prisma
scripts/source-module.ts
scripts/verify-cart-drawer.ts
src/app/(shop)/product/[slug]/page.tsx
src/app/admin/products/[id]/edit/page.tsx
src/components/admin/product-form.tsx
src/components/product/product-card.tsx
src/lib/actions/products.ts
src/lib/admin-form-validation.ts
src/lib/i18n.ts
docs/batch-1.8-implementation.md
docs/batch-1.8-migration-rehearsal.md
docs/batch-1.8-production-rollout.md
docs/batch-1.8-variant-architecture.md
docs/release/batch-1.8-production-migration.sql
docs/release/batch-1.8-production-verify.sql
docs/review/batch-1.8-production-candidate.sql
docs/review/batch-1.8-variants.prisma
docs/review/batch-1.8-variants.prisma.diff
docs/review/batch-1.8-variants.sql
scripts/fixtures/variants-browser.tsx
scripts/operator/batch18-rehearse.ps1
scripts/rehearse-batch18-variants.mjs
scripts/verify-batch18-migration-artifacts.mjs
scripts/verify-batch18-production-preparation.mjs
src/components/admin/variant-editor.tsx
```

Additional paths changed by this addendum (includes newly modified tracked files and new files):

```text
docs/batch-1.8-addendum-ui-safety.md
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
docs/review/batch-1.8-addendum-manifest.json
scripts/fixtures/addendum-browser.tsx
scripts/fixtures/gallery-admin-browser.tsx
scripts/fixtures/gallery-admin-environment.tsx
scripts/verify-batch18-addendum-postgres.ts
scripts/verify-batch18-addendum.tsx
scripts/verify-media-lifecycle.ts
src/app/admin/categories/page.tsx
src/app/admin/products/page.tsx
src/components/admin/confirm-button.tsx
src/components/admin/delete-button.tsx
src/components/admin/gallery-editor.tsx
src/components/admin/materials-fields.tsx
src/components/admin/size-editor.tsx
src/components/product/materials-divider.tsx
src/components/product/product-materials.tsx
src/components/product/use-mobile-card-animation.ts
src/lib/actions/categories.ts
src/lib/media-lifecycle.ts
src/lib/mobile-card-animation.ts
src/lib/product-materials.ts
```

All modified/untracked files in the combined Batch 1.8 working tree:

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
