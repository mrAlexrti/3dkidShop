# Batch 1.6.2 — Admin mobile

Branch: `batch-1-6-2-admin-mobile`.
Base and unchanged HEAD: `9741b1107e75350f82065d33777d71b16d9f66ba`.
Verified the accepted branch `batch-1-6-1-mobile-responsive`, HEAD, and clean
working tree before creating the new branch. All changes remain uncommitted.

## Changed-file manifest

| File | Change |
| --- | --- |
| `src/components/admin/admin-sidebar.tsx` | One shared sidebar becomes a mobile modal drawer; compact mobile header, focus management and scroll lock. |
| `src/app/admin/layout.tsx` | Full-width mobile column, 16px padding; existing desktop row and 32px padding. |
| `src/app/admin/admin.css` | Admin-scoped field sizing, wrapping, mobile touch targets and 16px input text. |
| `src/app/admin/page.tsx` | Contained recent-orders table scrolling. |
| `src/app/admin/products/page.tsx` | Wrapping title/action header and contained table scrolling. |
| `src/app/admin/categories/page.tsx` | Contained table scrolling and compact mobile create-form panel. |
| `src/app/admin/orders/page.tsx` | Contained orders-table scrolling. |
| `src/app/admin/orders/[id]/page.tsx` | Stacked mobile heading/status control, contained items table, compact cards and safe long-value wrapping. |
| `src/components/admin/product-form.tsx` | Stacked phone field groups, wrapping checkboxes and compact phone padding. |
| `src/app/admin/categories/[id]/edit/page.tsx` | Compact phone edit-form panel padding. |
| `src/app/admin/content/page.tsx` | Compact phone Content and notification form padding. |
| `scripts/verify-admin-responsive.ts` | Isolated real-component browser fixtures, drawer interactions and accepted desktop comparisons. |
| `docs/BATCH_1_6_2_ADMIN_MOBILE_REPORT.md` | This review record. |

## Layout and navigation

- Tailwind `lg` is the Admin navigation breakpoint: below **1024px**, show a
  sticky compact 3D Kid Admin header and hamburger. At **1024px and above**, keep
  the existing 256px sidebar, desktop colors, navigation, spacing and main padding.
- Mobile content reserves no sidebar width. The header stays in normal layout
  flow, so it requires no extra content offset. Main padding is 16px on mobile
  and 32px on desktop. Main flex content can shrink without widening the page.
- The same `AdminSidebar` navigation and `LangSwitcher` render in both layouts;
  no second navigation implementation or drawer dependency was added.
- Mobile drawer width is `min(18rem, calc(100vw - 2rem))`; height is `100dvh`.
  Its contents scroll vertically, including in short landscape viewports.
- The drawer has a backdrop and closes using its close control, backdrop click,
  Escape, or a navigation link. Crossing to desktop also closes the modal.
- Opening focuses the close control, makes main/header content inert, locks body
  scrolling while preserving the prior body styles and scroll position, and traps
  Tab/Shift+Tab. Closing restores interaction and focuses the visible hamburger.
- Controls expose translated labels, `aria-expanded`, `aria-controls`, dialog/
  modal and navigation semantics, and the active navigation link's `aria-current`.
  Navigation, close/open, language and logout controls have mobile 44px targets.

## Tables, forms and order detail

All five audited tables retain their existing structure and typography. Focusable,
labeled regions contain horizontal scrolling. Below `lg`, minimum widths are:
recent orders **640px**, products **720px**, categories **560px**, orders **720px**,
and order items **520px**. These minimums reset on desktop to preserve the accepted
table layout. No body overflow-hiding rule or mobile card redesign was added.

Product price/old-price and stock/category fields use one column below `sm`
(640px) and retain two columns above it. Product checkbox groups wrap. Product,
category and Content panels use 16px phone padding and restore 24px at `sm`.
Category inputs and the existing Content/notification grids already stack;
Admin-scoped sizing prevents native selects and fieldsets from widening them.
Mobile fields use 16px text to avoid Safari's automatic focus zoom, with minimum
44px controls and tappable checkbox labels. CategoryForm, SizeEditor, MediaUrlField,
LangSwitcher, notification handlers and form submission logic remain unchanged.

