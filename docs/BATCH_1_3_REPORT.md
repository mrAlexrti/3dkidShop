# Batch 1.3 — information pages, product autocomplete, storefront/order QA

Branch: `sites-ui-integration`. Clean starting commit: `8508926`.
TARGET only; REFERENCE was not modified. No push, deployment, schema change, migration, dependency change, seed, or category mutation. No Favorites, customer authentication, Account, or My Orders implementation.

## Local commits

- `d960598` — `fix: simplify informational page navigation and home catalog actions`
- `cffe468` — `feat: add lightweight product search autocomplete`
- `c68fc04` — `fix: remove public development remnants and localize checkout`
- `test: audit storefront and checkout flow` — final commit contains this report and the QA scripts; see `git log -4 --oneline` for its hash.

## Delivered behavior

About starts with the approved localized slogan as its H1. The standalone `3D kid` heading is removed; every approved body paragraph remains unchanged. The lead uses the existing `--sf-brand-pink: #F494BA` token. Body copy remains dark and readable.

Header category navigation is omitted on `/about` and `/delivery-payment`. The compact header and mobile menu remain. Catalog and product browsing retain category navigation; homepage categories remain below the hero cards. Five canonical real DB categories and their order are unchanged.

The homepage Catalog CTA is removed completely, including its unused UA/EN dictionary entries. Catalog products, search submission, and category links remain.

One shared `ProductSearchInput` serves home and catalog. A same-origin GET `/api/products/suggestions?q=...&locale=ua|en` executes a bounded Prisma query against active products only. It searches `name` and `nameEn` case-insensitively; takes six rows with stable ordering; selects only ID/slug/names and the first ordered image; returns only `{id, slug, name, image}`. Names are localized server-side. Queries under two characters return no results; over 80 characters or unsupported locale return 400. Responses are private/no-store. No new DB field or browser catalog preload.

The client waits 250ms, aborts superseded requests, ignores aborted results, caches the last completed normalized locale/query, and deduplicates IDs. Rows use 48px thumbnails, empty image alt text, and localized names. Product links disable speculative prefetch. Broken thumbnail requests use the existing placeholder. The catalog filter panel has an explicit stacking level so the dropdown can appear above the animated grid.

Combobox/listbox/option semantics, active descendant, selected option, and localized live status are supplied. Arrow keys wrap through results; highlighted Enter opens the product; unselected Enter retains normal catalog search. Escape, Tab, outside pointer and window blur close the list. Clearing the query removes results. Touch links retain normal navigation. Catalog q/category/sort/page behavior is retained.

## Public remnant and localization audit

Fixed:

- Removed the stale LiqPay/WayForPay/Monobank “coming soon” note. Only configured LiqPay is offered for online payment; unconfigured installations retain offline options and show neutral localized copy.
- Removed development wording from disabled Account labels and unconfigured social-icon labels. No fake `/account` link or `href="#"` was added. Social URLs are unchanged.
- Replaced the cart's unsupported “Free” delivery claim with carrier-rate copy; monetary totals are unchanged.
- Centralized checkout labels, placeholders, delivery messages, validation, submission feedback, order errors and payment-return/pending copy in UA/EN dictionaries.
- Replaced corrupt encoded Nova Poshta fallback strings with neutral localized messages; corrected the internal branch/locker text detection. Other Cyrillic that merely appeared corrupted through PowerShell's default decoding was checked again as UTF-8 rather than rewritten.
- Localized root/catalog/checkout metadata and removed obsolete sticker-oriented Open Graph wording.
- Localized product-detail out-of-stock text. Added quantity/removal/close labels, selected-option state and a cart dialog focus loop/Escape/focus return.
- Final read-only content audit: all ten active products have English names/descriptions; all ten use Ukrainian canonical size options. A shared display-only dictionary now renders Size/Small/Medium/Large in EN across product options, cart/drawer and checkout summary. UA and unknown custom option labels retain their original text. The checkout summary now shows selected options. Canonical keys/values, option IDs, cart identity and price modifiers are untouched.
- Associated checkout contact/delivery labels with inputs. Checkout submission recovers from rejected network/server requests via `finally`.

Retained intentionally: admin-only TEST_MODE warnings; ordinary localized input placeholders; valid order-confirmation “soon” wording; existing provider-supplied Ukrainian place/address names; development product data. No public development/demo/TODO copy or `href="#"` was found in the audited rendered storefront pages after the changes.

## Contained defects fixed

