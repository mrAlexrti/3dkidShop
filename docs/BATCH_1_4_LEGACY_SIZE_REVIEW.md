# Batch 1.4 — optional-size Admin editor and legacy-data review

Status: **proposal only; no catalog cleanup/conversion approved or applied**. Existing social/auth commits are preserved. No push, deployment, `.env` change, or real credential reset.

## Audit and classification

Read-only development audit: 10 products, 10 option groups, 30 option values, 2 orders, 10 images, 5 categories. Every group is named `Розмір`. Every product has the same `Маленький` / `Середній` / `Великий` values and modifiers 0 / 50 / 100. All 30 explicit `price`, `valueEn`, `note`, and `noteEn` fields are null.

These are classified as **legacy/test data awaiting review**, not automatically accepted as intentional size configuration. Creator intent is not recorded, so an individual legacy row's intent cannot be proven. The previous Admin product editor exposed no size configuration. There are **zero explicit configured size prices** in the current catalog.

## Finished editor behavior

- Each product has an explicit “Use configured sizes” checkbox. A new/legacy-only product starts with it off.
- Enabling starts a fresh size row; no legacy row or old modifier is copied into an active configuration.
- Admin can add/edit/remove UA/EN labels, full explicit prices and optional UA/EN notes. English labels may be left blank and use the existing fallback behavior.
- Removing all configured sizes, or disabling and saving, returns the product to simple-product mode at `Product.price`.
- Untouched size controls send no size-change instruction. Ordinary product edits preserve all existing legacy rows.
- Legacy rows appear in a separate read-only review panel. Size updates/deletions target configured rows only (`price IS NOT NULL`), never the old null-price rows. Legacy IDs cannot be submitted as existing configured IDs.
- Runtime category/card/detail/order mappings use only recognized size groups with a valid explicit price. Null-price legacy rows do not activate selectors or surcharges. The current ten products therefore behave as simple products while their legacy data remains stored.
- Stock remains product-level. Existing cart lines referencing unconfigured/removed legacy size IDs must be re-added; their old surcharge is not accepted for a new order.

`scripts/configure-size-prices.ts` is now read-only inventory tooling. Its bulk `--apply` path is explicitly disabled; it contains no write/delete calls. Legacy arithmetic in its output is hypothetical, not an activation plan.

## Exact proposed cleanup — awaiting approval

Every targeted removal below means **only that product's listed legacy group and its three null-price values**. No product, category, image, order, order item, stock, base price, or historical option snapshot would be modified. No legacy record would be converted into an active size.

| Product | Base price, UAH | Proposed action | Exact legacy group ID |
|---|---:|---|---|
| Брелок «Зірочка» | 119 | Remove group + 3 legacy values; keep simple | `cmrb2qlge000j1jjbtd3j2tet` |
| Ґудзики «Веселка» | 99 | Remove group + 3 legacy values; keep simple | `cmrb2qo5200111jjbvek92vsb` |
| Джибітс «Смайлик» | 129 | Remove group + 3 legacy values; keep simple | `cmrb2qpez001a1jjbrpa9xpi8` |
| Кліпса для навушників | 139 | Remove group + 3 legacy values; keep simple | `cmrb2qqrq001j1jjbn3aewz31` |
| Курс «Старт у 3D моделюванні» | 499 | Remove group + 3 legacy values; keep simple | `cmrb2qvhn002a1jjbn4jp5r45` |
| Мінікурс «Моделюємо іграшку» | 349 | Remove group + 3 legacy values; keep simple | `cmrb2qwxd002j1jjbn3gq1ov6` |
| Шопер «3D Kid Heart» | 399 | Remove group + 3 legacy values; keep simple | `cmrb2qs9m001s1jjbs8fjp38a` |
| Шопер «Playful Shapes» | 549 | Remove group + 3 legacy values; keep simple | `cmrb2qu2b00211jjb557xqkmu` |
| 3D іграшка «Ведмедик» | 149 | Retain 3 legacy values inactive for owner review; no conversion | `cmrb2qjf7000a1jjbynm46h26` |
| Набір 3D фігурок «Космос» | 299 | Retain 3 legacy values inactive for owner review; no conversion | `cmrb2qmsq000s1jjbi1bcxzgd` |

The two toy products might eventually warrant sizes, but the current generic labels/modifiers do not establish that. They would remain simple until the administrator deliberately enters real labels and explicit prices in the new editor. If sizes are wanted, their physical meaning and selling prices need confirmation rather than automatic inheritance.

If this precise proposal is approved, expected counts are: products 10 → 10; images 10 → 10; categories 5 → 5; orders 2 → 2; option groups 10 → 2; legacy values 30 → 6; explicitly configured size values 0 → 0. Stock remains 49 for the bear/cosmos products and 50 for the other eight products.

Before any future cleanup: re-read the exact IDs, verify that all targeted values still have null explicit prices and the reviewed labels/modifiers, check that no configured rows have been added, run the operation in a transaction, and assert protected data/IDs before committing. Any mismatch requires a fresh review. No cleanup command has been implemented or executed by this checkpoint.

## Verification

- `scripts/verify-size-editor.ts`: exercises the real checkbox, input and button handlers in both locales using React elements and a small hook-state harness; no new testing dependency. Covers enable/add/edit/remove/disable/zero sizes and untouched-save behavior.
- The same script invokes the actual Admin product create/update actions against new fixture records inside an outer transaction that always rolls back. It verifies explicit prices, UA/EN labels/notes, stable configured IDs on edit, historical snapshot readability, invalid-price/duplicate rejection, and legacy preservation on save/add/remove/disable. Existing catalog records are not mutated.
- It also checks the actual order action's prepared write against those database fixture prices: a configured size uses its explicit 200 UAH price; a legacy-only simple product uses its 123 UAH base price despite a legacy +50 modifier and forged client price/label. Order writes, stock writes and external effects are blocked in this pricing check; no order is created.
- `verify-cart.ts` passes simple/legacy-simple identity merging, same-size merging, different-size separation, label retention, totals, quantity changes, removal and storage normalization using isolated in-memory persistence.
- Before/after full catalog/order/category snapshots match after rollback; fixture product/images/options/values do not persist. No order, email, payment, Telegram message or TTN is created.
- `verify-checkout-render.ts` and `verify-storefront.ts` pass optional-size rendering and centralized UA/EN key parity.
- Project lint, `npx tsc --noEmit --incremental false`, production build and `git diff --check` pass. No testing dependency was added.
- Browser layout/interaction still needs manual review; the harness and static render checks are not a claim of real browser automation.

Batch 1.4 payment correction and remaining end-to-end QA are still in progress. This checkpoint does not mark the whole batch complete or start Batch 1.5.
