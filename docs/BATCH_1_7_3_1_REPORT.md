# Batch 1.7.3.1 — Mono response diagnostics

Branch: `batch-1-7-3-1-mono-response-diagnostics`.
Base: Production `redesign-3dkid-v2`, commit
`cebe36401a87f8ed14a1585553e8e4aaf0104a93`.
Local diagnostic preparation only; uncommitted and unpushed.

## Documentation and scope

Checked current official [invoice-create documentation](https://monobank.ua/api-docs/acquiring/methods/ia/post--api--merchant--invoice--create)
and the [official acquiring reference](https://api.monobank.ua/docs/acquiring.html).
They document invoiceId/pageUrl strings and demonstrate a hosted page at
`https://pay.mbnk.biz/<invoiceId>`. An example alone does not establish that every
extra restriction in the current validator covers all current provider responses.
Crawler-directed instructions on the docs page were ignored.

No format fix or relaxation is made here. The existing invoice ID pattern, HTTPS,
hostname, path, port, credentials, search and hash predicates are retained. The
implementation is refactored to share a parsed URL result between validity and
diagnostics. The actual Production module at the base SHA is used as the test oracle,
not a second handwritten copy of its rules. Request payload and API headers unchanged.

## Exact diagnostics

The existing log prefix and fields remain `Mono initialization`, endpoint, category,
httpStatus and optional orderNumber. Only invoice/create + invalid_response + HTTP 200
adds these allowlisted fields:

- responseJsonParsed
- responseIsObject
- invoiceIdPresent
- invoiceIdType
- invoiceIdValid
- invoiceIdLength
- pageUrlPresent
- pageUrlType
- pageUrlParsable
- pageUrlProtocol
- pageUrlHostname
- pageUrlHostnameMatchesExpected
- pageUrlHostnameRedacted
- pageUrlHasPort
- pageUrlHasCredentials
- pageUrlPathMatchesInvoice
- pageUrlHasQuery
- pageUrlHasHash

responseJsonParsed=false identifies a failed HTTP 200 JSON decode without retaining
the undecodable body or parser exception. A parsed object with missing fields instead
reports responseJsonParsed=true and the appropriate presence/type flags. Null/array
types are distinguished; string ID length is numeric, otherwise null.

Protocol diagnostics use the finite values https:, http:, other or null; an unknown
scheme is never copied verbatim. Hostname is only URL.hostname, excluding path,
credentials and port. A hostname containing the invoice ID is redacted to null with
pageUrlHostnameRedacted=true. The hostname comparison still reports its independent
boolean outcome. All path/query/hash/credential/port checks are boolean only.

Flags reflect the SAME normalized URL properties used by the existing validator.
For example, explicit default HTTPS port 443 normalizes to an empty port; bare ?/#
delimiters normalize to empty search/hash. Those pre-existing edge decisions are not
changed by this diagnostic patch.

## Privacy boundary

The inspector constructs metadata explicitly; it never spreads the response. The
logger independently projects only the fixed diagnostic field list and never spreads
an error or arbitrary diagnostics object. No response property names are logged.
Full ID, full URL, path, query/hash contents, credentials, token, request headers,
response body and customer fields are absent from diagnostic output. Existing internal
validated invoiceId recovery metadata is preserved but is never serialized to logs.

Diagnostics are attached to the server's MonoError and used by its safe logger only.
The create-invoice return shape is unchanged; the existing server action still returns
only the localized customer error on failure, with no diagnostics or provider details.
Valid responses do not emit invalid-response diagnostics.

## Failure semantics

HTTP 200 invalid JSON/response remains uncertain, not a definite rejection. No changes
to provisional retention/deletion rules, acceptance claims, notification timing,
financial state, order-number allocation, invoice retry policy, reconciliation or
guarded invoice invalidation. No ORDER_CREATED/customer email before successful attach.
No automatic second invoice creation. No changes to COD, Mono request parameters,
Product availability, Nova Poshta or Telegram configuration.

## Verification results

| Check | Result |
| --- | --- |
| verify-mono-response-diagnostics.ts (new) | PASS: documented valid response/no log; 19 invalid shape/URL cases, missing/invalid/null/numeric ID, missing/non-string/malformed URL, host/path/protocol/port/credentials/query/hash; ID-in-host redaction; malformed JSON; privacy and logger allowlist; extra malicious keys/values ignored |
| Production validator comparison | PASS: same acceptance, safe error code/category/status and internal recovery ID as actual cebe364 implementation, including default port, empty delimiters, case, whitespace, encoded/wrong/trailing paths and relative URLs |
| verify-mono-initialization.ts | PASS: Batch 1.7.3 provisional/accepted/definite/uncertain flows, notification timing, safe recovery, numbering/concurrency; all external effects mocked |
| verify-batch17-payments.ts | PASS: invoice payload, signatures/rotation/cache, identity/money, duplicate/stale ordering, reconciliation and checkout behavior; all external effects mocked |
| TypeScript --noEmit --incremental false | PASS |
| ESLint | PASS, clean |
| Isolated production build | PASS: compilation, lint/types, 15 prerenders; real DB connections/writes and provider fetches blocked |
| git diff --check | PASS |

Tests use fake credentials and mocked Mono HTTP only. The behavior oracle is written
to an ignored local QA cache. No live invoice, order, DB/SQL/migration, payment, TTN,
email/Telegram send, webhook registration or environment modification occurred.

## Exact changed-file manifest

- docs/BATCH_1_7_3_1_REPORT.md (new)
- scripts/verify-mono-response-diagnostics.ts (new)
- src/lib/payments/mono.ts

Three files. Production and main branch refs are unchanged. Leave changes uncommitted
and unpushed. No controlled Production retry or response-format fix performed.