- **P2 phone/name validation:** ten letters previously passed the phone length check; whitespace-only names could pass minimum length. Shared client/server validation now trims required text and requires 10–15 phone digits with phone formatting characters. Order enums and pricing/stock rules are unchanged.
- **P2 courier metadata:** choose a branch, switch to courier, enter a street. The old nullish fallback kept an empty warehouse string as `novaPoshtaBranch`, dropping the courier street from that metadata field. Selection now explicitly follows delivery type. Rollback QA verifies the courier street is stored.
- **P2 stale delivery lookup:** a city/warehouse response could arrive after clearing or switching delivery type. Debounce cancellation, AbortController and generation guards now discard stale responses. Warehouse loading is real, and does not replace/unmount the typing field. NP model/method/property contracts are unchanged. The unused hidden warehouse select was removed; registered delivery fields remain.
- **P2 carrier type fallback:** live JSON returns `TypeOfWarehouse`, not the old assumed `TypeOfWarehouseRef`. The inherited locker constant `841339c7-...` identifies a postal branch; live lockers returned `f9316480-5f2d-425d-bc2c-ac7cd29decf0`. The client classifier now recognizes the actual field, retains the legacy alias, treats postal/cargo branches as branches, and uses the observed locker type with text fallback. A legacy-alias postal branch previously classified as a locker now stays a branch. Regression fixtures and live untyped checkout searches cover this. No API whitelist/request contract was changed.

## Automated and source QA

| Area | Evidence / result |
|---|---|
| Localization state | Existing `verify-storefront.ts` passes key parity, cookie-driven SSR, persistence migration and store isolation. |
| Media regression | Existing `verify-product-media.ts` passes nullable GIF create/change/clear and stable main-image editing in a mandatory rollback transaction. ProductCard/GIF source is unchanged. |
| Canonical categories | `configure-storefront-categories.ts --verify` is read-only and passes. Five roots, orders 10/20/30/40/50, product allocation 8/1/0/0/1. |
| Batch 1.1 HTTP | Pass: both locales, home composition, real products/categories, footer, About/Delivery copy and metadata, catalog/product/cart, protected admin and read-only media/content controls, Comfortaa serving. |
| Batch 1.2 HTTP | Pass: both locales, exact brand token, leading category stars, five DB-driven categories in strip/footer/filters and category filtering. |
| Batch 1.3 HTTP | Pass: both locales, information-page navigation, removed CTA, search endpoint/payload/locale/limits, catalog searches/sorts/empty states, product links, empty cart and checkout loading shell, pagination bounds preserving filters. Next can emit a streamed meta redirect with HTTP 200; the test checks the actual redirect target. |
| Autocomplete DB query | `verify-product-search.ts` executes actual query source with active/inactive, bilingual, multi-image fixtures inside a guaranteed rollback. Active-only, both fields, insensitive match, localization, limit/dedup and first-image/minimal payload pass. |
| Cart state | `verify-cart.ts` exercises the actual store with isolated in-memory persistence: add/merge, separate option lines, quantities/floor, count/totals, remove, drawer state, clear pass. Browser storage is untouched. |
| Nonempty checkout markup | `verify-checkout-render.ts` renders actual form/product-option source with installed React DOM and real form hooks; UA/EN labels, size names/values, unchanged canonical option data, unknown-label fallback, tel input, card enabled/disabled states and absence of stale provider/Cyrillic EN copy pass. No renderer dependency. |
| Order transaction | `verify-order-flow.ts` exercises actual action source and real Prisma transaction: validation, empty/unavailable cart, quantities/options/stock, DB-authoritative price ignoring tampered client price, totals/items/status, three delivery/payment paths, courier metadata and concurrent-stock guard pass. |
| Live Nova Poshta | Pass with system CA trust: Kyiv settlement lookup plus real branch and locker searches; 50 branches / 50 lockers remain disjoint. Classifier fixtures also cover actual/legacy type fields and conflicting branch-type/locker-text. No Document/TTN operation used. |

HTTP initially encountered one database `P1001`/500; a retry passed. Server logs also showed remote connection resets/termination. These are observed development DB availability failures, not a diagnosed application cause. They were not hidden by changing database configuration or commerce logic.

The first carrier attempt returned 502 without system CA trust. Later unpaced diagnostic calls received upstream “To many requests”; tests now space carrier reads by 1.5 seconds. The final paced live lookups passed. No TLS verification was disabled, API key altered, or carrier rate limit bypassed. An initial typed QA request used the legacy misnamed locker constant; actual checkout's untyped address searches were then verified against real response fields.

## Order test safety and exact cleanup

