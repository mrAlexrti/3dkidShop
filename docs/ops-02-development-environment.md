# OPS-02 — Isolated development environment

OPS-02A reconciles the original OPS-02 tooling with the deployed BRAND-01B baseline `8cd280af5c678d5e7bd38223718aeb9918cfae9c`. The guards pin the separately provisioned 3Dkid-Dev project, its direct and pooled compute hostnames, the database and the role. The `ops02_guard.identity` marker is created only when the pinned database has no application relations, routines or enums. The running application reads the marker using `app_3dkid`. Administrative commands use `neondb_owner`. See the [environment and release gates](ops-02a-production-runtime-compatibility.md).

## Credentials and TLS

Keep `DEV_DATABASE_OWNER_URL` and `DEV_DATABASE_APP_URL` in `%LOCALAPPDATA%\3dkid-dev\database.env`. Keep the operator's CA bundle beside it as `cacert.pem`. Use a separate line per variable. The wrapper parses both targets before executing anything and ignores inherited PostgreSQL connection defaults. It passes passwords only in the corresponding child process environment. Direct and pooled libpq checks require `verify-full` with the pinned CA and normalize the Windows path. Prisma uses the pinned pooled hostname with `sslmode=require` and `sslaccept=strict`. The local wrapper supplies the same CA bundle.

Launchers skip workspace dotenv files. Use the guarded commands below from PowerShell with Node.js 24 and the installed PostgreSQL 18 client and server utilities. On another OS, `OPS02_PG_BIN` can point to PostgreSQL 18 tools and `OPS02_EDGE_BIN` can point to a Chromium browser for smoke tests.

## Commands

| Task | Command |
| --- | --- |
| Verify both DEV endpoints, marker, schema and restricted grants | `npm.cmd run dev:db -- verify` |
| Reconstruct an empty pinned DEV database or finish an interrupted first bootstrap | `npm.cmd run dev:db -- bootstrap` |
| Seed 100, 500 or 1,000 synthetic products | `npm.cmd run dev:db -- seed 100` |
| Start the app on Neon DEV using the pooled application role | `npm.cmd run dev -- 3000` |
| Start a fresh loopback-only PostgreSQL cluster and seed it | `npm.cmd run dev:local -- 3000` |
| Run local schema, seed, repeat-seed and reset verification | `npm.cmd run dev:db -- local-verify` |
| Compile the ordinary app using the deployment's configuration | `npm.cmd run build` |
| Start the ordinary build using the deployment's configuration | `npm.cmd start` |
| Compile an isolated optimized build using disposable local PostgreSQL | `npm.cmd run dev:build` |
| Start an existing optimized build against Neon DEV | `npm.cmd run dev:start -- 3000` |
| Start an existing optimized build with a fresh seeded loopback database | `npm.cmd run dev:start:local -- 3000` |
| Rehearse standard build and startup on a pre-provisioned unseeded local database | `npm.cmd run dev:db -- ordinary-rehearsal` |
| Run an optimized local browser smoke after an isolated build | `npm.cmd run dev:db -- local-smoke` |
| Run one optimized Neon DEV browser smoke after an isolated build | `npm.cmd run dev:db -- smoke` |
| Run the existing bulk browser and commerce suite locally | `npm.cmd run dev:regression` |
| Verify unsafe configuration and disabled transports | `node scripts/development/test-target.mjs` |
| Run a reviewed DEV-only SQL file with the direct owner role | `npm.cmd run dev:db -- sql path/to/query.sql` |

Explicit Development application launchers bind to `127.0.0.1`. Stop them with Ctrl+C when finished so Neon can suspend after inactivity. The local PostgreSQL instance is stopped when its launcher exits. Synthetic mail captures and disposable cluster directories are under the system temp directory. No database passwords or connection strings are included in those artifacts. Standard install, build and start follow the app's existing lifecycle. Only the explicit Development launchers open the external credential file or initialize a database.

