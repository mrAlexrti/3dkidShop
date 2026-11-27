# BRAND-01 — Global Brand Identity Consistency

The work starts at Production `05f0bb0870ee18d109ab92b84b73b327520aca0b` on `redesign-3dkid-v2`. The exact approved `Logo_Actual.jpg` is archived at `assets/brand/Logo_Actual.jpg` (409 × 369 px, SHA-256 `7168b7e5b6a50f213481a145b4462da4b1564a6943053fb099ad58cf0a937785`). Run `node scripts/generate-favicons.mjs` at the repository root to rebuild its public derivatives.

## Audit and changes

The favicon and SEO art in Production formed a coherent pink family derived from a different design. Its cream lettering, dark linework, pink field and sparkle positions differ from the approved JPG. All four embedded ICO frames were byte-identical to the corresponding live PNGs. Browser tabs and Google can show different stages of cached artwork, but the live asset mismatch was independently confirmed. The screenshot alone cannot identify which URL Google fetched or the date it processed the displayed icon.

The shared HTML email renderer, storefront header and footer all pointed to the same older transparent PNG with cream lettering and no pink field. Email client caching can persist an image after it is updated, but the old pixels were also present on the live URL. New emails use `https://www.3dkid.shop/hero/logo.png?v=brand-01`, a fixed HTTPS cache key shared across all templates. This public URL carries no recipient, order or token data. The artwork stays at 70 CSS px high and its display width is now 78 px to respect the source aspect ratio. The fallback text, HTML layout and email routing remain intact. The preview harness substitutes a local data URI only for visual verification.

| Asset or reference | Before | BRAND-01 |
| --- | --- | --- |
| `/favicon-16.png`, `/favicon-32.png`, `/favicon-48.png`, `/favicon-96.png` | Earlier pink artwork in every size | Circular derivatives of the approved master at the same stable URLs. Transparent corners and square canvases. |
| `/favicon.ico` | Four earlier frames | Four exact PNG frames at 16, 32, 48 and 96 px. |
| `/apple-touch-icon.png` | Earlier 180 px artwork | Updated 180 × 180 artwork at the existing URL. |
| Next.js root icon metadata | Five icon links and one Apple Touch link, from the root layout | Same nonconflicting declarations, with the 96 px qualifying PNG first. No file-based icons or web manifest add a competing set. |
| `/seo/brand-mark.png` | Earlier circled design | Updated 256 × 256 mark for OnlineStore JSON-LD. |
| `/seo/store-share.jpg` | Brand card with earlier circled design | Same 1200 × 630 card with the approved mark. Used for default Open Graph and Twitter metadata. Site Content overrides and product photography retain precedence. |
| Site Content SEO editor | Favicon and default social card previews from those public URLs | Previews inherit the updated files. No new configuration fields. |
| `/hero/logo.png` | Transparent 282 × 314 artwork | Full 409 × 369 master converted to PNG. Used by the storefront footer on the homepage and by the header and footer on catalog, authentication and account pages. The mobile footer gives the artwork 64 CSS px and a thin cream edge makes the pink field visible against the footer. |
| Transactional HTML emails | Unversioned transparent PNG | Versioned URL of the full artwork across seven account and fifteen commerce events in Ukrainian and English. |
| Textual brand | Most storefront, translation and email copy already used `3D kid`. Admin accessibility labels and Mono/LiqPay payment descriptions used `3D Kid`. | Those live labels now use `3D kid`. Existing merchant identifiers and payment behavior are separate from the display text. |
| Other active imagery | Customer account illustrations, Google sign-in mark, operator hero and product imagery | Preserve their existing independent roles. |

The rectangular logo retains the complete source field. For the circular assets, the generator extends the edge pink vertically on a square canvas and masks the corners without rescaling the source axes or clipping its sparkles. Only normal resizing and PNG/JPEG encoding are applied.

## Search thumbnail investigation

Read-only HTTPS requests returned 200 for all baseline public assets with matching Git bytes, and the homepage declared the canonical HTTPS www origin. The apex redirected there with 308. The crawler had access to all favicon sizes and both SEO images. The live homepage rendered three configured Blob images that decoded successfully and were visually distinct from the bundled mint-green dragon and robot. Its Open Graph and Twitter metadata referenced the brand card, not either fallback. The older illustrations still returned 200 with no indexing directive in both their original and Next Image URLs. They can appear on the homepage when its configured image is missing or fails, and the robot is also an account illustration fallback.

This release serves `X-Robots-Tag: noindex` on the two bundled dragon and robot URLs and their relative Next Image optimizer variants. They remain available to the site and to crawlers that need to see the header. The rule leaves the live configured hero URLs, product photography, the bunny fallback and SEO media crawlable. This addresses discoverability of the older bundled art. The exact source of Google's displayed thumbnail remains unconfirmed.

The 96 × 96 favicon meets Google's recommendation for an image larger than 48 × 48 px. The declared icon paths are stable, accessible through the canonical HTTPS host and permitted by robots.txt. Google decides which search image it shows and when to refresh it. [Google favicon guidelines](https://developers.google.com/search/docs/appearance/favicon-in-search) · [Google image indexing controls](https://developers.google.com/search/docs/crawling-indexing/prevent-images-on-your-page) · [Google preferred-image guidance](https://developers.google.com/search/docs/appearance/google-images)

## Validation

| Check | Result |
| --- | --- |
| TypeScript, ESLint, optimized Next.js build | Passed. |
| Asset verification | Passed master SHA and pixel comparisons, favicon and Apple dimension and transparency checks, and decode of four ICO frames with byte parity to the PNG variants. |
| SEO logic and optimized-server HTTP | Passed localized rendered metadata, canonical URLs, JSON-LD, robots, sitemap, redirects and visibility, asset response types and bytes, and original/optimized legacy image indexing headers. The 96 px favicon stays crawlable. |
| Dedicated Chrome favicon check | Passed eight UA/EN, desktop/mobile and light/dark combinations with head declarations, browser decode and keyboard navigation. |
| Desktop and mobile account/storefront regression | Passed against isolated PostgreSQL and mocked providers. Covered UA/EN SEO field persistence, header/footer branding, UX-07, authentication, cart merge and isolation, error-value retention, checkout and Mono attempt reconciliation. There were zero hydration errors or warnings. |
| Localized email regression | Passed 44 HTML/plain-text templates, 132 offline browser layout checks, six blocked-logo cases and 12 detailed previews. |

## Review artifacts and deployment checks

Open `coverage/brand-01/index.html` or `coverage/brand-01/comparison-sheet.png` locally for the approved master, previous and corrected artwork, native sizes and decoded ICO frames, simulated browser tab, SEO admin, email header and desktop/mobile storefront captures. The browser tab and search-result previews are simulations. The complete localized email previews are under `coverage/ux-08/emails`. The sanitized read-only HTTP evidence is `coverage/brand-01/production-baseline.json`. These generated review artifacts are local.

No schema change, migration, Site Content write, environment variable change, or provider setup is required. After approval and deployment, check the brand URLs over HTTPS, including the versioned email image, and confirm that the direct and optimized dragon/robot responses carry the intended header on Vercel. Verify an authorized real email in Gmail and Outlook, including with images blocked. After the live checks, use Search Console to inspect the homepage and monitor the favicon and thumbnail independently. Real email client proxy refresh and Google recrawl remain pending.