Environment inspection printed configuration flags only: TEST_MODE enabled; email/seller-notification credentials configured; LiqPay configured with sandbox disabled; Nova Poshta configured. TEST_MODE controls admin access and does **not** suppress order notifications. Therefore no checkout was submitted through localhost and no real/sandbox payment was attempted.

The QA loader binds real order validation/status logic and DB access, but notification/payment/post-commit lookup boundaries fail closed. The real transaction callback creates an uncommitted fake-customer order, checks it and the stock decrement, then throws a mandatory rollback sentinel **before commit**. Post-commit notification and payment code is unreachable. This does not weaken runtime safeguards.

Rolled-back fixture order numbers: `3DK-66125713`, `3DK-66130005`, `3DK-66132189`. Fake email: reserved `batch13-qa@example.invalid`. One real existing option was exercised. All fixture orders/items and stock mutations disappeared through rollback; no unrelated record was deleted. Notification/payment calls: **0**. Real TTNs/messages/charges: **0**.

Products **10 → 10**, orders **1 → 1**, images **10 → 10**; full product/order snapshots (including stock and items) match before/after order QA. Search/media fixtures also rolled back. No persisted test order exists and no cleanup deletion was needed.

## Limits and findings

**Critical before production**

- Investigate the observed development DB interruptions and confirm production connection/pooling availability. No successful load test or browser performance measurement is claimed.
- **P1 payment acceptance validation review**, separate from this UI batch: `callback/route.ts` verifies signature/order ID but does not compare callback amount/currency to the stored order. `isPaidLiqPayStatus()` accepts `sandbox` without checking current mode. Isolated reproduction: bind a fake 100 UAH order and stub notifications; supply a callback signed with a test key for that order with amount 1/currency USD/status success. The current branches reach the paid update without an amount/currency comparison. A sandbox-status fixture is also accepted with sandbox mode off. A valid signature is still required; this is not a claim that a customer can forge one. Source observation only, not an executed gateway test; no signed live callback was submitted. Payment code was not changed.
- Production must use TEST_MODE=0 and appropriately isolated integration credentials for QA. Current development credentials can send messages and initiate live payment.

**Recommended before production**

- Complete the browser checklist below and the safe sandbox/callback journey on an externally reachable Preview. Native Computer Use failed to connect (`native pipe unavailable`, OS error 2); no visual/keyboard/touch result is claimed from automation.
- Approved white on `#F494BA` contrast is about **2.14:1**. Footer palette and required brand pink were preserved. Request an approved readable contrast treatment before accessibility sign-off; no alternate pink was substituted.
- Reproduce the existing simple-product cart identity discrepancy: add a no-option product from a card (`id = productId`), then its detail page (`id = productId + '-'`). Two lines can appear. Severity P2 UX; server aggregates quantities for stock. Cart identity was explicitly preserved.
- Add production abuse controls/monitoring for the public DB-backed suggestions endpoint if traffic warrants it. Current query is bounded/debounced/cancelled; no whole-catalog response is sent.
- Test real multi-page pagination with >12 active products. Current 10 records cover all sort/filter/empty/bounds paths but not a second populated page.
- Transactional email templates remain Ukrainian; persisting/customer-selecting an email locale is outside this localized storefront cleanup.
- Cart product names are captured in the language used when adding the item, so a later language switch can retain the earlier name. Unknown custom option labels have no bilingual DB fields and fall back to their authored text. A richer locale-aware cart/option content contract is a separate follow-up; this batch fixes the actual canonical size labels without altering stored values.

**Nice to have later**

- Memoize the product-detail read shared by metadata/page; category tree and SiteContent already use request-scoped React cache. No broad query-layer rewrite.
- Reduce public dictionary/provider hydration, including admin dictionary/session-provider overhead. Current build First Load JS: home 186kB, catalog 187kB, product 186kB, checkout 162kB; not measured transfer/LCP scores.
- Convert the self-hosted Comfortaa TTF to WOFF2 and avoid loading an additional admin font stylesheet on storefront routes. Required Comfortaa 700 remains intact.
- Add explicit `sizes` and localized thumbnail selection labels to the existing product gallery in a separate media/accessibility refinement. Cart/checkout/suggestion images now have fixed correct size hints; card previews fetch just one DB image and the full product gallery remains intact.
- Review existing product-card nested interactive markup and the catalog's initial opacity animation under disabled/slow JS. GIF code remains unchanged.

Source assessment: hero images declare dimensions and responsive sizes; the center image is prioritized, side images remain lazy, and fallback assets are approximately 83–116kB each. Admin custom hero images bypass optimization and need sensible upload dimensions. Card aspect ratios reserve layout space. GIF URLs enter an image only after eligible pointer/focus interaction, remain unoptimized/aria-hidden, and retain static/reduced-motion/touch/error fallback. No GIF is preloaded for every catalog row. Actual CLS/LCP and mobile overflow remain browser measurements.

