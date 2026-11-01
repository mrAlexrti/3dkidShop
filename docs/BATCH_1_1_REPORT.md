# Batch 1.1 — visual fidelity, content, and product hover GIF

Implemented locally on `sites-ui-integration`, starting from clean Batch 1 commit `4570996`.
REFERENCE was inspected read-only and was not modified. Nothing was pushed or deployed.
Customer accounts, authentication, favorites, and My Orders were not implemented.

## Outcome and remaining Preview checks

The homepage, content controls, optional product GIF, footer, and two information pages are implemented.
Lint, TypeScript, production build, localization verification, transactional database media checks, and local production HTTP checks passed.

Browser interaction and pixel/layout validation are **manual Preview checks**, not automated passes. The browser access host was unavailable; Windows Computer Use then stopped because it could not verify Chrome's current URL safely. No browser inputs were issued afterward. No test dependency was added; `package.json` and `package-lock.json` remain unchanged.

## Local commits

| Commit | Change |
| --- | --- |
| `3976be2` | Optional product hover GIF, admin control, real query mappings, main-image consistency, rollback verification |
| `799fd09` | Compact home controls, approved slogan, Comfortaa 700 |
| `b875cfe` | Localized hero text, three media slots, SiteContent validation and social settings |
| `87ea518` | One Catalog block, category strip without All, three benefits |
| `bc29859` | Dynamic footer, social icons, About and Delivery & payment pages |
| Final test/docs commit | This report, local HTTP verification, invalid GIF URL fallback, immediate admin URL validation, final reference styling adjustments |

Run `git log --oneline 4570996..HEAD` for the complete commit list, including the report commit itself.

## Files changed and added

New files:

- `public/fonts/comfortaa-bold-700.ttf`
- `public/fonts/Comfortaa-OFL.txt`
- `scripts/verify-product-media.ts`
- `scripts/verify-batch11-http.ts`
- `src/app/(shop)/about/page.tsx`
- `src/app/(shop)/delivery-payment/page.tsx`
- `src/components/admin/media-url-field.tsx`
- `src/components/home/hero-image.tsx`
- `src/components/layout/social-icon.tsx`
- `src/lib/product-media.ts`
- `src/lib/site-content.ts`
- `docs/BATCH_1_1_REPORT.md`

Updated files:

- `prisma/schema.prisma`
- `scripts/verify-storefront.ts`
- `src/app/(shop)/catalog/page.tsx`
- `src/app/(shop)/layout.tsx`
- `src/app/(shop)/page.tsx`
- `src/app/(shop)/product/[slug]/page.tsx`
- `src/app/(shop)/storefront.css`
- `src/app/admin/content/page.tsx`
- `src/app/admin/products/[id]/edit/page.tsx`
- `src/app/admin/products/page.tsx`
- `src/components/admin/product-form.tsx`
- `src/components/catalog/product-grid.tsx`
- `src/components/home/benefits.tsx`
- `src/components/home/featured-products.tsx`
- `src/components/home/hero.tsx`
- `src/components/layout/category-nav.tsx`
- `src/components/layout/footer.tsx`
- `src/components/layout/header.tsx`
- `src/components/product/product-card.tsx`
- `src/components/product/related-products.tsx`
- `src/lib/actions/categories.ts` — SiteContent persistence only; category operations unchanged
- `src/lib/actions/products.ts`
- `src/lib/fonts.ts`
- `src/lib/hero-assets.ts`
- `src/lib/i18n.ts`
- `src/lib/site-settings.ts`

## Prisma convention, additive change, and data

The repository has **no Prisma migration directory/history**. Its existing convention is `prisma db push`, documented in `package.json`, README, and the schema header. No incompatible migration history was introduced.

- Schema: nullable `Product.hoverGifUrl String?`, without an index.
- Migration name/status: **not applicable — db-push workflow**. Additive change applied successfully to the configured development database.
- Pre-edit database/schema comparison: empty, no drift.
- Reviewed pending SQL contained only:

```sql
ALTER TABLE "Product" ADD COLUMN "hoverGifUrl" TEXT;
```

- Ran `prisma format`, `prisma generate`, and `prisma db push --skip-generate`.
- Post-change database/schema comparison: empty, fully in sync.
- No reset, seed, dedupe, backfill, drop, truncate, or destructive schema operation ran.
- Existing state preserved: **10 products, 10 ProductImage rows, 1 order, 7 categories**; all 10 existing GIF fields are null.
- Product ID set SHA-256 before and after: `5160de046a68ef7d8d1bd609d88a1471c86f0a1b582ad30f044b6b79f887982a`.
- No existing product, order, category, relationship, or SiteContent values were persistently changed. Media verification used a temporary product inside a transaction that deliberately rolled back; before/after inventory matched.

## Product GIF and image behavior

All real mappings (home, catalog ProductGrid, and related products) supply `hoverGifUrl` to the shared ProductCard. No demo products were imported.

Source review confirms:

