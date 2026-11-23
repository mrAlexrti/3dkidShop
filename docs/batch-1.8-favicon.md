# Batch 1.8 — official 3D Kid favicon

Date: 2026-11-21. Branch: `feat/batch-1.8-color-size-variants`.
Baseline/unchanged HEAD: `76621cf01ebe482bfee9a80aaed4a4b5b9dfed22`.

**Favicon implementation and isolated verification: PASS.** Database migration
rehearsal remains BLOCKED by authentication; see batch-1.8-migration-rehearsal.md.
No deployment or live indexing change was performed.

## Source and transformation

The existing catalog header's home link and footer both use
`public/hero/logo.png`: the official complete 3D Kid logo, 282x314 RGBA/sRGB.
This is the only logo asset in the repository; no separate compact official mark
or higher-resolution original was found. The original remains byte-identical:

```text
e74e671bb71e8aeb9722f32f5141c9c9913833d68e84676402047082c2353361  public/hero/logo.png
```

All stars, letters, geometry, colors and proportions are retained. The complete
image is scaled proportionally into a square with only the padding needed for its
original aspect ratio. No cropping, tracing, redrawing or invented mark. Tiny text
is necessarily less legible at 16px; the existing full brand is retained rather
than inventing a compact symbol. 32/48/96px assets provide larger choices.

Deterministic generation uses Sharp already installed with Next.js:

```text
node scripts/generate-favicons.mjs
```

No dependency or lockfile change. The source PNG is untouched. ICO/standard PNG
retain transparency; the Apple icon is opaque on #fbf7f2, the existing site's
cream surface, to avoid platform-dependent transparent bookmark backgrounds.
Light/dark contact-sheet inspection confirmed the full logo is retained.

| Asset | Dimensions | Size | Purpose |
| --- | --- | --- | --- |
| src/app/favicon.ico | 16/32/48 square PNG frames | 6,937 bytes | Stable /favicon.ico, browser tabs and conventional favicon discovery |
| src/app/icon.png | 96x96 | 9,174 bytes | Higher-resolution browser/search icon |
| src/app/apple-icon.png | 180x180, opaque | 17,496 bytes | Apple bookmark/home-screen icon |

## Next.js integration and crawlability

