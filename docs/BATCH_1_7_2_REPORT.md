# Batch 1.7.2 — order operations

Branch: `batch-1-7-2-order-operations`.
Base: Production branch `redesign-3dkid-v2`, commit
`4743a105a7b83aa9f881539162e425b1e877a12a`.
Local implementation only; no commit, push, deployment, migration, registration,
real order/payment/invoice/TTN, email or Telegram delivery.

## Operational semantics

No Prisma/schema change. Existing enum values and historical rows are retained.

New online, COD and backend-compatible pickup orders all start at `PENDING`, the
existing representation of normalized operational `NEW`. Only a manual merchant
action sets `PROCESSING`. Payment or carrier evidence never implies that work
started. A new order may remain NEW while paid, labeled, shipped or in transit.

| Trigger | Operational result | Independent facts |
| --- | --- | --- |
| Order accepted | NEW (`PENDING`) | Existing pending-payment setup |
| Successful payment | Unchanged | Validated PAID and `paidAt` |
| Payment failure/cancellation/expiry/refund | Unchanged | Existing normalized payment state; no inventory writes |
| Invoice setup failure/initialization expiry | Unchanged | Sanitized financial cancellation/error; localized checkout feedback |
| TTN created | Unchanged | Existing carrier metadata |
| Shipped/in transit/arrived/delivered alone | Unchanged | Existing delivery evidence |
| Confirmed paid + delivered | COMPLETED | Existing automatic final-completion rule |
| Take into work | PROCESSING | Payment and delivery columns untouched |
| Explicit Admin cancellation | CANCELLED | Existing local pending-Mono cancellation path retained |

Provider update payloads omit `status` entirely when there is no real operational
transition. They cannot rewrite unchanged legacy PAID/DELIVERED/etc. values into
the operational column. COMPLETED/CANCELLED remain terminal; generic Admin editing
cannot reopen them or reset PROCESSING to NEW.

Historical AWAITING_PAYMENT/PAID/SHIPPED/DELIVERED values remain readable, including
their legacy selector labels. Their normalized operational stage is NEW because
those values do not prove explicit merchant acceptance; payment/delivery continue
to require their existing independent evidence. Historical persisted PROCESSING
remains PROCESSING: there is no audit marker that can distinguish older automatic
COD acceptance from actual manual work. Nothing is backfilled or rewritten.

## Shared manual operation

`src/lib/orders/take-into-work.ts` performs a bounded read/compare-and-set retry.
The conditional update matches ID and the previously read operational status and
writes only `status: PROCESSING`. Concurrent payment/delivery field changes survive.
A concurrent finalization/cancellation wins over a stale acceptance attempt.

The winning write emits the existing ORDER_PROCESSING event with identical
financial/carrier before/after snapshots. Repeated Admin/Telegram actions return
already-in-work without another write/event. Missing, final and conflicting orders
return useful results. Admin requires the existing ADMIN session check; both its
quick button and generic PROCESSING selection use this service. Taking work is
optional and is not a precondition for creating TTN or delivery progression.

The localized quick action is visible for normalized NEW only. The button refreshes
Admin after completion and disables itself while pending. Terminal status selectors
are disabled. Notification channel settings/defaults remain independent and unchanged.

## Telegram protocol and authorization

Official documentation checked for this batch:

