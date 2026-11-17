# Deferred manual QA — 3D Kid

All entries below are **Pending Manual QA**. No live/manual evidence was collected
for these scenarios in Batch 1.7.5C. Automated fixtures, screenshots and successful
deployments are separate evidence; they do not establish live integration success.

Release references:

- **R175:** Batch 1.7.5, `794e99d0a0fe5572aee330d561e7e2f116090425`.
- **R175A:** Batch 1.7.5A safety correction, `e7f0750ebd08efb68603d0a67bb1f5e3d0cd74ab`.
- **R175B:** Batch 1.7.5B including editable About, `d1ac3b153a9d956e400d541e6c9110519956c29e`.

R175B is the current release baseline for future execution. Record the actual
deployment SHA tested, environment, browser/device, tester and time with each
evidence entry. Do not put credentials, customer/order data, private database
addresses or unredacted environment screenshots in this register.

Use a separately authorized, isolated nonproduction database and Blob store for
upload/Save/delete/cleanup exercises. A Preview URL alone is not isolation proof.
Until the [activation blockers](batch-1.7.5c-blob-cleanup-readiness.md#activation-blockers-and-operator-checklist)
are resolved, keep cleanup disabled. This register grants no authorization to
create test orders/payments, change Production data, enable cleanup or delete files.

## QA-001 — Multiple product photo uploads and persistence

- **Batch / release:** 1.7.5B / R175B (`d1ac3b1`).
- **Scenario / expected:** Select several JPG/PNG/WebP files, inspect progress/previews and explicitly Save. Reloading the test product preserves URLs and image count; upload alone does not save. Verify the ten-photo/5 MB-per-photo limits and partial-failure retry without losing successful URLs.
- **Prerequisites:** Isolated Admin test account, disposable product, independently verified nonproduction DB/store and callback reachability; small known files and oversized/unsupported fixtures.
- **Status:** Pending Manual QA.
- **Evidence / tester / time / deployment / device:** _Not recorded._
- **Findings / follow-up:** _Not recorded._

## QA-002 — Primary selection, ordering and stable image IDs

- **Batch / release:** 1.7.5B / R175B (`d1ac3b1`).
- **Scenario / expected:** Reorder photos and choose a primary image; Save/reload preserves order, alt text and original image IDs. Cards, detail thumbnails and reconciled cart use the intended primary. A stale second editor cannot overwrite newer gallery changes.
- **Prerequisites:** QA-001 fixtures with at least three saved photos; authorized read-only nonproduction record inspection and two editor tabs.
- **Status:** Pending Manual QA.
- **Evidence / tester / time / deployment / device:** _Not recorded._
- **Findings / follow-up:** _Not recorded._

## QA-003 — Gallery removal and replacement

- **Batch / release:** 1.7.5A + 1.7.5B / R175A (`e7f0750`), R175B (`d1ac3b1`).
- **Scenario / expected:** Remove/replace a saved image and cancel an unsaved change. Only successful Save changes records; surviving IDs remain stable. Shared gallery/category/hero/About references prevent retirement registration. No actual deletion occurs with cleanup disabled.
- **Prerequisites:** Isolated shared-URL fixtures; cleanup disabled; authorized nonproduction record/ledger inspection without modifying markers.
- **Status:** Pending Manual QA.
- **Evidence / tester / time / deployment / device:** _Not recorded._
- **Findings / follow-up:** _Not recorded._

## QA-004 — Catalog controls and responsive swipe

- **Batch / release:** 1.7.5B / R175B (`d1ac3b1`).
- **Scenario / expected:** Arrows/keyboard activation/swipe change photos without product navigation; a normal link click still opens details. Vertical scrolling remains natural, layout fits narrow/desktop screens and only the selected photo loads. One cart button remains; no quantity stepper appears.
- **Prerequisites:** Products with one/multiple images and selectable sizes, desktop browser, touch device and browser network inspector.
- **Status:** Pending Manual QA.
- **Evidence / tester / time / deployment / device:** _Not recorded._
- **Findings / follow-up:** _Not recorded._

## QA-005 — Detail thumbnails and lightbox

- **Batch / release:** 1.7.5B / R175B (`d1ac3b1`).
- **Scenario / expected:** Thumbnails, previous/next, mobile swipe and zoom/pan work. Arrow keys navigate; Escape closes; focus stays inside the dialog and returns to its trigger. Background scrolling is locked only while open. Enlarged assets load on demand; broken media falls back safely.
- **Prerequisites:** Multiphotograph product, desktop keyboard, touch device, screen reader and a deliberately broken nonproduction image URL.
- **Status:** Pending Manual QA.
- **Evidence / tester / time / deployment / device:** _Not recorded._
- **Findings / follow-up:** _Not recorded._

## QA-006 — Hover animation with gallery browsing

- **Batch / release:** 1.7.5 + 1.7.5B / R175 (`794e99d`), R175B (`d1ac3b1`).
- **Scenario / expected:** GIF and animated WebP load only on relevant hover/keyboard focus. Manual navigation exposes photographs without an animation overlay conflict. Touch/reduced-motion users receive static imagery; missing animations leave the photo usable.
- **Prerequisites:** Separate GIF/WebP fixtures, multi-photo product, reduced-motion control and network inspector.
- **Status:** Pending Manual QA.
- **Evidence / tester / time / deployment / device:** _Not recorded._
- **Findings / follow-up:** _Not recorded._

## QA-007 — Category and three hero uploads

- **Batch / release:** 1.7.5B / R175B (`d1ac3b1`).
- **Scenario / expected:** Each visual field supports upload/manual URL/preview, type/size errors and failed-upload recovery. Save is blocked while uploading. Explicit Save/reload persists URLs; other hero/social/font/About values remain intact. Shared assets are not retired. No upload control appears on social links.
- **Prerequisites:** Verified isolated DB/store/Admin, disposable category and content fixture, callback reachability including deployment protection.
- **Status:** Pending Manual QA.
- **Evidence / tester / time / deployment / device:** _Not recorded._
- **Findings / follow-up:** _Not recorded._

## QA-008 — Admin validation and draft preservation

- **Batch / release:** 1.7.5B / R175B (`d1ac3b1`).
- **Scenario / expected:** Missing/invalid fields, duplicate slug, server/network failure and retry preserve bilingual text, prices, checkboxes, options, category, uploaded URLs and order. Field errors/summary are localized, first invalid field receives focus, and repeated Save is guarded. Category/content forms follow the same behavior.
- **Prerequisites:** Disposable records, known duplicate slug, controlled nonproduction failure/network tools; do not reload an unsaved form to test error preservation.
- **Status:** Pending Manual QA.
- **Evidence / tester / time / deployment / device:** _Not recorded._
- **Findings / follow-up:** _Not recorded._

## QA-009 — About content, languages and SEO

- **Batch / release:** 1.7.5B Stage 1.5 / R175B (`d1ac3b1`).
- **Scenario / expected:** Unconfigured values exactly match original UA/EN copy. Independent saved overrides preserve paragraphs/line breaks and escape HTML. Language switching selects matching body/title/description/Open Graph values. Save becomes visible after refresh without deployment; failed Save retains About and hero drafts.
- **Prerequisites:** Isolated Site Content fixture, both locales, page metadata inspector and original fallback copy for comparison.
- **Status:** Pending Manual QA.
- **Evidence / tester / time / deployment / device:** _Not recorded._
- **Findings / follow-up:** _Not recorded._

## QA-010 — Product deletion and historical-reference archival

- **Batch / release:** 1.7.5A + 1.7.5B / R175A (`e7f0750`), R175B (`d1ac3b1`).
- **Scenario / expected:** An unreferenced disposable product deletes normally. A prepared historical-order fixture is protected with an understandable message and explicit Hide action; archival changes only activity/orderability and refreshes the list. Orders/payments/shipping/history and shared media remain intact. Unknown errors reveal no internals.
- **Prerequisites:** Independently isolated pre-existing synthetic order/product fixtures; no real order/payment creation. Do not delete or modify the reported historical «Гудзики Веселка» record to test this case. Its actual Production dependency remains unverified.
- **Status:** Pending Manual QA.
- **Evidence / tester / time / deployment / device:** _Not recorded._
- **Findings / follow-up:** _Not recorded._

## QA-011 — Cart reconciliation after product/media changes

- **Batch / release:** 1.7.5 + 1.7.5A + 1.7.5B / R175 (`794e99d`), R175A (`e7f0750`), R175B (`d1ac3b1`).
- **Scenario / expected:** Persist a cart, then change test prices/images/sizes/activity/orderability or remove a test product. Valid lines refresh authoritatively; changed totals require review. Invalid selections remain with IDs/quantities/size intent preserved and safe placeholders. Sizes never silently substitute or merge incorrectly.
- **Prerequisites:** Isolated catalog fixtures and browser carts, old/current persisted cart formats; no checkout submission required.
- **Status:** Pending Manual QA.
- **Evidence / tester / time / deployment / device:** _Not recorded._
- **Findings / follow-up:** _Not recorded._

## QA-012 — Offline cart, stale images and checkout blocking

- **Batch / release:** 1.7.5 + 1.7.5A / R175 (`794e99d`), R175A (`e7f0750`); current R175B (`d1ac3b1`).
- **Scenario / expected:** Before verification/offline/on reconciliation failure, persisted remote images are not trusted, local placeholders render and checkout remains blocked. Retry preserves selections; concurrent edits cannot be overwritten by old responses. Current broken authoritative images also fall back safely.
- **Prerequisites:** Prepared carts, offline/latency controls, cart page/drawer/checkout summary and a controlled image failure. Do not create orders.
- **Status:** Pending Manual QA.
- **Evidence / tester / time / deployment / device:** _Not recorded._
- **Findings / follow-up:** _Not recorded._

## QA-013 — Physical mobile and assistive interaction

- **Batch / release:** 1.7.5–1.7.5B / R175 (`794e99d`), R175A (`e7f0750`), R175B (`d1ac3b1`).
- **Scenario / expected:** Execute applicable cases on physical iOS Safari and Android Chrome, narrow/landscape layouts, native keyboard/file picker, screen reader and pinch gestures. No unintended navigation, overflow, focus trap or blocked scroll remains after closing dialogs.
- **Prerequisites:** Actual hardware and recorded OS/browser versions, isolated test deployment; desktop device emulation is not manual physical-device evidence.
- **Status:** Pending Manual QA.
- **Evidence / tester / time / deployment / device:** _Not recorded._
- **Findings / follow-up:** _Not recorded._

## QA-014 — Retention, reuse, sharing and concurrent writers

- **Batch / release:** 1.7.5A + 1.7.5B / R175A (`e7f0750`), R175B (`d1ac3b1`).
- **Scenario / expected:** A separately authorized isolated integration exercise proves committed Save before registration, fresh full 30-day retention, restart durability, reuse cancellation, final-reference removal and competing-writer fencing. No asset still referenced by gallery/category/hero/About/Review is deleted. Never shorten the clock in Production.
- **Prerequisites:** Future explicit test authorization, exclusive disposable store/DB, retained audit evidence and controlled test clock/aged fixtures; cleanup stays disabled until that separate exercise is authorized. This register does not authorize activation or deletion.
- **Status:** Pending Manual QA.
- **Evidence / tester / time / deployment / device:** _Not recorded._
- **Findings / follow-up:** _Not recorded._

## QA-015 — Scope rejection and retry recovery

- **Batch / release:** 1.7.5A / R175A (`e7f0750`); current R175B (`d1ac3b1`).
- **Scenario / expected:** Disabled/missing/mismatched store/database/environment scope produces no deletion. In an independently authorized isolated exercise, SDK failure, process restart and lost acknowledgement preserve the fence/job and retry safely; a successful Save remains successful. Quiet-store and bounded-window backlog limits are observed.
- **Prerequisites:** Future separate integration authorization and exclusive disposable resources; no Production connection or environment changes. Use mocked fault injection before any approved live test.
- **Status:** Pending Manual QA.
- **Evidence / tester / time / deployment / device:** _Not recorded._
- **Findings / follow-up:** _Not recorded._

## QA-016 — Ukrainian slug generation and historical links

- **Batch / release:** 1.7.5 + 1.7.5B / R175 (`794e99d`), R175B (`d1ac3b1`).
- **Scenario / expected:** New Ukrainian names generate predictable URL-safe slugs. Manual overrides survive later name edits; regeneration is explicit. Editing an existing name preserves its slug. Invalid/duplicate slugs show errors without losing drafts or changing historical URLs accidentally.
- **Prerequisites:** Disposable new/existing products and duplicate slug fixture, UA/EN Admin; no real historical slug edit.
- **Status:** Pending Manual QA.
- **Evidence / tester / time / deployment / device:** _Not recorded._
- **Findings / follow-up:** _Not recorded._

## QA-017 — Quantity/availability consistency and checkout readiness

- **Batch / release:** 1.7.5 / R175 (`794e99d`); current R175B (`d1ac3b1`).
- **Scenario / expected:** Detail/cart/drawer controls honor quantity 1 and integer/total limits; totals update immediately. Inactive/non-orderable/invalid sizes block purchase without consulting legacy stock. Selectable products open details; COD/Mono readiness/review gates remain present. Stop before submitting an order or payment.
- **Prerequisites:** Isolated valid/invalid/size fixtures, keyboard/touch and UA/EN; order/provider side effects remain disabled.
- **Status:** Pending Manual QA.
- **Evidence / tester / time / deployment / device:** _Not recorded._
- **Findings / follow-up:** _Not recorded._
