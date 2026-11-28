# OPS-02A — Production Runtime Compatibility and Environment Isolation

The local reconciliation starts directly at deployed BRAND-01B `8cd280af5c678d5e7bd38223718aeb9918cfae9c`. It transfers the reviewed Development tooling from OPS-02 `2d1c49e10ec9e63cd711d92456c3e2568289dd7b` and retains the Windows single-preload correction. The blocked combined candidate `c599eccd3b5c902efdfd80bc2a4f01945170f265` and the historical worktrees remain available for audit.

## Resolved release blockers

- **Build.** `npm run build` is `next build`. `postinstall` stays `prisma generate`. The old flag-dependent launcher is absent. `npm run dev:build` explicitly creates, seeds and uses disposable PostgreSQL with the Development sandbox.
- **Datasource.** One configuration guard runs when Next loads its config, before route/provider imports, and from Prisma and startup instrumentation. Production selections reject conflicting Development settings, spoofed target-routing query parameters, known Neon DEV endpoints and loopback/disposable targets. Accepted ordinary configuration leaves Prisma's schema-defined datasource intact.
- **Start.** `npm start` is `next start`. The guarded `dev:start` and `dev:start:local` commands start the existing optimized build against a verified Development target. Both Development launchers and provider mock preloads refuse hosted identities and ordinary npm lifecycle events before loading credentials or installing transports.

## Environment selection

| Configuration | Datasource and integration behavior |
| --- | --- |
| Explicit Production from Vercel labels or optional `OPS02_DEPLOYMENT=production` | Accept the existing ordinary app configuration. Reject DEV modes, DEV URLs, test mode and known mock configuration. Keep existing real integrations and database access unchanged. |
| Ordinary application with no Vercel labels and no DEV mode | Same ordinary datasource and integration behavior. Optional Vercel labels are unnecessary for ordinary build and startup. |
| Preview | Require `OPS02_DEPLOYMENT=preview`, `OPS02_MODE=neon` and `DEV_DATABASE_APP_URL`. Any hosted label must agree. Reject ordinary DB URL bindings, DEV owner credentials, enabled payments or cleanup and provider credentials. Use the pinned pooled DEV endpoint and strict TLS. |
| Explicit unhosted DEV or local | Use the pinned restricted Neon DEV endpoint or the restricted role on an isolated loopback database. Reject unknown targets and inherited provider credentials. Dedicated local preloads permit only recognized test settings and block outbound provider transports. |
| Conflicting labels, hosted indicator without an environment identity, or recognizable Preview without its marker | Reject before Prisma or provider initialization. |

