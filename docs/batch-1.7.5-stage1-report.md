# Batch 1.7.5 — Product & Cart UX — Stage 1

Stage 1 implemented locally. Changes are uncommitted, unstaged and unpushed. No deployment was performed.

## 1. Branch and baseline

- Repository: `mrAlexrti/3dkidShop`.
- Feature branch: `feat/batch-1.7.5-product-cart-ux`.
- Fetched `origin` and verified `origin/redesign-3dkid-v2` equals the expected baseline: `5f59b7c11d0e0e8036de498de92ad55e0cd6656b`.
- Initial working tree was clean. Feature branch was created from that remote ref; its HEAD remains at the baseline.
- The feature branch has no upstream configured, avoiding inherited tracking of the Production branch.

## 2. Implemented workstreams

**A — Cart reconciliation and checkout readiness**

Added a public read-only server lookup accepting at most 100 bounded product IDs. One batched Prisma query selects public display, orderability and size data from active products. Inactive and deleted products have the same public absence response; unpublished data and private fields are excluded.

Reconciliation refreshes names in the current locale, slug, main image, prices and size labels using stable product/size IDs. It preserves quantities and line IDs without merging lines or choosing replacement sizes. Unavailable lines remain visible and removable, with centralized UA/EN explanations; their cached prices are excluded from the payable subtotal. Legacy size labels lacking a stable ID remain visible as unresolved selections and block checkout rather than becoming simple products.

Readiness is never restored from local storage. Mounting cart/checkout surfaces and changing cart contents triggers verification; concurrent equivalent requests are shared. Request sequence, revision and item snapshot checks prevent old responses from overwriting newer edits. Failures retain selections and require an explicit retry. There is no polling or request effect loop.

Changed authoritative prices replace cached prices and require an explicit review action. Pending price-review markers survive rehydration. Cart mutations invalidate verification immediately. Checkout navigation and submission remain disabled while the cart is unverified, invalid, over limit or awaiting price review.

The checkout handler also performs a fresh lookup before submission, guards asynchronous identity creation against newer cart edits, suppresses duplicate submission, and protects newer cart contents from COD completion. New storefront requests ask `createOrder` to reject prices changed since review, inside its existing locked authoritative-pricing transaction. Existing Mono retry replay and legacy server repricing remain compatible.

**B — Quantity and availability UX**

Reused the existing +/- controls with shared integer and amount constraints. Quantities range from 1 to PostgreSQL Int maximum `2147483647`; subtotal calculations use integer minor units and the existing Decimal(10,2) maximum of `99999999.99 UAH`. Fractional, negative, non-finite and overflowing values/additions are rejected. Increment/Add operations are disabled at supported limits, including quantities already in the cart. An over-limit cart can still be reduced or cleared line by line.

Full cart, drawer and checkout share safe amount rendering. Drawer line amounts now reflect quantity. Unsupported totals show a dash and explanation instead of a misleading zero or unsafe multiplication. Controls retain localized accessible names and native keyboard behavior. Checkout navigation uses a single button rather than nesting a button inside a link.

Availability continues to use publication, orderability and current explicitly priced size records. `Product.stock` is ignored. No inventory, color/size combination or filament architecture was introduced.

**C — Product descriptions and media**

Descriptions render blank-line-separated paragraphs and preserve ordinary line breaks inside paragraphs. UA/EN selection and missing-English fallback are unchanged. React renders stored content as escaped text; no HTML interpretation or rich-text editor was added.

Audited the detail main image, gallery, thumbnails, catalog image, hover overlay, cart/checkout images, empty media, image hosts and loading behavior. Added a small shared image wrapper for empty/unsupported/broken sources, retaining meaningful alt text. Gallery main/thumbnail images now declare responsive sizes; thumbnail buttons have localized labels, selection state and horizontal containment on small screens. Gallery selection has a safe fallback when its input list changes.

Next.js host configuration is unchanged: existing HTTPS Cloudinary, Unsplash and Supabase sources remain supported. Hover GIFs remain lazy direct browser requests, retain their existing validated HTTP(S) URLs, static-image fallback, mouse/keyboard activation, touch behavior and reduced-motion preference. No media URL is fetched server-side during validation. Main image updates still preserve image IDs and gallery records.

**D — Automatic Admin slug**

New products generate lowercase hyphenated slugs from Ukrainian names using deterministic transliteration. Manual slug editing stops automatic updates. A localized explicit regenerate button uses the current name and re-enables name-driven generation. Existing products preserve their stored slug during ordinary name edits, including historical noncanonical slugs.

