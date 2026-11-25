# UX-09 / UX-10 pre-release review

Reviewed `47094e532a4cd5ce7497e569cc218819cee96764` against the deployed SEO-01 baseline `80af0d512f2f8a7c2a6c2e8889b9690e78bd4e84`. The follow-up replaces the Web Locks requirement and prevents overlapping checkout attempts on an account while financial status is unresolved. The database release SQL is unchanged. Production migration and deployment require separate approval.

## Cart SQL

Run `node scripts/rehearse-batch19-customer-account.mjs --database-only --cart-profile` against the harness's disposable loopback database. The profiler uses the restricted runtime login and 21 distinct synthetic configured products, each with a color, image and filament requirement. An add starts with the listed number of lines and appends one new configured product. Each row reports 14 measured runs after two warm-ups. Wall time covers the Prisma operation and transaction round trips on the local machine. The per-statement column below comes from PostgreSQL `pg_stat_statements` and measures server execution only. These figures do not capture Vercel-to-Neon latency, database wake-up, connection setup, contention or HTTP overhead.

| Starting lines | Read statements | Read p50 / p95 ms | Add statements | Add p50 / p95 ms |
| --- | ---: | ---: | ---: | ---: |
| 1 | 11 | 2.63 / 4.59 | 12 | 3.67 / 5.63 |
| 2 | 11 | 2.67 / 4.64 | 12 | 3.87 / 6.12 |
| 5 | 11 | 3.07 / 5.89 | 12 | 4.17 / 6.77 |
| 10 | 11 | 3.21 / 5.33 | 12 | 5.63 / 7.22 |
| 20 | 11 | 4.3 / 7.2 | 12 | 6.63 / 9.09 |

| Statement | Purpose | Read mean μs at 20 lines | Add mean μs at 20 lines |
| --- | --- | ---: | ---: |
| BEGIN | Open the transaction. | 0.5 | 0.6 |
| SET TRANSACTION ISOLATION | Pin one catalog and cart snapshot with repeatable read. | 3.4 | — |
| SELECT User | Lock the customer row with FOR UPDATE and enforce CUSTOMER role. | — | 20.4 |
| SELECT CustomerCart | Load the account's JSON selections and revision by primary key. | 30.3 | 28.4 |
| SELECT Product | Find distinct active products and base prices/orderability. | 34.4 | 36.0 |
| SELECT ProductImage | Batch-read gallery candidates and color bindings, up to ten per product in the projection. | 22.8 | 24.4 |
| SELECT ProductOption | Load option groups for the batched product IDs. | 28.4 | 30.2 |
| SELECT ProductOptionValue | Resolve option labels, prices and retirement markers. | 22.5 | 23.7 |
| SELECT ProductVariant | Load referenced variants or native sizes and candidate prices. | 32.5 | 36.1 |
| SELECT ProductVariantSelection | Resolve the exact selected color and size values. | 23.8 | 25.8 |
| SELECT VariantFilamentGroup | Return unsatisfied groups using a SQL predicate across alternatives and filaments. | 44.7 | 47.1 |
| INSERT CustomerCart | Upsert the changed JSON and revision, checking the owner on insertion. | — | 136.6 |
| COMMIT | Close the transaction. The add becomes visible to other sessions. | 0.7 | 0.8 |

