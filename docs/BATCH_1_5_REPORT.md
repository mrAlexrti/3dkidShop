# Batch 1.5 — catalog unification and architecture audits

Date: 2026-11-12. Branch: `batch-1-5-catalog-admin-audit`.

Created from clean `sites-ui-integration` HEAD `330324c8c18a35df0141702b6c9e849c159aa10d`. Verified `git status`, branch, and empty porcelain output before switching; no implementation edits preceded branch creation. The new local branch initially required permission to write `.git` through the workspace sandbox.

## Change summary

Home, catalog, and related-product grids now use one `ProductCard` markup and the existing `sf-product-*` presentation. Removed the `presentation` switch, old Tailwind card, nested add button inside product link, hover-only quick-add panel, and grid entrance motion. Home card appearance is the design source: image proportions, white/blush borders, rounded surfaces, Comfortaa type, price/old-price treatment, and a permanently reachable 44px bag button.

Catalog shell, filters, sort, pagination, empty state, and loading skeleton reuse `sf-*` tokens/classes. Selected category appears under the catalog title; count remains localized. Filter category/subcategory buttons expose pressed state; search and sort have labels, pending/empty state uses status announcements, and select controls receive the existing visible focus outline. Out-of-stock cards retain their guard/toast and expose disabled semantics; size-product bag labels say to choose a size. Both image and title remain separate product links, and the bag button is their sibling.

The duplicate header category strip is omitted on `/catalog`, where full filters already exist. Header/mobile menu access, home category navigation, and other page navigation remain. No separate category pages were introduced.

Shared responsive grid: four columns above 980px, two from 381–980px, one at 320–380px. The narrow-screen exception applies equally to home/catalog; it avoids cramped price/button rows. Search submit wraps full width on phones, filters wrap, sort can fill its row, pagination wraps, and min-width guards are retained. This was inspected in code; actual browser layout/overflow remains manual QA because the browser bridge was unavailable.

Routing and business queries remain `/catalog?category=<slug>`, with category+child filtering, UA/EN name search/autocomplete, sorting, query preservation, pagination/reset/clamping, active-only products, and existing centralized localization. Configured sizes still route to detail without selecting a size; simple products add directly; minimum configured price and stock checks retain their existing sources. Hover/focus GIF preference, touch/reduced-motion suppression, loading/error static-image fallback remain. Backend pricing, size architecture, Prisma schema, cart/order/payment/NP logic, Admin login/password authorization, and disabled customer-account controls were not changed. Sorting continues to use the existing database base-price order; this batch does not redesign variant-price sorting.

## Validation

| Check | Result / boundary |
| --- | --- |
| `node_modules/.bin/tsc.cmd --noEmit` | PASS, including new test script. Generated local tsbuildinfo removed; no source artifact committed. |
| `npm.cmd run lint` | PASS, no lint errors/warnings. Git CRLF conversion notices are separate from lint. |
| `$env:NODE_OPTIONS='--use-system-ca'; npm.cmd run build` | PASS; Next.js 15.5.9 production compilation, lint/type check, static generation and traces. No deployment. |
| `git diff --check` | PASS. |
| `tsx scripts/verify-unified-catalog.ts` | PASS UA/EN: actual card callbacks/semantic links, quick add, configured-size routing/from copy, stock guards, mouse/focus GIF gating, touch/reduced-motion/error fallback, parent/child pressed state, preserved query/reset page, pagination current page and hrefs. Fail-closed in-memory dependencies; no DB/network. |
| `tsx scripts/verify-storefront.ts` | PASS centralized UA/EN parity and locale/store behavior, in memory. |
| `tsx scripts/verify-cart.ts` | PASS isolated actual cart store, simple/size IDs, quantities/totals/normalization. Browser storage untouched. |
| `tsx scripts/verify-checkout-render.ts` | PASS actual optional-size/detail and checkout renders, UA/EN, explicit selection, full size prices/notes, stock/unpriced guards. Side effects blocked. |
| `tsx scripts/verify-batch14-payment-ui.ts` | PASS isolated actual payment/checkout components; handoff, state rendering/polling, cart retention. No provider/notification calls. |
| `tsx scripts/verify-batch14-payments.ts` | PASS isolated actual actions/callback; signatures, matching, CAS/idempotency, authoritative pricing, sandbox isolation. All DB/provider/notification writes are in-memory stubs. |
| `tsx scripts/verify-batch12-http.ts` | PASS read-only localhost production HTTP: all five real categories in home/footer/filters, category assignments and localized labels, built CSS. Updated obsolete card selector assertion to shared visual link. |
| `tsx scripts/verify-batch13-http.ts --skip-np` | PASS UA/EN home/info/catalog/product pages, all sorts, search/empty results/autocomplete API, optional-size labels, empty cart/checkout shell, invalid search inputs, pagination bounds and preserved query. Updated duplicate-header assertion to filters/shared cards. No NP request. |

Tooling notes: initial sandboxed `tsx` could not resolve OS user information (`uv_os_get_passwd`); these checks passed after approved execution outside the sandbox. Initial sandboxed localhost server returned 500 because Prisma could not open TLS using Windows security credentials. Restarting that same production server outside the sandbox resolved the issue; both HTTP suites then passed. No source, `.env`, certificate/security settings, or provider configuration was changed to work around it.

The real inventory used by HTTP QA contained ten active products, five root categories, and no children. Live >12-product pagination and real child-category navigation cannot be demonstrated with that inventory. They are covered by isolated component checks where possible, without seeding business data. Existing `verify-product-search.ts`, `verify-product-media.ts`, `verify-size-editor.ts`, and `verify-order-flow.ts` were inspected but not executed because they perform temporary transactional DB writes. **No rollback fixtures or other real DB mutations were used in this batch.**

