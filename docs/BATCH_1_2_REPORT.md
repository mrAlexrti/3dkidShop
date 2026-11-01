# Batch 1.2 — final brand pink and canonical development categories

Branch: `sites-ui-integration`. Starting commit: `fa901d4`, with a clean working tree.
All changes are local to TARGET. REFERENCE is untouched. Nothing was pushed or deployed.
No Favorites, customer authentication, Account, or My Orders work was started.

## Files

- Updated `src/app/(shop)/storefront.css`
- Updated `src/components/layout/category-nav.tsx`
- Added `scripts/configure-storefront-categories.ts`
- Added `scripts/verify-batch12-http.ts`
- Added `docs/BATCH_1_2_REPORT.md`

## Exact brand color and presentation

One scoped token, `--sf-brand-pink: #F494BA`, supplies the exact RGB `(244, 148, 186)` to:

1. The entire hero H1.
2. The active language button background.
3. The cart count badge background.
4. The large rounded footer container background.
5. Each category's leading decorative star.
6. The decorative Catalog heading star.

Footer text, headings, links, and social icons remain white, as explicitly requested. Active language text uses the existing dark storefront ink for readability; inactive appearance, state handling, and focus behavior are unchanged. No alternate pink was substituted for these six elements.

Each category link now contains its own `aria-hidden` four-point star **before** its label. Stars are 12px, noninteractive, vertically centered by the existing flex layout, and separated from labels by 8px. Separator-only stars were removed. The Catalog heading retains its small star using the same token/class.

Hero desktop clamp changed from `clamp(2.1rem, 5.1vw, 4.1rem)` to `clamp(1.97rem, 4.79vw, 3.85rem)`. At a 16px root size, the desktop cap is **61.6px, previously 65.6px: exactly 4px smaller**. Mobile uses `clamp(1.6rem, 6.3vw, 2.49rem)`, proportionally reduced from `clamp(1.7rem, 6.7vw, 2.65rem)`. Centering, natural wrapping, Comfortaa 700, hero copy/configuration, and the three-card composition remain intact.

## Applied development Category rows

Exactly five categories exist. Every row has `parentId = null`; there are no subcategories.

| Order | UA | EN | Slug | ID | Products |
| ---: | --- | --- | --- | --- | ---: |
| 10 | Іграшки | Toys | `toys` | `cmrb2qiao00001jjbqywiz49o` | 8 |
| 20 | Брелоки | Keychains | `keychains` | `cmvy92gv30002kfeql9jwgpdm` | 1 |
| 30 | Клікери | Clickers | `clickers` | `cmvy92h1r0004kfeq727yandq` | 0 |
| 40 | Фіджети | Fidgets | `fidgets` | `cmvy92h500006kfeqfwj5wzy0` | 0 |
| 50 | Аксесуари для навушників | Earphone Accessories | `earphone-accessories` | `cmrb2qjbh00061jjb23y0l3z4` | 1 |

The existing `toys-3d` row was reused and renamed to `toys`. The existing `headphone-accessories` row was reused, renamed to `earphone-accessories`, and promoted to root. Their IDs were preserved. Three new canonical rows were created.

Runtime category code still reads `getCategoryTree()` and `Category.order`; no canonical category array or name conditions were added to React. Home, catalog navigation/filters, footer, and admin category choices use the real rows. This replaces the former Batch 1.1 manual taxonomy checklist with the now-authorized development cleanup.

## Obsolete categories removed

These five rows were removed **after** their products had been reassigned and a transaction-level query confirmed zero remaining product references:

| Old slug | Old category | Removed ID |
| --- | --- | --- |
| `buttons` | Ґудзики | `cmrb2qj3100041jjbv8kmzjsk` |
| `other-3d` | Інші 3D товари | `cmrb2qilo00011jjbcyrg1fj2` |
| `jibbitz-crocs` | Джибітси для Crocs | `cmrb2qj6r00051jjb70q5z2e0` |
| `shoppers` | Шопери | `cmrb2qirr00021jjbanf5kgzs` |
| `courses-3d-modeling` | Курси з 3D моделювання | `cmrb2qixd00031jjb9xtnhmst` |

## Product ID and reassignment audit

All ten IDs below were recorded before mutation and checked unchanged after it. Seven category FKs changed: one keychain to Keychains and six unrelated mock products to the owner-approved Toys fallback. Two toy products and the headphone clip kept their category IDs; their category rows were renamed as described above.

