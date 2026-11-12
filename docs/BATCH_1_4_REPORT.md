# Batch 1.4 — final local implementation and QA report

Date: 2026-11-12. Branch: `sites-ui-integration`.

Completed Batch 1.4 only. Existing commits were preserved. No push, deployment, Batch 1.5 work, `.env` edit, real credential reset, real payment, real notification or TTN creation. REFERENCE was not edited. Live acquiring is intentionally unavailable; this is not a claim of payment production readiness.

## Social links

Reuse the existing `SiteContent` keys `social_instagram`, `social_telegram`, `social_tiktok`, `social_youtube`. Each has its own existing Admin content URL field, current-value display, URL validation and clear-to-empty behavior. No new settings table or media provider was introduced. Valid URLs render distinct links with localized accessible labels, `target="_blank"` and `rel="noopener noreferrer"`. Empty/invalid values hide icons; no `href="#"` exists. No social URLs were invented or written to the database. Enter the brand's actual URLs in Admin.

All 16 independently configured/empty combinations were checked in UA and EN, including invalid protocols/embedded credentials and clearing. This validates URL mapping and rendering without sending messages to any social service.

## Admin authentication and manual reset

Before: credentials plus custom TOTP verification and a development credential bypass. After: Auth.js credentials provider, configured username and bcryptjs password verification, JWT sessions retaining role `ADMIN`, protected middleware/actions, and existing Auth.js logout. No customer authentication was added. TOTP input/verification/helper and the example TOTP secret were removed. There was no otherwise-unused TOTP package to remove; package dependencies are unchanged.

Credential environment names only: `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH`, `AUTH_SECRET`; compatibility fallback `NEXTAUTH_SECRET`. `ADMIN_TOTP_SECRET` is obsolete. `TEST_MODE` still controls useful Admin development warnings but cannot bypass credentials. Real environment values were neither printed nor changed.

The user performs the final secret update:

1. Run `powershell -NoProfile -File .\scripts\prepare-admin-credentials.ps1` in a private local terminal.
2. Enter the new username and hidden password twice. The helper uses bcrypt cost 12 and generates a fresh session secret. It puts prepared env lines on the local clipboard; it does not print plaintext or write `.env`.
3. Privately replace the relevant existing `.env` lines using that clipboard block, retaining escaped dollar signs in the bcrypt hash. Keep `AUTH_SECRET` and `NEXTAUTH_SECRET` equal, remove obsolete `ADMIN_TOTP_SECRET`, and clear the clipboard.
4. Restart the local server; test new login, wrong/old credentials, protected `/admin`, and logout. Secret rotation invalidates old JWT sessions.

See `ADMIN_CREDENTIAL_RESET.md` for the full procedure. Correct/incorrect/old credentials, role propagation, absent/MANAGER denial, ADMIN authorization, logout wiring and helper hash parsing passed with isolated fake credentials. Unauthenticated protection and login without TOTP also passed over localhost HTTP. Actual forgotten credentials were not reset or used; authenticated browser verification follows the user's manual reset.

## Optional size architecture and development data

The old price differences came from database `ProductOptionValue.priceModifier` added to `Product.price`. The ten development products all had the same legacy three-value groups and modifiers 0/50/100. This was not evidence of intentional per-product size configuration; creator intent was not recorded. No hidden hardcoded product-specific selling-price map was retained.

Final modes:

- Zero configured sizes: no selector; immediate card/detail Add; authoritative `Product.price`.
- Configured sizes: Admin manages UA/EN label, full explicit price and optional UA/EN note; card Add opens detail; no implicit default size; detail Add requires a selection and displays its explicit price.
- Cart identity is `productId` or `productId-sizeValueId`. Repeated same product/size merges; different sizes remain separate. Persisted legacy items are normalized defensively. Removed/invalid size IDs cannot authorize a new order and may need to be removed/re-added.
- Cart, checkout and immutable versioned order snapshots preserve the selected bilingual size information. Historical flat snapshots remain readable after edits/deletes. No empty Size row is displayed for simple products.
- Server prices and labels come from database records. Client prices and labels are ignored; invalid/missing/cross-product sizes are rejected. Stock remains product-level, aggregated across all selected sizes and atomically checked/decremented.