- Static optimized product image remains mounted and remains the semantic image.
- The GIF element does not exist before pointer interaction or keyboard focus, so it has no initial-load image request.
- Mouse hover and keyboard `:focus-visible` can mount an unoptimized Next Image overlay; pointer leave/blur removes it. Browser cache can reuse the URL.
- Coarse/touch pointers and `prefers-reduced-motion: reduce` keep the static image. Preference changes are subscribed to while mounted.
- Empty, malformed, non-HTTP(S), credential-bearing, and failed image URLs fall back to static. A loading GIF is transparent until loaded.
- The overlay is absolutely positioned, has `pointer-events: none`, empty alt, and `aria-hidden`, preserving card dimensions and avoiding duplicate screen-reader content.
- Badges and cart controls render above the overlay. Quick-add stock/options/cart identity logic is unchanged; its keyboard/touch visibility is improved.

Product create/edit admin now has localized **GIF при наведенні / Hover GIF**, helper text, URL validation, preview, and Remove. Empty input saves null. GIF preview is suppressed for reduced motion; ordinary hero previews remain visible.

The main-image edit bug was confirmed and fixed. Product updates and main-image changes are atomic. The existing first image (ordered by `order`, then ID) is updated in place; a missing main image is created once. Unchanged image URLs and all gallery records remain intact. The admin listing, edit form, and storefront use the same image ordering.

**Direct-file GIF upload: URL-only because persistent storage is not configured.** No ephemeral uploads, binary/base64 database content, or external storage provider was introduced. A persistent object-storage provider is a separate follow-up. Main static images retain the existing Next image-domain configuration.

## Homepage and typography

- Home has compact UA/EN, disabled account, and cart/count controls; no large white navigation bar or top logo/navigation block.
- No extra logo above H1. The exact approved UA/EN slogan is the default H1, with natural wrapping and no forced accent split.
- No default subtitle. An independently configured localized subtitle may render.
- Three pastel rotated hero cards, white borders, and gold doodles retained. Failed custom hero URLs return to the corresponding bundled image.
- Category strip sits directly below the cards, uses real ordered root categories/slugs, has no All item, and can scroll horizontally at small widths without shortening category names.
- One Catalog preview uses up to 12 active database products in the catalog's newest-first ordering; the current database supplies 10. The separate New Arrivals block is removed.
- Exactly three approved benefits, with natural EN translations and no invented return-policy text.
- Public grid spacing, product-panel proportions, white borders, and card image aspect ratio follow the inspected reference.
- Added Comfortaa-only theme to the existing font registry. Public layout sets both body/display variables to Comfortaa; scoped rules enforce 700 throughout the storefront, including controls and cart. Public toast typography is scoped too.
- Self-hosted reference Comfortaa 700 TTF and OFL license copied into TARGET. Font SHA-256 matches REFERENCE: `990742fd8ec75da91f4eabcce954f36316de713e1ff0140eeefda0db1c44f91f`.
- Only weight 700 is loaded by the public local font face. Existing root/admin font selection remains functional and is accurately labeled as Admin font in Site Content.

## SiteContent contract

| Keys | Meaning |
| --- | --- |
| `hero_title_ua`, `hero_title_en` | Independent localized H1 overrides; blank uses that language's central default |
| `hero_subtitle_ua`, `hero_subtitle_en` | Independent optional subtitles; blank hides subtitle |
| `hero_image_1`, `hero_image_2`, `hero_image_3` | Optional HTTP(S) image URLs, with admin previews and bundled fallbacks |
| `social_instagram`, `social_telegram`, `social_tiktok`, `social_youtube` | Actual social profile URLs; blank keeps a non-clickable icon |
| Existing `site_font` | Existing admin/root font selection; storefront always uses Comfortaa 700 |

Hero image fallbacks are `/hero/dragon-v1.webp`, `/hero/bunny-v1.webp`, and `/hero/robot-v1.webp`.
Legacy unlocalized `hero_title`/`hero_subtitle` rows are left intact but no longer exposed as misleading controls or used as cross-language fallbacks. No SiteContent rows need seeding: defaults work before first save. Saves validate and upsert only supported keys.

## Footer, routes, and localization

Footer uses a generous rounded pink container with white headings/copy/icons. Background `#b94679` gives approximately 5:1 white-text contrast. Desktop sections are brand, dynamic root categories, customers, and social profiles; tablet/mobile stack responsively.

- Categories come from the same `getCategoryTree()` ordered database rows, so newly added root categories appear automatically.
- Customer entries: disabled future Account, `/about`, `/delivery-payment`. No checkout-as-delivery link, broken account navigation, Returns, corporate orders, or fake `#` link.
- Instagram/YouTube reuse Lucide; Telegram/TikTok use lightweight SVG. No icon dependency was added. Missing social URLs render dashed, non-clickable icons with localized accessible labels.
- `/about`: exact supplied UA text, natural EN translation, localized metadata.
- `/delivery-payment`: only actual Nova Poshta branch/locker/courier choices, Nova Poshta rates, and the existing payment-upon-receipt flows. The LiqPay paragraph renders only when LiqPay is configured. No other providers, free/fixed delivery, international promises, returns, or delivery guarantees.
- New text remains in the central `i18n.ts` dictionary. Exactly UA default and EN. Hero media/admin labels, helper/error text, benefits, footer/social labels, and information pages are localized. The touched product not-found metadata now uses the central localized string.