For a deliberate reset of the known application tables, stop the DEV app and run `npm.cmd run dev:db -- reset DEV-SYNTHETIC`, then seed again. This removes all app records in that dedicated database, including test data added after seeding. The schema, ACLs and DEV marker remain. The fixed table list uses `RESTRICT` so an unknown foreign-key dependency blocks the reset. Repeated seeds preserve existing synthetic fixture IDs. Reset before shrinking a larger dataset or restoring fixture state after browser tests.

Use `dev-admin` and `3dkid-dev-admin-only!` for the local admin. Use `customer-a@example.test` or `customer-b@example.test` with `3dkid-dev-customer-only!` for native customer login. These are synthetic application identities. Guest order `790001` belongs to the test claiming scenario for customer B. The fixture includes four product configuration modes, alternating availability and prices, filament stock alternatives, a cart, favorites and paid, failed and COD orders. It uses bundled media paths.

## Schema provenance and migration workflow

[scripts/development/baseline-pre-cart.sql](../scripts/development/baseline-pre-cart.sql) is the schema-only application export from the checksum-verified OPS-01 checkpoint `2026-11-27T15:13:16.745806Z`, archive SHA-256 `b6bf8d1824c99e863f5bd0cb71456d8cbe8f4d8d7acb4e4bfa4c4cab0a55eb82`. It includes functions, triggers, checks, indexes and application ACLs. Provider-owned default ACLs for `cloud_admin` are omitted. Neon retains its own system roles and defaults. The bootstrap runs the unmodified reviewed [preflight](release/ux-09-10-customer-cart-preflight.sql), [migration](release/ux-09-10-customer-cart.sql), and [verification](release/ux-09-10-customer-cart-verify.sql) using the original guard and migration checksum. The separate DEV marker is outside the app's public Prisma schema.

For future changes, author and review a SQL file under `docs/release`, rehearse it locally, and run `npm.cmd run dev:db -- migrate docs/release/FILE.sql SHA256 namespace.guard=reviewed-value`. The optional guard and migration execute on the same verified direct connection. The CLI checks the exact file bytes. The bootstrap migration is pinned to LF so its approved checksum survives a fresh Windows checkout. If a pre-existing worktree still has a CRLF copy, refresh that specific file from the reviewed Git blob and recheck the hash. Run release-specific preflight and verify SQL through the guarded `sql` command. Files with backslash-bearing code or psql commands other than `\set ON_ERROR_STOP on` require a separately reviewed invocation. Keep Production releases in the operator-controlled OPS-01 workflow. Use the guarded commands above for workspace database changes.

## Integration isolation

| Integration | Guarded local app | Preview |
| --- | --- | --- |
| Mono/LiqPay and refunds | Online payment disabled. Outbound HTTP blocked. | Leave payment credentials absent and keep online payment disabled. |
| Resend | Capture messages to the `example.test` email domain in `mail.ndjson` outside the repo. Reject other recipients. | Leave Resend credentials absent. Native sign-in works for seeded users. |
| Telegram | Credentials absent and outbound transport blocked. | Leave notification and webhook credentials absent. |
| Vercel Blob | Upload credentials absent, cleanup disabled, separate SDK transport blocked. | Leave Blob connection variables absent and cleanup disabled. Use bundled assets. |
| Google OAuth | Disabled. Existing automated local OAuth tests use a mock. | Leave Google client credentials absent. |
| Nova Poshta | Mock city and warehouse lookup. Label creation and other provider actions are disabled. | Leave API credentials absent. Use local QA for provider-specific flows. |
| Reconciliation, tracking and cron | Scheduler credentials absent. No scheduler is started. | Leave `CRON_SECRET` absent. Use local mocked payment/reconciliation tests. |

The sandbox is a guarded application workflow. It blocks the app's Fetch and Blob SDK transports and avoids repository dotenv files. An unrestricted shell or arbitrary custom TCP program still has its normal OS capabilities. Any future real-provider check needs separate operator authorization and dedicated DEV credentials.

## Vercel Preview handoff

The Git-linked Vercel project uses `redesign-3dkid-v2` for Production. Preview setup is a separate operator action. Before approval:

