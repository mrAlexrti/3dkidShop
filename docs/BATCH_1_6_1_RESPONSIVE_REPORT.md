# Batch 1.6.1 — mobile responsive polish

Branch: `batch-1-6-1-mobile-responsive`.
Base and current HEAD: `d8cc9215cbf9862d1b5398c81daccb3880a60096`.
The accepted branch, HEAD, and clean working tree were verified before creating
the branch. Changes remain uncommitted for owner review.

## Changed-file manifest

| File | Change |
| --- | --- |
| `src/app/(shop)/storefront.css` | Scoped responsive layout and touch-target adjustments. |
| `src/app/(shop)/cart/page.tsx` | CSS hooks for compact cart rows, quantities, removal, and totals. |
| `src/app/(shop)/product/[slug]/page.tsx` | CSS hooks for product copy and characteristics. |
| `src/components/cart/cart-drawer.tsx` | CSS hooks for drawer sizing and item controls. |
| `src/components/catalog/catalog-filters.tsx` | Phone category selector using the existing filter action; desktop chips retained. |
| `src/components/checkout/checkout-form.tsx` | CSS hooks for form and delivery selector. |
| `src/components/checkout/checkout-page.tsx` | CSS hooks for page and summary items. |
| `src/components/product/product-card.tsx` | Image `sizes` updated to reflect two-column small-phone cards. |
| `src/components/product/product-gallery.tsx` | CSS hooks for thumbnail wrapping. |
| `src/components/product/product-options.tsx` | CSS hooks for size and quantity controls. |
| `scripts/verify-unified-catalog.ts` | Category-select routing, parameter preservation, clearing, and page reset regression. |
| `scripts/verify-responsive.ts` | Isolated component renders measured in installed headless Edge; no new dependencies. |
| `docs/BATCH_1_6_1_RESPONSIVE_REPORT.md` | This review and verification record. |

## Breakpoints and behavior

- **At all widths:** product-page copy uses `overflow-wrap: anywhere`. A long
  unbroken title demonstrated desktop overflow; this safeguard fixes that defect
  without changing normal desktop content. The new phone category selector is
  hidden by default.
- **`max-width: 1024px` (added):** home categories form three columns; product
  thumbnails wrap; long size labels and characteristics fit their columns;
  checkout inputs use 16px text; lookup dropdown height is bounded; order-summary
  item prices move below the item text to keep narrow tablet summaries usable.
- **`max-width: 680px` (updated):** home categories become two columns; primary
  catalog chips become a native category selector; subcategory chips retain their
  existing action in a bounded scrolling block. Search occupies a full row and
  autocomplete stays anchored to that full-width input. Sort remains full width.
  Home panels, benefits, and footer use more compact spacing. Product/cart/checkout
  page padding is reduced. Delivery choices become full-width labeled rows.
  Product and cart quantity controls, removal controls, and drawer close control
  have 44px targets. The drawer uses dynamic viewport height, a bounded width,
  scrollable item region, and bottom safe-area padding. Mobile menu scrolling is
  bounded by viewport height; logo has a 44px target.
- **`max-width: 380px` (updated):** removed the one-column product-grid override.
  Cards retain two columns with 8px gaps, 8px body padding, and 13px titles.
  Price and quick-add stack within each card to avoid collisions; quick-add stays
  44px. Header padding/gaps are reduced and the header gains a little width so the
  logo, UA/EN, account placeholder, cart, and menu fit on one row at 320px even
  with a scrollbar.
- **Existing `max-width: 980px` remains unchanged:** shared product grids have two
  columns through 980px and four above it. Benefits/footer tablet rules are kept.

Home, catalog, and related products share the existing product-card components;
there are no duplicated mobile pages. Product links, quick-add, size routing,
selected size notes/prices, quantity actions, and checkout rules are preserved.
The gallery, hero title/subtitle/composition, payment options, and footer links
retain their existing content and design language. All primary home categories
remain visible in the wrapped block, including the eight-category growth fixture.
The footer retains its mobile single-column layout and 44px links/social controls.

## Desktop protection and diff review

Full-page screenshot comparisons against the accepted CSS passed for 32 normal
fixture/locale/width combinations at 1280px and 1440px. The accepted comparison
omits the newly added phone selector, which is absent from accepted markup and
hidden on the current desktop. It otherwise uses the same rendered components.
Motion is disabled by the fixture boundary and Next image/link rendering is
substituted with native elements; this is an isolated layout comparison.

The separate unbroken-title stress fixture is checked for overflow at desktop
widths, but excluded from equality comparisons because its wrapping correction
is intentional. No colors, font system, desktop spacing, hierarchy, or card
design were redesigned. No overflow-hiding rule was added to the body.