## Category data left unchanged

Automatic restructuring was unsafe because the current catalog contains tote bags, courses, buttons, and Crocs accessories whose placement in the requested five categories is not defined. No relationships were guessed or deleted.

| Current slug | Current parent | Product count |
| --- | --- | ---: |
| `toys-3d` | Root, order 10 | 3 |
| `other-3d` | Root, order 20 | 0 directly |
| `shoppers` | Root, order 30 | 2 |
| `courses-3d-modeling` | Root, order 40 | 2 |
| `buttons` | `other-3d`, order 10 | 1 |
| `jibbitz-crocs` | `other-3d`, order 20 | 1 |
| `headphone-accessories` | `other-3d`, order 30 | 1 |

Until the manual merchandising checklist is completed, the home strip/footer truthfully show the existing four root categories, rather than a fabricated five-category list.

## Validation results

| Check | Result |
| --- | --- |
| `npm run lint` | Passed |
| `npx tsc --noEmit --incremental false` | Passed |
| `npm run build` | Passed, including sitemap prerendering |
| `git diff --check` | Passed |
| `npx tsx scripts/verify-storefront.ts` | Passed: UA/EN parity, cookie-led state, stale-store handling, localized hero isolation/fallbacks, URL validation |
| `npx tsx scripts/verify-product-media.ts` | Passed: null/add/change/clear persistence, stable main image ID, unchanged gallery, no duplicates, rollback and preserved inventory |
| `npx tsx scripts/verify-batch11-http.ts` | Passed against local production server: both locales, exact home structure, real products/categories, About/Delivery copy and metadata, catalog/product/cart, admin guard, authenticated admin create/edit/content fields and hero previews, font asset |
| Post-change Prisma schema comparison | Empty: database in sync |
| Commerce/integration diff review | No changes to checkout/order transactions, prices/stock behavior, cart identity/options, LiqPay, Nova Poshta/TTN, notifications, auth/TOTP |
| Package manifests | Unchanged; no new test or runtime dependency |

The initial sandboxed build compiled, then failed only because the sitemap's DB TLS connection was blocked. The production build passed outside the sandbox with normal development DB access. No reset was proposed or executed.

A final HTTP rerun briefly failed because the development database was unreachable. The single retry passed the complete UA/EN/admin suite against the final production build, without a code change.

HTTP checks authenticate only with the repository's already-enabled development test login and perform read-only requests. They do not submit products, content, orders, or payments, and do not modify auth settings. Database persistence checks test schema/media operations, not actual browser form submission.

## Manual admin and Preview checklist

1. Product create/edit: enter a direct hosted GIF URL, confirm preview, save, reopen, change URL, remove/clear, save, and verify static behavior. Also test invalid URL validation and broken URL fallback.
2. Main image: change a URL accepted by the existing Next image configuration; save/reopen and check home/catalog/detail. Save again without changes and confirm no extra image rows or gallery changes.
3. Site Content: set separate UA and EN titles/subtitles; leave EN blank once to confirm its own default. Clear subtitles. Replace each hero URL, test a broken image, then clear it to check bundled fallback.
4. Add only real social profile URLs; confirm active icons open the intended page. Keep unspecified networks blank and non-clickable.
5. Review the current ten products before changing taxonomy. Reuse `toys-3d` as Іграшки / Toys (order 10); create real root Брелоки / Keychains, Клікери / Clickers, Фіджети / Fidgets (orders 20/30/40); promote the existing `headphone-accessories` row to root and set EN to Earphone Accessories (order 50). Preserve its existing product and slug.
6. Decide the proper categories for tote bags, courses, buttons, and Crocs accessories before moving/removing their current root branches. Preserve every product relationship and category until this mapping is decided. This decision is necessary to reach exactly five roots safely.
7. Preview the following widths in both locales: **320, 360, 390, 430, 768, 1024, 1440 px**. All seven require manual visual validation: no horizontal page scrollbar; readable wrapping; reachable compact controls; usable cards/doodles; scrollable, uncut category names; stable product media/badges/cart; three benefits on desktop; readable white footer and sensible stacking.
8. With one real GIF configured, inspect Network: no GIF request on initial load, then load on mouse hover or keyboard focus. Confirm static return on leave/blur, reduced-motion static behavior (including preference changes), broken GIF fallback, touch navigation, and no layout shift. Repeat on home, catalog, and related cards.
9. Confirm Add to Cart for a simple in-stock product, stock guard, and option-bearing product navigation. Do not submit a paid order merely for this UI validation.

These interaction/layout checks remain unverified until manual Preview review. URL availability/content and download weight are administrator-managed; the server validates URLs without fetching arbitrary media. Direct uploads require persistent object storage in a separate follow-up.

## Final Git scope

All changes are local to TARGET on `sites-ui-integration`. REFERENCE is untouched, and no secrets or environment files were staged. The handoff working tree is clean after the final test/docs commit. No push, deployment, or later customer batch was started.
