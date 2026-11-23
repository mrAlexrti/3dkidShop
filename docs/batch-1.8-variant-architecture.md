# Batch 1.8 — Color + Size architecture and schema gate

**Stage 1B local implementation update:** see [implementation and verification](batch-1.8-implementation.md).
Local implementation is now authorized and implemented. The earlier gate outcomes
below remain a historical record; they do not describe current runtime coverage.
Production migration, deployment and native-write activation remain unapproved.

**Stage 1A.5 verification update:** read section 14 before using this proposal.
It supersedes the original revision policy and commit-time-only error-handling
assumption. Sections 1–13 otherwise record Stage 1A; section 14 records the later
local-only execution evidence and corrections.

## 1. Decision, scope and evidence

**Stage 1A outcome: design ready for owner review; schema and implementation NOT approved.**

Recommend retaining `ProductOption` / `ProductOptionValue` as reusable selection
dimensions and adding **`ProductVariant` + `ProductVariantSelection`** for explicitly
configured purchasable combinations. A database extension is required. Independent
color/size flags or additive price modifiers cannot safely represent the business
rules. Do not infer a Cartesian product of colors and sizes.

This is a proposal, not an applied schema or an executable migration. The only
deliverable changed in Stage 1A is this document. `prisma/schema.prisma`, database
records, runtime code, dependencies and migration files remain unchanged. No SQL,
Prisma database command, live infrastructure operation or business transaction was
executed. Implementation must wait for approval of the decisions in section 12.

- Repository: `mrAlexrti/3dkidShop`.
- Production baseline, fetched and verified: `76621cf01ebe482bfee9a80aaed4a4b5b9dfed22`.
- New feature branch: `feat/batch-1.8-color-size-variants`, created at that baseline.
  Removed inherited Production upstream tracking; no branch was pushed.
- Initial working tree: clean. `origin/main` was
  `3bf9ce0955040535db1e42ea161d0d27a80fb160`.
- No live database inventory was obtained. Historical reports are evidence of
  earlier behavior, not proof of the present Production catalog or schema.

Reviewed the actual schema, size helpers/editor, product form/actions, product
page/card/gallery mappings, cart normalization/reconciliation/persistence,
reconciliation action, checkout submission/pricing, checkout identity/session,
order snapshot readers and existing size/cart/checkout tests. Previous decisions:

- [Batch 1.4 report](BATCH_1_4_REPORT.md) and
  [legacy-size review](BATCH_1_4_LEGACY_SIZE_REVIEW.md): explicit size prices,
  stable value IDs, optional sizes, immutable snapshots; old null-price modifiers
  were not automatically accepted as intentional sizes.
- [Batch 1.7 report](BATCH_1_7_REPORT.md),
  [revised print-on-demand gate](BATCH_1_7_PRINT_ON_DEMAND_SCHEMA_GATE.md), and
  [baseline audit](BATCH_1_7_AUDIT_SCHEMA_GATE.md): publication/orderability,
  combination-level availability, transactional pricing and generic dimensions.
  The revised gate supersedes earlier stock-based design. Its suggested generic
  combination/selection architecture is retained here.
- [Batch 1.7.5](batch-1.7.5-stage1-report.md),
  [media retention](batch-1.7.5a-media-cleanup.md),
  [gallery/Admin reliability](batch-1.7.5b-gallery-admin-ux.md), and
  [cleanup readiness](batch-1.7.5c-blob-cleanup-readiness.md): preserve cart review,
  stale-image protection, stable gallery IDs, form state and media locks.
- [Deferred manual QA](deferred-manual-qa.md): all **17** scenarios remain
  **Pending Manual QA**. This architecture review supplies no live QA evidence.

## 2. Existing architecture and limitations

| Actual code / model | Current behavior and constraint |
| --- | --- |
| `Product` | Base `Decimal(10,2)` price; independent `isActive` / `isOrderable`; `stock` is inert legacy data. No configured option mode. |
| `ProductOption` | Arbitrary `name`, product FK, values. Runtime recognizes only exact `Розмір` / `Size` group names. No machine-readable dimension kind. |
| `ProductOptionValue` | Stable ID, UA/EN labels and notes; nullable explicit full size price; legacy `priceModifier` remains unused for selling prices. No combination identity or per-combination availability. |
| `product-variants.ts` | Only valid explicitly priced size values activate options. `startingPrice` uses their minimum, otherwise base price. Empty sizes currently mean simple product. This fallback must NOT apply to an empty new option-enabled configuration. |
| `product-size-admin.ts` / `size-editor.tsx` | Maximum 40 sizes. Multiple/non-size groups are rejected. Untouched controls send no mutation; retained IDs update in place; removed configured sizes are physically removed. Null-price legacy rows are preserved. Native combinations need retirement instead. |
| `CartItem`, `cart-items.ts` | Simple line ID is product ID; size line ID is product ID + size-value ID. `variant.id` currently means **size-value ID**, not a future combination ID. Duplicate same-size additions merge with quantity/total guards. Unresolved legacy labels fail closed. |
| `cart-store.ts` | `stikr-cart` persistence version 1; normalized hydration masks remote images and never restores verification. Revisions/request sequence protect edits from stale responses; price changes require review; failures retain cart but block checkout. |
| `reconcile-cart.ts` | One bounded public lookup (100 product IDs), active products only, current primary image and size prices. Does not expose unpublished data. Response has no explicit option mode. |
| `create-order.ts` | Sorted Product `FOR SHARE` locks, then current products/options/prices and Order creation **inside the same Read Committed transaction**. Client price is never the source. New clients require quote equality. |
| Mono retry | Existing attempt replay and payload identity occur before new pricing/invoice creation. Identity is `{productId,size,quantity}` per line; browser session also hashes cart revision. Existing attempts must retain their original totals and snapshots. |
| `OrderItem` | Required Product FK protects historical orders from product deletion. `productName`, `price`, quantity and string `optionsJson` are historical snapshots. Version 1 stores bilingual size data; historical flat snapshots are also readable. No current variant FK. |
| Snapshot consumers | `orderSizeLabel` in Admin order detail and shared notification templates; cart/drawer/checkout separately call `sizeLabel`. All need multi-option presentation, with version 1/flat readers retained. |
| Galleries / media | Product images have stable IDs/order; main image is first; gallery/lightbox/card carousel and lazy hover GIF already work. No variant-specific media is requested. |
| Admin forms | Shared `AdminForm` intercepts submit without React form-action reset, retains controls/drafts/uploads on error and focuses field errors. Extend this rather than replacing it. |

The generic option tables can represent **choices**, but cannot represent which
pairs are sold, their absolute prices, availability or stable purchase identity.
Attaching independent prices/availability to color and size values would wrongly
allow missing combinations and make combined pricing ambiguous.

## 3. Business contract

| Product mode | Required selection | Authoritative unit price |
| --- | --- | --- |
| `SIMPLE` | None | `Product.price` |
| `SIZE` | One configured size | Exactly one matching ProductVariant price |
| `COLOR` | One configured color | Exactly one matching ProductVariant price |
| `COLOR_SIZE` | One configured color AND one configured size | Exactly one matching ProductVariant price |
| `LEGACY` (technical compatibility state) | Existing explicitly priced sizes, if present | Existing size/base-price resolver, unchanged |

`LEGACY` is not a fifth seller-facing configuration. Existing products remain in
it until explicitly converted; new products in the later bridge application use
one of the four deliberate modes. Do not infer options from a row count or labels
once a product leaves LEGACY. A native option mode with zero configured or zero
available combinations stays unavailable, never falls back to `Product.price`.

Effective purchase eligibility:

```text
Product.isActive AND Product.isOrderable
AND valid bounded integer quantity / bounded total
AND (simple mode OR exactly one owned configured combination matching every choice)
AND (for combinations: isAvailable AND retiredAt IS NULL
     AND every selected value is not retired)
```

- `isActive` controls publication, not manufacture availability. Published
  unavailable products remain visible; `isOrderable=false` stops every variant.
- Combinations have an independent `isAvailable`, default false. No stock counter,
  reservations, numeric caps from `Product.stock`, or payment-driven availability.
- A missing pair is not offered. An explicitly configured unavailable pair may be
  shown disabled with a localized reason, but cannot be added/checked out.
- Example: Red/Small at 199.00 available; Red/Medium at 249.00 unavailable;
  White/Medium at 259.00 available; White/Small absent. Only those three rows exist.
- Unit prices are full positive UAH amounts, `Decimal(10,2)`, 0.01 through
  99,999,999.99. No base + color + size arithmetic. Validate canonical input at
  most two fractional digits **before** database numeric coercion can round it.
