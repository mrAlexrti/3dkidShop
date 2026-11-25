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
| UX-09 / UX-10 — Account cart and sign-in form corrections | P1 pre-launch review. Account-bound cart, guest merge and retained sign-in fields are implemented locally. The operator approved automatic reconciliation and safe replacement of superseded unpaid Mono attempts, including switches to COD and checkout from another device, without an account-wide restriction. Migration and Production payment QA require separate approval. |
| QA-05 — Favorites | Operator manual QA passed 12/12. No defects. |
| UX-11 — Localization of Form Validation Messages | P2, pending. |
| PERF-01 — Storefront Performance & Navigation Optimization | P1 pre-launch, next major development batch. Storefront navigation and search latency predate SEO-01. Profile category switching, product navigation, filtering, autocomplete, authenticated cart SQL, database workload, caching, prefetching, browser performance, and Vercel/Neon infrastructure. |
| Batch 2.0 — Promo Codes | Pending UX-09 / UX-10 review. |
| Launch Fixes | Legal pages, Google OAuth publication, Telegram customer comment and cancelled-order revenue analytics. |
| Final QA | November 29–30, 2026. Comprehensive end-to-end QA and launch-blocking fixes. |
| Store launch | December 1, 2026 target, subject to successful QA. |

Batch 2.0 promo codes can extend the authoritative order pricing transaction with an immutable discount snapshot. Verified phone ownership and SMS-based order claims are deferred. Filament consumption, manufacturing costing and MANUAL/AUTO repricing remain future work. Storefront availability and authoritative prices remain separate from historical order snapshots.
