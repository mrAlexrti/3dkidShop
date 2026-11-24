# UX-06 Customer Account UI Redesign

Approved baseline `1442f70d45011268ac255c68d828841bf7f2a724` on `redesign-3dkid-v2`. The release is prepared locally on `feat/ux-06-customer-account-redesign` for design review.

## Before and after

| Area | Before | UX-06 |
| --- | --- | --- |
| Account navigation | A plain row of text links | A branded profile and initials panel, icon links, a visible current location, and a separate sign-out action. On smaller screens the panel becomes a compact four-item navigation. |
| Overview | Name, email and introductory text | A personalized welcome, four shortcuts, accurate localized counts, up to three recent orders and a catalog action for empty accounts. |
| Profile and sign-in | Basic cards and form controls | A single form style with visible focus, labeled fields and explicit feedback. Profile separates personal information and account security. Sign-in, registration, recovery and confirmation share the same layout. |
| Favorites and orders | Plain headings and empty text | Storefront product cards, catalog links for empty states, accessible order rows and structured order details. Order history includes the existing payment, delivery and tracking information. |
| Store navigation | Category navigation also appeared under account pages. The footer used one account label. | The shared header skips the category bar and its mobile category menu for `/account` and nested routes. Logo, catalog, language, account and cart controls remain visible. Home, catalog and product routes keep their category navigation. Header and footer reflect the existing customer session check. |

## Scope and runtime behavior

- The account reuses the storefront container, typography, colors, imagery and Lucide icons. The auth illustration uses existing local brand assets.
- Dashboard order queries use the same server-side customer scope as order history. The initial dashboard reads a bounded order preview and counts active favorites in parallel. It asks PostgreSQL for a separate order total only when there are more than three orders. Private shortcuts disable speculative prefetching.
- The shared header and footer derive a signed-in, signed-out or pending visual state from the existing favorites response. They receive a boolean for presentation and share the existing request. Until it resolves, they use a neutral account label. No additional endpoint, identity lookup or public personalization cache is introduced.
- OAuth routing, session handling, credentials, email confirmation, guest claims, order ownership, item snapshots, checkout, merchant availability and favorites persistence remain on the approved Batch 1.9 paths. UX-06 has no database migration, provider setup or dependency changes. Administrator sign-in uses its existing separate interface.
- The optimized local build reports 189 kB of first-load JavaScript for the homepage, compared with 188 kB for the reviewed Batch 1.9 build. The overview reports 112 kB. These are bundle sizes from the build. Production latency and compute usage will be assessed during the rollout.

## Local review and deployment

Run `node scripts/rehearse-batch19-customer-account.mjs --commerce-regression --ux06-screenshots` for the optimized build and browser regression on synthetic records with mocked providers and private loopback PostgreSQL. The screenshot option writes Git-ignored review images to `coverage/ux-06/`.

The account matrix covers 320, 390, 768 and 1280 pixels, Ukrainian and English, navigation presence and absence, the public category menu, active navigation and keyboard focus, empty and populated accounts, real fixture counts, long names and email addresses, and existing authorization and claim flows. Review screenshots of the dashboard, profile, favorites and orders, then spot-check the sign-in and confirmation layout.

TypeScript, ESLint, the optimized build, the full customer account regression, checkout acceptance and localized render tests, and the existing catalog media, color gallery and cart drawer browser suites passed. The current account suite also exercises outgoing and incoming favorites synchronization signals. The first run exposed timing assumptions in the test fixture, which now waits for both streamed account content and the customer status request. A clean rebuild cleared a Windows trace file lock. The build still emits the existing JOSE Edge compression warnings documented in the Batch 1.9 review. The redesign review found no application defects requiring a separate functional change.

| Changed paths | Scope |
| --- | --- |
| `src/app/(shop)/account/` | Private and authentication routes, page states and account stylesheet. |
| `src/components/account/` | Forms, navigation, order rows and shared account surfaces. |
| `src/app/(shop)/layout.tsx`, `src/app/(shop)/storefront.css`, `src/components/layout/header.tsx`, `src/components/layout/footer.tsx`, `src/components/product/favorite-button.tsx` | Context-aware storefront controls and account presence from the existing favorites response. |
| `src/lib/customer/copy.ts`, `scripts/rehearse-batch19-customer-account.mjs`, `scripts/verify-batch19-browser.mjs`, `docs/roadmap.md`, `docs/ux-06-customer-account-redesign.md` | Centralized copy, regression coverage, screenshot capture and release notes. |

The screenshots use synthetic customers, orders and products. Desktop captures use a 1280-pixel viewport and mobile captures use a 390-pixel viewport. Physical-device and real-provider verification for UX-06 remain part of Production QA.

## Final design refinements

- Sign-in, registration and account linking use the official full-color Google G on a light button with locally served Google Sans. The forms keep the Auth.js endpoints and protection checks, including password confirmation before linking. Registration reuses the existing verified Google sign-in flow. [Google Sign-In branding guidelines](https://developers.google.com/identity/branding-guidelines)
- Favorites, recent orders, order history and order details use the shared price formatter with the account locale and the ₴ symbol. Stored prices, cart calculations and other storefront price displays retain their existing behavior.
- Customer sign-in, password setup and reset, and Google linking have localized, keyboard-accessible password visibility controls. Passwords start hidden and are concealed again when forms submit or reset. Administrator sign-in retains its separate form.
- QA and Sort come from the local commerce fixtures `qa` and `native-sort-fixture`. The screenshot database does not seed social URLs. The browser regression checks the same footer with empty settings and with four synthetic configured URLs in both languages. The footer continues to read categories and social links from the database.

The screenshot run refreshes overview, profile, favorites and order history and adds sign-in, registration, password reset, password setup and order detail views. All captures remain under the Git-ignored `coverage/ux-06/` directory.

TypeScript, ESLint, the optimized build, product and cart checks, and the isolated PostgreSQL and Edge browser suites passed for this follow-up. Browser coverage includes localized regular and previous prices, keyboard password controls, Google button rendering and mocked registration and linking. The existing JOSE Edge warnings remain.

After design approval, verify the remote Production baseline and approve deployment separately. The release uses the existing Batch 1.9 database and environment. After deployment, run read-only storefront checks, confirm the approved account UI on a physical phone and resume manual Batch 1.9 Production QA, including authorized Resend verification and recovery. Google OAuth publication and the other Launch Fixes are tracked in the [roadmap](roadmap.md).
