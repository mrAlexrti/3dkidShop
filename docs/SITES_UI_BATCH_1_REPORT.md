# Sites UI integration — Batch 1

Implemented on `sites-ui-integration`. Baseline: `3e1ce6f`.
Batch 2 has not started. Nothing was pushed, merged, or deployed.

## 1. Files changed

- `src/app/(shop)/layout.tsx`
- `src/app/(shop)/page.tsx`
- `src/app/globals.css` (removed the unused decorative-header height variable only)
- `src/components/home/benefits.tsx`
- `src/components/home/featured-products.tsx`
- `src/components/layout/footer.tsx`
- `src/components/layout/header.tsx`
- `src/components/layout/lang-switcher.tsx`
- `src/components/product/product-card.tsx`
- `src/components/providers.tsx`
- `src/lib/i18n.ts`
- `src/store/lang-store.ts`

## 2. Files added

- `public/hero/dragon-v1.webp`
- `public/hero/bunny-v1.webp`
- `public/hero/robot-v1.webp`
- `public/hero/logo.png`
- `src/app/(shop)/storefront.css`
- `src/components/home/hero.tsx`
- `src/components/home/hero-doodle.tsx`
- `src/components/layout/category-nav.tsx`
- `src/lib/hero-assets.ts`
- `scripts/verify-storefront.ts`
- `docs/SITES_UI_BATCH_1_REPORT.md`

## 3. Commits created

| Commit | Purpose |
| --- | --- |
| `2f07786` | Cookie-led localization foundation |
| `9bc7cf2` | Selected assets and scoped visual foundation |
| `36be337` | Shared navigation and footer |
| `1f05691` | Configurable home-only three-card hero |
| `7b26551` | Home presentation using real target products |
| `1903aa7` | Database-free localization verification and resilience fixes |

The final documentation commit contains this report and removes an extra trailing blank line in the adapted doodle component. Run `git log --oneline 3e1ce6f..HEAD` for the complete list, including that commit.

## 4. Assets copied

| Reference source | Target destination | Dimensions | Bytes |
| --- | --- | --- | ---: |
| `public/hero/dragon-v1.webp` | Same relative path | 1254 × 1254 | 116142 |
| `public/hero/bunny-v1.webp` | Same relative path | 1254 × 1254 | 87764 |
| `public/hero/robot-v1.webp` | Same relative path | 1254 × 1254 | 83252 |
| `public/hero-logo-reference.png` | `public/hero/logo.png` | 282 × 314 | 20208 |

All four asset hashes match their reference sources. No font files were copied: target font themes, including the existing Comfortaa option, remain in use. The reference favicon was a generic starter mark and was not imported. No historical mascot composites, demo product sheets, unused SVGs, or media infrastructure were copied.

## 5. Localization keys added

The same 26 leaf keys were added to each centralized dictionary (`ua` and `en`):

- `nav.home`, `nav.categories`, `nav.account`, `nav.openCart`, `nav.closeMenu`, `nav.skip`
- `language.label`, `language.ua`, `language.en`
- `home.eyebrow`, `home.description`, `home.searchLabel`, `home.searchPlaceholder`, `home.benefitsLabel`
- `home.hero.title`, `home.hero.titleAccent`, `home.hero.subtitle`, `home.hero.gallery`, `home.hero.dragon`, `home.hero.bunny`, `home.hero.robot`
- `product.outOfStock`, `product.chooseOptions`
- `footer.description`, `footer.customers`, `footer.catalogLabel`

Existing translation values were preserved. Quick-add notifications now use centralized translations. Public locales remain Ukrainian (`ua`, HTML `uk`) and English (`en`), with Ukrainian as the existing server default. No locale-prefixed URLs were added.

## 6. Architecture changes

- Shop layout renders a compact header in normal document flow. Removed the old fixed header's 150/220px content offset. Admin and login remain outside the storefront wrapper.
- The full hero is rendered only by the home page. The approved rotated cards, pastel palette, and decorative stars/rays follow `components/hero.tsx` and `components/hero-doodle.tsx` in the reference. Branding uses the approved logo plus localized heading composition.
- `src/lib/hero-assets.ts` configures each image separately, including intrinsic dimensions. `next/image`, responsive sizes, and square card containers reserve space. No image is preloaded speculatively; LCP profiling is still required before choosing an image to prioritize.
- Hero, section headings, search form, and benefits are server components. No entrance animation hides the new home content. Interactive navigation/product controls retain target stores and router behavior.
- Home Prisma queries, product mapping, stock checks, options routing, add-to-cart behavior, and target category queries remain intact. Search submits GET `/catalog?q=...`; category links use `/catalog?category=...` and real target slugs.
- Home product cards have an opt-in presentation. Their purchase button is separate from product links and remains visible on touch devices. Other product-card presentations remain in place.
- The language store remains in `src/store/lang-store.ts`, using Zustand and the centralized dictionary. Each Providers instance owns its store, initialized from the existing server locale cookie. Persistence stores only `locale`, discards stale dictionaries, and cannot override the cookie during hydration. The switcher retains `router.refresh()` and synchronizes the HTML language immediately.
- New styles use storefront classes/tokens. Target global CSS was preserved apart from the unused header variable. Existing font settings remain authoritative.
- Category submenus use native click/keyboard-accessible disclosure controls with Escape handling. New controls have localized accessible names, visible focus styles, and mobile touch targets. Doodles are hidden from assistive technology and ignore pointer events. New styles honor reduced motion.
- The account icon is a disabled, localized “coming soon” control. No customer authentication or account pages were added. Footer links use existing routes; previous placeholder social/phone and nonfunctional policy items were not carried into the new presentation.