Order heading and selector stack below `lg`. Long order numbers wrap, including
on desktop. Item scrolling stays inside its card. Customer and carrier cards
shrink safely; addresses, refs, TTNs and expanded provider diagnostics wrap. The
carrier title/badge can wrap on mobile. TTN creation/tracking controls and all
order, payment and delivery calculations/handlers are unchanged.

## Verification and desktop impact

Passed:

- TypeScript: `npx tsc --noEmit --incremental false`.
- ESLint: `npm run lint`, zero warnings/errors.
- Production build: `npm run build` with the existing system-CA setting.
- `tsx scripts/verify-batch16-notifications.ts`.
- `tsx scripts/verify-storefront.ts` and `tsx scripts/verify-unified-catalog.ts`.
- Existing `tsx scripts/verify-responsive.ts`: **216** storefront renders and
  exact desktop CSS comparisons at 1280/1440px. One initial checkout screenshot
  comparison was unstable; the unchanged regression passed on rerun. No
  storefront source or existing regression scripts were modified.
- New `tsx scripts/verify-admin-responsive.ts`: **242** UA/EN page/viewport
  renders at widths **320, 360, 375, 390, 430, 768, 1023, 1024, 1280, 1440**
  plus **740×320** landscape. Includes dashboard, products, categories, orders,
  product create/edit (with size fields), category create/edit, Content and
  notification settings, and order detail with long expanded diagnostics and
  both existing-TTN/create-TTN states. No page overflow; mobile sidebar consumes
  no content width; all five table types scroll within their containers.
- Hydrated real sidebar: open/close, backdrop, Escape, link closure and local
  navigation, UA→EN cookie/text state and router refresh boundary, focus trap/
  return, inert background, body lock, short-height scrolling and desktop resize
  cleanup. All eight mobile/tablet/landscape viewport cases are exercised.
- **40** accepted/current desktop comparisons at 1280/1440px. Sidebar, headings,
  tables, forms and field geometry must match exactly. Images must match within
  a strict **0.1% changed-pixel ceiling** for Chromium fractional text
  rasterization. The ordinary desktop appearance is preserved.
  Results: 36 screenshots are pixel-identical; four TTN-create screenshots differ
  only in carrier-heading rasterization, by at most **0.027%** of image pixels.
  The intentional unbroken-value stress fixture is excluded from image equality comparisons and
  remains covered by overflow checks at every width.
- `git diff --check` and complete production/test diff review.

Fixtures render the actual page sources with fail-closed action/Prisma/provider
bindings. Browser navigation stays on a local fixture server; logout is mocked;
remote browser requests are blocked. No real DB writes, orders, payment requests,
carrier calls or notifications are performed. Existing installed esbuild, sharp
and Edge are reused; package manifests and lockfiles are unchanged. QA artifacts
and accepted/current comparison PNGs live in ignored `.next/cache/admin-responsive-qa/`,
which survives production-build cleanup. The existing storefront script writes
temporary artifacts to `.next/responsive-qa/`, cleared by subsequent builds.

Reviewed the complete diff for duplicated navigation, desktop changes, body-level
overflow, small targets, unrelated refactors and business logic. Production edits
are limited to Admin presentation and drawer interaction. A long order number
found during the 1024px stress check was fixed with heading wrapping.

## Remaining device review

Automated browser checks use installed Chromium/Edge, not Safari or a physical
phone. Check iOS Safari's keyboard, dynamic browser bars, safe areas, native
selects, touch table/drawer scrolling and VoiceOver on a device. Fixtures use
native Link/Image substitutes and mocked router refresh; a live authenticated
Next navigation/session smoke test remains manual. No real form submissions or
provider actions were exercised.

## Scope confirmation

No Prisma schema or migration changes; no database changes; no `.env` changes;
no storefront business-logic changes; no payment or Nova Poshta logic changes;
no notification architecture, event or status changes. No push, deployment,
merge, Vercel changes or commit. All changes are left uncommitted for review.
