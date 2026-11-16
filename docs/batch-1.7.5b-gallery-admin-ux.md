# Batch 1.7.5B — Product gallery and Admin reliability

Stage 1 implementation on `feat/batch-1.7.5b-gallery-admin-ux`, starting from
`e7f0750ebd08efb68603d0a67bb1f5e3d0cd74ab` on fetched
`origin/redesign-3dkid-v2`. The initial working tree was clean. No commit, push,
merge, deployment, live database query or Blob upload/deletion is part of this stage.

## Form reset: root cause and correction

The previous Product form supplied a React `<form action={...}>` function that
started an asynchronous transition but returned `undefined` immediately. React
therefore considered that form action successful before the product Save had
finished. Uncontrolled input values reset to their defaults. Catching Save errors
inside the transition, or returning a business-validation error, did not reject
the already completed form action. Controlled name/slug/media fields survived,
which made the loss of descriptions, English text, prices and checkboxes appear
inconsistent. Category and content forms used the same pattern.

This matches the installed React 19 behavior and the official
[React form documentation](https://react.dev/reference/react-dom/components/form).
The isolated browser test reproduces uncontrolled-field reset after a fulfilled
action that caught a failed Save.

The shared `AdminForm` now intercepts `onSubmit` with `preventDefault`, captures
FormData and calls the server action in a guarded transition. It has no React
form `action`, never calls `reset`, and keeps the input components mounted on
errors. Successful Saves retain their navigation/refresh behavior. Save is
disabled until hydration, during Save and while registered uploads are active;
the submit handler independently checks immediate upload/submission refs.

Client constraint validation and server Zod validation produce field-specific
errors. Mandatory fields have associated labels and markers; invalid controls
have visible red borders, `aria-invalid`, associated error text, a concise summary
and focus/scroll to the first invalid field/group. Duplicate/invalid slugs,
missing records, retired media, malformed gallery/options JSON and known database
errors return bounded structured results. Unknown failures show safe localized
copy without exposing exception details. Product, category, hero/social/font
content and the existing notification-settings form use the reliable wrapper;
notification behavior and settings actions were not changed.

UA/EN descriptions, prices, category, checkboxes, options, manual URLs, completed
uploads and gallery order remain present after client, server and network
failures. There is no browser draft persistence: deliberate navigation, reload
or closing the tab can still discard an unsaved draft. A stale gallery conflict
asks the Admin to preserve draft URLs before reloading.

## Product photographs and storefront

- The supported limit is **1–10 photographs per product**, each JPG/PNG/WebP up to
  the existing 5 MB upload limit. Both UI and server enforce the collection limit.
  Existing products with more than ten saved images are displayed without silent
  truncation in Admin; they must be deliberately reduced before a new gallery Save.
- Admin supports multiple file selection and sequential direct-to-Blob uploads,
  per-photo uploads/manual URLs, previews, optional alt text, explicit primary
  selection, up/down reordering and removal. The first photo is primary.
- Existing `ProductImage.id` values are updated in place. Only deliberately
  removed rows are deleted; only new photographs receive new IDs. Foreign or
  duplicate image IDs are rejected. A snapshot of the original gallery prevents a
  stale editor overwriting a concurrently changed gallery/order/alt value. Legacy
  single-image action callers continue to preserve other gallery rows.
- Product Save, gallery synchronization, unchanged optional size behavior and
  retirement registration are one locked transaction. Uploading does not save
  any product/category/content record. Partial batch failure retains completed
  URLs, leaves remaining files retryable and never duplicates a completed upload.
- Home, catalog and related-product cards receive at most ten photo metadata
  records. Only the selected card image is mounted; the carousel does not preload
  all full-size photographs. Native previous/next buttons sit outside the product
  link. Horizontal touch/pen swipes suppress their synthetic navigation click;
  vertical scrolling and browser pinch zoom remain usable.
- The existing single cart button, option-first detail routing, prices,
  availability and cart semantics are preserved. No catalog quantity controls
  were added. Hover/focus animation remains lazy and reduced-motion aware; it is
  shown only on the first photograph when the shopper is not actively browsing.
- Product detail thumbnails remain available, with previous/next controls and a
  native modal lightbox. The modal supports arrow keys, Escape, touch swipe,
  enlarged 2× scroll/pan and double-click/toggle zoom, native pinch zoom, background
  scroll lock, modal focus containment, return focus and localized screen-reader
  labels. Zoomed panning does not accidentally change photographs. Enlarged media
  is mounted only while the lightbox is open. Existing fallbacks remain in use.

## Admin upload coverage and security

The audit found product photographs, hover GIF/animated WebP, category image and
the three hero images as editable visual-asset URL fields. All now support the
existing uploader. Review avatars have no Admin writer. Social/external links
remain plain URL fields.

Category and hero fields retain manual URLs, progress, safe previews, file/type/
size validation, failure messages and explicit Save. Missing Blob configuration
leaves manual URLs usable. Existing external/Cloudinary URLs and Next image host
configuration remain supported and unchanged.

The existing authenticated Admin-only preparation/token endpoint is reused
without modification: UUID paths under `3dkid/product-media`, short-lived scoped
authorization, bounded image types/sizes/signatures, rate controls and no exposed
persistent credentials. Static files remain limited to 5 MB and hover animations
to 12 MB. Binaries go directly from browser to Blob; PostgreSQL stores URLs only.
The verified provider callback still requires no browser session and performs no
database attachment or deletion. No remote media URL is fetched by server-side
validation. New server mutations preserve existing Admin authorization.

## Product deletion diagnosis and supported behavior

`OrderItem.product` is required and has no cascading Product deletion rule.
Historical order references can therefore prevent deletion through Prisma FK
errors. Product image/option/attribute children already cascade; legacy size
options alone are not evidence of a protected order dependency.

No Production record was queried or changed. Local historical documentation
identifies a similarly named demo product, `Ґудзики «Веселка»`; this does **not**
establish why the reported `Гудзики Веселка` record currently fails deletion.
An authorized operator must inspect its actual ID/order references and server
event logs if the specific diagnosis is required.

The new action/UI distinguish:

- historical order references, checked inside the locked transaction;
- racing/other protected references (`P2003` / `P2014`);
- missing records (`P2025`, or idempotent absence on a repeated delete);
- lost/insufficient Admin authorization;
- unknown database/connection/transaction failures, with sanitized logging.

Products without protected dependencies are physically deleted normally. Known
protected references show a localized inline explanation and a separately
confirmed **Hide product** action. Archival sets only `isActive=false` and
`isOrderable=false`, preserving media, variants, prices, orders and history.
Both successful operations refresh the Admin list and invalidate storefront
views. No orders, order items, payments, notifications or shipping records are
deleted or rewritten; no FK constraint was weakened. Failed deletion never
retires media. Successful physical deletion collects the entire gallery and
animation and uses the existing post-commit retirement protocol.

## Media-lifecycle compatibility

All gallery, category and hero writes use the existing advisory media-write lock
and retired-media attachment guards. Retirement registration now first checks
the complete authoritative reference inventory under that same transaction.
Removing a gallery row registers **no retirement candidate** while its URL remains
in any other saved image, product animation/description, category image/description,
hero/other allowlisted content, or Review avatar/text. Reordering alone registers
nothing. A later removal of the final reference may register a fresh candidate.

The worker still rechecks references immediately before claiming deletion. The
30-day minimum, database clock, durable deadlines/markers, reuse cancellation,
claim fencing, restart recovery, retries, configured-store/prefix ownership and
external-URL protection remain intact. Scan caps retain files; an oversized
inventory skips candidate registration safely. SDK/background cleanup failures
cannot invalidate a committed Save.

**Cleanup remains disabled by default.** No environment or scope approval was
created or modified. Independent Production/Preview databases sharing a Blob
store are not safe cleanup scopes. Future activation still requires all the
isolation, authoritative-reference inventory, participating-writer rollout and
explicit authorization prerequisites in
[the 1.7.5A policy](batch-1.7.5a-media-cleanup.md#safe-activation-in-a-future-release).
Code defaults are verified; deployed environment settings were not inspected.

Never-attached uploads remain a separate orphan-file issue. Removing an unsaved
URL or abandoning a draft does not delete an object. A future cleanup needs an
aged, reviewable inventory, complete cross-environment reference protection and
the same retention/fencing protocol. No automatic orphan deletion was added.
No finite retention period guarantees permanent availability of old direct URLs
in cached pages/external documents; keeping all historical URLs forever requires
retaining their media forever or a permanent equivalent archive.

## Verification

All checks use installed dependencies, isolated fixtures and mocked providers.
No live storage or Production database was used. No full payment-release rehearsal
was repeated.

| Check | Result |
| --- | --- |
| `verify-media-lifecycle.ts` | PASS: 28 groups, including galleries, stable IDs, shared URLs, stale editors, validation, protected deletion/archive and all previous retention/concurrency/retry/scope checks |
| `verify-product-cart-ux.tsx` | PASS: 18 cart, hydration, reconciliation, quantity, pricing, slug, description and fallback groups |
| `verify-media-upload.tsx` | PASS: 8 secure upload groups, actual SDK callback verification with signed local fixtures |
| `verify-product-media.ts`, `verify-image-hosts.ts` | PASS: local URL, fallback, stable image and Next host compatibility |
| `verify-batch17-availability.ts`, `verify-unified-catalog.ts` | PASS: availability, options, existing single cart button, GIF/reduced-motion, UA/EN |
| `verify-cart.ts`, `verify-checkout-cart.ts`, `verify-checkout-render.ts` | PASS: store, retries/idempotency, cart and UA/EN checkout compatibility |
| `verify-checkout-acceptance.ts` | PASS: 15 mocked acceptance categories; no real orders/payments/messages |
| `verify-cart-drawer.ts [Edge] --gallery-admin` | PASS: 6 real React/DOM scenarios, 320/390/1280 px × UA/EN, real Tailwind/storefront CSS and native dialogs; form reset reproduction, visible field errors, failure/retry preservation, partial upload retry, galleries/carousels/swipe/GIF/lightbox/archive |
| `verify-cart-drawer.ts [Edge] --media-upload` | PASS: 6 UA/EN upload browser scenarios, including native keyboard activation and configuration failures |
| `verify-cart-drawer.ts [Edge]` | PASS: 4 UA/EN cart drawer browser scenarios, offline/unavailable image fallback and checkout gating |
| `verify-responsive.ts [Edge]` | PASS: 216 storefront viewport renders, including multi-photo cards and detail thumbnails |
| `verify-admin-responsive.ts [Edge] --batch175b` | PASS: 154 Admin viewport renders, including ten-photo edit form, category, content and product list; keyboard navigation and no overflow |
| TypeScript / ESLint | PASS: no errors or warnings |
| Isolated production build | PASS: optimized Next production build, fixture-only Prisma reads and blocked live effects |
| `git diff --check` | PASS |

Browser screenshots for narrow catalog and ten-photo Admin editing were also
visually inspected. Test artifacts stay under ignored `.next/cache`. The isolated
build restores its temporary `next-env.d.ts` change and does not modify real
configuration, credentials or environment files.

## Changed files (38)

Application actions/helpers:

- `src/lib/actions/products.ts`
- `src/lib/actions/categories.ts`
- `src/lib/admin-form-validation.ts` (new)
- `src/lib/gallery.ts` (new)
- `src/lib/product-gallery-admin.ts` (new)
- `src/lib/product-size-admin.ts`
- `src/lib/product-slug.ts`
- `src/lib/media-lifecycle.ts`
- `src/lib/i18n.ts`

Admin components/pages:

- `src/components/admin/admin-form.tsx` (new)
- `src/components/admin/gallery-editor.tsx` (new)
- `src/components/admin/product-form.tsx`
- `src/components/admin/category-form.tsx`
- `src/components/admin/media-url-field.tsx`
- `src/components/admin/delete-button.tsx`
- `src/components/admin/size-editor.tsx`
- `src/app/admin/products/[id]/edit/page.tsx`
- `src/app/admin/products/page.tsx`
- `src/app/admin/content/page.tsx`

Storefront:

- `src/components/product/product-card.tsx`
- `src/components/product/product-gallery.tsx`
- `src/components/product/related-products.tsx`
- `src/components/catalog/product-grid.tsx`
- `src/components/home/featured-products.tsx`
- `src/app/(shop)/catalog/page.tsx`
- `src/app/(shop)/page.tsx`
- `src/app/(shop)/product/[slug]/page.tsx`

Tests and documentation:

- `scripts/fixtures/gallery-admin-browser.tsx` (new)
- `scripts/fixtures/gallery-admin-environment.tsx` (new)
- `scripts/verify-media-lifecycle.ts`
- `scripts/verify-product-cart-ux.tsx`
- `scripts/verify-media-upload.tsx`
- `scripts/verify-batch17-availability.ts`
- `scripts/verify-unified-catalog.ts`
- `scripts/verify-cart-drawer.ts`
- `scripts/verify-responsive.ts`
- `scripts/verify-admin-responsive.ts`
- `docs/batch-1.7.5b-gallery-admin-ux.md` (new)

## Remaining limits and release boundaries

No schema migration, dependency installation, lockfile change or new environment
configuration is required. Existing public Blob setup instructions continue to
apply. External storage/database isolation cannot be inferred from code or mocks.
Live PostgreSQL advisory locking and Blob integration were not exercised; any
future live checks require separately authorized nonproduction resources.

Recommended later manual checks: create/edit a disposable nonproduction product
with multiple photos and animation, reorder/select primary, trigger missing-field
and duplicate-slug errors, retry an interrupted upload, inspect category/hero
uploads, test keyboard/screen-reader navigation and physical-device swipes/zoom,
then verify protected-order archival on isolated data. Do not delete the reported
historical/demo record merely to test this UI.

All changes remain **uncommitted and unpushed** on the feature branch. Production,
`main`, Neon, Cloudflare, Vercel environment settings, checkout integrations and
automatic cleanup activation were untouched. Stage 2 was not started.