The previously approved additive `db push` added nullable `ProductOptionValue.valueEn`, `price`, `note`, `noteEn` and `Order.paymentProvider`, `paymentMode`, `paymentStatus`. Repository convention is `db push`, without a migrations directory. No additional schema change/reset/migration was needed in this continuation. ProductOption/Value models and the deprecated modifier column remain; modifiers no longer participate in storefront/order pricing.

The exact approved cleanup was already committed as `ef2a5dc`; it was verified rather than reapplied. Eight legacy groups/24 values were removed and six existing toy values updated, with no creates:

| Product | Small / Маленький | Medium / Середній | Large / Великий |
|---|---:|---:|---:|
| 3D іграшка «Ведмедик» | 149 UAH | 199 UAH | 249 UAH |
| Набір 3D фігурок «Космос» | 299 UAH | 349 UAH | 399 UAH |

The other eight products are simple. All six retained modifiers are zero. Product IDs, base prices, stock, images, categories, orders, order items and historical snapshots were unchanged. Exact reviewed IDs and protected-record digests are in `BATCH_1_4_LEGACY_SIZE_REVIEW.md`.

| Records | Entire approved cleanup before → after | This continuation before → after |
|---|---:|---:|
| Products | 10 → 10 | 10 → 10 |
| Images | 10 → 10 | 10 → 10 |
| Categories | 5 → 5 | 5 → 5 |
| Orders / items | 2 / 2 → 2 / 2 | 2 / 2 → 2 / 2 |
| Size groups / values | 10 / 30 → 2 / 6 | 2 / 6 → 2 / 6 |

Final protected-record SHA-256 remains `b94d21cce0f717a4ba01cf4a390c0d455df6c3f4c07120e07cefef408eb47559`. The complete post-cleanup catalog/order/category snapshot also matched before/after rollback QA.

## Payment flow and security

Before: key presence enabled online checkout; a success toast preceded gateway handoff; the return page always showed a success icon/title; callbacks lacked amount/currency checks, accepted sandbox unconditionally and could repeat notifications.

After:

1. Server validates checkout, authoritative product/size prices, quantity and shared stock. Online checkout is rejected before mutation when unavailable.
2. For the existing signed-form provider, a local signed handoff is prepared before the stock/order transaction; no provider request occurs. The transaction creates an `AWAITING_PAYMENT` order with provider/mode snapshot and `paymentStatus=PENDING`. The handoff is returned only after commit.
3. The client uses neutral redirect copy and submits the gateway form, without successful-payment UI or navigation to a success page first. Cart clearing follows a successful form-submit call; a thrown handoff retains the cart.
4. A validated callback can transition payment status. The return page reads server data, never a browser `payment=success`/`email=sent` flag.
5. The page shows distinct confirmed offline order, payment pending, paid, failed/cancelled/reversed and unavailable states. Pending state polls the local status endpoint up to ten times over about 30 seconds, supports manual recheck, aborts on cleanup and stays pending on network failure. A different order remounts local state. Legacy online orders without provider metadata remain pending even if their fulfillment status was changed or an old unvalidated callback set a paid flag; they require reconciliation.
6. Offline order creation still confirms immediately and uses the existing notifications. No online confirmation notification runs before payment. Sandbox order/callback paths suppress real notifications.

Current online availability is **false**. `ONLINE_PAYMENT_MODE` defaults to `disabled`; `live` also remains disabled. Sandbox requires explicit `ONLINE_PAYMENT_MODE=sandbox`, `LIQPAY_SANDBOX=1` and sandbox-prefixed public/private keys. TEST_MODE/key presence alone cannot enable it. These requirements are documented in `.env.example`; the real `.env` was not edited. Sandbox copy is explicit when enabled. No Mono/other provider was integrated.

Callback validation now covers:

- Constant-time signature comparison and bounded/validated callback data.
- Existing order reference, bound LiqPay provider and matching authorized payment mode; COD and unbound legacy orders cannot be paid through this callback.
- Matching signed merchant key, `pay` action, exact UAH currency and exact expected amount in integer minor units; malformed/extra-decimal/negative/nonfinite amounts are rejected.
- Only successful statuses authorize paid state; sandbox status requires sandbox mode. Unknown/processing/hold statuses leave payment pending.
- Atomic compare-and-set makes repeated/concurrent callbacks safe. Stale failures cannot undo confirmed payment. Reversals record `REFUNDED` and preserve the historical paid timestamp; they do not automatically cancel fulfillment or restore stock. Cancelled/refunded orders cannot be silently re-paid.