No dependencies, Next.js configuration, Tailwind version/configuration, Prisma schema, API/server actions, cart store, checkout logic, shipping/payment integrations, notifications, admin authentication, or database configuration changed.

## 7. Validation results

| Check | Result |
| --- | --- |
| Initial branch | `sites-ui-integration` |
| Initial target working tree | Clean |
| Baseline `npm run lint` | Passed |
| Baseline `npx tsc --noEmit --incremental false` | Passed |
| Final `npm run lint` | Passed |
| Final `npx tsc --noEmit --incremental false` | Passed |
| `node_modules/.bin/tsx scripts/verify-storefront.ts` | Passed, entirely in memory |
| `npm run build` within sandbox | Compilation passed; prerender blocked by database access |
| `git diff --check 3e1ce6f` | Passed after removing a trailing blank line |
| Reference integrity | 98/98 files retained; zero SHA-256 changes |
| Copied image dimensions and hashes | Verified |
| Dependency/framework/business-logic diff review | No unexpected changes |

The in-memory check covers UA/EN key parity, initial cookie-selected dictionary, stale persisted dictionaries, invalid stored locales, locale-only persistence, cookie writes, and isolation between store instances. It does not substitute for live browser checks.

The sandboxed build fails on the same pre-existing database/TLS problem observed in the baseline. Exact relevant output:

```text
✓ Compiled successfully in 10.3s
Invalid `prisma.product.findMany()` invocation:

Error opening a TLS connection: В пакете безопасности отсутствуют учетные данные (os error -2146893042)

Invalid `prisma.siteContent.findUnique()` invocation:

Error opening a TLS connection: В пакете безопасности отсутствуют учетные данные (os error -2146893042)

Error occurred prerendering page "/sitemap.xml".
Error [PrismaClientInitializationError]:
Invalid `prisma.product.findMany()` invocation:

Error opening a TLS connection: В пакете безопасности отсутствуют учетные данные (os error -2146893042)
clientVersion: '5.22.0'
Export encountered an error on /sitemap.xml/route: /sitemap.xml, exiting the build.
⨯ Next.js build worker exited with code: 1 and signal: null
```

Database access was not retried outside the sandbox following the user's instruction. `.env*` and database configuration were not changed. No migrations, seed/backfill/dedupe scripts, or production-data writes were run.

## 8. Known issues and limitations

- Full production build remains blocked by the existing build-time database dependency. Rerun later against an explicitly approved nonproduction environment.
- No available browser was returned by the browser tools. Runtime screenshots and visual acceptance have not been completed; no claim of pixel-perfect or live commerce verification is made.
- LCP image selection and measured CLS/overflow checks require a running site and browser.
- Customer account control is intentionally unavailable in this batch.

## 9. Screenshots and manual checks still required

Against the approved nonproduction environment:

- Home screenshots at desktop (1440px), tablet (768px), mobile (390px), and narrow mobile (320px).
- Ukrainian default with no cookie; English switch, refresh persistence, cookie synchronization, and server-rendered copy after navigation. Confirm old browser storage cannot restore stale text.
- Three independent hero images, card rotation/stacking, responsive spacing, decorative art, and no missing images. Measure LCP/CLS before prioritizing an image.
- Compact header on catalog, product, cart, and checkout pages; no obsolete fixed spacing.
- Real parent/child category navigation and home search with existing products.
- Open/close cart from the header, quantity badge, and home quick-add for stock, unavailable products, and products with options. Complete no real purchase during this UI review.
- Keyboard navigation, disclosure controls, visible focus, mobile menu Escape behavior, reduced motion, contrast, and no horizontal page overflow.
- Existing admin route/login appearance and authentication, including TOTP, without changing configuration or credentials.

## 10. Git status and stop condition

Final branch: `sites-ui-integration`. Working tree is intended to be clean after the final report commit; the final response includes the checked status.

Reference remained read-only throughout. No push, deployment, merge, migration, or Batch 2 work was performed.