Each listed statement ran once per operation. The read and add are separate operations. Inside each interactive transaction a single connection executes its statements sequentially. The read uses an explicit isolation statement, while the add uses the database default and the customer lock. Session verification is outside the measured read or add. The actual mutation also rechecks the same session within the customer lock and runs the existing rate-limit statement. [Prisma interactive transactions](https://www.prisma.io/docs/orm/v6/prisma-client/queries/transactions)

The profile found no N+1 statement growth and no repeated relation query within a traced read or add. Group availability is resolved in one batched statement, with no per-variant filament request. Result rows and CPU work still grow with the cart. The existing initial authenticated cart read may be followed by a merge projection when a saved guest cart exists. A later checkout forces a fresh read for quote integrity, then the order transaction independently revalidates prices and availability. PERF-01 should measure the route and merge round trips in Vercel/Neon, analyze query plans and image row volume, and evaluate safe deduplication before changing batching or cache behavior.

The checkout overlap guard is outside these counts. It adds a customer-scoped Order lookup under the existing customer lock. The index beginning with Order customerId is already present.

The private cart read runs on initial authenticated load or session change, opening the drawer, entering cart/checkout/checkout success, qualifying path or locale changes while the drawer or cart view is open, returning to the window or visible tab, and a same-browser cart-change signal. Focus/visibility events share a 1.5-second throttle and overlapping reads share one in-flight request. A mutation returns its authoritative projection directly. Ordinary catalog and product client navigation with the drawer closed does not itself trigger a cart read. Guest views skip this API. The existing favorites/session discovery has a separate cadence. Payment status keeps its pre-existing, bounded polling on the result page.

## Browser storage and guest import

- The reviewed commit returned early when Web Locks was absent. A compatible browser with Web Locks could also hold its local lock across an arbitrarily delayed network request. The new implementation uses a short IndexedDB transaction to stage a single UUID and immutable guest draft across tabs. It releases the transaction before calling the server.
- The PostgreSQL customer transaction and unique receipt make retries idempotent. A receipt from one account cannot transfer those same guest items to another. The local draft and acknowledgment both overlay an exact saved version and leave any different guest record intact. After an acknowledged partial merge, the untransferred lines stay available as guest items.
- If the browser denies IndexedDB before staging, the guest cart stays editable and the account shows that the items stayed in the guest cart. If the browser loses the acknowledgment after staging, the saved draft can replay its UUID with the same account even if IndexedDB is now unavailable. Acknowledging the server receipt makes guest checkout available again. The saved pending message survives refresh and links back to sign-in. Private-mode expiry, clearing site data, or opening links in another storage partition can remove access to browser-local guest data.
- Safari supports Web Locks starting with Safari 15.4. Chromium shipped the API in Chrome 69. Android WebView uses Chromium with a separate data store from Chrome. Apple web views may also use nonpersistent stores. Edge regression tests simulate absent Web Locks, a throwing lock getter, denied IndexedDB and a failed acknowledgment write. Physical iOS Safari, Android browser and private mode, Instagram, and Telegram WebViews still need operator checks. Vendor documentation describes the platform APIs and storage model. [WebKit Web Locks](https://webkit.org/blog/12445/new-webkit-features-in-safari-15-4/) · [Chrome Web Locks](https://developer.chrome.com/blog/new-in-chrome-69) · [Android WebView](https://developer.chrome.com/docs/webview) · [Apple web view stores](https://developer.apple.com/documentation/webkit/wkwebsitedatastore) · [WebKit private storage](https://webkit.org/tracking-prevention/)

## Payment lifecycle and recovery

| Scenario | Expected behavior |
| --- | --- |
| Order creation or invoice setup fails | Before a committed order there is no deduction. A failed provisional invoice keeps the cart and the existing financial review/retry process. |
| Customer leaves the provider, closes the tab or returns on another device | The provisional order and purchase plan remain in PostgreSQL. The cart remains available while payment is unresolved. A provider webhook or scheduled merchant reconciliation can accept payment without the shopper's tab. |
| Repeated exact checkout | The account and cart revision select one initial checkout key. The payload fingerprint prevents changed details from replacing the order. Replaying the same pending checkout can return the same hosted page from another device. A verified explicit retry has one stable successor identity. |
| Customer edits cart while an invoice is payable or payment is uncertain | The review found that the new revision previously allowed a second payable checkout and even a separate COD order. The fix serializes the check under the existing customer lock and blocks both kinds while the prior payment remains unresolved. The customer can open its signed status page. |
| Payment fails or expires with verified terminal evidence | Quantities remain in the cart. The existing provider-verified retry can authorize a successor. Abandoned payments require merchant evidence or operator resolution before an overlapping purchase is permitted. |
| Payment succeeds | Mono's authoritative paid transition creates the operational order number. The server consumes only the captured line generations and still-present purchased quantities in the same transaction, then deletes the purchase plan. Later additions and any line re-created with a new generation stay. |
| Duplicate or late callback | Duplicate paid evidence and an older failure do not deduct again. The tested earlier paid evidence arriving after a newer terminal cutoff records the financial fact for manual review without accepting or deducting the earlier order again. |

Online setup commits a **provisional attempt**. Charging and fulfillment remain separate. Removing quantities at provisional creation would empty the basket for abandoned or failed payments. The paid transition completes the durable operational order. The status page reads persisted financial state, so refreshing it does not force a merchant fetch. [Monobank acquiring status and callbacks](https://api.monobank.ua/docs/acquiring.html)

The baseline used `localStorage` for the checkout identity and retry marker. It already required a signed status link and a storage marker in the same browser profile for the explicit retry control. It offered no recovery from order history for unpaid provisional attempts and no cross-device explicit retry. UX-09 moved the authenticated marker to `sessionStorage`, which added the original-tab boundary for that control. Exact account checkout replay can still rediscover a pending invoice and make a fresh local marker when the checkout payload and revision match. With a changed cart the review fix exposes the older attempt's status from checkout. Personal account history still shows accepted operational orders. A shopper who lost the original payment page and changed the cart can check status, wait for verified expiry, or ask the operator for help. The explicit retry from a changed or lost tab remains limited. The signed status page does not recover a missing payment URL by querying the provider.

**Launch gate for online payments.** Before approving deployment, the operator must confirm that verified webhook delivery or existing scheduled merchant reconciliation resolves abandoned attempts, including expiry after the shopper closes the tab. An unresolved provider result intentionally blocks a second authenticated checkout. The local suite exercised the real order transactions and payment state transitions with synthetic provider evidence. Live delivery, the scheduler configuration and physical devices remain outside this review. If the abandonment/expiry gate fails, hold the online release until reconciliation works or the operator approves a recovery change.

## Database release and recovery

The [complete migration SQL](release/ux-09-10-customer-cart.sql) is `docs/release/ux-09-10-customer-cart.sql`. Its SHA-256 is `a178ddc24938c4bb746eaad5133eb55d21fc85dfae90af00fb0c839f70cfacea`.

| Table | Fields and constraints |
| --- | --- |
| CustomerCart | `userId` text primary key with cascading User reference, nonnegative integer `revision` defaulting to 0, `lines` JSONB array with at most 100 entries. Trigger limits owners to CUSTOMER. |
| CustomerCartImport | UUID primary key `id`, indexed `userId` with cascading CustomerCart reference, `accepted` JSONB object. |
| CustomerCartPurchase | `orderId` text primary key with cascading Order reference, `lines` JSONB array with 1–100 entries. |

The migration revokes PUBLIC access to new objects. `app_3dkid` gets SELECT and INSERT on all three tables, UPDATE on CustomerCart revision and lines only, and DELETE on CustomerCartPurchase only. SQL runs as the reviewed direct-connection owner inside a transaction with a three-second lock timeout and 30-second statement timeout. It creates new objects and references existing keys. It performs zero updates, deletions or backfills on existing customer, product, order or authentication records. The isolated rehearsal verifies old restricted-role reads and compares row counts and fingerprints across migration, empty rollback and reapplication.

1. With separate approval, verify the baseline, role, restore-tested backup and SQL hash. Run the [read-only preflight](release/ux-09-10-customer-cart-preflight.sql) with `psql -X -v ON_ERROR_STOP=1` on the direct TLS connection.
2. In the same invocation as the migration, set `ux0910.reviewed_execution='customer-cart-reviewed'` with a `psql -c` argument before its `-f` argument. Run the [read-only verification](release/ux-09-10-customer-cart-verify.sql) after commit and check grants, references and initial zero counts. SEO-01 can keep serving while the new empty schema exists.
3. Deploy the approved application after database verification. Check the provider reconciliation gate described above. The additive schema supplies everything the release needs from PostgreSQL through the existing connection.
4. For application rollback, retain the new tables and operate SEO-01 on that compatible schema. Account cart sync and cart deduction are unavailable while SEO-01 serves. Record any provisional purchase plans before switching app versions. A proved-empty schema can use the [guarded SQL rollback](release/ux-09-10-customer-cart-rollback.sql), which takes an exclusive lock and refuses once any new rows exist.
5. After cart data exists, preserve all three tables, their history and import receipts. Use a forward application fix. Before resuming cart service, audit plans for orders accepted during the rollback window. Those orders need a reviewed forward reconciliation using the same customer lock, verified paid and accepted predicate, and once-only plan-consumption algorithm. A duplicate provider callback on an already accepted order alone does not perform this repair. Keep unresolved or disputed payments for operator reconciliation. Rehearse that recovery against a separate restored copy before separately approving an operator write. Restoring the old pre-migration backup over a live database would discard newer unrelated records.

## Validation completed

- Prisma validation, TypeScript, ESLint and an optimized Next.js build passed.
- Isolated PostgreSQL passed migration fingerprints, restricted grants, empty rollback and refusal after use. Payment coverage included a fresh authenticated session replaying the same invoice, terminal failure and expiry, blocking a changed cart while the invoice remained payable, successful deduction without a browser return, duplicate evidence, stale paid review and subsequent cart edits.
- The optimized Edge suite passed the guest-store failure cases, parallel same-origin documents sharing one receipt, and the UX-09, UX-10, account, checkout and SEO-01 regressions with zero React hydration errors. The standalone drawer suite covered both languages at 390 and 1280 pixels. The mocked payment acceptance suite passed 15 groups and the focused cart/checkout suite passed 21 groups.