- [InlineKeyboardButton](https://core.telegram.org/bots/api#inlinekeyboardbutton)
- [CallbackQuery](https://core.telegram.org/bots/api#callbackquery)
- [answerCallbackQuery](https://core.telegram.org/bots/api#answercallbackquery)
- [setWebhook](https://core.telegram.org/bots/api#setwebhook) — documentation only;
  no registration request executed.

ORDER_CREATED now uses “Нове замовлення” / “New order” in the shared settings and
template dictionary. Only its enabled owner-Telegram notification gets an inline
keyboard: “Взяти в роботу” and “Відкрити замовлення”. The URL targets the exact
existing authenticated Admin order page. Disabling Telegram ORDER_CREATED prevents
both the message and keyboard; ORDER_PROCESSING remains separately configurable.
Customer email uses its own settings and gets no Telegram callback data.

The callback format is `ow1:<order-id>`, at most 52 ASCII bytes (Telegram allows
64). It contains no credentials or customer data and grants no authority by itself.

`POST /api/telegram/webhook`:

- Requires server-only TELEGRAM_WEBHOOK_SECRET and the official
  X-Telegram-Bot-Api-Secret-Token header. SHA-256 digests are compared with Node's
  timingSafeEqual. Invalid/missing configuration fails closed.
- Requires the configured numeric positive TELEGRAM_ADMIN_CHAT_ID and bot token.
  Only private owner chats are supported. Both message.chat.id and from.id must
  equal that configured ID, chat.type must be private, and from.is_bot must be false.
  Group/channel/inline-message callbacks are not authorized in this batch.
- Bounds streamed JSON to 32 KiB, checks the update/callback structure and accepts
  only the exact versioned action format. Malformed/unknown/unauthorized input cannot
  mutate an order. Other authenticated update types are acknowledged and ignored.
- Uses the shared CAS service and answers callback queries in Ukrainian. Repeated
  clicks/delivery are harmless. Existing buttons remain visible after acceptance;
  subsequent clicks return “Замовлення вже в роботі”.
- No polling, webhook registration, bot configuration change, or new templates per
  provider. The sender supports optional reply_markup while preserving plain text,
  uses fixed Bot API method URLs, checks HTTP/JSON success and bounds calls to 5s.
  Exceptions, URLs, tokens and raw provider responses are never logged.

Existing best-effort notification architecture is retained: CAS prevents duplicate
transition dispatch, but there is no new durable outbox. If callback acknowledgement
fails after state persistence, it cannot undo or repeat the operational transition.

## Manual Production setup after separate release approval

1. Add a strong server-only `TELEGRAM_WEBHOOK_SECRET` using Telegram's documented
   allowed character set (`A-Z`, `a-z`, `0-9`, `_`, `-`, 1–256 characters). Keep its
   value private. Existing TELEGRAM_BOT_TOKEN and TELEGRAM_ADMIN_CHAT_ID stay unchanged.
2. Verify TELEGRAM_ADMIN_CHAT_ID identifies the owner's private numeric Telegram
   chat/user. Group chat callbacks intentionally fail closed.
3. Deploy the reviewed code through the separately approved release process.
4. Manually register Telegram setWebhook with:
   - `url`: `https://www.3dkid.shop/api/telegram/webhook`
   - `secret_token`: the same private value as TELEGRAM_WEBHOOK_SECRET
   - `allowed_updates`: `["callback_query"]`
5. Inspect webhook configuration/delivery health through a trusted manual tool.
   Do not disclose the bot token or put real credential values into this report.

None of those Production steps was performed during development.

## Checkout compatibility and Batch 1.7.1

The storefront no longer renders pay_on_pickup. Online card (when configured) and
Nova Poshta COD remain visible. The validator, historical labels and backend pickup
support are retained; this is deliberately a UI restriction. Payment method choices
use two desktop columns. Product publication/orderability semantics are unchanged.

The three Batch 1.7.1 cart/product runtime files are byte-for-byte unchanged from the
base commit. Their real-browser navigation, backdrop, focus, scroll, add-to-cart and
no-success-toast regressions were rerun successfully.

## Verification

All isolated tests use actual application source with fail-closed mocks or loopback
browser fixtures. No .env loading is used in the regression scripts. The isolated
Next build empties sensitive provider credentials in its child process and blocks
Prisma connections/writes and provider fetches; its generated output/config is ignored.

| Check | Result |
| --- | --- |
| verify-order-operations.ts | PASS: lifecycle matrix, CAS races/terminal guards, one event, snapshots preserved, Admin auth, callback security/size/identity/parsing/replay, keyboard/toggles/URL, plain text/Bot API failures, final completion, UA/EN action renders |
| verify-batch16-notifications.ts | PASS: independent toggles/events, settings, templates, concurrent Admin/carrier updates; NEW order TTN does not start work |
| verify-batch17-payments.ts | PASS: Mono security/state/reconciliation/order creation; NEW online/COD/pickup; financial failure/setup cancellation independent; stock untouched |
| verify-batch14-payments.ts | PASS: isolated legacy LiqPay compatibility and security; payment does not start work |
| verify-novaposhta-status.ts | PASS: all 69 original classification samples plus provider normalization; financial/delivery assertions separate from operational state |
| verify-batch17-cod.ts | PASS: COD-only behavior, trusted amount, duplicate TTN/auth and false-positive hardening |
| verify-checkout-render.ts | PASS: UA/EN; pickup absent, configured card and COD present; existing sizes/pricing/orderability |
| verify-storefront.ts / verify-unified-catalog.ts / verify-cart.ts | PASS |
| verify-batch14-payment-ui.ts | PASS: nine UA/EN payment result states; browser return is not payment authority |
| verify-cart-drawer.ts | PASS: UA/EN, 390/1280px; real React StrictMode/Framer Motion/Zustand; Batch 1.7.1 behavior |
| verify-responsive.ts | PASS: 216 viewport renders; no horizontal overflow; desktop CSS screenshots identical at 1280/1440 |
| verify-admin-responsive.ts | PASS: 264 viewport renders and 44 desktop comparisons, including NEW quick action; accepted fixtures normalize only the explicitly added action |
| TypeScript --noEmit --incremental false | PASS |
| ESLint | PASS, no warnings |
| Isolated production build | PASS: compilation, lint/types, 15 prerenders; includes Telegram endpoint |
| git diff --check | PASS |

Expected sanitized warning paths are exercised for unavailable notification settings
and mocked Telegram API failure. In-memory CAS races are not a claim of a live
PostgreSQL integration test; no database connection is used.

## Changed-file manifest

Runtime:

- src/app/admin/orders/[id]/page.tsx
- src/app/api/cron/novaposhta/route.ts
- src/app/api/payments/liqpay/callback/route.ts
- src/app/api/telegram/webhook/route.ts (new)
- src/components/admin/order-status-select.tsx
- src/components/admin/take-order-into-work-button.tsx (new)
- src/components/checkout/checkout-form.tsx
- src/lib/actions/create-order.ts
- src/lib/actions/orders.ts
- src/lib/i18n.ts
- src/lib/notifications/orders.ts
- src/lib/notifications/telegram-actions.ts (new)
- src/lib/notifications/telegram.ts
- src/lib/notifications/templates.ts
- src/lib/order-status.ts
- src/lib/orders/take-into-work.ts (new)
- src/lib/payments/transitions.ts
- src/lib/status.ts

Verification/documentation:

- scripts/verify-admin-responsive.ts
- scripts/verify-batch14-payments.ts
- scripts/verify-batch16-notifications.ts
- scripts/verify-batch17-payments.ts
- scripts/verify-checkout-render.ts
- scripts/verify-novaposhta-status.ts
- scripts/verify-order-operations.ts (new)
- docs/BATCH_1_7_2_REPORT.md (new)

No Prisma files, environment files, package manifests, Production config, main branch,
or unrelated features changed. Leave all 26 files uncommitted and unpushed for review.
