# Batch 1.4 — optional-size Admin editor and legacy-data review

Status: **owner-approved cleanup/configuration applied in one guarded transaction on 2026-11-11**. Exactly eight legacy groups and 24 values were deleted; the existing six Bear/Cosmos values received EN labels, explicit prices and zero modifiers. No records were created. Existing commits are preserved. No push, deployment, `.env` change, or real credential reset.

## Audit and classification

Read-only development audit: 10 products, 10 option groups, 30 option values, 2 orders, 10 images, 5 categories. Every group is named `Розмір`. Every product has the same `Маленький` / `Середній` / `Великий` values and modifiers 0 / 50 / 100. All 30 explicit `price`, `valueEn`, `note`, and `noteEn` fields are null.

Before cleanup these were classified as **legacy/test data awaiting review**, not automatically accepted as intentional size configuration. Creator intent was not recorded. The previous Admin product editor exposed no size configuration. There were zero explicit configured size prices before the approved operation; the six retained toy values are now intentional owner-configured fixtures.

## Finished editor behavior

- Each product has an explicit “Use configured sizes” checkbox. A new/legacy-only product starts with it off.
- Enabling starts a fresh size row; no legacy row or old modifier is copied into an active configuration.
- Admin can add/edit/remove UA/EN labels, full explicit prices and optional UA/EN notes. English labels may be left blank and use the existing fallback behavior.
- Removing all configured sizes, or disabling and saving, returns the product to simple-product mode at `Product.price`.
- Untouched size controls send no size-change instruction. Ordinary product edits preserve all existing legacy rows.
- Legacy rows appear in a separate read-only review panel. Size updates/deletions target configured rows only (`price IS NOT NULL`), never the old null-price rows. Legacy IDs cannot be submitted as existing configured IDs.
- Runtime category/card/detail/order mappings use only recognized size groups with a valid explicit price. Null-price legacy rows do not activate selectors or surcharges. After cleanup eight products are simple; Bear and Cosmos each have three configured sizes.
- Stock remains product-level. Existing cart lines referencing unconfigured/removed legacy size IDs must be re-added; their old surcharge is not accepted for a new order.

`scripts/configure-size-prices.ts` is now read-only inventory tooling. Its bulk `--apply` path is explicitly disabled; it contains no write/delete calls. Legacy arithmetic in its output is hypothetical, not an activation plan.

## Exact approved and applied cleanup

Every targeted removal below affected **only that product's listed legacy group and its three null-price values**. The six retained toy values were updated using the owner's explicit prices. No product, product ID, category, image, order, order item, stock, base price, or historical option snapshot was modified. No records were created.

| Product | Base price, UAH | Applied action | Exact legacy group ID |
|---|---:|---|---|
| Брелок «Зірочка» | 119 | Remove group + 3 legacy values; keep simple | `cmrb2qlge000j1jjbtd3j2tet` |
| Ґудзики «Веселка» | 99 | Remove group + 3 legacy values; keep simple | `cmrb2qo5200111jjbvek92vsb` |
| Джибітс «Смайлик» | 129 | Remove group + 3 legacy values; keep simple | `cmrb2qpez001a1jjbrpa9xpi8` |
| Кліпса для навушників | 139 | Remove group + 3 legacy values; keep simple | `cmrb2qqrq001j1jjbn3aewz31` |
| Курс «Старт у 3D моделюванні» | 499 | Remove group + 3 legacy values; keep simple | `cmrb2qvhn002a1jjbn4jp5r45` |
| Мінікурс «Моделюємо іграшку» | 349 | Remove group + 3 legacy values; keep simple | `cmrb2qwxd002j1jjbn3gq1ov6` |
| Шопер «3D Kid Heart» | 399 | Remove group + 3 legacy values; keep simple | `cmrb2qs9m001s1jjbs8fjp38a` |
| Шопер «Playful Shapes» | 549 | Remove group + 3 legacy values; keep simple | `cmrb2qu2b00211jjb557xqkmu` |
| 3D іграшка «Ведмедик» | 149 | Update 3 existing values into intentional explicit-price sizes below | `cmrb2qjf7000a1jjbynm46h26` |
| Набір 3D фігурок «Космос» | 299 | Update 3 existing values into intentional explicit-price sizes below | `cmrb2qmsq000s1jjbi1bcxzgd` |

The following are intentional owner-specified development fixtures, not an inference that old modifiers establish valid sizes. Existing group/value IDs and UA labels stay unchanged. Update `price`, `valueEn` and set `priceModifier = 0` on these six rows only; leave notes null.