1. Scope `OPS02_DEPLOYMENT=preview`, `OPS02_MODE=neon` and `DEV_DATABASE_APP_URL` to Preview or a dedicated Preview branch. Use the restricted pooled DEV connection. Remove any Preview `DATABASE_URL`, `DIRECT_URL`, `DATABASE_URL_UNPOOLED` and `DEV_DATABASE_OWNER_URL` bindings. Keep the Production Neon integration and its credentials scoped to Production.
2. Set `ONLINE_PAYMENT_MODE=disabled`, `PRODUCT_MEDIA_CLEANUP_ENABLED=false` and `PRODUCT_VARIANTS_ENABLED=true`. Leave `TEST_MODE` off and all live integration secret names absent, including credentials inherited from a Vercel integration. The application rejects Preview configuration containing those credentials.
3. Set dedicated Preview `AUTH_SECRET` and `CUSTOMER_AUTH_SECRET`. Set `ADMIN_USERNAME` and an independent bcrypt `ADMIN_PASSWORD_HASH` for Preview. Set `CUSTOMER_AUTH_ORIGIN`, `AUTH_URL`, `SITE_URL` and `NEXT_PUBLIC_SITE_URL` to the chosen HTTPS Preview origin. Keep Deployment Protection enabled for the synthetic storefront.
4. Verify that any Vercel deployment labels agree with the explicit Preview marker. Build and deploy only after separate approval. Check that startup verifies the DEV marker, API access uses `app_3dkid`, and all external actions remain disabled. See [Vercel system environment variables](https://vercel.com/docs/environment-variables/system-environment-variables) and [Neon connection pooling](https://neon.com/docs/connect/connection-pooling).

Run builds, regression cycles, fixture resets and large synthetic experiments locally by default. Use Neon DEV for targeted cloud checks and later performance profiling, stopping the app when idle. This setup creates the 100-product DEV dataset.

## Original OPS-02 verification evidence

- The direct owner and pooled application endpoints each passed libpq `verify-full` TLS and the role, database and environment-marker checks. Prisma also completed the browser and checkout flow against the pinned pooled endpoint with strict certificate validation.
- Local PostgreSQL 18 and Neon DEV matched at 25 application tables, 212 columns, 214 constraints, 65 indexes, 22 enum labels, 13 functions and 22 triggers. The public schema fingerprint was `c0162f84eebc0b351f8c973b5b16579ffd80ec528528810f2b87d42b403323c1`. The application ACL fingerprint was `2ac161b7e4921efc66b1000a58426aad3efd89b666e4694062e9143c6297c266`.
- The application role passed login, privilege and ownership checks. Public DDL and truncation were rejected. The pinned guard rejected Production hostname and connection-option substitutions. The local rehearsal rejected a mismatched database marker, reapplied the reviewed migration to the schema-only baseline, and passed Prisma validation with an empty schema diff.
- The 100-product fixture seeded successfully on both targets. The local rehearsal verified reseeding and a data-only reset followed by reseeding. The 500- and 1,000-product presets are available for later profiling.
- Optimized browser smoke checks passed on both targets for the storefront, catalog, product details, credentials sign-in, the customer account and cart, and checkout with mocked Nova Poshta. A separate restricted-role query confirmed the durable synthetic order. The browser checks reported zero hydration errors.
- TypeScript, ESLint, the optimized build and the bulk PostgreSQL/browser suite passed. The suite covered the historical commerce migrations and grants, mock OAuth, native sign-in, SEO and branding, account illustrations, cross-device carts and mocked payment reconciliation. An earlier isolation run exposed a Windows preload parsing issue and a separate run timed out at keyboard navigation. The corrected launcher passed the complete rerun.

The Windows preload now loads the dotenv guard from the provider mock itself, keeping one `--require` argument in each Next worker. The earlier keyboard timeout passed on an unchanged rerun and its exact cause was unconfirmed. OPS-02A keeps the complete suite and adds checks for ordinary lifecycle commands and ambiguous or conflicting environments.
