# Batch 1.7.5 — Stage 1.5 implementation report

## 1. Branch and preservation

Work remains on `feat/batch-1.7.5-product-cart-ux`; the branch was not recreated. HEAD and `origin/redesign-3dkid-v2` remain at `5f59b7c11d0e0e8036de498de92ad55e0cd6656b`.

All 36 Stage 1 files were snapshotted locally before this stage. None was removed or reverted: 30 remain byte-for-byte identical, and six received scoped additions to the product form, media host helper, centralized localization or regression harnesses. The completed Stage 1 cart, quantity, description, slug and checkout behavior passes its regressions. The Stage 1 report remains unchanged.

No reset, stash, commit, push, merge, deployment or branch recreation occurred.

## 2. Files added or extended by Stage 1.5

New files:

- `src/app/api/product-media/upload/route.ts`
- `src/lib/media-upload.ts`
- `src/lib/media-upload-server.ts`
- `src/lib/media-upload-client.ts`
- `scripts/verify-media-upload.tsx`
- `scripts/fixtures/media-upload-browser.tsx`
- `scripts/fixtures/media-upload-environment.tsx`
- `docs/vercel-blob-product-media-setup.md`
- `docs/batch-1.7.5-stage1.5-report.md`

Existing files extended:

- `src/components/admin/product-form.tsx`
- `src/components/admin/media-url-field.tsx`
- `src/lib/product-media.ts`
- `src/lib/i18n.ts`
- `next.config.ts`
- `package.json`
- `package-lock.json`
- `scripts/verify-admin-responsive.ts`
- `scripts/verify-cart-drawer.ts`
- `scripts/verify-product-cart-ux.tsx`
- `scripts/verify-image-hosts.ts`
- `scripts/verify-build-isolated.mjs`

This stage changes/adds 21 files relative to the preserved Stage 1 state. Six overlap the prior 36, leaving 51 changed/new files overall.

## 3. Upload architecture and security

Both product media fields keep their manual URL input and add opt-in file upload controls. The main image supports JPG/PNG/WebP up to 5,000,000 bytes; hover animation supports GIF/animated WebP up to 12,000,000 bytes. Selection displays filename and size before upload. Progress, localized errors, preview, replacement and clearing are supported. Failed uploads keep the previous URL. Product Save alone persists the result, and is guarded during active uploads, including keyboard/form-action submission.

The official `@vercel/blob@2.9.0` browser upload sends file bytes directly to public Blob storage. The function receives only bounded JSON/header metadata. The SDK browser chunk loads only when uploading; unrelated Admin media fields retain manual-only behavior unless explicitly enabled. PostgreSQL continues to store only existing URL fields.

`GET /api/product-media/upload` checks Admin authorization and returns only availability. POST preparation and SDK token issuance use the existing `requireAdmin()` and reject anonymous users, managers and ordinary users. They require same-origin requests and are rate limited per server instance.

The server generates UUID object paths beneath the dedicated product-media prefix. A signed five-minute intent binds path, kind, MIME and size; a browser-supplied arbitrary path cannot obtain a grant. SDK constraints allow only the expected MIME, bounded bytes and the exact generated path, with overwrite disabled and short expiry. No SVG, HTML or script upload formats are allowed. Header checks include JPEG, PNG, GIF, WebP container signatures and the animated WebP flag.

Persistent credentials are referenced only in the server-only helper/SDK server path. They are not returned, logged or passed into browser uploads. JSON bodies are limited to 16 KiB. Provider errors are mapped to centralized UA/EN messages without leaking raw SDK details.

Completion callbacks do not require an Admin cookie or Origin. The SDK verifies their provider signature first; the callback performs no database updates or deletion. Tests also execute the real installed SDK's local HMAC verification with signed and forged fixture callbacks, with no storage request.

New public Blob URLs work through the existing Next image/fallback wrapper and gallery/cards. Next configuration adds only the public Blob host pattern; Cloudinary, Unsplash and Supabase support remains. Storefront gallery/card implementations, lazy hover animation, reduced-motion behavior and accessibility are unchanged from Stage 1. Existing external media is neither migrated nor reuploaded.

## 4. Validation results

All final checks passed with isolated fixtures and mocked external services.