Computer/browser inventory reported no browser/native surfaces: browser access host and native pipe unavailable. No screenshots, viewport measurements, hydrated browser interactions, or actual overflow checks are claimed.

## Manual browser checklist

Run the local production server and inspect the following in UA and EN. Do not submit checkout, edit real Admin data, invoke cron, or create a TTN.

1. At 320, 360, 375, 390, 768, 1024, and 1440px, compare home and catalog cards. Check image ratio, borders, typography, price wrapping, reachable bag buttons, and document horizontal overflow. Confirm one column through 380px and two at 390px/tablet.
2. Follow each home category to `/catalog?category=...`; inspect heading, count, selected pills, empty categories, footer/header consistency, and absence of the extra header category strip. Mobile menu should still work and close with Escape. Child-category live UI needs an approved nonproduction fixture later; this batch added none.
3. Combine category, search, sorting, and pagination; use Back/Forward, refresh a deep link, reset All, clear search, and change locale. Ensure unrelated query parameters survive filter/sort changes and page resets when appropriate. With >12 preexisting nonproduction records, check real multi-page navigation; none were created here.
4. Use only keyboard: Tab through search/suggestions/filter/sort/card links/bag/page links; check visible focus, ArrowUp/Down/Enter suggestions, Escape dismissal, and no focus traps. Confirm minimum 44px controls and screen-reader names/pressed/current states.
5. Click image/title to detail. Add an in-stock simple product, inspect cart, then remove it locally. Click a configured-size bag and ensure detail opens with no selected size; select a size and verify its price/label in local cart. Out-of-stock must not add. Do not place an order.
6. Mouse hover and keyboard focus a GIF card; check static image while loading and after failure. On touch and with reduced motion enabled, verify no GIF request or entrance animation. Add remains reachable without hover.
7. Check long UA/EN names, old-price rows, empty results, loading state, autocomplete overlay position, search-clear button, and localized count/active-category labels. No technical status codes should appear in public UI.

## Audit deliverables

- [Category Admin audit](BATCH_1_5_CATEGORY_ADMIN_AUDIT.md): all twelve questions, exact files/functions, completeness/risk classification, propagation and legacy tooling, plus a minimal unimplemented plan.
- [Notification/status audit](BATCH_1_5_NOTIFICATION_STATUS_AUDIT.md): all fourteen events plus refunds, triggers/recipients/channels/activation/configuration/deduplication/localization, independent state inventory, risks, proposed toggles and normalized model.

The critical classifier issue was reported during the batch and reproduced without side effects: current cron predicates classify `unpaid`/`not paid` as paid and `not delivered` as delivered. This proves predicate behavior; it does not establish real provider payloads or affected production orders. See the notification audit for precise source and scope. No unrelated system was fixed.

## Recommended next steps — all require explicit implementation approval

| Scope | Minimal next work |
| --- | --- |
| Small safe improvements using current schema | Category slug/error UX, order/count visibility, blocked-delete explanations, localized Admin selectors/labels, optional sibling up/down reorder using existing order. Consolidate documented maintenance entry points without running them. Central UA/EN status labels with safe unknown fallback and localized notification templates. Prioritize a separately approved code-based NP classifier fix with fixtures, CAS/transition safety, and clear TTN-vs-shipment meaning; do not silently change automated business transitions. Add server-only event/channel toggles through a validated existing SiteContent key only after event semantics are approved. |
| Schema/data-model changes | Persist order locale; independent normalized order/payment/delivery facts, immutable provider references/raw status/history, checkout/payment-attempt idempotency, delivery event/outbox records and unique notification delivery keys. Stage migration/backfill/reconciliation with reviewed mapping and rollback; no large automatic status conversion. Reservation release and refunds need explicit idempotent policies. |
| Payment-provider work | Confirm API versions/contracts, pending/held/refund/cancellation/settlement mappings and secure callback/reconciliation design before any activation. Live LiqPay remains disabled. Plata by mono and NovaPay COD redesign are separate future batches; no provider integration, credentials or activation are authorized here. |

## Local commits and complete changed-file manifest

1. `401efc1` — `refactor: unify storefront catalog presentation`
2. `668bed0` — `test: validate unified catalog experience`
3. `docs: audit category and notification architecture` — this report and both detailed audits. The final commit ID/HEAD is supplied in the handoff; a document cannot contain its own commit hash.

```text
docs/BATCH_1_5_REPORT.md
docs/BATCH_1_5_CATEGORY_ADMIN_AUDIT.md
docs/BATCH_1_5_NOTIFICATION_STATUS_AUDIT.md
scripts/verify-unified-catalog.ts
scripts/verify-batch12-http.ts
scripts/verify-batch13-http.ts
src/app/(shop)/catalog/loading.tsx
src/app/(shop)/catalog/page.tsx
src/app/(shop)/storefront.css
src/components/catalog/catalog-filters.tsx
src/components/catalog/pagination.tsx
src/components/catalog/product-grid.tsx
src/components/home/featured-products.tsx
src/components/layout/header.tsx
src/components/product/product-card.tsx
```

## Explicit operational confirmations

No push, deployment, merge, Vercel change, `.env` modification, schema change, real DB mutation, real payment, real email, real Telegram message, or real TTN. No credentials were printed. Production architecture and deferred roadmap items were preserved. Category and notification/status recommendations remain unimplemented pending approval.