## Manual localhost / Preview checklist

- At 320/360/390/430/768/1024/1440px in UA and EN: hero/controls, category scrolling, no horizontal overflow, compact suggestion dropdown above cards, readable footer, About first heading and absent information-page category strip.
- Search: one character produces no request; two+ produces one debounced request per changed normalized query; fast typing cancels old requests. Verify mouse/touch links, 48px thumbnails, arrows, highlighted Enter, ordinary Enter, Escape, Tab, outside click, clear, focus and screen-reader announcements. Test failed endpoint/thumbnail and EN display.
- Each category, search + category + sort, empty search and pagination; product links, images, stock, options and related cards. GIF hover/focus/leave/blur, reduced motion, touch navigation and broken GIF fallback; inspect Network to confirm no initial GIF download.
- Add from card and detail/options, cart badge/drawer, Tab containment/Escape/focus return, quantities/remove/totals, reload persistence and proceed to checkout. Account stays disabled/non-navigating. Check footer real category/About/Delivery links and social configured/unconfigured states.
- Checkout: empty persisted cart after hydration; nonempty summary; blank fields, invalid email/phone, city lookup, branch/locker disjoint results, courier address, rapid city/delivery switches, loading/error/manual paths, payment switches and UA/EN errors. Verify field focus survives lookup and submission failure recovers.
- Stop before order submission under current credentials. On a separately configured sandbox Preview, verify post-commit confirmation, notification delivery, LiqPay return + signed callback/status and stock/order reconciliation. Use fake recipients and suppress/isolate seller notifications; never test a charge against this live configuration.
- On Preview verify callback reachability, deployment environment/certificate behavior, remote image allowlist, fonts/CSP, touch/Safari/Chrome behavior and real web-vitals. No Preview is created by this batch.

## Validation commands

`npm run lint`, `npx tsc --noEmit --incremental false`, `npm run build`, and `git diff --check` pass on the final app implementation. Build uses this Windows machine's existing system CA setting: `$env:NODE_OPTIONS='--use-system-ca'`. No TLS checks were disabled.

Run existing scripts with `npx tsx scripts/verify-storefront.ts`, `verify-product-media.ts`, `configure-storefront-categories.ts --verify`, `verify-batch11-http.ts`, and `verify-batch12-http.ts`. New scripts are `verify-product-search.ts`, `verify-cart.ts`, `verify-checkout-render.ts`, `verify-order-flow.ts`, and `verify-batch13-http.ts`. The last supports `--skip-np`, `--np-only` and `--filters-only` to isolate read-only network/classification checks. HTTP tests require `npm run start -- -H 127.0.0.1 -p 3011`; base URLs are restricted to loopback. On this Windows machine start the server with the same `--use-system-ca` NODE_OPTIONS used for the build.

## Complete changed-file inventory

```text
docs/BATCH_1_3_REPORT.md
scripts/source-module.ts
scripts/verify-batch11-http.ts
scripts/verify-batch13-http.ts
scripts/verify-cart.ts
scripts/verify-checkout-render.ts
scripts/verify-order-flow.ts
scripts/verify-product-search.ts
src/app/(shop)/about/page.tsx
src/app/(shop)/cart/page.tsx
src/app/(shop)/catalog/page.tsx
src/app/(shop)/checkout/page.tsx
src/app/(shop)/checkout/success/page.tsx
src/app/(shop)/page.tsx
src/app/(shop)/product/[slug]/page.tsx
src/app/(shop)/storefront.css
src/app/api/products/suggestions/route.ts
src/app/layout.tsx
src/components/cart/cart-drawer.tsx
src/components/catalog/catalog-filters.tsx
src/components/catalog/product-search-input.tsx
src/components/checkout/checkout-form.tsx
src/components/checkout/checkout-page.tsx
src/components/checkout/use-np-lookups.ts
src/components/home/featured-products.tsx
src/components/layout/header.tsx
src/components/product/product-options.tsx
src/lib/actions/create-order.ts
src/lib/i18n.ts
src/lib/np-warehouse-types.ts
src/lib/product-content.ts
src/lib/product-search.ts
src/lib/validations/checkout.ts
```

Prisma schema/migrations, package manifests/lockfile, ProductCard/GIF implementation, cart store, integration contracts/signatures/notifications, admin auth/TOTP and REFERENCE are unchanged.