| Check | Result |
| --- | --- |
| `tsx scripts/verify-media-upload.tsx` | PASS — 8 groups: Admin authorization; forbidden roles/origins; signed paths/tampering/expiry; formats/signatures/sizes; callbacks/configuration/rate limiting; client result/progress; actual field handlers; Save boundary; credentials/lifecycle/compatibility |
| `tsx scripts/verify-cart-drawer.ts <Edge path> --media-upload` | PASS — 6 real-browser cases: UA/EN at 320, 390 and 1280px; native keyboard activation, name/size, progress, failure retention, retry, GIF/WebP, preview, explicit URL-only Save and missing configuration/manual clearing |
| `tsx scripts/verify-product-cart-ux.tsx` | PASS — all 17 Stage 1 groups |
| `tsx scripts/verify-cart.ts` | PASS |
| `tsx scripts/verify-checkout-cart.ts` | PASS |
| `tsx scripts/verify-checkout-render.ts` | PASS |
| `tsx scripts/verify-checkout-acceptance.ts` | PASS — existing isolated acceptance/idempotency coverage; no payment implementation changed |
| `tsx scripts/verify-batch17-availability.ts` | PASS |
| `tsx scripts/verify-unified-catalog.ts` | PASS — UA/EN, existing lazy hover/reduced-motion/fallback behavior |
| `tsx scripts/verify-product-media.ts` | PASS — isolated media/image identity and gallery fixtures |
| `tsx scripts/verify-image-hosts.ts` | PASS — public Blob and existing hosts, rejection of private Blob/HTTP/lookalike/unrelated hosts |
| `tsx scripts/verify-cart-drawer.ts` | PASS — existing UA/EN desktop/mobile cart keyboard/lifecycle cases |
| `tsx scripts/verify-responsive.ts` | PASS — 216 storefront viewport renders and existing desktop CSS comparisons |
| `tsx scripts/verify-admin-responsive.ts <Edge path> --batch175` | PASS — 88 Admin viewport renders including the extended create/edit product forms and keyboard/sidebar behavior |

The new tests cover all 17 requested upload regression topics across the source and browser suites. Storage operations are mocked; browser tests use loopback fixtures and block external requests. No live Blob, Production Vercel or Production Neon access is used.

## 5. Build and static checks

- TypeScript: PASS — `tsc --noEmit --incremental false`.
- ESLint: PASS — `npm run lint`, no errors or warnings in the final run.
- Isolated production build: PASS — optimized Next.js 15.5.9 compilation, types/lint, prerender and traces; 16 static generation steps completed, including the new endpoint in the route inventory.
- `git diff --check`: PASS.
- The build runner explicitly blanks Blob credentials and blocks provider fetches/DB effects; no Production configuration is required to compile.

The new SDK dependency chain has no advisories in the final production dependency audit after the scoped CLI-helper Zod patch. Existing application dependencies still report five high and three critical advisory entries; broad dependency upgrades are outside this stage. No existing dependency version was changed.

## 6. Manual Vercel configuration

See [the complete setup and operations guide](./vercel-blob-product-media-setup.md).

An operator must manually create a **Public** Blob store in the existing project's Storage dashboard, deliberately choose connected environments, and enable the server-only `BLOB_READ_WRITE_TOKEN` connection variable. Confirm Node.js 20+ for SDK 2.9.0. Separate nonproduction storage is appropriate for later live checks.

This implementation uses the supported client-token `upload`/`handleUpload` flow, which requires a read-write token. OIDC-only configuration does not enable this flow; the current SDK's separate presigned flow supports OIDC. The guide links the official SDK documentation and explains provider callback reachability. No resource or environment configuration was changed automatically.

## 7. Lifecycle and known limitations

- Unsaved uploads remain orphan objects. No automatic deletion, TTL or media-library behavior was added. Replacing/clearing a URL cannot delete shared files. A future cleanup should inventory only the dedicated prefix, compare against all saved references, report old candidates and require review plus a fresh reference check before explicit deletion.
- Signature checks are lightweight first-header preflight checks, not full decoding, malware scanning or server attestation of directly uploaded bytes. Blob enforces MIME/size/path constraints; no arbitrary remote validation fetch is introduced.
- Rate limiting is bounded per warm instance, not a distributed quota. Shared limiting/platform abuse controls can be added separately if usage requires them.
- Live storage provisioning, real provider callback reachability through deployment protection, and real cloud uploads are intentionally untested here. Missing configuration keeps manual entry usable and never reports a fake upload success.
- Existing application dependency advisories remain documented above. The newly added Blob dependency chain was patched without changing the application's existing versions.

## 8. Migration requirement

None. Prisma schema, Neon data model and product media fields are unchanged. No SQL was run. Files remain in Blob; existing product fields store permanent public URLs only.

## 9. Preserved boundaries

All Stage 1 functionality is retained. Cart, variants, Mono, COD, payment reconciliation, Nova Poshta and Admin authorization implementations were not modified in this stage. No Cloudinary file was moved/reuploaded; no shared asset was deleted. No live payment, message, TTN or storage upload occurred.

Production, Neon, Vercel resources/settings, Cloudflare, `main` and environment secrets were untouched. Only local source, tests, documentation and the necessary SDK dependency/lockfile additions changed.

## 10. Delivery state

All 51 changed/new files remain local, uncommitted, unstaged and unpushed on the same feature branch. No commit, push, merge or deployment occurred. Stage 1.5 is complete; Stage 2 has not begun.