| Product ID | Product | Before slug | Final slug | Category FK changed |
| --- | --- | --- | --- | --- |
| `cmrb2qjf700081jjbohggu03b` | 3D іграшка «Ведмедик» | `toys-3d` | `toys` | No |
| `cmrb2qlgd000h1jjbj7assulp` | Брелок «Зірочка» | `toys-3d` | `keychains` | Yes |
| `cmrb2qmsq000q1jjb1rbniyby` | Набір 3D фігурок «Космос» | `toys-3d` | `toys` | No |
| `cmrb2qo52000z1jjbo88lodk5` | Ґудзики «Веселка» | `buttons` | `toys` | Yes |
| `cmrb2qpez00181jjb2j2ws3vd` | Джибітс «Смайлик» | `jibbitz-crocs` | `toys` | Yes |
| `cmrb2qqrq001h1jjbqfta3dfr` | Кліпса для навушників | `headphone-accessories` | `earphone-accessories` | No |
| `cmrb2qs9l001q1jjbypq7631v` | Шопер «3D Kid Heart» | `shoppers` | `toys` | Yes |
| `cmrb2qu2b001z1jjbtsy8reee` | Шопер «Playful Shapes» | `shoppers` | `toys` | Yes |
| `cmrb2qvhn00281jjbc704w76o` | Курс «Старт у 3D моделюванні» | `courses-3d-modeling` | `toys` | Yes |
| `cmrb2qwxc002h1jjbzz8gaohd` | Мінікурс «Моделюємо іграшку» | `courses-3d-modeling` | `toys` | Yes |

| Inventory | Before | After |
| --- | ---: | ---: |
| Products | 10 | 10 |
| Orders | 1 | 1 |
| Product images | 10 | 10 |
| Categories | 7 | 5 |

Matching SHA-256 fingerprints before mutation, after mutation, and in the independent read-only verification:

- Sorted product ID array: `066fc9b112d36c4c65ef5e2259af24cfbe789067c31611f69480f2807e72ffc9`
- Orders including order items: `5a8b6e229a868c78640458567ff1cf2d7a4ffe8fd3edb3caa7f00b692c5d5632`
- Preserved data: `48c3ea64817a2240d5a6f9aeae7ff40f98ce4df9432d9deec708f44af6ceb22c`

The preserved-data fingerprint covers every product scalar except `categoryId`, plus orders/items, images, options/values, attributes, and SiteContent. Product timestamps were explicitly preserved when changing category FKs. No private order contents, credentials, or media URLs are included in this report.

## Configuration script

The one-purpose script inspects all category/product records and prints the product IDs/counts and classification plan before writes. Application runs in one serializable transaction: reuse/create canonical rows, reassign products, assert obsolete categories are empty, remove only those obsolete IDs, and verify exact final categories/FKs and preservation fingerprints before commit.

```text
npx tsx scripts/configure-storefront-categories.ts --dry-run
npx tsx scripts/configure-storefront-categories.ts --apply
npx tsx scripts/configure-storefront-categories.ts --verify
```

Default mode and `--verify` are read-only. `--apply` refuses `NODE_ENV=production`. Matching canonical rows are reused without updates, and products already in the selected category are skipped, making repeated application idempotent. Canonical data exists only in this CLI configuration script, not storefront components.

No Prisma schema changes, db push, migrations, resets, truncation, global seed, product deletion, or order deletion were used.

## Validation and handoff

| Check | Result |
| --- | --- |
| Configuration script `--dry-run` before mutation | Reviewed the full original inventory and all ten product mappings; no writes |
| Configuration script `--apply` | Passed; one serializable transaction committed and verified |
| Configuration script `--verify` | Passed independently with read-only queries: exact five rows, parent/order fields, valid product FKs, matching counts/IDs/fingerprints |
| Configuration script post-cleanup `--dry-run` | Passed; five canonical categories, ten products, zero category reassignments proposed |
| `npm run lint` | Passed |
| `npx tsc --noEmit --incremental false` | Passed |
| `npm run build` | Passed, including sitemap prerendering against the development database |
| `git diff --check` | Passed |
| `npx tsx scripts/verify-storefront.ts` | Passed: centralized UA/EN parity, locale persistence, hero isolation/defaults and validation |
| `npx tsx scripts/verify-product-media.ts` | Passed: GIF null/add/change/clear, main image ID/update consistency, no duplicates, unchanged gallery and complete rollback |
| `npx tsx scripts/verify-batch11-http.ts` | Passed UA/EN: home, real categories/products, catalog/product/cart, About/Delivery copy and metadata, admin guard, existing authenticated admin media/content fields and hero previews |
| `npx tsx scripts/verify-batch12-http.ts` | Passed UA/EN: real `getCategoryTree()` order, all five leading stars, matching footer/filter categories, exact brand token rules and served CSS, selected category states and product filtering 8/1/0/0/1 |
| Protected source diff against `fa901d4` | No changes to GIF/media logic, hero configuration, cart/checkout/order logic, Nova Poshta, LiqPay, notifications, auth/TOTP, About/Delivery, Prisma schema, or dependency files |

The existing configured hover GIF was retained: one existing product has a configured GIF and nine have null. Media regression fixtures were entirely rolled back. No storefront, content, product, or order form was submitted by the HTTP checks; only the existing development admin login was used for read-only admin rendering checks.

Browser automation was unavailable in the preceding correction passes. Pixel-level layout and pointer/keyboard/touch interaction approval remain manual Preview checks; HTTP/source checks do not claim to replace them. The working GIF implementation and all commerce/integration source files are unchanged.

Local commits:

1. `262c80a` — `fix: apply final brand pink and category star placement`
2. The second commit includes this report, the applied configuration script, and the Batch 1.2 read-only HTTP verification. Run `git log --oneline fa901d4..HEAD` for its hash.

Final handoff remains on `sites-ui-integration`, with no push, deployment, or next-batch work.