Server validation requires canonical lowercase ASCII letters/digits and single hyphen separators, with a 160-character limit, for new or intentionally changed slugs. Invalid custom values are rejected rather than silently rewritten. Database uniqueness collisions return a structured localized inline error, including concurrent-save collisions. Admin authorization remains first. An intentionally changed URL revalidates both old and new paths.

## 3. Files changed

| Area | Files |
| --- | --- |
| Cart logic | `src/store/cart-store.ts`, `src/lib/cart-items.ts`, **new** `src/lib/cart-limits.ts`, **new** `src/lib/cart-reconciliation.ts`, **new** `src/lib/actions/reconcile-cart.ts` |
| Cart/checkout UI | `src/app/(shop)/cart/page.tsx`, `src/components/cart/cart-drawer.tsx`, **new** `src/components/cart/cart-readiness.tsx`, `src/components/checkout/checkout-page.tsx`, `src/components/checkout/checkout-form.tsx` |
| Checkout pricing | `src/lib/actions/create-order.ts` |
| Product UI/media | `src/app/(shop)/product/[slug]/page.tsx`, `src/components/product/product-options.tsx`, `src/components/product/product-card.tsx`, `src/components/product/product-gallery.tsx`, **new** `src/components/product/product-description.tsx`, **new** `src/components/product/product-image.tsx`, `src/lib/product-media.ts` |
| Admin/localization | `src/components/admin/product-form.tsx`, `src/lib/actions/products.ts`, **new** `src/lib/product-slug.ts`, `src/lib/i18n.ts` |
| Source regressions | **new** `scripts/verify-product-cart-ux.tsx`, **new** `scripts/product-media-fixtures.ts`, `scripts/verify-cart.ts`, `scripts/verify-checkout-acceptance.ts`, `scripts/verify-checkout-render.ts`, `scripts/verify-batch17-availability.ts`, `scripts/verify-unified-catalog.ts`, `scripts/verify-product-media.ts` |
| Browser regressions | `scripts/verify-responsive.ts`, `scripts/verify-admin-responsive.ts`, `scripts/verify-cart-drawer.ts`, `scripts/fixtures/cart-drawer-browser.tsx`, `scripts/fixtures/cart-drawer-environment.tsx` |
| Report | **new** `docs/batch-1.7.5-stage1-report.md` |

There are 36 changed/new deliverable files including this report. Existing unchanged test scripts are listed separately in the validation results below.

## 4. Regression results

All final runs passed. Tests use isolated storage, in-memory product/Prisma fixtures and mocked external services. Browser checks use loopback fixture servers, temporary Edge profiles and blocked external traffic.

| Validation command | Result |
| --- | --- |
| `tsx scripts/verify-product-cart-ux.tsx` | PASS — 17 groups covering actual store, handlers, lookup, Admin actions, descriptions and media |
| `tsx scripts/verify-cart.ts` | PASS — normalization, simple/size identity, merging, quantities, totals and revision behavior |
| `tsx scripts/verify-checkout-cart.ts` | PASS — stable Mono retry identity, handoff/failure retention, paid-only matching clear and newer-cart protection |
| `tsx scripts/verify-checkout-acceptance.ts` | PASS — existing 15 acceptance categories plus changed-quote rejection for COD and Mono before any order/invoice creation |
| `tsx scripts/verify-checkout-render.ts` | PASS — UA/EN purchase/checkout output, selected/unselected/unavailable sizes, quantity-limit output and accessible labels |
| `tsx scripts/verify-batch17-availability.ts` | PASS — independent activity/orderability, Admin permissions, forged stock ignored |
| `tsx scripts/verify-unified-catalog.ts` | PASS — UA/EN shared cards, quick-add, size routing, hover/focus GIF, reduced motion and error fallback |
| `tsx scripts/verify-product-media.ts` | PASS — defaults to isolated fixtures; URL validation, stable main image, unchanged gallery and empty-image creation |
| `tsx scripts/verify-image-hosts.ts` | PASS — installed Next image matcher, Cloudinary/legacy allowed hosts and rejected lookalikes |
| `tsx scripts/verify-responsive.ts` | PASS — 216 UA/EN viewport renders; storefront/product/cart/drawer/checkout; unavailable-size/product and changed-price notices; no horizontal page overflow; existing desktop CSS comparisons preserved |
| `tsx scripts/verify-cart-drawer.ts` | PASS — real React StrictMode/Framer/Zustand at 390px and 1280px, both languages; keyboard focus, Escape, backdrop, route/back, checkout and cleanup |
| `tsx scripts/verify-admin-responsive.ts <Edge path> --batch175` | PASS — 88 UA/EN viewport renders including create/edit slug controls, plus keyboard/sidebar/navigation behavior |

Coverage against the requested regression cases:

