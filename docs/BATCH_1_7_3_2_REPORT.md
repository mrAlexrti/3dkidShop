# Batch 1.7.3.2 - Mono hosted domain and Cloudinary allowlists

Branch: `batch-1-7-3-2-mono-hosted-domain-fix`.
Base: Production `redesign-3dkid-v2`, commit
`550b4449c9f5632bf59cb0fde919bfe26fdf92c9`.
Local preparation only; leave uncommitted and unpushed.

## Runtime changes

Production diagnostics identified a valid Mono invoice response rejected because
its hosted URL used `pay.monobank.ua`. The fixed Mono hostname allowlist is now
exactly `pay.mbnk.biz` and `pay.monobank.ua`. No wildcard, suffix match or
environment-controlled payment hostname is used.

The same predicate drives URL acceptance and the existing safe diagnostic field
`pageUrlHostnameMatchesExpected`. All other validation predicates and `validInvoiceId`
are unchanged: HTTPS, no custom parsed port or credentials, exact invoice path,
and empty parsed query/hash. Existing URL normalization behavior is unchanged.
Diagnostics retain their fixed metadata projection and privacy/redaction tests;
identifiers, full URLs, paths, query values, response bodies, credentials, headers
and customer information are not logged.

`next.config.ts` adds exactly one HTTPS image pattern for `res.cloudinary.com`.
Existing HTTPS `images.unsplash.com` and `**.supabase.co` patterns remain unchanged.
The representative Cloudinary URL supplied in the task is accepted by the actual
installed Next.js image matcher, evaluated locally without fetching the image.
All other image configuration is unchanged. No storage, upload or stored URL changes.

No changes to Mono request payload/headers, provisional-order initialization,
failure/recovery semantics, payment transitions, reconciliation, notifications,
numbering, result pages or webhooks. No schema or availability changes.

## Verification

| Check | Result |
| --- | --- |
| verify-mono-response-diagnostics.ts | PASS: both exact hosts accepted without failure logs; 40 invalid shape/lookalike/URL cases; privacy assertions and prior-validator parity outside the intentional hostname addition |
| verify-image-hosts.ts | PASS: actual Next matcher accepts representative Cloudinary, Unsplash and Supabase URLs; rejects HTTP Cloudinary, lookalikes and arbitrary hosts; whole config equals approved base plus one exact pattern |
| verify-mono-initialization.ts | PASS: Batch 1.7.3 successful/definite/uncertain initialization, notification timing, recovery and sequential-number/concurrency regressions |
| verify-batch17-payments.ts | PASS: Mono invoice/signature/identity/amount/order/reconciliation and compatibility regressions |
| verify-batch14-payments.ts | PASS: legacy payment compatibility regressions |
| TypeScript --noEmit --incremental false | PASS |
| ESLint | PASS, clean |
| Isolated production build | PASS: compilation, lint/types, 15 prerenders; DB connections/writes and provider fetches blocked |
| git diff --check | PASS |

Provider HTTP in tests is mocked. The isolated build uses empty Prisma read
fixtures and blocks DB connections/writes and provider fetches. QA artifacts stay
in ignored local cache directories. No live Mono request, invoice, payment, order,
DB/SQL/migration, environment-file/configuration change, email/Telegram send, TTN,
upload or webhook registration occurred. No live checkout test was performed.
Production and main branch refs are unchanged. No commit or push.

## Exact changed-file manifest

- docs/BATCH_1_7_3_2_REPORT.md (new)
- next.config.ts
- scripts/verify-image-hosts.ts (new)
- scripts/verify-mono-response-diagnostics.ts
- src/lib/payments/mono.ts

Five files.
