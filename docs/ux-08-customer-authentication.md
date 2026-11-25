# UX-08 customer authentication and UX-05 transactional email

UX-08 starts from Production `1b4563ca8bfde35872fd39a16bdcc3cea6712e25`. UX-07 is deployed. Its two Site Content controls and read-only browser checks have been verified in Production. Upload, replacement, persistence and reset with the final media are pending manual QA.

## Native registration investigation

| Observation | Evidence and conclusion |
| --- | --- |
| BUG-02, sign-in failed after registration | The operator confirmed a committed verified CUSTOMER record with a populated 60-character hash. The hash length cannot establish whether the stored credential matched the intended input. In a mobile Edge reproduction against the optimized UX-07 baseline, exact input created an Auth.js session, including leading and trailing spaces, Unicode and form-encoded punctuation. A deliberately altered input was rejected. In the server code, normalization applies to email while bcrypt receives the submitted password as-is. The exact Production rejection stage remains unverified. |
| BUG-03, first confirmation showed a generic error and a retry succeeded | The optimized baseline reproduced that sequence using an invalid password and then a valid password on the same still-unused proof. The old message covered both validation and proof rejection. Under the isolated PostgreSQL runtime role, mismatched and oversize passwords leave the proof available. Two concurrent valid redemptions commit exactly one account. The cause of the reported Production sequence remains inconclusive. |
| Confirmed input and feedback gaps | The old form accepted a single password entry, had a browser character limit that could truncate pasted input and mapped password validation and proof rejection to the same message. The release accepts the input up to a bounded browser limit, checks the actual password length and UTF-8 size, requires matching entries and displays a specific validation error. The original bcrypt restrictions and whitespace behavior are retained. |

The operator reset the previous test account after checking for dependencies. BUG-02 and BUG-03 remain pending a fresh physical-device Production retest with the same test address. The original observations did not confirm an application defect. This refinement changes the presentation and validation feedback.

Registration and recovery keep a generic email request response, including for existing, missing and throttled accounts. The new confirmation view displays the submitted address and provides a 60-second resend cooldown, a way to correct the address and sign-in navigation. The persisted server-side limiter still governs all requests. Completion is shown only after the transaction succeeds. Invalid and reused links offer a new request or the profile page as appropriate.

The browser's default outline on the programmatically focused status heading is suppressed on that heading alone. Keyboard focus styling remains visible on controls. The completed state replaces the original instructions with a success icon, one page heading and a sign-in action. The default password hint shows the minimum. The maximum appears only for an oversize password.

The Google callback, native credentials provider, session isolation, revocation, password hashing cost, token binding and redemption, customer and administrator separation, and UX-07 media loading remain outside the presentation changes. There are no dependency, database schema, migration or configuration changes. Verification uses an isolated PostgreSQL runtime role and fake providers. HTTPS cookie behavior can be exercised with synthetic Next request boundaries and the real Auth.js implementation without a live TLS connection.

## Transactional email coverage

- Seven account email purposes use localized action labels, a direct fallback URL and the existing expiration notice. The lifetime is 20 minutes for account actions and 30 minutes for order claims.
- The 15 configurable commerce events have distinct introductions, labeled order, payment and delivery statuses, and a product table with snapshot unit prices and quantities. Delivery details, a recorded shipping charge and tracking appear when available. No authoritative discount field exists in this baseline. Telegram retains management timestamps. The existing checkout receipt is `ORDER_CREATED`. The reserved `ORDER_CONFIRMED` event has no independent trigger.
- The order CTA opens the existing 24-hour signed status page for guests and signed-in customers. The private order page still requires the customer's owning session. Recipients, preferences, triggers and dispatch rules stay the same. Existing queued HTML-only messages remain deliverable.
- The layout uses inline styles, a table fallback for Outlook and localized plain-text alternatives. The logo is displayed at 63 × 70 px from the public HTTPS PNG, which returned HTTP 200 and is about 20 KB. Base64 is used in the offline preview generator. The footer links directly to the store.
- Links use their existing first-party destinations. Confirm Resend's domain-level open and click tracking are disabled during authorized Production QA. Resend disables both by default. [Resend tracking settings](https://resend.com/blog/introducing-custom-tracking-domain)

## Local review

Run `node scripts/rehearse-batch19-customer-account.mjs --commerce-regression --ux07 --ux08-screenshots` for isolated PostgreSQL and optimized Edge validation, including order CTA privacy and receipt delivery to the mock provider. Screenshots are written to `coverage/ux-08`. `node node_modules/tsx/dist/cli.mjs scripts/verify-ux08-emails.ts` renders all 44 bilingual HTML and plain-text variants into `coverage/ux-08/emails/index.html`, with desktop and mobile PNGs for registration, recovery and order receipt. The preview generator uses synthetic data, inert action links and offline rendering.

Final local verification passed TypeScript, ESLint, the optimized build, restricted-role PostgreSQL fixtures, mocked notifications and order acceptance regressions. Optimized Edge had zero hydration errors or warnings. Browser coverage includes the two locales, long addresses, keyboard focus, all three password completion screens, guest and customer order status links, and UX-06 and UX-07. Email coverage includes 132 layout checks at 320, 390 and 960 px, long content, and six image-blocking checks.

After separate operator approval, run registration and sign-in from a fresh synthetic account on the affected physical mobile device, first in its system browser and then through the email application's link handling. Record the stage, browser, route, response category and whether the expected cookie was set. Keep password values, hashes, proof URLs, cookies and customer data out of the diagnostic record. Verify receipt, fallback links and appearance in real Gmail and Outlook with operator-controlled recipients.

## Final refinement files

| Area | Files |
| --- | --- |
| Account routes and styles | `src/app/(shop)/account/confirm/page.tsx`, `src/app/(shop)/account/account.css` |
| Account controls | `src/components/account/account-email-request.tsx`, `account-form.tsx`, `account-surface.tsx` |
| Localization and feedback | `src/lib/i18n.ts`, `src/lib/customer/actions.ts`, `copy.ts`, `email-template.ts`, `password.ts` |
| Notification rendering and transport | `src/lib/notifications/branded-email.ts`, `email.ts`, `orders.ts`, `outbox.ts`, `templates.ts` |
| Verification and local previews | `scripts/fixtures/batch19-mock-providers.cjs`, `scripts/verify-batch19-browser.mjs`, `verify-batch19-concurrency.ts`, `verify-checkout-acceptance.ts`, `verify-manager-dates.ts`, `verify-notification-delivery.ts`, `verify-order-operations.ts`, `verify-ux08-emails.ts` |
| Documentation | `docs/roadmap.md`, `docs/ux-08-customer-authentication.md` |
