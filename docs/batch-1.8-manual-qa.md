# Batch 1.8 — deferred native variant manual QA

All entries are **Pending Manual QA**. Automated/synthetic evidence belongs in
`batch-1.8-implementation.md`; none establishes a live manual PASS. The original
17 entries in `deferred-manual-qa.md` are unchanged. No release commit exists yet.
Scope: uncommitted Stage 1B on `feat/batch-1.8-color-size-variants`, based on
`76621cf01ebe482bfee9a80aaed4a4b5b9dfed22`.

Prerequisites for live testing: separately approved schema/deployment, verified
isolated data/storage and native-write activation. Do not test against Production
without separate authorization. Use synthetic products and mocked payment effects.

| ID | Scenario and expected result | Additional prerequisites | Status | Evidence / findings |
| --- | --- | --- | --- | --- |
| V01 | Untouched simple and legacy size products retain labels, prices, IDs, card routing and checkout identity | Known legacy fixtures and pre-release screenshots/hash evidence | Pending Manual QA | Date/device/operator/release SHA: ___; findings: ___ |
| V02 | Create native SIMPLE, SIZE, COLOR and sparse COLOR_SIZE products; only configured combinations are offered | Native writes explicitly approved on isolated environment | Pending Manual QA | ___ |
| V03 | Require applicable selections, disable missing/unavailable pairs, clear incompatible size with explanation and update full price | Sparse prices and unavailable fixture | Pending Manual QA | ___ |
| V04 | Edit labels/notes/prices; retire/restore values and combinations without identity regeneration; verify history pages | Retired fixture history and recorded IDs | Pending Manual QA | ___ |
| V05 | Two Admin tabs: stale editor cannot overwrite newer config; failed validation/network preserves descriptions, gallery order, prices and UA/EN values | Two sessions and safe network-failure simulation | Pending Manual QA | ___ |
| V06 | Catalog price sort and pagination match displayed minimums; one cart button, options open details, no quantity stepper | Enough mixed products for multiple pages | Pending Manual QA | ___ |
| V07 | Distinct colors/sizes stay separate; same combination merges; overflow and invalid rows blocked; price change needs review | Synthetic cart and Admin changes | Pending Manual QA | ___ |
| V08 | Import older cart once; old tab cannot strip color choices; malformed/full storage preserves source and blocks checkout | Saved legacy/future-version fixtures; storage recovery plan | Pending Manual QA | ___ |
| V09 | Offline reconciliation, retired combination, deleted product and image change preserve intent with placeholders and block unsafe checkout | Synthetic unavailable/deleted fixtures; network simulation | Pending Manual QA | ___ |
| V10 | Mocked Mono retry/return uses same invoice, color change uses distinct identity, only paid matching cart clears; COD prices remain authoritative | Isolated mocked providers, no real payment/notification | Pending Manual QA | ___ |
| V11 | v1, flat and v2 historical order labels/prices stay unchanged after product rename, retirement and archival; deletion with orders refused | Synthetic historical orders | Pending Manual QA | ___ |
| V12 | Gallery, lightbox, GIF, category/hero uploads and media retirement remain compatible with native edits; cleanup stays disabled | Isolated storage mocks; existing gallery QA prerequisites | Pending Manual QA | ___ |
| V13 | UA/EN keyboard/focus/screen-reader flow and physical mobile layouts support long labels, notes and sparse choices | Physical iOS/Android, desktop keyboard, assistive technology | Pending Manual QA | ___ |
| V14 | Default-off rollout gate prevents native writes; bridge continues reading native orders/products and legacy Save; no automatic conversion | Separately controlled isolated deployment settings | Pending Manual QA | ___ |

Record exact tested commit/deployment, device, locale, fixture IDs, evidence and
findings before changing a status. These rows authorize no live data mutation.