- Continue integer-minor-unit arithmetic and existing quantity 1..2,147,483,647,
  100-cart-line and 9,999,999,999-minor-unit total limits. Reject overflow before
  writes. Transport exact decimal strings / integer minor units, not Decimal
  objects or unchecked floating-point arithmetic.
- Prices shown before a complete selection are the minimum available combination
  price, with localized “from”. None available: unavailable indication, no fake
  base-price offer. Hide the product-wide `oldPrice` for native option products
  until a variant compare-price policy is approved; leave simple/legacy behavior.
- UA labels are mandatory. EN labels/notes use current UA fallback; legacy known
  size translations retain `getProductOptionLabel` fallback. Color labels are
  escaped text, never CSS/HTML or an assumed filament/material identifier.

## 4. Recommended minimal additive model

Two new models, two enums, five scalar columns across existing tables, and the
indexes/relations/SQL invariants below. No replacement of existing option tables,
price columns, ProductImage, Order or payment models. The five columns are
Product.optionMode, Product.variantRevision, ProductOption.kind,
ProductOptionValue.retiredAt and OrderItem.productVariantId.

### 4.1 Proposed Prisma diff (review artifact only)

Add these enum definitions and models to a future approved schema. All relation
names and fields below form part of the proposal; no actual schema was edited.

```prisma
enum ProductOptionMode {
  LEGACY
  SIMPLE
  SIZE
  COLOR
  COLOR_SIZE
}

enum ProductOptionKind {
  COLOR
  SIZE
}

model ProductVariant {
  id             String                    @id @default(cuid())
  productId      String
  product        Product                   @relation(fields: [productId], references: [id], onDelete: Cascade, onUpdate: Restrict)
  combinationKey String                    @db.VarChar(300)
  price          Decimal                   @db.Decimal(10, 2)
  isAvailable    Boolean                   @default(false)
  retiredAt      DateTime?
  selections     ProductVariantSelection[]
  orderItems     OrderItem[]
  createdAt      DateTime                  @default(now())
  updatedAt      DateTime                  @updatedAt

  @@unique([productId, id])
  @@unique([productId, combinationKey])
  @@index([productId, retiredAt, isAvailable])
}

model ProductVariantSelection {
  variantId String
  productId String
  optionId  String
  valueId   String
  variant   ProductVariant     @relation(fields: [productId, variantId], references: [productId, id], onDelete: Cascade, onUpdate: Restrict)
  option    ProductOption      @relation(fields: [productId, optionId], references: [productId, id], onDelete: NoAction, onUpdate: Restrict)
  value     ProductOptionValue @relation(fields: [optionId, valueId], references: [optionId, id], onDelete: NoAction, onUpdate: Restrict)

  @@id([variantId, optionId])
  @@index([optionId, valueId])
  @@index([productId, variantId])
}
```

Only the following additions are made inside existing models; their other fields
and relations remain as currently defined:

```diff
 model Product {
+  optionMode      ProductOptionMode @default(LEGACY)
+  variantRevision Int               @default(0)
+  variants        ProductVariant[]
 }
 model ProductOption {
+  kind              ProductOptionKind?
+  variantSelections ProductVariantSelection[]
+  @@unique([productId, id])
+  @@unique([productId, kind])
 }
 model ProductOptionValue {
+  retiredAt         DateTime?
+  variantSelections ProductVariantSelection[]
+  @@unique([optionId, id])
 }
 model OrderItem {
+  productVariantId String?
+  productVariant   ProductVariant? @relation(fields: [productId, productVariantId], references: [productId, id], onDelete: Restrict, onUpdate: Restrict)
+  @@index([productId, productVariantId])
 }
```

`variantRevision` is a stale-editor epoch, not cart readiness or stock. Stage 1A
originally proposed one application increment per Save. Stage 1A.5 supersedes that:
the proposed SQL advances it on Product and child writes, possibly multiple times
per transaction. The application checks expected revision once under the Product
lock, does not assign/increment the column, and reloads the resulting epoch after
Save. Reject a stale editor with its inputs intact. Never wrap.

### 4.2 Identity and database invariants

1. IDs are opaque and stable. Existing size-value IDs are retained in their
   original table; new variants get independent CUIDs. Labels/price/availability
   edits update rows in place. A different selection tuple creates a different
   variant. Never repurpose an ID by changing product or selected values.
2. A product has at most one typed COLOR group and one typed SIZE group. Legacy
   groups have `kind=NULL`. `UNIQUE(productId,kind)` deliberately permits multiple
   NULL legacy groups, while preventing duplicate typed groups. Do not change
   NULL semantics to NULLS NOT DISTINCT. Renaming a group does not change kind.
3. The three composite selection FKs enforce variant/product/group/value
   ownership. A selection cannot borrow a value or group from another product.
   The primary key permits at most one selected value per group per variant.
4. Canonical keys, computed from immutable IDs in fixed kind order, are exactly
   `SIZE=<valueId>`, `COLOR=<valueId>`, or
   `COLOR=<valueId>;SIZE=<valueId>`. IDs are bounded ASCII alphanumeric/underscore
   (at most 128) before concatenation, so delimiters are unambiguous. Group IDs
   need not enter the key: values have stable unique IDs and belong to one group.