| Product | Existing value ID | UA label retained | EN label set | Explicit price, UAH | Modifier before → after |
|---|---|---|---|---:|---|
| Bear | `cmrb2qjf7000b1jjbx8uq0bra` | Маленький | Small | 149.00 | 0 → 0 |
| Bear | `cmrb2qjf7000c1jjbbhx40rqk` | Середній | Medium | 199.00 | 50 → 0 |
| Bear | `cmrb2qjf7000d1jjb83mbxkby` | Великий | Large | 249.00 | 100 → 0 |
| Cosmos | `cmrb2qmsq000t1jjbkylncewg` | Маленький | Small | 299.00 | 0 → 0 |
| Cosmos | `cmrb2qmsq000u1jjbe4yng99b` | Середній | Medium | 349.00 | 50 → 0 |
| Cosmos | `cmrb2qmsq000v1jjbjmanxsiv` | Великий | Large | 399.00 | 100 → 0 |

Bear product ID remains `cmrb2qjf700081jjbohggu03b`; Cosmos product ID remains `cmrb2qmsq000q1jjb1rbniyby`. The deprecated `priceModifier` column remains in the schema but no storefront/order price calculation reads it. All six remaining modifiers are zero. Sizes use the explicit database `price` directly; simple products use `Product.price`.

Verified counts: products 10 → 10; images 10 → 10; categories 5 → 5; orders 2 → 2; order items 2 → 2; option groups 10 → 2; option values 30 → 6; intentionally configured explicit-price size values 0 → 6; remaining null-price legacy values 30 → 0. Stock remains 49 for the Bear/Cosmos products and 50 for the other eight products. The eight simple products keep their listed base prices.

`scripts/configure-development-size-fixtures.ts --apply` completed once, after a read-only preflight. A serializable transaction checked exact IDs, counts, labels, base prices, stock and original null fields before writing. It asserted all final values and unchanged protected records before commit. A separate read-only `--verify` then passed. The SHA-256 digest of complete product/image/category/order/order-item/attribute records was identical before and after: `b94d21cce0f717a4ba01cf4a390c0d455df6c3f4c07120e07cefef408eb47559`. Remaining groups and value fields outside the three approved fields also matched. The old bulk conversion script remains disabled. The new script refuses a second apply because its original-state guards no longer match; use `--verify` for read-only checks.

## Verification

- `scripts/verify-size-editor.ts`: exercises the real checkbox, input and button handlers in both locales using React elements and a small hook-state harness; no new testing dependency. Covers enable/add/edit/remove/disable/zero sizes and untouched-save behavior.
- The same script invokes the actual Admin product create/update actions against new fixture records inside an outer transaction that always rolls back. It verifies explicit prices, UA/EN labels/notes, stable configured IDs on edit, historical snapshot readability, invalid-price/duplicate rejection, and legacy preservation on save/add/remove/disable. Existing catalog records are not mutated.
- It also checks the actual order action's prepared write against those database fixture prices: a configured size uses its explicit 200 UAH price even with a deliberately stale +987.65 modifier; a legacy-only simple product uses its 123 UAH base price despite a legacy +50 modifier and forged client price/label. Only temporary rollback fixtures receive those modifiers. Order writes, stock writes and external effects are blocked in this pricing check; no order is created.
- `verify-cart.ts` passes simple/legacy-simple identity merging, same-size merging, different-size separation, label retention, totals, quantity changes, removal and storage normalization using isolated in-memory persistence.
- Before/after full catalog/order/category snapshots match after rollback; fixture product/images/options/values do not persist. No order persists and no email, payment, Telegram message or TTN is triggered.
- `verify-checkout-render.ts` and `verify-storefront.ts` pass optional-size rendering and centralized UA/EN key parity.
- Project lint, `npx tsc --noEmit --incremental false`, production build and `git diff --check` pass. No testing dependency was added.
- Browser layout/interaction still needs manual review; the harness and static render checks are not a claim of real browser automation.

After the approved cleanup, `verify-order-flow.ts` exercises the actual order transaction against all eight simple products and all six intentional size prices. It rejects missing, nonexistent and cross-product sizes, checks two sizes against shared product stock, ignores forged browser prices/labels, and verifies bilingual immutable order snapshots. Eighteen test orders are created only inside transactions that obligatorily roll back; no test order persists and the fail-closed external-call counter stays zero. A first test run exposed a fixture error (removing `variant` while retaining the legacy size ID in the cart-line ID); correcting the fixture required no runtime change.

Local production HTTP QA checks all ten product pages in both locales: exactly two show configured size controls and eight omit them. Existing category/brand and search/information-page checks remain part of the read-only storefront suite. No checkout submission or carrier/payment request is sent by these HTTP checks.

Manual browser follow-up: check simple-card immediate Add, toy-card navigation to size selection, selected-price changes, repeated same-size quantity merging, different-size separation and selected labels in cart/checkout. Recheck GIF hover/reduced-motion/touch behavior. Stop before placing an actual order; automated order checks already cover that transaction with mandatory rollback.

This document records the completed size-data checkpoint. The remaining Batch 1.4 payment correction and safe final QA were subsequently completed; see `BATCH_1_4_REPORT.md` for the final architecture, validation evidence and manual browser/provider checks. Batch 1.5 was not started.