| Cases | Evidence |
| --- | --- |
| 1–7: unchanged persisted cart; product/size price changes; inactive, non-orderable, deleted products; removed size | Product/cart UX fixture tests, active-only lookup query assertions and price-review rehydration checks |
| 8–10: independent sizes, duplicate additions, invalid legacy values | Product/cart UX and existing cart suites; unresolved label-only selections preserved safely |
| 11–14: boundaries/overflow; readiness gate; transient failures; concurrent edits/out-of-order responses | Product/cart UX suite, purchase render limit checks and real checkout handler tests |
| 15–16: server-authoritative pricing and Mono retry/idempotency | Existing checkout acceptance/cart suites plus fresh-quote mismatch rejection tests |
| 17–18: description paragraphs and media/GIF fallbacks | Product/cart UX, isolated media, unified catalog and image-host suites |
| 19–22: Ukrainian slugs, manual override, existing URL preservation, invalid/duplicate errors | Pure normalization plus actual Admin field handlers and server actions with uniqueness-race fixtures |
| 23–24: UA/EN, keyboard access and responsive layouts | Source renders, real drawer interaction tests, 216 storefront and 88 Admin viewport cases |

Browser artifacts are local and ignored by Git: `.next/cache/responsive-qa`, `.next/cache/admin-responsive-qa`, `.next/cache/cart-drawer-qa`.

## 5. Static validation and production build

- TypeScript: PASS — `tsc --noEmit --incremental false`.
- ESLint: PASS — `npm run lint`, no errors or warnings in the final run.
- Prisma: PASS — `prisma validate`; schema unchanged and no database connection required.
- Production build: PASS — `node scripts/verify-build-isolated.mjs`; optimized Next.js compilation, type/lint checks, prerender and build traces completed; 15 static generation steps completed.
- The existing isolated build runner supplies empty Prisma read fixtures and forbids DB connections/writes and provider fetches. It changes only ignored build output/configuration and restores the generated Next type reference. Normal project config and environment files remain unchanged.
- Whitespace: PASS — `git diff --check`.

## 6. Database migrations

None. Prisma schema, SQL, dependencies, lockfile and environment secrets are unchanged. No SQL was run against any database.

## 7. Cart/checkout safety review

- Public lookup validates request size/IDs and exposes no unpublished product or private Admin/customer data.
- Reconciliation cannot substitute sizes, merge independent selections, erase unavailable lines, reset the cart on a network failure, or apply an obsolete response over newer edits.
- Rehydration never trusts persisted verification status. Price-review requirements persist separately from readiness.
- Local prices are display snapshots. Checkout still calculates order prices from current server records under the existing row locks and checks availability, quantity, size and aggregate database limits.
- The new reviewed-price guard closes the change-after-reconciliation window for fresh storefront submissions. It is optional for older callers, which retain the existing server-authoritative repricing behavior.
- Existing Mono attempts replay before fresh pricing checks and retain their original immutable server-priced snapshot, identity and paid-only acceptance rules. No payment reconciliation, retry recovery or financial accounting implementation changed.
- Duplicate browser submission is guarded synchronously. A newer cart snapshot is protected through identity creation and COD completion.
- No raw HTML, arbitrary server media fetch, new image-host wildcard, unauthenticated Admin mutation, secret or dependency was introduced.

## 8. Existing behavior preserved

The 3D Kid design, App Router routes, metadata, gallery, hover animation preferences, Cloudinary URLs, guest checkout, optional product sizes, Zustand storage key/version, UA default/EN fallback, server-authoritative order pricing, COD flow, Mono identities/retries/paid-only acceptance, and Admin permissions remain compatible. Stock zero does not make a product unavailable.

## 9. Limitations and deferred work

- Reconciliation is event-driven rather than continuous live inventory. A fresh submission lookup and locked server pricing remain the final protection against catalog changes between visits.
- Intentionally changing a slug does not create redirects from the old URL. Historical-slug redirect persistence is a future improvement; normal name edits preserve existing links.
- Browser fixtures cover responsive geometry and desktop/mobile-width keyboard interactions; physical-device touch and assistive-technology checks remain useful release follow-up. No live carrier, payment, email or Telegram acceptance was attempted.
- Nova Poshta checkout search instability remains a separate backlog item.
- Color + Size inventory, filament directories, account features, promo codes and media/storage migration remain excluded.

## 10. Delivery state

All work remains uncommitted, unstaged and unpushed on the feature branch. No commit, push, merge, PR publication or deployment was performed. Stage 1 stops here.

## 11. Protected environments

Production, Production Neon, Vercel, Cloudflare Scheduler and `main` were untouched. No Production SQL, real payments, real notifications or real Nova Poshta TTNs were created. No environment secrets were changed. No payment-release or PostgreSQL rehearsal was run.