Reviewed the full production diff, regression additions, and new harness for
desktop impact, unsafe widths, unrelated refactors, duplicated pages, and business
changes. Production changes are CSS/hooks, an image sizing hint, and one category
control reusing the existing handler. No new responsive JavaScript was needed.

## Verification

Passed:

- `tsc --noEmit`.
- `npm run lint` (zero warnings/errors).
- `npm run build` (production compilation, type/lint checks, page generation).
- `tsx scripts/verify-unified-catalog.ts` (UA/EN cards, quick-add, size routing,
  stock guard, filters, query preservation, page reset, pagination).
- `tsx scripts/verify-storefront.ts` (localization and persistence).
- `tsx scripts/verify-cart.ts` (actual isolated cart store and size-line identity).
- `tsx scripts/verify-checkout-render.ts` (optional-size states, explicit prices,
  disabled states, notes, and checkout/payment labels in both locales).
- `tsx scripts/verify-batch16-notifications.ts` (status/notification compatibility,
  suppression, settings, authorization, and transition/concurrency checks).
- `tsx scripts/verify-novaposhta-status.ts` (all 69 hardening cases and mocked
  provider normalization).
- `tsx scripts/verify-batch14-payments.ts` and
  `tsx scripts/verify-batch14-payment-ui.ts` (isolated payment and checkout handoff
  regression coverage).
- `tsx scripts/verify-responsive.ts`: **216 viewport renders**, both locales,
  home/catalog/product/long-title product/cart/drawer/checkout/locker/courier.
  Width/height pairs: **320×740, 360×800, 375×812, 390×844, 430×932, 768×1024,
  980×800, 981×800, 1024×768, 1280×900, 1440×900, 740×360**. Checks include body
  overflow, product columns, home-category wrapping, header fit, open-menu bounds,
  open autocomplete and carrier dropdowns, and desktop screenshots. Selected-size
  copy and nine gallery images exercise wrapping. Screenshots were visually
  inspected for representative 320px home/catalog/product/cart/checkout layouts.
- `git diff --check`.

Artifacts are ignored under `.next/responsive-qa/` (`results.json` and PNGs).
Run the viewport script after the production build, which can clear `.next`.
The sandbox blocked `tsx` user-profile access and stalled the initial build;
isolated scripts and the successful build ran with the required sandbox access.
Tests with real DB writes, including rollback-only fixtures, were deliberately
not run. All executed business regressions use isolated/mocked boundaries.

## Remaining limitations and protected scope

- Edge checks use SSR fixtures, seeded UI states, native image/link substitutes,
  and a simulated open-menu layout. They do not claim a hydrated end-to-end touch
  session, live carrier lookup, real order submission, or real device keyboard /
  Safari verification. Existing isolated action tests cover unchanged behavior.
- Cart quantity can still exceed actual product stock; stock synchronization
  remains deferred to the planned Product Options / stock lifecycle work.
- A future much larger home category set will add rows. The catalog category
  selector remains compact; an all-categories affordance is not needed now.
- Above 1024px the accepted home-category strip is retained, including its
  horizontal scrolling behavior when a large category set needs it.

Confirmed: **no Prisma schema changes, migrations, DB changes, `.env` changes,
payment changes, notification/status architecture changes, Nova Poshta business
logic changes, dependency changes, push, deployment, merge, or Vercel settings
changes. No commit has been made.**

## Final owner-requested review

Reviewed the complete tracked diff and both new files again before commit. One
real UI regression was found and corrected: when a child category was active,
the phone selector used its parent's value, so choosing that parent again could
not fire a native change event to clear the child filter. The selector now keeps
the active child's distinct value and a localized `Parent / Child` option, with
the parent still available as a separate choice. It reuses the existing filter
handler and preserves search/sort parameters and page reset behavior.

The new UA/EN regression failed against the previous implementation and passed
after the fix. Native select values/options are also checked in the viewport
harness. TypeScript (`--noEmit --incremental false`), ESLint, and production build
were rerun successfully. The 216-render viewport suite passed again after the
build, including the new native-selector checks, with no horizontal overflow.
All 32 normal desktop screenshot comparisons at 1280/1440px remained identical.

No other fixes or unrelated refactors were needed. Cards retain readable 13–14px
phone titles and 44px quick-add controls; cart quantity/remove/close controls stay
44px, with delivery choices and checkout submit at least 48px. No duplicated
mobile pages or JavaScript viewport logic were introduced. Desktop protection,
two columns at 320px, and wrapped phone/tablet categories remain in place. The
schema, database, `.env`, payment, notification, and provider boundaries remain
untouched. Earlier isolated Batch 1.6 and 69-case Nova Poshta results still apply;
this review changed only category presentation, its regressions, and this report.
