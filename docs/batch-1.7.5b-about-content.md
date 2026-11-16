# Batch 1.7.5B — Stage 1.5: editable About Us

Implemented on the existing `feat/batch-1.7.5b-gallery-admin-ux` branch at
`e7f0750ebd08efb68603d0a67bb1f5e3d0cd74ab`. All 38 uncommitted Stage 1 files
were preserved. A local ignored SHA-256 manifest verified that 30 remained
byte-for-byte unchanged; the other eight were extended for this workstream.
No branch recreation, reset, stash, commit, push, merge or deployment occurred.

## Behavior

Admin → Site Content now includes **Про нас / About Us**, with independent UA
and EN slogan, multiline body, SEO page title and SEO meta description fields.
The initial values come from the current database overrides or the exact
existing localized copy in `src/lib/i18n.ts`. No brand copy was replaced.

The eight keys are:

- `about_slogan_ua`, `about_slogan_en`
- `about_body_ua`, `about_body_en`
- `about_meta_title_ua`, `about_meta_title_en`
- `about_meta_description_ua`, `about_meta_description_en`

They reuse the existing `SiteContent` table and centralized allowlist/schema.
All editor fields are required and reject whitespace-only values. Limits are
500 characters for slogans, 20,000 for bodies, 160 for SEO titles and 320 for SEO
descriptions, declared in both the HTML controls and server validation.
Omitted keys remain untouched for compatibility with partial/older content
submissions. A partial override falls back independently for each missing field
and language. An absent or legacy blank database value also uses the existing
localized fallback; new empty submissions are rejected.

Body text is stored without trimming its authored line breaks/blank lines.
The storefront uses paragraph elements for blank-line-separated text and
`white-space: pre-wrap` for line breaks inside paragraphs, normalizing CRLF/CR
for display. Rendering is ordinary escaped React text, with no raw HTML or rich
text interpretation. The original About article, slogan styling and paragraph
spacing remain in use.

`/about` reads only these eight public keys and resolves them using the existing
locale cookie (Ukrainian by default). Page content and generated title,
description and Open Graph metadata use the same request-scoped React cache.
There is no cross-request or cross-locale content cache. The page is explicitly
dynamic. A successful content Save revalidates `/about`, `/admin/content` and the
existing root layout, so later visits/refreshes show changes without a Vercel
deployment. Pages already open are not updated through polling or push events.

## Form reliability and data safety

The fields are inside the existing Stage 1 `AdminForm`. It retains inputs on
client validation, structured server validation, authentication/transport and
database errors; focuses the first invalid control; preserves help/error
associations; and prevents double submissions. Required markers and localized
length/error messages are supplied through centralized UA/EN translations.

The existing three hero upload controls, URLs, progress and Save guards remain
intact. Saving About content does not clear other values. The server action
upserts only submitted allowlisted keys in one transaction. Invalid/failed Saves
write nothing and do not invalidate caches or register cleanup work. The Admin
page passes only the eight public About values to the client editor, rather
than serializing private SiteContent/retirement-ledger rows.

Media-write locking, retired-media attachment checks, shared-reference scanning,
durable retirement and 30-day retention are unchanged. If a managed media URL is
embedded as plain text in saved About content, it is protected by the existing
SiteContent reference scan. Cleanup remains disabled by default. No environment
setting or cleanup scope approval was read from Vercel, created or modified.

## Verification

All tests use isolated data and mocked dependencies; no Production SQL, Prisma
connection, live upload/deletion, payment or notification operation was performed.

| Check | Result |
| --- | --- |
| `verify-about-content.tsx` | PASS: 10 focused groups covering unchanged baseline copy, UA/EN defaults and overrides, multiline escaping, SEO/Open Graph, lengths/required values, partial writes, rollback/auth failures, revalidation/fresh reads, real Admin field wiring, public-only client props, hero uploads and locale switching |
| `verify-cart-drawer.ts [Edge] --gallery-admin` | PASS: 6 real React/DOM runs at 320/390/1280 px × UA/EN; existing gallery/upload/archive checks plus About draft/SEO/hero preservation, server/network errors, first-invalid focus, language switching and double-submit guard |
| `verify-responsive.ts [Edge] --about` | PASS: 48 renders, default and long custom About text in UA/EN across 12 desktop/mobile/landscape viewports; no overflow; desktop CSS screenshots unchanged |
| `verify-admin-responsive.ts [Edge] --batch175b` | PASS: 154 Admin renders including the expanded content form and Stage 1 gallery/forms; keyboard drawer checks passed |
| `verify-media-lifecycle.ts` | PASS: all 28 Stage 1 retention, shared-reference, concurrency, retry, gallery and deletion/archive groups |
| `verify-media-upload.tsx` | PASS: all 8 secure upload groups |
| `verify-product-cart-ux.tsx` | PASS: all 18 cart/reconciliation, pricing, slug, description and fallback groups |
| TypeScript | PASS: `tsc --noEmit --incremental false` |
| ESLint | PASS: `npm run lint`, no warnings |
| Isolated production build | PASS: `node scripts/verify-build-isolated.mjs`, with fixture-only Prisma reads and blocked live effects |
| `git diff --check` | PASS |

The 320 px Ukrainian About page and desktop English Admin content screenshots
were visually inspected. QA artifacts remain under ignored `.next/cache`.
Stage 1 checkout validation evidence remains applicable; checkout/payment code
was not changed or broadly retested for this content-only addition.

## Changed files and combined total

Stage 1.5 touches **13 files**, including documentation. Eight extend existing
Stage 1 changes:

- `src/app/admin/content/page.tsx`
- `src/lib/actions/categories.ts`
- `src/lib/admin-form-validation.ts`
- `src/lib/i18n.ts`
- `scripts/verify-admin-responsive.ts`
- `scripts/verify-responsive.ts`
- `scripts/fixtures/gallery-admin-browser.tsx`
- `scripts/fixtures/gallery-admin-environment.tsx`

Five add entries to the combined working-tree change list:

- `src/app/(shop)/about/page.tsx` — existing page updated
- `src/lib/site-content.ts` — existing schema/resolver module extended
- `src/components/admin/about-content-fields.tsx` — new editor fields
- `scripts/verify-about-content.tsx` — new isolated regression suite
- `docs/batch-1.7.5b-about-content.md` — this report

The combined Stage 1 + Stage 1.5 total is **43 modified/untracked files**, all
unstaged, uncommitted and unpushed. The original 38-file list and Stage 1 report
remain in [batch-1.7.5b-gallery-admin-ux.md](batch-1.7.5b-gallery-admin-ux.md).

## Limits and boundaries

- No Prisma migration, dependency/lockfile change or new environment variable is
  required. No live database or Vercel environment was inspected or changed.
- Draft preservation lasts while the form remains mounted. Deliberate reload,
  navigation or closing the tab can still discard unsaved edits.
- An already-open About page needs refresh/navigation after a later Admin Save.
  No realtime update mechanism was introduced.
- Native-device/screen-reader and live nonproduction integration checks remain
  manual; automated browser/fixture checks do not establish live storage/database
  connectivity or Production/Preview isolation.
- Production, `main`, Neon, Vercel settings and Cloudflare remain untouched.
  Automatic Blob cleanup was not activated. Stage 2 was not started.