Uses App Router's file-based metadata conventions; no manual icon declarations or
layout edits are needed. The audit found no prior favicon asset or competing
icons metadata in src/app, app, public or layouts. No generic icon reference was
left alongside the new brand. [Next.js 15 icon conventions](https://nextjs.org/docs/15/app/api-reference/file-conventions/metadata/app-icons).

Observed local production-build links, identical across UA/EN and homepage/catalog:

```html
<link rel="icon" href="/favicon.ico" type="image/x-icon" sizes="16x16" />
<link rel="icon" href="/icon.png?2070fcd956cbdff6" type="image/png" sizes="96x96" />
<link rel="apple-touch-icon" href="/apple-icon.png?446b774acc173fbc" type="image/png" sizes="180x180" />
```

The ICO directory independently contains all three declared frames despite Next's
link reporting the first frame's size. The PNG/Apple query is a framework-managed
asset version; /favicon.ico remains a stable unversioned URL. No authentication,
API token, media storage credential or database lookup is needed to serve them.

The root metadataBase remains https://www.3dkid.shop and existing canonical-host
middleware/sitemap behavior is unchanged. Relative icon links resolve to that
hostname when the homepage is served there. No new language-specific icon or
unrelated canonical/indexing setting was introduced. Both locales share these
same official-brand assets.

robots.txt still allows / and disallows only /admin. The public icon routes are
not Admin routes; anonymous local GET and HEAD requests returned 200. Tests with
Googlebot/Googlebot-Image user-agent headers confirmed the local application does
not block the homepage/assets. This is not proof of live domain/WAF behavior.

Google asks for a representative square favicon, a stable URL and crawlable home/
image resources; the 96px PNG exceeds its recommended 48px size. Google controls
recrawl timing and does not guarantee displaying an icon even when eligible.
[Google Search Central favicon requirements](https://developers.google.com/search/docs/appearance/favicon-in-search).

## Executed checks

```text
node scripts/verify-favicon.mjs
node scripts/verify-favicon.mjs --build
node scripts/verify-favicon.mjs --output .next/cache/batch17-build-output-1795257265884
tsc --noEmit --incremental false
npm run lint
git diff --check
```

| Check | Result |
| --- | --- |
| Asset integrity | PASS: original logo matches Git baseline, square dimensions, complete proportional image, valid bounded ICO directory/PNG payloads, transparent standard PNG and opaque Apple PNG |
| Production build | PASS: Next 15.5.9 compile, type/lint and generation of 18 pages including metadata routes |
| TypeScript | PASS, standalone noEmit/nonincremental |
| ESLint | PASS, final repository lint has no warnings/errors |
| Next HTTP | PASS: actual compiled app, UA/EN homepage/catalog, three consistent brand declarations and anonymous icon GET/HEAD 200 with correct bytes/content types |
| Metadata streaming | PASS: streamed icon links are hoisted into rendered head; HTML-limited Bingbot receives all links in initial head |
| Googlebot/Image and robots | PASS locally: no authentication or application crawl block; no live Google request/indexing operation |
| Chrome browser | PASS: actual installed desktop Chrome, UA/EN, 1280/390px viewports and light/dark themes (8 cases); all icons decode and header logo remains keyboard-accessible home link |
| Visual inspection | PASS: source and proportional small/large logo contact sheet on light/dark surfaces; no identity crop/redesign |
| Previous work | PASS: all 60 other pre-existing changed files byte-preserved; migration report extended with current blocker |
| Git/artifact checks | PASS: empty index, no new credentials/dependencies/config/generated artifacts; previous QA statuses unchanged |

The first HTTP check incorrectly expected all Googlebot icon markup in the initial
raw head. Next 15 streams metadata for JavaScript-capable crawlers and emits its
icon-hoisting script. The check was corrected to validate that existing framework
behavior, rendered head, and blocking head output for HTML-limited crawlers.
No application SEO configuration was changed to satisfy the test.
[Next.js 15 streaming metadata](https://nextjs.org/docs/15/app/getting-started/metadata-and-og-images).

The isolated build/runtime use empty Prisma read fixtures and reject DB mutations,
raw connections and provider fetches. A test-only preload blocks Next dotenv
loading, so project credential files are not loaded for this verification. Browser
checks use a fresh headless profile and block external HTTPS requests. Build HTML,
screenshots/contact sheet and test results stay in ignored .next/cache. No real
products, orders, payments, notifications, Blob operations or hosted services used.

## Pending deployed/manual checks

**NOT TESTED:** live www/apex redirects, deployed Googlebot access/WAF/CDN responses,
physical Android/iOS or Safari, native visible browser tab/bookmark/home-screen UI,
old browser favicon caches, Search Console inspection and Google Search appearance.
Chrome mobile results are viewport emulation, not a physical-device claim.

After a separately authorized release, the operator should verify www homepage
and each icon return 200 without login, inspect rendered head in UA/EN, check the
header home link, and view tabs/bookmarks on physical devices in both themes.
If appropriate, request homepage indexing in Search Console and allow Google's
own recrawl; immediate search-result changes are neither performed nor promised.

The combined Batch 1.8 application still needs its approved additive schema before
deployment. A completed favicon does not bypass the blocked migration gate.
No push, merge, deployment, Neon/Production SQL, Vercel/Cloudflare change, cleanup
activation or native-write activation occurred. All work remains unstaged,
uncommitted and unpushed.

## Exact changed-file inventory

This execution adds the three icon assets, generator, verifier and this note, and
extends the existing migration report. All preceding application/SQL work remains.
The complete combined inventory is appended below.

### Combined inventory (67 files)

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
docs/batch-1.8-favicon.md
docs/batch-1.8-implementation.md
docs/batch-1.8-manual-qa.md
docs/batch-1.8-migration-rehearsal.md
docs/batch-1.8-release-readiness.md
docs/batch-1.8-variant-architecture.md
docs/review/batch-1.8-neon-preflight-readonly.sql
docs/review/batch-1.8-production-candidate.sql
docs/review/batch-1.8-variants.prisma
docs/review/batch-1.8-variants.prisma.diff
docs/review/batch-1.8-variants.sql
scripts/fixtures/batch18-variant-reference.ts
scripts/fixtures/variants-browser.tsx
scripts/generate-favicons.mjs
scripts/rehearse-batch18-variants.mjs
scripts/verify-batch18-application-postgres.ts
scripts/verify-batch18-architecture.ts
scripts/verify-batch18-implementation.ts
scripts/verify-batch18-migration-artifacts.mjs
scripts/verify-batch18-postgres.ts
scripts/verify-favicon.mjs
src/app/apple-icon.png
src/app/favicon.ico
src/app/icon.png
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
