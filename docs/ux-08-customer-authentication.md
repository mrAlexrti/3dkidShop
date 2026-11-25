# UX-08 customer authentication and UX-05 transactional email

UX-08 starts from Production `1b4563ca8bfde35872fd39a16bdcc3cea6712e25`. UX-07 is deployed. Its two Site Content controls and read-only browser checks have been verified in Production. Upload, replacement, persistence and reset with the final media are pending manual QA.

## Native registration investigation

| Observation | Evidence and conclusion |
| --- | --- |
| BUG-02, sign-in failed after registration | The operator confirmed a committed verified CUSTOMER record with a populated 60-character hash. The hash length cannot establish whether the stored credential matched the intended input. In a mobile Edge reproduction against the optimized UX-07 baseline, exact input created an Auth.js session, including leading and trailing spaces, Unicode and form-encoded punctuation. A deliberately altered input was rejected. In the server code, normalization applies to email while bcrypt receives the submitted password as-is. The exact Production rejection stage remains unverified. |
| BUG-03, first confirmation showed a generic error and a retry succeeded | The optimized baseline reproduced that sequence using an invalid password and then a valid password on the same still-unused proof. The old message covered both validation and proof rejection. Under the isolated PostgreSQL runtime role, mismatched and oversize passwords leave the proof available. Two concurrent valid redemptions commit exactly one account. The cause of the reported Production sequence remains inconclusive. |
| Confirmed input and feedback gaps | The old form accepted a single password entry, had a browser character limit that could truncate pasted input and mapped password validation and proof rejection to the same message. The release accepts the input up to a bounded browser limit, checks the actual password length and UTF-8 size, requires matching entries and displays a specific validation error. The original bcrypt restrictions and whitespace behavior are retained. |

Registration and recovery keep a generic email request response, including for existing, missing and throttled accounts. The new confirmation view displays the submitted address and provides a 60-second resend cooldown, a way to correct the address and sign-in navigation. The persisted server-side limiter still governs all requests. Completion is shown only after the transaction succeeds. Invalid and reused links offer a new request or the profile page as appropriate.

The Google callback, native credentials provider, session isolation, revocation, password hashing cost, token binding and redemption, customer and administrator separation, and UX-07 media loading remain outside the presentation changes. There are no dependency, database schema, migration or configuration changes. Verification uses an isolated PostgreSQL runtime role and fake providers. HTTPS cookie behavior can be exercised with synthetic Next request boundaries and the real Auth.js implementation without a live TLS connection.

## Transactional email coverage

- Seven account email purposes are styled in Ukrainian and English: registration, password recovery, email ownership verification, Google account password setup, both email-change confirmations and guest-order claim.
- The 15 configurable order, payment and carrier email events use the same design. The existing checkout receipt is `ORDER_CREATED`. The reserved `ORDER_CONFIRMED` event has no independent trigger and this release adds none.
- The renderer keeps existing recipients, preferences, event triggers and status links. Account emails show the existing 20-minute lifetime or 30 minutes for order claims. The signed order status link and original account proof fragment still go to their existing destinations.
- The layout uses inline styles and an Outlook-compatible table fallback. Live Gmail and Outlook rendering remains an operator QA check. The logo uses the deployed 3D Kid brand asset.

## Local review

Run `node scripts/rehearse-batch19-customer-account.mjs --commerce-regression --ux07 --ux08-screenshots` for isolated PostgreSQL and optimized Edge validation. Screenshots are written to `coverage/ux-08`. `node node_modules/tsx/dist/cli.mjs scripts/verify-ux08-emails.ts` renders all 44 bilingual email variants into `coverage/ux-08/emails/index.html`, with desktop and mobile PNGs for registration, recovery and order receipt. The preview generator uses synthetic data, inert links and offline rendering.

After separate operator approval, run registration and sign-in from a fresh synthetic account on the affected physical mobile device, first in its system browser and then through the email application's link handling. Record the stage, browser, route, response category and whether the expected cookie was set. Keep password values, hashes, proof URLs, cookies and customer data out of the diagnostic record. Verify receipt, fallback links and appearance in real Gmail and Outlook with operator-controlled recipients.

## Files

| Area | Files |
| --- | --- |
| Account routes and styles | `src/app/(shop)/account/sign-in/page.tsx`, `confirm/page.tsx`, `account.css` |
| Account controls | `src/components/account/account-email-request.tsx`, `account-form.tsx` |
| Validation, copy and email | `src/lib/customer/actions.ts`, `challenges.ts`, `copy.ts`, `email-template.ts`, `password.ts`, `security.ts` |
| Notification rendering | `src/lib/notifications/branded-email.ts`, `templates.ts` |
| Verification and local previews | `scripts/rehearse-batch19-customer-account.mjs`, `verify-batch19-browser.mjs`, `verify-batch19-concurrency.ts`, `verify-ux08-emails.ts` |
| Documentation | `docs/roadmap.md`, `docs/ux-08-customer-authentication.md` |
