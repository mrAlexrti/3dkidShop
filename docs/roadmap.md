# 3D kid launch roadmap

| Release | Status |
| --- | --- |
| Batch 1.8 — Color + Size | Deployed. |
| Batch 1.8A — Color images and variant price UX | Deployed. |
| Batch 1.8.1 — Filaments and catalog | Deployed. The operator accepted core configuration, copying, persistence, independent requirements and all eight manufacturing availability scenarios. BUG-01 is closed after mobile GIF playback passed on a physical phone. Deferred noncritical regressions move to final QA. |
| Batch 1.9 — Customer account | Deployed. Google OAuth manual QA passed 5/5. Fresh registration, branded Resend email, cross-device confirmation, password creation, desktop and mobile sign-in, simultaneous sessions, profile editing, checkout autofill, password recovery and invalid credentials passed. BUG-02 and BUG-03 were not reproduced and their original cause remains unconfirmed. Remaining manual Production account QA is pending. |
| UX-06 — Customer Account UI Redesign | Deployed and hydration verified in Production at `6c2dd27e8b5eedf0871e455097f043a4836beecd`. Final functional acceptance remains part of manual Production QA. |
| UX-07 — Customer Account Content Management | Deployed at `1b4563ca8bfde35872fd39a16bdcc3cea6712e25`. All 66 read-only Production checks passed with zero hydration errors or warnings. The operator confirmed both Site Content controls. Live Blob upload, replacement, persistence and reset QA await final illustration files. |
| UX-08 — Customer registration and authentication flow, with UX-05 branded email | Deployed. Registration and password recovery manual QA passed. Authorized Gmail and Outlook coverage across all templates is still pending. |
| SEO-01 — Search appearance, brand identity and indexing | Deployed at `80af0d512f2f8a7c2a6c2e8889b9690e78bd4e84`. Google Search Console accepted the homepage reindexing request. Search appearance refresh is pending. |
| OPS-01 — Database Release Manager | Implemented and used successfully for the UX-09 / UX-10 Production migration. Follow-up pending to integrate the reusable tooling into a permanent repository location. |
| UX-09 / UX-10 — Account cart and sign-in form corrections | Deployed at `05f0bb0870ee18d109ab92b84b73b327520aca0b`. Manual Production acceptance is pending. Real payment acceptance and verification of reconciliation scheduling remain launch gates. |
| BRAND-01 / BRAND-01A — Brand identity and administrator-managed favicon | Deployed at `3f2ad0986effca473740c2ba90585e9cd6029060`. The operator verified live upload and reset and found that the approved upload rendered smaller than the default. Google refresh remains unverified. |
| BRAND-01B — Storefront logo and favicon consistency | Isolated candidate for release approval. Restores the historical transparent storefront logo and makes the approved uploaded JPEG match the packaged favicon. |
| OPS-02 — Isolated Development Environment | Available on the separate development branch at `2d1c49e10ec9e63cd711d92456c3e2568289dd7b`. Guarded Neon DEV and loopback PostgreSQL workflows support development and tests. |
| OPS-02A — Production Runtime Compatibility and Environment Isolation | Launch priority. Resolve the build fallback, datasource override and `npm start` blockers before bringing OPS-02 runtime changes into a Production release. [Gate evidence and reconciliation plan](ops-02a-production-runtime-compatibility.md). |
| QA-AUTO-01 — Automated QA | Planned after the isolated branding release. |
| Manual Production QA | Operator results: QA-01 5/5 PASS. QA-02 9/9 PASS. QA-03 7/8 PASS. QA-04 4 PASS, 1 FAIL, 2 PENDING. QA-05 Favorites 12/12 PASS with no defects. QA-06 12/13 PASS. QA-04.06 Google account linking is pending manual verification. |
| BUG-04 — Nova Poshta parcel lockers | Parcel locker search reports that the service is unavailable. Include it in the existing Nova Poshta API audit. |
| UX-11 / BUG-06 — Localized Form Validation | P2, pending. Show localized, context-specific validation and preserve editable values. An invalid profile phone currently restores the previous value and displays an unrelated expired-link error. |
| UX-12 — Purchasable Variants Warning | Pending. Prominent admin warning for products without a purchasable variant combination. |
| UX-13 — Customer Password Change | Pending. Audit and implement a visible password-change action in the account. |
| UX-14 — Customer Email Change | Pending workflow investigation and manual verification. |
| PERF-01 — Storefront Performance & Navigation Optimization | P1, after QA-AUTO-01. Storefront navigation and search latency predate SEO-01. Profile category switching, product navigation, filtering, autocomplete, authenticated cart SQL, database workload, caching, prefetching, browser performance, and Vercel/Neon infrastructure. |
| Batch 2.0 — Promo Codes | Pending. |
| Launch Fixes | Legal pages, Google OAuth publication, Telegram customer comment and cancelled-order revenue analytics. |
| Final QA | November 29–30, 2026. Comprehensive end-to-end QA and launch-blocking fixes. |
| Store launch | December 1, 2026 target, subject to successful QA. |

Batch 2.0 promo codes can extend the authoritative order pricing transaction with an immutable discount snapshot. Verified phone ownership and SMS-based order claims are deferred. Filament consumption, manufacturing costing and MANUAL/AUTO repricing remain future work. Storefront availability and authoritative prices remain separate from historical order snapshots.