5. Unique `(productId,combinationKey)` includes unavailable AND retired variants.
   Restore the original row to offer that tuple again; do not generate a new ID.
   This avoids nullable `UNIQUE(productId,colorId,sizeId)` ambiguity. PostgreSQL
   normally treats NULLs as distinct in unique constraints; see
   [constraint semantics](https://www.postgresql.org/docs/current/ddl-constraints.html).
6. SQL-only checks require positive bounded variant price and nonnegative
   revision. An unavailable/retired row retains its last valid price for audit.
7. A required deferred database integrity validator must verify that the key
   exactly matches the selection rows, that only typed COLOR/SIZE groups are
   selected, and that each nonretired variant has exactly the dimensions required
   by Product.optionMode and only nonretired values. Empty selections, extra
   dimensions, SIMPLE/LEGACY active variants and mismatches reject the transaction.
   Retired variants may retain a previous mode's shape, but never an invalid key.
8. Separate identity guards forbid changing a persisted variant's product/key,
   moving an option/value between owners, changing an already typed group kind,
   and replacing a variant's selection tuple. NULL -> typed kind is permitted
   only through the reviewed conversion path. Normal removal soft-retires native
   values and their affected variants together. Persisted native variant/value
   rows are not physically removed individually, even without orders; whole
   product deletion without protected history remains supported.
9. `OrderItem.productVariantId` is nullable for old/simple orders. New native
   option orders populate it from the server. Its composite FK ensures product
   ownership and prevents deleting a used variant. Snapshots remain authoritative,
   independent of mutable FK targets. Existing Product history restriction stays.

The canonical key alone is insufficient if callers can forge it. The deferred
validator and identity guards are part of the required SQL design, not optional
“application validation later”. Their implementation must be reviewed and tested
before migration execution is considered. Commit-time checks allow a transaction
to create a variant then its selections without an invalid intermediate commit.
[PostgreSQL constraint triggers](https://www.postgresql.org/docs/current/sql-createtrigger.html)
support deferred checking. Their functions must use a fixed qualified schema,
invoker rights and bounded queries; no dynamic SQL or privilege escalation.

### 4.3 Alternatives considered

| Alternative | Assessment |
| --- | --- |
| Existing values with color/size price modifiers | Cannot identify or price sparse combinations; reject. |
| Separate new ProductColor and ProductSize tables plus variant nullable FKs | Feasible, but duplicates existing bilingual values and needs a size-ID mapping/backfill. More churn than two reusable combination tables. |
| Variant with nullable colorId/sizeId only | Simpler for two fixed dimensions, but diverges from Batch 1.7's generic-dimension decision; requires additional NULL-safe uniqueness and ownership constraints. |
| JSON combinations or labels as identity | Weak ownership/uniqueness, fragile edits and concurrency; reject. |
| One variant row for every simple product too | Unnecessary migration and serialization changes; retain simple Product.price path. |

Generic storage does not enable arbitrary dimensions in this release. Only COLOR
and SIZE are accepted by the enum, schemas, API and Admin editor.

## 5. Compatibility, cart and serialization

### 5.1 Existing products and size conversion

The additive schema defaults every existing product to LEGACY and leaves option
kinds NULL, values unretired and historical order variant FKs NULL. **No automatic
business-data backfill is part of the DDL.** Existing size and simple behavior is
unchanged while the bridge application is deployed.

Later, explicitly reviewed conversion of a size-only product occurs in one locked
transaction: verify the expected revision and exact eligible group/values; mark
that same group SIZE; create one variant/selection per existing explicitly priced
size using its exact price; set deliberate availability; switch mode to SIZE and
let SQL advance revision. Keep all existing group/value IDs, labels, notes and legacy
price fields. Do not translate modifiers to prices or assume NULL-price rows are
valid choices. Ambiguous/multiple/non-size groups stop conversion for manual review.
Existing historical report fixture counts must not serve as live conversion input.

For native products, only ProductVariant.price controls option prices. Legacy
value.price is not dual-written as a second authority. General product edits with
no option payload preserve configuration. The old size editor/writer may operate
only on LEGACY products; it must reject native modes instead of deleting values.

Enabling/removing dimensions requires an explicit preview/confirmation of affected
combinations. Retire incompatible rows and retain them, then change mode atomically.
Re-enabling a prior tuple restores its original variant. Never infer a missing
color for an old size cart, even if only one color currently exists.

### 5.2 Wire identity and safe hydration

Recommended compatibility union, to implement after approval:

| Selection | Persisted/wire identity | Server interpretation |
| --- | --- | --- |
| Simple | Existing shape, line ID productId; no variant/selection | Valid only for simple/legacy-simple mode |
| Size-only | Existing `variant:{id:sizeValueId,labelUa,labelEn}`, line ID `productId-sizeValueId` | LEGACY resolver or exact native SIZE key/selection -> server finds ProductVariant |
| Color-only / Color + Size | New `selection:{version:2,variantId,values:{COLOR:colorValueId,SIZE?:sizeValueId}}`; line ID `productId:variant:variantId` | Exact owned combination ID AND matching values/mode |

Keeping the size-only envelope is intentional: the current field named `variant`
contains a size-value ID. Do not silently reinterpret it as ProductVariant.id.
Native SIZE purchases have a real combination ID server-side even though the
compatibility wire sends the stable size identity. Its unique canonical key makes
resolution unambiguous. New detail/reconciliation DTOs can expose that combination
ID without rewriting legacy cart lines or pending checkout session snapshots.

- New normalized TypeScript types must distinguish legacy size from version-2
  combination selections. Reject mixed fields, unknown versions, malformed IDs,
  extra dimensions and contradictory tuples. Never downgrade an unknown selection
  to a simple purchase. Cached labels/prices are display data, not authority.
- Use a separate `stikr-cart-v2` persistence key/envelope for combination-capable
  clients, with a bounded one-time import from old `stikr-cart` only when no v2
  record exists. Persist the import and its marker atomically in that one record;
  an intentionally emptied v2 cart must not import old purchases again. On storage
  failure retain the source and in-memory cart, report the problem and do not
  destructively clear either record. Do not dual-write new combinations into v1.
  The actual old normalizer ignores unknown selection fields and could otherwise
  turn a colon-delimited combination line into a simple line. An envelope version
  alone cannot prevent an old tab from overwriting a shared local-storage key.
- Preserve the existing pure simple/size line shape, identity, quantities and
  pending online checkout serialization on import. Do not rewrite browser
  pending-payment envelopes during hydration. Leave the v1 source for recovery;
  do not silently synchronize later edits made by an obsolete tab into v2 or
  re-import items after checkout. Require a reload of old tabs; automatic merging
  across simultaneously running old/new applications is not promised. Surface a
  localized stale-tab/recovery notice rather than guessing which cart is newer.
- Same canonical choice merges safely; different combination IDs stay separate.
  Size-only additions continue the existing line identity, including after native
  SIZE conversion. Never merge by translated labels or current display price.
- Legacy labels without IDs stay unresolved/removable; size selections from a
  product now requiring color stay unavailable until the shopper deliberately
  reselects. A removed/retired selection never silently becomes another option.
- Keep remote images masked until authoritative verification. Deleted/inactive
  products retain their selection and quantity with local placeholders; offline
  errors retain intent but never make checkout ready.
- Cart mutations invalidate readiness. Preserve revision/sequence/snapshot guards,
  bounded batched requests, no polling, and explicit changed-price review. Unknown
  or failed lookup results never reset the entire cart or certify it.

### 5.3 Reconciliation contract and storefront projections

Extend the lookup with an explicitly versioned request/response. Validate product
IDs, selection IDs and collection sizes; return only published public fields and
the requested combinations (or a bounded detail option set). Avoid 100 products ×
all combinations in cart responses. No per-line N+1 requests. The mode must travel
explicitly so an empty native combination list cannot imply simple product.

Retain the old product-ID-array contract for bridge callers: LEGACY stays as today;
native SIZE may project current combination prices by existing size-value IDs;
native COLOR/COLOR_SIZE must fail closed in the old projection (not quick-add as
simple). Final checkout still validates mode regardless of caller age. Stale old
pages may require a localized reload/details prompt; infinite compatibility with
old Next server-action binaries is not promised.

Public detail data contains configured nonretired values, selection IDs, allowed
tuples/prices and availability. Cards need only `requiresSelection`, a minimum
price/availability summary and existing media; never send every variant matrix to
every card. Update home/catalog/related mappings and server price sort/filter
semantics consistently; Product.price alone must not drive native option price
ordering. Use a bounded database aggregate/query rather than per-product lookups.
Keep names, descriptions, slugs, routes and metadata behavior; use the same primary
product photo, with no new color-image relation.

## 6. Checkout, atomicity and immutable history

### 6.1 Transaction protocol

Extend the existing sorted Product `FOR SHARE` barrier; do not replace checkout
with outside-transaction reconciliation or trust the browser's reviewed price.

1. Bound/parse the cart union before use. Preserve existing checkout/customer,
   delivery and guest validation and request line limits.
2. Preserve Mono's existing idempotent-attempt lookup/replay **before new pricing**.
   A matching existing attempt uses its original stored price/snapshot. Later
   variant retirement does not authorize a second invoice or mutate that attempt.
3. For a new COD order or new online attempt, take the existing sorted product
   shared locks inside the order transaction. Reload product mode, publication,
   orderability, exact variants and selected owned values after acquiring locks.
4. LEGACY uses its unchanged resolver; SIMPLE rejects any selection. Native SIZE
   resolves the compatibility size ID through the unique canonical combination;
   COLOR/COLOR_SIZE verifies both combination ID and every submitted dimension.
   Reject missing, extra, cross-product, absent, retired or unavailable choices.
5. Read Decimal prices directly from the selected database row. Compute guarded
   minor-unit totals. Retain reviewed-price equality for new clients and
   authoritative server pricing for compatibility clients. Never accept a fallback
   Product.price for a native option mode.
6. Write OrderItems, optional native variant FK, immutable snapshot and actual
   unit price/quantity in that same transaction. No remote call inside the lock.
7. Preserve existing COD acceptance/numbering and online provisional paid-only
   acceptance. Mono creation, signed callbacks, retry source validation,
   reconciliation, notifications and financial accounting remain unchanged.

All new product/option/value/variant writers must acquire the **parent Product
`FOR UPDATE` lock before reading configuration or mutating children**. This
protects absent combinations and mode transitions as well as existing rows.
Child-row locks alone cannot protect against a newly inserted pair. Updates to
unreferenced variant prices also pass through this parent barrier.

For Admin Save/delete: retain media advisory lock `(175501,1)` first, then sorted
Product write locks, then children; check revision, validate, sync, let SQL advance revision
and commit as one unit. Checkout takes Product locks only and never media locks.
Use this same lock order in maintenance/import/conversion writers; do not add a
path that holds Product and then requests the media lock. Retry a known deadlock
only as a bounded whole database transaction, before any provider request.

The SQL plan must also install parent-lock guards on option/value/variant/selection
mutations and deferred integrity checks (section 8). Application prelocking avoids
inverted child/parent lock order; a rogue writer can still deadlock and must roll
back, not partially commit. Database owners can disable triggers; deny/bound direct
mutation operationally. An application lock is not proof that arbitrary SQL,
old checkout binaries or another Preview database follows this protocol. Future
activation needs a writer/deployment inventory, not an assumption.

The shared/exclusive barrier follows PostgreSQL's
[row-lock conflict rules](https://www.postgresql.org/docs/current/explicit-locking.html).
Real multi-session lock behavior must be tested on disposable PostgreSQL before
release; mock assertions alone cannot establish it.

### 6.2 Checkout retry identity

`checkout-identity.ts` and `checkout-session.ts` both currently normalize lines to
`{productId,size,quantity}`. Adding colors only to a UI DTO would let different
colors share a retry payload hash. This is a required compatibility change, not a
payment-provider redesign:

- Preserve byte-for-byte existing line material for simple/size-only requests,
  sorting, existing customer data handling, HMAC purpose and key semantics.
- For new color/combined lines use a tagged version-2 line with productId,
  variantId, exact stable dimension IDs and quantity. Browser/server must share a
  tested canonical selection serializer while retaining their existing data/hash
  wrappers. Distinct colors/combinations must produce distinct input identities.
- Hash identity from validated request selection, not current price/labels,
  database option mode, locale or mutable variant metadata. Existing retries must
  remain resolvable after catalog edits. Do not reprice a previously created
  attempt or reset the existing browser pending-payment record.
- Keep `3dkid-online-checkout-v2` readable for unchanged legacy attempts. Use a
  separate versioned pending-session key for new color/combined attempts so an
  obsolete tab cannot overwrite their identity record either. Never copy an
  in-flight attempt into a new key and generate a replacement checkout identity.
  Return/retry handling locates the matching reference in the bounded supported
  records and applies the same revision/cart/paid checks. New cart persistence
  and pending-checkout storage must be tested together, including old-tab writes.
- Preserve revision-aware paid-only matching cart clear, failure retention,
  duplicate-submit suppression and explicit retry behavior. If an unsupported
  stored session cannot be safely read, retain the cart and show recovery; do not
  silently start another invoice or clear newer shopper edits.

### 6.3 Version-2 order snapshot

Continue string `optionsJson`; no historical backfill. New native option orders
store a server-created, bounded version-2 snapshot, for example:

```json
{
  "version": 2,
  "variantId": "opaque-combination-id",
  "dimensions": [
    {"kind":"COLOR","optionId":"color-group-id","valueId":"red-id","labelUa":"Червоний","labelEn":"Red","noteUa":null,"noteEn":null},
    {"kind":"SIZE","optionId":"size-group-id","valueId":"small-id","labelUa":"Маленький","labelEn":"Small","noteUa":null,"noteEn":null}
  ]
}
```

Unit price/quantity remain the actual immutable OrderItem columns; UAH remains
the existing order/payment currency. LEGACY can keep version 1; simple orders
continue NULL. Never regenerate historical labels or prices by joining current
variant rows. Retiring/editing choices changes no existing order snapshot.

Implement a bounded snapshot reader for v2, v1 and historical flat objects.
Unknown versions must not fall through to flattening arbitrary string properties
(which would expose IDs as labels). Update `orderSizeLabel` consumers deliberately:
Admin order detail and notification item presentation, with matching UA/EN labels.
Preserve existing notification event/escaping rules and frozen queued payloads;
do not resend historical notifications. Unknown/malformed snapshots display a
safe localized fallback without querying current product options.

## 7. Admin and customer UX plan

### Admin

- Two explicit Color/Size toggles produce the four native modes. Existing LEGACY
  products show current size editor and a deliberate conversion preview; ordinary
  edits do not convert them. Turning off a dimension previews retired combinations
  and cart impact; it does not automatically choose new prices or collapse rows.
- Product-scoped color and size editors reuse current UA/EN value/note conventions.
  IDs survive label edits and ordering. Reject duplicate normalized UA labels per
  dimension, duplicate IDs and out-of-product IDs. Labels are not identity.
- Show an explicit allowed-combination list: color, size, absolute price,
  availability, remove/restore. Single-dimension modes use the same rows. Never
  enable the full matrix automatically. An optional matrix preview can help add
  deliberate rows, but no implicit “all offered” checkbox default.
- Proposed safe bounds: 40 active values per dimension (retaining current size
  limit), 200 active/configured combination rows per product including unavailable
  rows, two selections per variant, 100-character labels and 500-character notes.
  Bound JSON/form payload size independently; reject overflow, never truncate.
  Retired history is not counted as active and is fetched separately/paginated.
- Keep rows usable as stacked cards on narrow screens; no mandatory wide 40×40
  matrix. Native controls, visible labels, keyboard remove/restore, descriptive
  availability state and focus to the first invalid row/field.
- Use current `AdminForm` and controlled size/gallery drafts. Field-addressed
  validation results (row ID + field), summary and localized business errors must
  preserve UA/EN descriptions, price strings, toggles, category, unsaved rows,
  gallery IDs/order, successful upload URLs and other product controls. No reset,
  remount keyed by error, or automatic product save on upload.
- Disable Save while uploading or submitting; retain double-submit guard. Known
  uniqueness/ownership/revision errors map to safe localized results; unexpected
  exceptions are sanitized, not dumped to Admin. A stale form must not silently
  overwrite configuration even when its gallery snapshot is unchanged.
- Removal means retirement for native options/variants. Historical order references
  retain existing safe archive behavior; no cascading orders/payments/history.

### Storefront

- Render only configured, nonretired dimensions; fixed order Color then Size.
  No automatic initial choice, even with one value. Require every applicable
  choice before Add. Disabled choices explain missing/unavailable combinations.
- Candidate choices come from the actual allowed rows compatible with the current
  selection. If changing a color invalidates an already chosen size, clear that
  incompatible size explicitly with localized feedback; do not substitute one.
  Allow changing either dimension without trapping the shopper in a dead end.
- Resolve displayed price from the exact row when selection is complete. Preserve
  the detail quantity stepper and all cart arithmetic/overflow guards.
- Cards retain one cart button and no quantity stepper. `requiresSelection` derives
  from mode (or LEGACY's actual sizes), not from available row count; option
  products navigate to detail. Keep unavailable products visible but disabled.
- Preserve primary/gallery image IDs, carousel arrows/swipe click separation,
  lightbox/keyboard focus/zoom, responsive layout and lazy reduced-motion-aware
  hover GIF. No variant-specific galleries or large variant/GIF preloading.
- Cart/drawer/checkout show both selected localized labels where applicable.
  Announce price/availability changes accessibly; localized “choose options”
  messages replace size-only wording where necessary, in centralized i18n only.

## 8. Additive SQL migration plan and read-only preflight

**Gate status: migration required, execution forbidden at Stage 1A.** This section
is a reviewed design-level plan, not final executable SQL. SQL trigger bodies,
catalog names, drift checks and disposable-database results require another review
after design approval and before any execution authorization. No migration file
has been created. Do not use `db push`, seed, data-conversion tools or `migrate dev`
against a real connection to prepare it.

### 8.1 Read-only preflight (future, separately authorized)

Use a confirmed read-only connection/transaction and bounded SELECTs only. Do not
run it in this stage. Collect aggregate counts and opaque IDs needing owner review;
exclude customer/order contact data and connection strings from reports.

1. Confirm exact project/branch/database/schema, PostgreSQL version, Production vs
   Preview consumers, current deployment SHAs, read-only role and backup/PITR.
   A Preview URL does not prove a separate DB. Independently verify all targets.
2. Inspect `information_schema.columns`, `pg_constraint`, `pg_indexes`, `pg_trigger`
   and migration history/catalog to compare actual Product/Option/Value/OrderItem
   definitions with baseline. Detect unexpected triggers, duplicate proposal names,
   schema drift, existing migration history and unsupported Prisma changes.
3. Inventory groups by product: exact names, group counts, explicit-priced values,
   NULL/zero/negative/out-of-range prices, labels/EN fallbacks, notes, duplicate
   normalized labels, orphan ownership, invalid/oversized IDs and legacy modifiers.
   Classify unambiguous simple / explicit-size / needs-owner-review, not by stock.
4. Count products, images, options/values, orders/items; count NULL/v1/flat/malformed
   snapshot shapes without rewriting them. Confirm required Product history FK and
   no unexpected delete cascades. Old historical data remains unchanged.
5. Measure largest group/product payload and query/index sizes to confirm proposed
   limits. Capture minimal catalog/configuration and historical-snapshot digests
   for before/after comparisons without exporting private order data.
6. Inventory every writer: current/old Production, Preview, imports, maintenance,
   seeds and direct SQL. Existing scripts such as `configure-size-prices.ts` and
   development fixture tools are not approved conversion jobs. `verify-size-editor`
   and older order-flow suites use database fixtures; do not run them merely
   because their names sound isolated.
7. Confirm no new objects/columns already exist and define lock timeout, statement
   timeout, maintenance/drain procedure and stop conditions. Any ambiguous product
   is excluded from conversion, not auto-corrected in preflight.

No current live count, catalog conversion list or isolation proof is claimed.

### 8.2 Proposed DDL operations, in order

Keep the repository's reviewed SQL-change convention (`prisma/changes`) for the
later artifact; do not introduce Prisma migration history implicitly on a database
previously managed by `db push`/approved SQL. A future switch to Prisma Migrate
requires a separately reviewed baseline, not a destructive reset.

Within a short, explicitly authorized schema transaction, after matching preflight:

1. Create `ProductOptionMode` and `ProductOptionKind` enum types with the values in
   section 4.1. No renames/drops or dependency upgrade.
2. Add Product.optionMode default LEGACY NOT NULL and variantRevision default 0
   NOT NULL; ProductOption.kind nullable; ProductOptionValue.retiredAt nullable;
   OrderItem.productVariantId nullable. Nullable additions have no business backfill.
3. Add unique keys `(ProductOption.productId,id)`, `(productId,kind)` and
   `(ProductOptionValue.optionId,id)` as proposed. Existing NULL kinds permit
   multiple historical groups. Do not impose uniqueness on old labels.
4. Create `ProductVariant` and `ProductVariantSelection`, all columns/types/defaults,
   composite keys/FKs/indexes exactly as section 4.1. Prisma CUIDs and `@updatedAt`
   are application-generated; SQL must not invent alternate IDs or update times.
5. Add the nullable OrderItem composite variant FK and its index. Keep the original
   OrderItem -> Product FK/referential actions unchanged. Use deferred NO ACTION
   where needed for selection -> group/value FKs so complete product cascades
   without historical orders finish before validation; variant -> selections and
   Product -> variants cascade, while used variants remain restricted by orders.
6. Add the following additional SQL constraints (illustrative names):

```sql
-- Proposal excerpts ONLY. No statement in this document was executed.
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_price_bounds"
  CHECK ("price" > 0 AND "price" <= 99999999.99);
ALTER TABLE "Product" ADD CONSTRAINT "Product_variantRevision_nonnegative"
  CHECK ("variantRevision" >= 0);
```

7. Install parent Product locking/identity guard functions and triggers, and the
   deferred combination-integrity validator described below. These are required
   additions beyond Prisma schema syntax. No email/HTTP/Blob calls in any trigger.
8. Assert catalog definitions, empty new tables, all products LEGACY/revision 0,
   all new nullable fields NULL, expected unchanged record counts and historical
   snapshot digests; commit only when all assertions pass. This does not convert
   products, rewrite orders, create combinations or change orderability/stock.

**Required SQL function/trigger contract for the later migration review:**

| Guard / affected table | Required behavior |
| --- | --- |
| Child-write parent barrier: ProductOption, ProductOptionValue, ProductVariant, ProductVariantSelection | Before insert/update/delete, derive old/new parent ownership, lock affected existing Product rows in sorted order, then validate. Reject ownership moves; allow cascade when the parent is being deleted. Writer still prelocks before children to avoid lock inversion. |
| Identity/retirement guards | Non-NULL kind is immutable; native values stay in their group; variant product/key/selection tuple is immutable. No individual hard deletion of persisted native values/variants. Whole-product cascade allowed only subject to existing order FKs. No native -> LEGACY downgrade. |
| Deferred validator on Product mode updates | At transaction end recheck every surviving nonretired variant for that product against final mode and active selected values. LEGACY/SIMPLE require none. Allows an unavailable option product with zero rows. |
| Deferred validator on variant/selection writes | Recheck every surviving affected variant's complete final selections/key, including retired rows; compare active shape to mode. Deleting/moving a selection cannot create an incomplete committed identity. Deleted variants from an allowed product cascade are skipped. |
| Deferred validator on option kind / value retirement changes | Recheck all variants that depend on that group/value; no active variant may select a retired value or untyped group. Nonretired but unavailable variants still require a structurally valid selection. |

The implementation must explicitly validate both affected old/new owners on any
rejected move attempt and handle cascades/zero-row operations without bypass.
Identity triggers cannot treat “has no orders yet” as permission to repurpose a
published variant. A database-only fixture suite must attempt false canonical keys,
duplicate tuples and cross-product writes, not just exercise the happy-path ORM.

CHECK/trigger semantics are additional SQL, not something Prisma client generation
can supply. [Prisma's unsupported-feature guidance](https://www.prisma.io/docs/orm/v6/prisma-migrate/workflows/unsupported-database-features)
requires retaining custom SQL for such features. Use the installed Prisma 5 toolchain
for eventual validation; do not copy newer-version partial-index syntax or add a
dependency upgrade. A bare `db push` is not the reviewed migration mechanism.

Existing-table DDL/index creation takes locks. The preflight must choose a brief
maintenance window based on real row counts; if OrderItem index construction is
too large, stop and propose a separately reviewed concurrent-index phase (outside
the DDL transaction), rather than silently changing this plan. No default migration
timeout, Neon branch identity or low traffic is assumed safe.

### 8.3 Deployment and rollback gates

| Gate | Required state / behavior |
| --- | --- |
| A — Owner architecture approval | Approve schema, SQL invariants, compatibility/price/mode policies and bounds. No DB execution permission is implied. |
| B — Implementation + isolated rehearsal | Build bridge readers/writers and snapshot/identity adapters; review final Prisma diff + executable SQL; test real disposable PostgreSQL constraints/locks and rollback. No Production credentials. |
| C — Infrastructure/schema approval | Verify target and writer/Preview isolation, backup, current baseline and schema drift; approve exact DDL + maintenance window separately. Schema first; new Prisma client must not run before its columns exist. |
| D — Bridge deployment | All products remain LEGACY. Current app can coexist with additive columns while its code is drained. Deploy mode-aware checkout, public projection, Admin fences, snapshots and retry adapters together. Drain old server-action/checkout/Admin/import writers across all deployments sharing the DB before conversion. |
| E — Explicit catalog conversion | Only separately reviewed product IDs/configuration, guarded transaction/revision; verify active carts and pending attempts. New product COLOR/SIZE toggles stay unavailable operationally until this gate. No conversion automatically at build/start/request. |
| F — Release verification | Automated matrix green; manual isolated UA/EN/mobile and pending-payment compatibility evidence; no cleanup activation or infrastructure changes bundled. |

An old server can price a new color-enabled product as simple because it ignores
optionMode; additive schema compatibility alone does not make mixed binary writers
safe. Preview deployments sharing the DB count as writers. Versioned public
responses do not protect against an old checkout endpoint. If draining/isolation
cannot be established, do not enable/convert native option products.

Rollback before any conversion: old application can run against the additive
schema; retain the new columns/tables, do not automatically drop or reverse them.
A failed DDL transaction rolls back as a unit. Rehearse trigger compatibility with
legacy writes, not just SELECT compatibility.

Rollback after native products/orders exist: use a **mode-aware bridge rollback
build**. Do not roll back to pre-1.8 checkout, copy prices into modifiers, delete
variants, drop new tables or restore an old database over real orders. If only an
old build is available, pause checkout/writes and disable native products through
a separately authorized safe procedure before any cutover; maintain handling of
existing Mono attempts/callbacks with a compatible service. Pausing new orders does
not authorize cancelling, repricing or deleting previous orders/invoices.

## 9. Future Batch 1.8.1 filament association

Reuse stable **COLOR ProductOptionValue.id** as the product's color-choice identity.
Do not encode a material name, hex code, spool number or filament ID into the
variant key. Label changes and future directory links must not change choice or
variant IDs. ProductOption.kind provides machine-readable COLOR classification.

In 1.8.1, a nullable directory FK or an explicit mapping entity can associate a
COLOR value with a central filament entry. Many products may share that entry;
product labels remain intentional customer-facing snapshots. If several materials
offer the same displayed color, decide whether mapping is one-to-one or a separate
eligibility relation before adding it. Do not duplicate “color” into two competing
product-choice identities or add an unconstrained string filament ID now.

No filament table, FK, inventory, availability propagation or consumption logic in
1.8. Filament-linked orderability and lock coordination must be separately designed
when global filament edits can affect multiple products. A future relation cannot
make client-side stock or a color name authoritative for current availability.

## 10. Implementation breakdown after approval

| Step | Planned change / acceptance boundary |
| --- | --- |
| 1. Schema artifacts | Final additive Prisma/SQL, catalog assertions, read-only preflight and rollback runbook; no implicit db push or automatic conversion. |
| 2. Domain layer | Typed option kinds/modes, bounded canonical selection keys, immutable identity, price/availability resolver and v1/v2 snapshot reader. Preserve legacy helper behavior behind mode dispatch. |
| 3. Admin transactions | Replace native size-only mutation path with revision-checked generic sync, explicit retire/restore and parent locks; retain media transaction order/gallery snapshot and safe delete/archive behavior. |
| 4. Server projections | Extend detail lookup, mode-aware card summaries and catalog price sorting/filtering, bounded versioned reconciliation with compatibility projection. |
| 5. Cart/checkout | New selection union/persistence adapter, separate-line/merge rules and both-label UI; extend locked authoritative pricing and request identity serializer without changing Mono/COD state machines. |
| 6. Admin/customer UI | Controlled dimensions/combinations editor, field errors, UA/EN; detail required choices/price/quantity; one card cart button and unchanged gallery/GIF. |
| 7. Regression + rollout | Isolated coverage below; approved disposable PG rehearsal; bridge deployment/drain; deliberate reviewed conversions and separate release approval. |

Expected affected runtime areas are the files audited in section 2, their call
sites in home/catalog/product pages, `src/types/index.ts`, centralized i18n,
checkout identity/session **selection serialization only**, and snapshot consumers.
No changes are planned to provider APIs, Mono financial transitions, COD accounting,
Nova Poshta, scheduling, media storage or About content. No implementation was made
in any of these files at this gate.

Media-lifecycle compatibility: new tables contain IDs/labels/prices, no new asset
URLs. ProductImage/gallery/category/hero/About reference protection stays intact;
product Save/delete retain the existing media lock/transaction/30-day retirement
protocol. Do not enable cleanup, alter scope approval or infer Production/Preview
isolation. Cleanup activation remains blocked for the independently documented
infrastructure/writer/QA reasons.

## 11. Automated coverage and manual QA gates

All future tests use mocked providers/Blob/notifications, local storage fixtures
and a newly created disposable PostgreSQL cluster where database semantics are
needed. No default `.env` database, real product/order or external service. The
schema rehearsal needs its own fixture runner/guard; do not casually expand the
unrelated payment-release rehearsal. No migration/test execution against Neon.

| Area | Required cases and assertions |
| --- | --- |
| Mode matrix | Simple, LEGACY-simple, LEGACY-size, native SIZE, COLOR and COLOR_SIZE; no implicit mode from empty rows; no selection required for simple; every required choice for others. |
| Sparse combinations | Missing Red/Medium, configured unavailable pair, globally nonorderable/inactive product, all rows unavailable/retired and zero rows; no Cartesian expansion/base-price fallback. |
| Identity / DB integrity | Same tuple cannot duplicate even retired/unavailable; canonical key cannot be forged; one value per kind; foreign product/group/value rejected; tuple/kind/owner immutable; labels/prices edits keep IDs. |
| Money and limits | Absolute combination price, decimals/rounding rejection, forged client prices, exact current server price/quote mismatch, fractional/nonfinite/Int overflow quantities, line/total overflow and 100-line bound. |
| Legacy carts | v0/v1 persisted simple and size lines hydrate without images/readiness; preserve IDs/quantity/labels, unchanged size-only wire after conversion, same-size merge, different colors/sizes separate, malformed/unknown union never simple, unresolved labels unavailable; v2-key one-time import, empty-cart import marker, storage failure, obsolete-tab writes and pending-session preservation. |
| Reconciliation | Bounded batched lookup; changed price review; removed/deleted/inactive/unavailable combination keeps line; placeholders before verification/offline; errors block checkout; out-of-order results cannot overwrite edits; no silent option substitution. |
| Checkout atomicity | Actual two-session PG race: Admin price/availability/mode/value retirement vs new COD/Mono order snapshot. Prove parent barrier for insert/delete/price-only child writers and deadlock rollback; no accepted mixed tuple/price state. |
| Retry compatibility | Existing simple/size payload hash and browser key goldens unchanged; v1 pending attempt replay after product conversion/retirement, color and quantity changes produce different identities; no second invoice; concurrent duplicate requests winner-only behavior; paid-only matching clear/newer cart retained. |
| History | v2, v1 and historical flat snapshots in UA/EN; price/labels remain after edits/retirement; nullable old FK unchanged; unknown/malformed snapshot bounded fallback; queued notification payloads not rewritten/resubmitted. |
| Variant lifecycle | Add, rename, edit price, disable, retire, re-enable original tuple, size -> combined -> size and whole-product deletion without orders. Protected order dependency blocks physical deletion and supports archive; no history cascade. |
| Admin preservation | Missing labels/prices, duplicate tuple/slug, forged IDs, stale revision, network and server errors retain ALL unsaved form/gallery/upload state; field-specific focus/summary; untouched LEGACY sizes preserved; double submission blocked. |
| Localization / accessibility | Centralized UA/EN key parity, EN fallback, escaped labels/notes/snapshots, Color/Size accessible labels, keyboard controls, availability/price announcements, disabled choices. |
| Responsive / media | Narrow/mobile and desktop editor, option controls and cart/drawer/checkout; one card cart button/no stepper; detail quantity; carousel arrows/swipe click separation, thumbnails/lightbox/zoom/focus/Escape, GIF/reduced motion and no eager gallery loads. |
| Media regression | Shared gallery/category/hero/About URLs still protected, lock order retained, unchanged primary IDs; cleanup disabled and no live Blob operations. |
| Schema rollout / rollback | Additive DDL on baseline clone, failures roll back, legacy writes compatible before conversion, explicit conversion retains IDs, trigger introspection assertions, bridge rollback retains new orders and data; old-writer deployment blocks conversion. |

Reuse/extend relevant isolated suites: `verify-cart.ts`,
`verify-product-cart-ux.tsx`, `verify-checkout-cart.ts`,
`verify-checkout-acceptance.ts`, `verify-checkout-render.ts`,
`verify-batch17-availability.ts`, `verify-unified-catalog.ts`,
`verify-product-media.ts`, `verify-media-lifecycle.ts`, and existing responsive,
Admin responsive and drawer fixtures. Port the useful older `verify-size-editor.ts`
and order-flow DB scenarios into an explicitly isolated fixture runner; they must
not inherit a live DATABASE_URL. Add focused combination/schema tests rather than
tests that merely mirror implementation.

Before eventual release: Prisma syntax/client/DDL drift checks, TypeScript,
ESLint, isolated production build and `git diff --check`, plus disposable PG
constraint/lock tests. Browser tests establish fixture behavior; live integration
and physical-device evidence remain separate. Append new Batch 1.8 QA scenarios at
implementation time; do not mark any of existing QA-001..QA-017 PASS without real
evidence. Recheck the existing gallery, form, cart and media scenarios after variants.

## 12. Risks, required owner approvals and unresolved evidence

Approve these recommendations explicitly before implementation:

1. **Schema:** two generic combination tables, nullable typed group kind, product
   mode with LEGACY bridge, revision token, value retirement, optional order variant
   FK, SQL parent-lock/identity guards and deferred integrity validation.
2. **Compatibility:** existing simple/size wire identity retained, combination IDs
   independent from size IDs; separate v2 cart storage with one-time legacy import
   and an old-tab reload/recovery policy; manual reviewed per-product conversion;
   no automatic reinterpretation of old modifiers or missing colors. Retire/restore
   identities rather than physically deleting native individual variants/values.
3. **Business policy:** positive absolute UAH combination prices, explicit required
   choices, unavailable pairs visible disabled, no implicit cross product, and no
   base-price fallback in native option modes. Approve hiding global oldPrice for
   native option products pending a future compare-price design.
4. **Admin bounds/UX:** 40 active values per dimension, 200 combination rows,
   stacked mobile editor, explicit dimension-change review and stale-editor errors.
   If real catalog needs exceed these bounds, revise before implementation.
5. **Rollout:** schema-first bridge then old-writer drain/isolation before any
   native-mode enablement; maintenance/preflight/final SQL approvals are separate.
   Only a mode-aware rollback is safe after adoption. No DB execution authorized now.
6. **Filament boundary:** stable COLOR value identity, later optional association;
   actual filament cardinality/material substitution/availability remains 1.8.1.

Missing evidence before an eventual release: live schema/catalog classification,
all database consumers/deployed writer versions, Production/Preview DB isolation,
DDL lock duration, PostgreSQL constraint/lock rehearsal and real manual QA. None
is inferred from historical report counts, a Preview URL or a successful build.
Production/Preview Blob isolation and cleanup activation remain separately BLOCKED;
variant work grants no permission to change cleanup settings or delete assets.

## 13. Stage 1A verification record

- Git baseline fetched/verified and feature branch created from the exact approved
  SHA; initial tree clean. No pre-existing changes were overwritten.
- Source/report review completed; all 17 deferred entries still Pending Manual QA.
- Focused verification results:

  | Check | Stage 1A result |
  | --- | --- |
  | `tsx scripts/verify-cart.ts` | PASS — actual cart/store with isolated persistence and mocked lookup; size IDs, merging, quantities and limits |
  | `tsx scripts/verify-checkout-cart.ts` | PASS — isolated retry identity, failure/pending retention, paid-only matching clear and newer-cart protection |
  | `tsx scripts/verify-checkout-acceptance.ts` | PASS — 15 existing acceptance categories, mocked database/Mono/notifications; no real effects |
  | Proposed Prisma additions merged into a temporary ignored candidate, installed Prisma 5.22 `validate` | PASS — schema syntax/relations only, dummy loopback DATABASE_URL override, no database connection; actual schema untouched and temporary proposal file removed |
  | Deferred QA count | 17 Pending Manual QA, register unchanged |
  | Tracked and new-document whitespace checks | PASS — `git diff --check` and no-index check of this untracked document |

  The first three suites could not start under the Windows sandbox's
  `uv_os_get_passwd` restriction; approved reruns outside it passed. The schema
  validator succeeded; removal of its empty ignored temporary directory encountered
  a Windows busy-directory error, after its proposal file had been removed.
  These checks validate baseline behavior and proposal syntax, **not** the new
  unimplemented SQL functions, migration, UI or variant behavior. No new automated
  test is presented as an implemented feature or completed manual QA.
- No Prisma schema/migration/dependency/runtime modifications. No full production
  build is required for this documentation-only gate; future implementation must
  complete the full validation matrix above.
- No commit, push, merge, deploy, SQL/database connection, real payment/order,
  notification, upload/delete or environment change. Production/main, Neon,
  Cloudflare and Vercel settings untouched. Cleanup remains disabled by default in
  code; external environment values were not inspected or changed.

**STOP: obtain architecture/schema approval. Do not begin implementation or execute
any schema/data conversion from this document automatically.**

## 14. Stage 1A.5 independent verification — 2026-11-17

### Disposition and evidence boundaries

**Production migration/native activation: BLOCKED. Stage 1B has not started.**
Corrected review DDL and compatibility contracts now have local execution evidence.
Native application readers/writers, UI and serializers remain unimplemented. A
passing review fixture is not a passing native storefront.

Preserved the Stage 1A document, branch and baseline. The actual
`prisma/schema.prisma`, all `src` files, dependencies, existing SQL changes and the
17-entry deferred QA register are unchanged. DDL ran only in newly initialized
LOCAL PostgreSQL 18.7 clusters with synthetic data, on explicit loopback ports;
each owned cluster was stopped. No Neon connection or existing database was used.

The owner reports a Neon snapshot and a readable PostgreSQL 18 custom dump with
14 tables. **A full restore of that archive is NOT TESTED.** Our 14-table baseline
was generated from the pinned repository schema, not the owner's dump. It does not
prove backup completeness, recoverability or live schema equality.

### Six-gate verification matrix

**PASS** means executed evidence within the stated scope; **FAIL** means a
reproduced defect; **BLOCKED** means missing required evidence/authorization;
**NOT TESTED** means work not performed. Negative cases are intentionally asserted
by tests; a green runner does not erase a known FAIL.

| Gate | Result | Evidence and limits |
| --- | --- | --- |
| 1 — Existing products | **PASS** | Current simple/size rendering, prices, IDs, merging and v1/flat readers passed. Actual `syncProductSizes` ran on expanded disposable PG: retained IDs/prices, null-price rows and disable behavior. Pre-expansion order snapshots survived unchanged. No live catalog audit or implicit conversion. |
| 2 — PostgreSQL / Prisma | **PASS, corrected review artifacts only** | Prisma 5.22 syntax/relations, PG18 DDL/guards/rollback, empty relational diff and two-session locks passed. Original deferred-COMMIT-only error propagation is a proven FAIL; explicit flush correction passed. Application integration of that barrier is **NOT TESTED**. |
| 3 — Prices / availability | **FAIL for current catalog consistency** | Catalog sorts by base price while displaying minimum configured size price. Counterexample reproduced. Native SQL price/availability/base-fallback fences and locks passed. Corrected reference rules passed; native application projections/quotes are **NOT TESTED**. |
| 4 — Cart / orders / Mono | **FAIL if current code is reused for native variants** | Current hashes collide for different colors; normalization strips combination selections; current v1 reader prints a v2 variant ID. Legacy retry/hash/cart/snapshot regressions passed. Corrected reference contracts and SQL v2 immutability passed; native bridge replay/return integration is **NOT TESTED**. |
| 5 — Deployment / rollback | **BLOCKED** | Additive rollback executed locally; cutover and post-adoption rollback reviewed. Full backup restore, live schema/consumer preflight, DB/environment topology and writer drain remain unverified. No deployment authorized/performed. |
| 6 — Filament boundary | **PASS, identity design scope** | Synthetic color rename preserved value/variant identities and historical text. No translated label enters the key. Future optional directory association remains additive; no filament/inventory code introduced. |

### Findings and corrections

| ID | Finding | Required correction and verification |
| --- | --- | --- |
| F1 — Critical | Installed Prisma 5.22 resolved an interactive transaction containing an invalid deferred combination without throwing. Follow-up SELECT found zero inserted products: PostgreSQL had rolled back. Commit-only error handling could falsely report Save success/start post-save effects. | **Final SQL command in every future write callback: `SET CONSTRAINTS ALL IMMEDIATE`.** Invalid Save/update then rejects inside the callback; previously saved fields remain intact. Reproduced on multiple fresh clusters. No general claim about every Prisma deferred error is made. |
| F2 — High | Parent locks do not detect stale editors if a child-only writer forgets an application revision increment. | SQL maintains a monotonic epoch on Product/child writes; multiple increments are intentional. Application compares once under lock, never assigns/increments it, reloads final epoch. Arbitrary reset/exhaustion reject. Child-only mutation invalidating the old editor was executed. |
| F3 — High | Default LEGACY alone does not prevent old checkout code inserting a converted product at base price without a variant FK. | Native OrderItem guard requires owned variant FK, matching current price, mode, active/orderable product, availability and exact v2 snapshot. Old-shaped native insert fails; existing NULL-FK history remains. Writer drain is still required. |
| F4 — High | Actual server AND browser payment identity omit colors. | Preserve exact simple/size JSON identity material. Use tagged combination identity and shared canonical selection serializer. Actual collision and distinct reference hashes were executed. Native retry integration remains Stage 1B work. |
| F5 — High | Actual normalizer ignores `selection`, reconstructs product-only identity and merges two color lines into one simple line. Same-key envelope versioning cannot protect against an obsolete tab. | Separate cart/pending namespaces, unchanged pure-size wire, one-time import marker and no dual writes. Reference tests cover old-tab writes, empty cart, quantities/storage failure. Refuse partial migration when normalization would drop selections: 101 legacy lines must not silently truncate; retain source and show recovery. |
| F6 — High | Current `orderSizeLabel` falls through to flat parsing for v2 and exposes variantId as a label. | Explicit bounded v2/v1/flat dispatcher; unknown versions fail safely. SQL freezes native captured fields and checks dimension IDs AND bilingual labels/notes against locked records on insertion. No historical backfill. |
| F7 — Medium | `price_asc` / `price_desc` sort by Product.price; card output calls `startingPrice`. A base-1 / size-999 product sorts before base-100 / size-100. | Record current mismatch without unrelated source changes. Native sorting/display must share effective-price semantics and deterministic tie-breaker. Owner approval needed before broadening legacy behavior. |
| F8 — Medium | Prisma relations can load through multiple SELECTs. Outside checkout, Read Committed may combine old mode with new rows/prices. | Native DTOs need one SQL snapshot: one statement or bounded read-only Repeatable Read transaction. Sort/page using the same projection as cards. Do not lock the entire catalog. Actual bridge projection is NOT TESTED. |
| F9 — Medium | Typing a legacy group does not trigger checks on its pre-existing values; malformed old IDs could enter canonical keys. | Deferred checks validate all typed values, including unused/pre-existing IDs and label/note bounds. Bad conversion rejects atomically; untyped LEGACY data is not reinterpreted. |
| F10 — Capacity | Full-product validation on every revision touch/selection row would repeatedly rescan the matrix. | Product structural trigger runs on mode updates; variant/selection checks scope to affected variant; group/value changes validate structure. No spoofable GUC cache. Final 20×10 / 200-combination fixture committed in **630 ms locally**, not a Production SLA. |

PostgreSQL rounded `1.005::numeric(10,2)` to 1.01 in execution. SQL bounds cannot
recover the original precision after coercion. The bridge must validate canonical
price input before database coercion, using exact minor-unit parsing; zero/NaN,
out-of-range prices and arithmetic overflow remain rejected. See
[PG18 numeric semantics](https://www.postgresql.org/docs/18/datatype-numeric.html).

### Final review artifacts and SQL limitations

- [Complete proposed schema](review/batch-1.8-variants.prisma).
- [Exact proposed Prisma diff](review/batch-1.8-variants.prisma.diff).
- [Additive DDL and SQL-only guards](review/batch-1.8-variants.sql).

Still exactly two models/two enums/five columns from section 4. The diff includes
a review-only warning comment; the actual application schema is untouched. No
ProductColor/ProductSize duplication, filament model or modifier activation.

DDL prominently states **NOT APPROVED FOR PRODUCTION EXECUTION** and refuses to
run without a disposable-review database name, loopback server address and local
fixture sentinel. Removing that guard requires a separately reviewed execution
artifact and authorization. The sentinel prevents accidents; it is not a security
role. No owner backup is loaded by the runner.

SQL-only safeguards beyond Prisma representation:

1. Positive finite bounded prices, bounded variant IDs and nonnegative epoch.
2. Composite ownership/unique keys; deferred NO ACTION selection -> group/value
   FKs allow complete product cascades without protected history.
3. Parent locks, database-maintained epoch, immutable identity/ownership/kind,
   retirement-only individual removal and no native -> LEGACY downgrade.
4. Deferred key/mode/retirement/typed-value checks and explicit application flush.
5. Native insertion fence and immutable v2 order capture; original Product history
   FK and old NULL variant references preserved.

Functions use invoker rights and qualified tables, no external I/O or automatic
conversion. Existing media advisory lock must precede Product locks in application
writers. Child-first arbitrary SQL can deadlock and must roll back; compliant
writers prelock sorted parents before children. Actual bidirectional lock waits
were observed, consistent with [PG18 lock rules](https://www.postgresql.org/docs/18/explicit-locking.html)
and [constraint triggers](https://www.postgresql.org/docs/18/sql-createtrigger.html).

Prisma relational diff does not prove CHECK/trigger/function/deferrability parity;
PG assertions separately exercise them. App 40/200 payload limits remain to be
implemented. Roles/writers must be restricted: an owner disabling triggers,
TRUNCATE/CASCADE or arbitrary privileged SQL can bypass invariants. No actual
Production role/trigger/version/isolation configuration was inspected here.

### Execution evidence

```text
node scripts/rehearse-batch18-variants.mjs
tsx scripts/verify-batch18-architecture.ts
```

The runner pins baseline schema, creates a new random OS-temporary cluster and
database, clears inherited PG settings, uses explicit loopback URLs and validates
its marker/data directory before tests. Schemas are copied to temp for CLI work.
Only its owned cluster is stopped; synthetic files remain for inspection.

| Check | Result |
| --- | --- |
| Toolchain/schema | PASS — PostgreSQL 18.7; Prisma 5.22 syntax/relations; no dependency change |
| DDL | PASS — unapproved execution guard, injected transaction error rolls back new types/tables/columns to 14-table baseline, successful expansion, empty relational Prisma diff |
| `verify-batch18-postgres.ts` | PASS — **20** groups: pre-expansion v1/flat orders; actual legacy size writer; four modes; identity/ownership; bad COMMIT reproduction; explicit flush/update rollback; retirement/restore; money/availability; conversion IDs; immutable v2; history FK/archive; revision and matrix |
| Actual concurrency | PASS — separate sessions **6392 / 13008**; observer saw PG Lock wait. Checkout SHARE blocks child price update and preserves original order price. Reverse direction waits then reloads committed unavailability. |
| `verify-batch18-architecture.ts` | PASS — **8** groups; native-reuse FAILs intentionally reproduced, not counted as completed runtime features |
| `verify-cart.ts`, `verify-checkout-cart.ts` | PASS — existing persistence/line merge, retry identity/retention and paid-only matching clear |
| `verify-product-cart-ux.tsx` | PASS — 18 groups: hydration/images/offline/reconciliation/review/limits/checkout/slug/UA/EN |
| `verify-checkout-acceptance.ts` | PASS — 15 mocked acceptance categories including retries/idempotency; no real invoice/notification |
| `verify-checkout-render.ts`, `verify-batch17-availability.ts`, `verify-unified-catalog.ts` | PASS — existing simple/size prices, option-first cards, UA/EN, availability and hover behavior; sorting counterexample remains valid |
| `verify-media-upload.tsx`, `verify-media-lifecycle.ts`, `verify-about-content.tsx` | PASS — 8 / 28 / 10 groups; mocked storage, shared gallery references and content preservation |
| `verify-cart-drawer.ts` | PASS — UA/EN 390/1280 actual React/Zustand; keyboard/readiness and image fallback |
| `verify-cart-drawer.ts <Edge-path> --gallery-admin` | PASS — six UA/EN 320/390/1280 runs: real React reset reproduction, failed Save/network preserves fields/uploads, gallery/lightbox/GIF/About/archive; services mocked |
| `verify-admin-responsive.ts --batch175b` | PASS — 154 existing Admin viewport renders; native editor not implemented |
| TypeScript / ESLint | PASS — noEmit/nonincremental and repository lint |
| Whitespace / source boundary | PASS — final checks; actual application/schema/dependencies/deferred QA unchanged |

Harness corrections during development: Unicode fixtures moved from Windows CLI
arguments to UTF-8 files; a shell-corrupted snapshot literal was corrected; browser
invocation retried with its required Edge path. Those fixture failures are not
Production findings. The deferred-COMMIT behavior is a real architecture finding.

**NOT TESTED:** native application bridge/UI, end-to-end native Mono retry/return,
deployment/drain, live catalog classification, physical devices, full backup restore
and Production performance. Full Next build was not repeated for review-only
artifacts/tests; app/runtime schema did not change. Database-connected old suites
were not run on default project URLs; safe coverage used actual helpers on the
private cluster and isolated existing regressions instead.

### Cutover, rollback and approvals

Reviewed sequence for separately authorized later execution:

1. Prove full restoreability on an isolated target; approved read-only live drift/
   target/consumer preflight. Backups alone grant no Production SQL permission.
2. Separately approved additive schema, all products LEGACY, no business backfill.
   Failed DDL rolls back; successful expansion keeps old app compatible while no
   native configurations exist.
3. Mode-aware bridge with revision checks, final constraint flush, snapshot
   dispatcher, consistent public projections, legacy hash goldens and versioned
   storage/return adapters. Drain old Admin/checkout/import writers everywhere.
4. Verify Production/Preview DB topology/deployment versions; do not assume
   independent databases. Native edits without expected revision fail closed in
   the bridge. SQL guards alone cannot stop stale old ordinary-field overwrites.
5. Separately authorize native creation; then only reviewed legacy IDs/configuration
   convert under locks. Preserve size IDs; no modifier inference or automatic
   startup/request/build conversion.
6. Approved smoke evidence for exact SHA; fixtures do not establish live QA.
   Cleanup enable/scope and infrastructure settings remain unchanged.

Before native data: compatible old application rollback may retain additive
schema; never drop additions automatically. After native products/orders: only
mode-aware bridge rollback with v2 reader/storage/retry support is safe. Retain
schema, variants, frozen orders and completed payments. An old-only fallback needs
a separately authorized write/ordering pause; no repricing/cancelling old attempts,
history deletion or restoring an earlier backup over new orders.

**Stage 1B local implementation prerequisites:** owner approval of corrected
schema/SQL, DB-managed epoch, mandatory constraint flush, native insertion/snapshot
fence, storage migration/recovery policy, bounds and price/mode behavior. Integrate
these into actual actions/readers and add native end-to-end tests. The reference
module in `scripts/fixtures` is not approved production implementation.

**Production migration/activation blockers:** full archive restore evidence;
authorized live drift/target checks; verified environment/DB/writer inventory;
completed bridge; native regressions/manual evidence; final execution artifact,
maintenance and rollback approval. Local DDL success authorizes none of these.
Independent Blob cleanup activation blockers also remain unchanged.

### Changed deliverables and state

Eight combined Stage 1A / 1A.5 files, unstaged/uncommitted/unpushed:

1. `docs/batch-1.8-variant-architecture.md` — preserved and extended report.
2. `docs/review/batch-1.8-variants.prisma` — complete review schema.
3. `docs/review/batch-1.8-variants.prisma.diff` — exact proposal diff.
4. `docs/review/batch-1.8-variants.sql` — guarded review DDL.
5. `scripts/fixtures/batch18-variant-reference.ts` — nonproduction contract.
6. `scripts/verify-batch18-architecture.ts` — compatibility counterexamples/fixtures.
7. `scripts/rehearse-batch18-variants.mjs` — owned local-cluster runner.
8. `scripts/verify-batch18-postgres.ts` — actual integrity/concurrency tests.

No application implementation, Production/Neon operation, environment setting,
Vercel/Cloudflare change, Blob activation, payment or notification occurred.
Production/main refs unchanged; cleanup remains disabled by default in code
(external settings not inspected). All **17 Pending Manual QA** entries remain
untouched. **STOP after Stage 1A.5.**
## Combined UI/safety addendum — 2026-11-22

The active Prisma/review SQL now additionally includes nullable Product.materials,
materialsEn and materialsDivider. These are display metadata; they do not change
the approved combination identities, absolute prices or immutable order snapshots.
Category_parentId_fkey is transactionally strengthened from SET NULL to RESTRICT;
Product.category's existing RESTRICT action is explicit in Prisma. No automatic
materials extraction or product conversion is introduced. The pre-addendum complete
schema and SQL are archived under docs/review/archive/batch18-before-addendum.
See [combined implementation and test evidence](batch-1.8-addendum-ui-safety.md).
