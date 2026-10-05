# Production Readiness & Known Limitations

Status at end of the build: all 5 stages of the project plan complete, backed
by 45 passing e2e tests (`backend/test/*.e2e-spec.ts`, 8 files) and
browser-driven verification of every UI flow via Playwright.

## What's in place

- **Correctness**: e2e coverage for happy paths, validation failures,
  unauthorized/forbidden, not-found, duplicate/idempotency, and
  timeout/retry/exhaustion scenarios (master-task Rule 7's minimum set) for
  every module.
- **Security baseline** (proposal §9):
  - HTTPS assumed at the reverse proxy (Nginx) in deployment; `helmet()` sets
    CSP/HSTS/frame-options/etc. on the app itself.
  - JWT auth (dashboard) + API key/secret auth (partners), both enforced
    globally with per-route `@Public()`/`@Roles()` opt-outs, not
    opt-ins - a new route is protected by default.
  - Passwords and partner API secrets are bcrypt-hashed; a partner secret is
    shown exactly once at issuance and never stored in reversible form.
  - Shared-secret comparisons (the Gateway webhook guard) use
    `crypto.timingSafeEqual`, not `===` - see
    `backend/src/common/utils/timing-safe-equal.util.ts`.
  - Rate limiting: a global 120 req/min baseline
    (`@nestjs/throttler`), tightened to 20/min on `/auth/login`
    specifically (brute-force target) - verified by an e2e test that drives
    21 requests and asserts the 21st gets HTTP 429.
  - Structured logging redacts `Authorization` and `x-api-secret` headers;
    request bodies (which could contain a login password) are never logged.
  - `npm audit`: backend has 3 high-severity findings, all in `prisma`'s CLI
    dev-dependency chain (`@prisma/config` → `deepmerge-ts`, "stack
    exhaustion on recursive object graphs"). The `prisma` CLI *is* present in
    the Docker runtime image (`backend/Dockerfile`'s runtime stage reuses the
    builder's full `node_modules` rather than a fresh prod-only install,
    because `docker-entrypoint.sh` runs `prisma migrate deploy` at container
    startup and needs it) - but nothing reachable via the running HTTP server
    invokes the CLI, only the entrypoint script does, once, at startup. Fixing
    the CVE would force-downgrade Prisma to 6.12.0; left as-is rather than
    downgrading an already-vetted stable version over a CVE with no
    network-facing attack path in this app. Removed `@nestjs/mau` (unused
    Nest Cloud deploy CLI) and `uuid` (unused - the code uses `node:crypto`'s
    `randomUUID` throughout), which eliminated 5 other high-severity findings
    outright. Frontend: 0 vulnerabilities.
- **Database**: every migration applied incrementally against the real
  (Neon-hosted) Postgres instance, never hand-edited; indexes on the columns
  actually queried (`@@index` in `prisma/schema.prisma`).
- **Observability**: structured JSON logs (pino), correlation IDs on every
  request, an audit trail of every API call, a dashboard with traffic/error-
  rate/latency/transaction metrics.

## Explicitly out of MVP scope (proposal §16 - not silently dropped)

- E-commerce/Marketplace rebuild - out of scope by design, it's external.
- Blockchain Gateway itself - separate team/repo; this project only
  implements a client against its DRAFT contract (`docs/api-contract.md`
  §4), with a mock standing in until the real Gateway exists.
- Direct Switching → blockchain RPC - architecturally prohibited, not a gap.
- Full enterprise API management (API monetization, developer portal, etc.).
- High-availability clustering / enterprise disaster recovery.
- Advanced fraud detection.
- Enterprise SIEM integration (structured logs are SIEM-ingestible, but no
  SIEM connector is wired up).
- KMS/HSM - not applicable to this codebase (it never holds private keys;
  that's the Gateway's responsibility per the system boundary).

## Known technical debt / upgrade paths

- **No Redis/BullMQ** (`docs/architecture.md` §3): retry/timeout/
  reconciliation run on a DB-backed job table polled by `@nestjs/schedule`
  cron, because this dev environment had no Redis available. Fine at MVP
  transaction volume; swap for BullMQ+Redis if throughput requires a real
  broker - `JobsService` is the one place that would change.
- **Blockchain Gateway integration contract is a DRAFT** (`docs/
  api-contract.md` §4) - written unilaterally since the real Gateway team's
  contract doesn't exist yet. Auth mechanism, retry/timeout policy on the
  Gateway's own side, webhook signature scheme, and Gateway-side idempotency
  semantics are flagged `DECISION REQUIRED`, not assumed.
- **Business-service routing target** (`targetService !== "BLOCKCHAIN_GATEWAY"`)
  has no defined protocol beyond "POST the transformed payload to
  `targetConfig.endpointUrl` if one's configured, else mark complete" -
  nothing more specific is documented anywhere in the source materials, so
  nothing more specific was invented. Revisit once real business-service
  integrations are scoped.
- **No CI pipeline** configured in this repo (no `.github/workflows` etc.) -
  the test suite and build are verified manually each stage; wiring that
  into CI is a natural next step.
- **docker-compose.yml/Dockerfiles are unexercised** in the environment this
  project was built in (no Docker available there) - validate them in an
  environment that has Docker before relying on them for a real deployment.
- **Migrations run from the app container's own entrypoint**
  (`docker-entrypoint.sh` → `prisma migrate deploy`) on every container
  start. Fine for a single instance; if this is ever horizontally scaled to
  multiple replicas, multiple containers would race to run migrations
  concurrently on a deploy. Prisma's migrate deploy is designed to be safe
  under concurrent execution (it uses an advisory lock), but the cleaner
  pattern at that point is a separate one-shot migration job run once before
  the app replicas start, not baked into every replica's entrypoint.
- **Single dashboard admin password** is seeded in cleartext in
  `backend/prisma/seed.ts`'s console output for local dev convenience -
  change it immediately in any shared/staging/production environment (the
  seed script's own output says so).

## What to do before a real production deployment

1. Finalize the Blockchain Gateway integration contract jointly with that
   team; replace the mock client's assumptions with the agreed contract.
2. Validate `docker-compose.yml` end-to-end in an environment with Docker.
3. Replace the seeded dev admin credentials.
4. Set `GATEWAY_USE_MOCK=false` and fill in real `GATEWAY_*` env vars.
5. Point `DATABASE_URL` at the production database; run `prisma migrate
   deploy` (the Dockerfile's entrypoint already does this automatically).
6. Review rate-limit thresholds against expected real traffic.
7. Set up CI (build + `npm run test:e2e` on every change) and a CD path.