A dedicated Preview marker is required because Vercel system variable exposure is configurable. An environment with all hosted indicators and the Preview marker omitted is indistinguishable from ordinary self-hosting. Scope Production secrets exclusively to Production and keep the Preview marker in the same Preview scope as its configuration. See the [operator Preview checklist](ops-02-development-environment.md#vercel-preview-handoff) and [Vercel system variables](https://vercel.com/docs/environment-variables/system-environment-variables).

The Development guard checks URLs before connecting. The first connection reads the database name, role privileges and `ops02_guard.identity` marker. An incorrect marker denies application startup after the identity query and before application queries or writes. Administrative commands verify identity before issuing mutations. [Development command reference](ops-02-development-environment.md#commands)

The ordinary path keeps the existing Monobank, Resend, Telegram, Blob, Google OAuth, Nova Poshta and cron configuration. No provider credentials are substituted on that path. Preview omits provider credentials and disables online payments and media cleanup. Normal local Development captures synthetic email, mocks read-only delivery lookup and blocks other external traffic. The regression suite retains its own synthetic OAuth, payment, mail and Blob fixtures.

## Environment test matrix

`node scripts/development/test-target.mjs` tests configuration selection, actual Next config loading and the real Prisma initializer with a stubbed client constructor. The provider and side-effect counters are stubs. Rejected configurations never reach normal client or provider initialization, credential loading or destructive operations. The marker case supplies a fake read-only identity response. The local database rehearsal also checks a wrong marker against real disposable PostgreSQL.

| Case | Expected | Observed |
| --- | --- | --- |
| 1. Labeled Production | Ordinary datasource and provider configuration | Passed. No datasource override. |
| 2. Production without Vercel flags | Same ordinary path | Passed. No datasource override. |
| 3. Production with local mode | Reject conflict | Passed. |
| 4. Production with DEV URL | Reject conflict | Passed. |
| 5. Production with loopback URL | Reject target | Passed. |
| 6. Production with mock configuration | Reject before provider or mock initialization | Passed. |
| 7. Valid Preview | Pinned restricted pooled DEV datasource | Passed. |
| 8. Preview missing DEV configuration | Reject before connecting | Passed. |
| 9. Preview with Production datasource | Reject mixed configuration | Passed. |
| 10. Valid Neon DEV | Pinned restricted target and strict TLS | Passed. |
| 11. Valid disposable local PostgreSQL | Restricted loopback target and local marker | Passed. |
| 12. DEV pointing at Production | Reject hostname before connecting | Passed. |
| 13. DEV pointing at unknown host | Reject hostname before connecting | Passed. |
| 14. DEV with wrong marker | Reject after identity read and before normal application work | Passed. |
| 15. Standard build and start without Development configuration | Direct Next commands and no Development launcher | Passed. Environment matrix and actual npm command rehearsal. |
| 16. Explicit isolated build and start | Guarded Development entry points and local authentication | Passed. Environment matrix and optimized disposable browser smoke. |

Additional checks cover missing Preview markers, Preview with a provider credential, flagless Preview with the explicit marker, inconsistent hosted indicators, alternate loopback encodings, URL routing overrides, unguarded test mode, dotenv access and blocked fetch/SDK egress. Controlled child processes also reject hosted Development build, start, bootstrap, seed, reset and regression commands, and reject Development preloads during ordinary build.

## Rehearsal evidence

- The standard npm commands ran against a database provisioned by the test harness. The harness used the restricted local role and the local marker with provider credentials and mock preloads absent. Homepage, catalog and favicon returned HTTP 200. Products, users and orders remained at zero. The synthetic matrix separately verifies the ordinary hosted and unflagged Production datasource selections without opening a connection.
- The explicit optimized Development build and disposable browser run passed. It exercised sign-in, cart, delivery lookup with a mock, and checkout. A restricted-role query confirmed the new synthetic order and the browser reported zero hydration errors.
- The full OPS-02 suite retained all four regression flags and passed. It covered database migrations and restricted grants, cart and payment behavior with mocks, UA/EN storefront and accounts, SEO and BRAND-01B. Focused checks confirmed unchanged Next headers and image policy, all favicon sizes and ICO bytes, and 44 localized email templates. TypeScript, ESLint, Prisma validation and the public schema comparison passed.
- The two existing Neon DEV connections passed read-only `verify-full` TLS and identity probes. The DEV dataset was left in place.

The first compile exposed a stale TypeScript import for the configuration file after its move to native ESM. The image-host regression now imports the new path and compares evaluated headers and settings. An existing worktree had CRLF bytes for the reviewed cart SQL. Restoring its exact Git blob allowed the checksum to pass while keeping the committed migration intact. One browser run stopped because Edge could not see the process-local provider preload marker. The config check remains ahead of route loading, and the positive Node-only branch excludes the database identity guard from the built Edge artifact. These fixes retained all regression assertions. The nested worktree may emit a multiple-lockfile tracing warning, and the existing JOSE Edge warnings remain.

One standalone browser smoke timed out waiting for the account after form submission. The exact cause of that one-off timeout was unconfirmed. The runner could submit before React attached the form handlers, so it now waits for hydration before entering credentials and checkout data, and reports only HTTP status codes if sign-in stalls again. Two consecutive fresh disposable runs passed with the same optimized build and unchanged assertions.

## Release procedure

1. Review the exact candidate and its cumulative diff against deployed BRAND-01B. Confirm the only install/build/start paths are ordinary commands, and preserve the existing Production and separate Preview environment scopes.
2. After separate operator approval, promote the exact approved candidate using the normal Git and Vercel workflow. No Production migration is associated with this infrastructure change.
3. Verify the exact hosted commit and run minimal read-only storefront smoke checks. Real provider acceptance remains a separately authorized activity.
4. Base subsequent feature branches on the approved reconciled baseline. Keep existing OPS-01, OPS-02 and BRAND-01B branches as evidence. The older blocked combined commit should stay out of future release ancestry. The reviewed shared baseline removes the need for application-only extraction.

Hosted credentials, deployment and Preview settings remain operator-controlled. The verification here uses synthetic configuration, disposable local services and read-only Neon DEV identity probes. It does not establish actual hosted configuration or provider delivery behavior.
