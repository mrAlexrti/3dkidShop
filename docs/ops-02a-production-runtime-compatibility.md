# OPS-02A — Production Runtime Compatibility and Environment Isolation

Launch priority. OPS-02 remains available for isolated development and testing on `feat/ops-02-development-isolation` at `2d1c49e10ec9e63cd711d92456c3e2568289dd7b`. The combined BRAND-01B candidate `c599eccd3b5c902efdfd80bc2a4f01945170f265` failed its Production isolation gate. The branding-only release starts at Production `3f2ad0986effca473740c2ba90585e9cd6029060`.

## Confirmed release blockers

1. **Build fallback.** OPS-02's `build.mjs` selects ordinary `next build` only when `VERCEL=1` and `VERCEL_ENV` identifies Production or Preview. With the system flags absent, it selects a local launcher that initializes and seeds disposable PostgreSQL and builds with synthetic integration settings. Vercel system-variable exposure is configurable. [Vercel system environment variables](https://vercel.com/docs/environment-variables/system-environment-variables)
2. **Datasource override.** OPS-02's Prisma initialization accepts `OPS02_MODE=local` and a valid loopback datasource even when `VERCEL_ENV=production`. Its instrumentation can also invoke the Development identity check with a mode set. The review reproduced the datasource choice with a stubbed Prisma constructor and a synthetic URL.
3. **Start command.** OPS-02 replaced the standard `npm start` path with the Development credential-loading and startup launcher. That is a Production entry-point regression regardless of how Vercel serves its Next.js functions.

The release review used stubbed processes and Prisma connections. It neither opened a database connection nor tested hosted configuration or credentials.

## Reconciliation plan

- Keep normal install, build and start entry points safe with hosted flags present or absent. Keep database initialization, seed, reset and provider mocks behind explicit development or test commands. Keep local tools and synthetic fixtures outside the deployed runtime path.
- Give Production precedence over DEV mode flags. Review Preview isolation separately and make ambiguous hosted configuration fail safely. Preserve the existing Production database role and provider configuration.
- Test labeled Production, missing flags, conflicting DEV flags, approved Preview and guarded local development with stubbed credentials and processes. Assert the selected datasource and child command and prove that Production loads no DEV credentials, initializes no database and starts no mocks. Rehearse the standard build and start using isolated resources before seeking release approval.
- Until OPS-02A is separately reviewed and reconciled, compose releases from the exact current Production SHA and transfer only their reviewed application changes. Run those candidates in an isolated checkout using external OPS-02 tooling. Verify each candidate's full ancestry and cumulative diff for launchers, Prisma overrides, seed logic and hosted behavior. Keep the OPS-02 and BRAND-01B development branches intact. When OPS-02A is approved, reconcile its reviewed changes against the then-current Production branch and update the development branch from that result.