The result URL uses a 24-hour HMAC capability bound to the order number, derived with a purpose prefix from the existing server auth secret. `/api/payments/status` returns only `{state}`, requires that capability, and uses private/no-store caching. The result page is noindex/no-referrer. Confirmation email links include the capability. Old tokenless/expired links show unavailable; secret rotation invalidates old result links as well as sessions. No customer account/session system was introduced.

Protocol caveat: the existing version-3 SHA-1 signing contract was retained, with timing-safe verification. Current [official callback prose](https://www.liqpay.ua/doc/api/callback) describes SHA3-256 while its examples and the [official legacy SDK](https://github.com/liqpay/sdk-python/blob/master/liqpay/liqpay.py) use SHA-1. Confirm the actual merchant API version/signature contract with the provider before any live activation. No speculative dual-signature fallback was added, and live acquiring remains blocked.

For Mono: implement/configure the acquiring adapter and invoice creation, bind provider invoice/reference and expected amount/currency/mode to the pending order, validate its authoritative callback with idempotent transitions, add secure handoff/failure recovery and sandbox tests. The provider-neutral result state, capability endpoint and UI can be reused. Add durable notification retry/reconciliation and stock-reservation expiry policy before live rollout. Do not enable live payment by merely changing a flag.

## Customer account audit

No `/account` route, customer provider or working cabinet exists. Existing Prisma User/Account/Session structures do not constitute a storefront customer feature; active authentication is Admin credentials only. The icon was intentionally disabled, not a broken account link. Header and footer remain truly disabled/non-navigating and now explicitly announce localized “Account is currently unavailable”. No fake page, Favorites, Google customer OAuth or My Orders was added.

## Validation and limitations

Passing local checks:

- `npm run lint`, `npx tsc --noEmit --incremental false`, `npm run build`, `git diff --check`.
- `verify-batch14-payments.ts`: isolated real action/callback/status source, invalid signatures/data/merchant/reference/amount/currency, disabled/live guards, sandbox isolation, pending/paid/failure/reversal, duplicate/concurrent callbacks, offline/online handoff, token tamper/expiry. No real DB/provider/notification calls.
- `verify-batch14-payment-ui.ts`: UA/EN five result states, false browser success denied, order-state remount, no pending success icon, online/offline submit handlers, failed-handoff cart retention and bounded polling/network failure, using installed React and isolated globals.
- `verify-batch14-auth.ts`, `verify-batch14-social.ts`, `verify-cart.ts`, `verify-checkout-render.ts`, `verify-storefront.ts`.
- `verify-order-flow.ts`: eighteen orders exercised inside mandatory-rollback transactions, all eight base prices/six explicit size prices, snapshots, aggregate stock and race guard; zero external calls, no persisted QA order.
- `verify-size-editor.ts`, `verify-product-media.ts`, `verify-product-search.ts`: temporary fixture mutations always rolled back; legacy nonzero modifier cannot alter explicit/base price; image/GIF behavior unchanged.
- `configure-development-size-fixtures.ts --verify`: read-only approved final state and protected-data hash.
- Local production HTTP suites `verify-batch11-http.ts`, `verify-batch12-http.ts`, `verify-batch13-http.ts --skip-np`, `verify-batch14-http.ts`: UA/EN storefront/content/categories/search, all ten size states, capability-protected result state, forged success denied, disabled account, no-TOTP login/protected Admin, truthful unavailable online payment. No checkout/carrier/payment submission.

No testing dependencies were installed. An initial UI assertion used an older icon class name and was aligned with the installed icon library. A localhost suite was interrupted when the server was stopped for the final rebuild; it was rerun against the fresh build. Neither incident required changing business behavior or database records.

Actual browser interaction remains manual: the native helper reports missing pipe (OS error 2), and browser inventory reports browser host unavailable with no browsers. Source/render/HTTP checks are not claimed as real browser automation. Real credentials, external callbacks and real charges were deliberately not tested. No persistent QA order exists to clean up. The idle localhost server log contained PostgreSQL connection-termination notices (`57P01`); fresh read-only database verification then passed with the same protected-data hash. No database reset/reconfiguration was attempted.

Manual handoff:

1. Perform the private credential reset, then check login/bad password/old credentials/logout/protected Admin in the browser.
2. Set each actual social URL independently in Admin; verify save, current value, clear and safe external link.
3. Check simple immediate Add; Bear/Cosmos size selection and six prices; same-size merge/different-size lines; selected labels through cart/checkout. Stock stays shared per product.
4. Check GIF hover/leave, keyboard focus, reduced motion, broken GIF and touch navigation, plus responsive widths 320/360/390/430/768/1024/1440.
5. In an explicitly authorized sandbox/Preview only, check gateway handoff, browser return before callback, later confirmation, cancellation and repeated callback. Ensure `NEXT_PUBLIC_SITE_URL`/`SITE_URL` points to that authorized test origin for callbacks/returns. Never make a real charge. Externally reachable callbacks and deployment-specific configuration still need Preview QA after separate authorization; no push/deploy was performed here.

Before production: settle the acquiring provider/protocol, remote callback delivery, stock reservation expiry/reconciliation, checkout idempotency and durable notification retry. Existing timestamp-suffix order numbers can collide under concurrency and deserve a dedicated contained fix before high-volume traffic. Legacy online orders without provider/mode snapshots need manual reconciliation. These are documented follow-ups, not an unrequested payment/auth rewrite.

The result page hydrates only its small interactive status component; polling is bounded and cancelled; no catalog-wide GIF preloading or product-query expansion was introduced. Existing public brand pink, Comfortaa, hero/media, five-category tree, search and integrations are preserved.

## Commits and file manifest

Existing Batch 1.4 commits preserved: `4a36390` socials; `69e3826` password-only Admin; `41ac9ea` reset-helper module fix; `40cb935` optional sizes; `0af4f04` reviewed fixture plan; `ef2a5dc` approved guarded fixture configuration. New implementation/QA commits: `7e6d712` — `fix: validate payment confirmation and result states`; `3193d01` — `fix: keep unbound legacy online orders pending`. This final report and the size-checkpoint status are committed as `docs: complete Batch 1.4 validation and handoff`; its hash is available in the final reply and `git log`. Final git status is checked after committing; no push or deployment follows.

The complete Batch 1.4 changed-file manifest follows (relative to the completed Batch 1.3 checkpoint; deleted `src/lib/totp.ts` is intentional).

```text
.env.example
docs/ADMIN_CREDENTIAL_RESET.md
docs/BATCH_1_4_LEGACY_SIZE_REVIEW.md
docs/BATCH_1_4_REPORT.md
prisma/schema.prisma
scripts/configure-development-size-fixtures.ts
scripts/configure-size-prices.ts
scripts/prepare-admin-credentials.mjs
scripts/prepare-admin-credentials.ps1
scripts/verify-batch11-http.ts
scripts/verify-batch13-http.ts
scripts/verify-batch14-auth.ts
scripts/verify-batch14-http.ts
scripts/verify-batch14-payments.ts
scripts/verify-batch14-payment-ui.ts
scripts/verify-batch14-social.ts
scripts/verify-cart.ts
scripts/verify-checkout-render.ts
scripts/verify-order-flow.ts
scripts/verify-size-editor.ts
src/app/(shop)/cart/page.tsx
src/app/(shop)/catalog/page.tsx
src/app/(shop)/checkout/page.tsx
src/app/(shop)/checkout/success/page.tsx
src/app/(shop)/delivery-payment/page.tsx
src/app/(shop)/page.tsx
src/app/(shop)/product/[slug]/page.tsx
src/app/admin/content/page.tsx
src/app/admin/orders/[id]/page.tsx
src/app/admin/products/[id]/edit/page.tsx
src/app/api/payments/liqpay/callback/route.ts
src/app/api/payments/status/route.ts
src/components/admin/product-form.tsx
src/components/admin/size-editor.tsx
src/components/auth/login-form.tsx
src/components/cart/cart-drawer.tsx
src/components/checkout/checkout-form.tsx
src/components/checkout/checkout-page.tsx
src/components/checkout/order-result.tsx
src/components/layout/footer.tsx
src/components/layout/header.tsx
src/components/product/product-card.tsx
src/components/product/product-options.tsx
src/lib/actions/create-order.ts
src/lib/actions/products.ts
src/lib/auth.ts
src/lib/cart-items.ts
src/lib/i18n.ts
src/lib/notifications/orders.ts
src/lib/payments/liqpay.ts
src/lib/payments/online-payment.ts
src/lib/payments/order-result.ts
src/lib/payments/payment-state.ts
src/lib/product-size-admin.ts
src/lib/product-variants.ts
src/lib/server-env.ts
src/lib/totp.ts
src/store/cart-store.ts
src/types/index.ts
```
