# BRAND-01B — Storefront logo and favicon consistency

The isolated release branch `release/brand-01b` starts directly at Production `3f2ad0986effca473740c2ba90585e9cd6029060`. It transfers the branding, favicon renderer, relevant tests and release notes from the reviewed `c599eccd3b5c902efdfd80bc2a4f01945170f265` implementation. OPS-02 `2d1c49e10ec9e63cd711d92456c3e2568289dd7b` remains available on its development branch. See [OPS-02A](ops-02a-production-runtime-compatibility.md) for the combined release blockers and reconciliation plan.

## Storefront logo

BRAND-01 put an opaque, landscape brand master in the header and footer and added a footer outline. BRAND-01B copies the original transparent 282 × 314 PNG from `05f0bb0870ee18d109ab92b84b73b327520aca0b` into `/hero/storefront-logo.png`. It restores the historical widths of 50 px for the desktop header, 110 px for the desktop footer and 38 px for both on mobile. The original logo CSS had no image border radius or shadow. The existing versioned email image at `/hero/logo.png?v=brand-01` retains its original file, URL and proportions.

## Favicon rendering

The earlier uploader scaled the full rectangle until its four corners fit inside the mask. The packaged renderer extended the flat background along the short dimension and then masked the corners. That difference reduced the uploaded artwork. At 96 px, the old upload had 722 bright cream pixels compared with 1,448 in the packaged default, using alpha > 240, R > 230, G > 210, B > 150 and G − B < 60 for both samples.

`node scripts/generate-favicons.mjs` now calls the same bounded renderer as the admin upload. The renderer checks the opaque area near and outside the circular boundary for a flat background with minor compression noise. It extends and masks that background at the original artwork scale. If edge details or transparency require protection, it fits all visible pixels inside the circle. It retains the existing JPEG, PNG and WebP validation, dimension limits, aspect ratios and transparent exterior corners. The operator's JPEG has the same SHA-256 as the committed master. It produces the exact packaged 16, 32, 48 and 96 px PNGs and ICO. Identical bytes keep the same ETag. A different favicon still gets a fresh ETag through the existing publication and cache invalidation path.

The existing admin authorization, single active Blob reference, failure handling, public URLs and reset path stay in place. This change needs no database migration or configuration change. Header and footer, email logo, Apple Touch Icon, social cards, structured-data logo, hero art and product images are independent of favicon settings. Existing saved icons retain their bytes until the administrator uploads a replacement or resets to the default.

## Review evidence

The reviewed before/after comparison is under `coverage/brand-01b` in the development worktree. The new candidate's own browser screenshots and 96 px packaged, uploaded and restored favicon response samples are under `coverage/brand-01b/after` in the isolated release worktree. The fixture categories and social links in the screenshots are synthetic.

The isolated review uses a separate local checkout with the Production dependency lock and only the tracked `.env.example` template. An external launcher clears inherited database and provider settings and uses the OPS-02 dotenv guard. It executes the existing candidate regression script with `--commerce-regression --ux07 --seo01 --brand01a`. That script builds the candidate source, starts its optimized Next.js app against disposable loopback PostgreSQL, and uses existing mocked providers and Blob storage. It exercises the localized storefront, SEO, admin authorization, failed uploads, replacement, reset and cache behavior. Standalone checks cover TypeScript, ESLint, favicon assets and rendering, and all 44 localized email templates. Live Blob testing of the corrected renderer and Google Search refresh remain pending after approval and deployment.

The isolated optimized build, full regression and standalone checks passed. The four storefront captures matched the reviewed development screenshots byte for byte. The packaged, uploaded and restored 96 px browser responses shared a checksum, and the focused renderer test matched all four packaged PNG sizes and the ICO. The release preserves the baseline `next build`, `next start` and `prisma generate` commands, dependency lock, Next configuration, Prisma schema and datasource initialization. Hosted verification remains pending deployment approval.
