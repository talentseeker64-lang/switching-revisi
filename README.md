# Digital Switching System

Integration hub for the agribusiness ecosystem (Koperasi, Resi Gudang,
Petani, Peternak, Nelayan, Pekebun, Toko/Warung, Logistik, Penyedia
Alsintan, Penggilingan Padi, Distributor, Payment Gateway,
E-commerce/Marketplace...). Validates, routes, orchestrates, transforms and
audits transactions between partners, forwarding blockchain-related work to
an externally-developed **Blockchain Gateway** via REST — this system never
talks to blockchain, wallets, or private keys directly.

See `docs/architecture.md` for the full system boundary and component
diagram, and `docs/production-readiness.md` for what's done, what's
deliberately out of MVP scope, and what to check before a real deployment.

## Modules

| Module | What it does |
|---|---|
| `partners` | Partner/merchant CRUD, API credential issuance (shown once) |
| `routing` | Routing rules (partner-scoped or generic, priority-ordered) |
| `transactions` | Merchant Transaction API (partner-facing) + dashboard monitoring |
| `orchestration` | Dispatches routed transactions to the Gateway or a business service |
| `gateway-client` | REST client to the Blockchain Gateway (real + mock implementations) |
| `webhooks` | Inbound Gateway status callbacks |
| `jobs` | Retry/timeout/reconciliation cron workers (DB-backed, no Redis) |
| `audit` | One row per API call - actor, endpoint, status, duration |
| `monitoring` | Dashboard summary (traffic, transactions, partner/endpoint activity) |
| `reconciliation` | Compares Switching vs. Gateway-reported status |

## Stack

| Layer | Tech |
|---|---|
| Backend | NestJS 12 (TypeScript, ESM), Prisma 6 + PostgreSQL |
| Frontend | Next.js 16 (App Router), Tailwind v4, shadcn/ui |
| Auth | JWT (dashboard users) + API key/secret (partners) |
| Async/retry | DB-backed job queue + `@nestjs/schedule` cron (no Redis dependency) |
| API docs | OpenAPI/Swagger at `/docs` |

## Repository layout

```
backend/    NestJS API — the Digital Switching System itself
frontend/   Next.js operations dashboard
docs/       Architecture, API contract, ERD, role matrix, status model
docker-compose.yml, nginx/   Deployment composition (staging/production)
```

## Local development

### Backend

```bash
cd backend
cp .env.example .env   # fill in DATABASE_URL (Postgres) and JWT_SECRET
npm install
npx prisma migrate dev
npx prisma db seed      # creates a dev admin user, see console output
npm run start:dev       # http://localhost:3000, Swagger at /docs
```

### Frontend

```bash
cd frontend
npm install
npm run dev              # http://localhost:3001
```

`frontend/.env.local` sets `NEXT_PUBLIC_API_URL` (defaults to
`http://localhost:3000`).

Log in to the dashboard with the seeded admin credentials printed by
`prisma db seed` — **change that password before any shared/staging use.**

## Testing

```bash
cd backend
npm run test:e2e    # 45 tests across 8 spec files, full HTTP-level coverage
npm run build        # type-check + compile
```

```bash
cd frontend
npm run build         # type-check + production build
```

No Docker/browser in this backend's CI path is required to run the e2e
suite — it boots the full NestJS app in-process against the configured
`DATABASE_URL` and drives it with `supertest`. UI flows were verified
separately with Playwright during development (not part of the committed
test suite).

## Deployment

`docker-compose.yml` (root) builds and runs `backend`, `frontend`,
`postgres` and an `nginx` reverse proxy. Not exercised in the environment
this project was built in (no Docker available there) — validate it in an
environment that has Docker before relying on it.

## Blockchain Gateway integration

Built by a separate team, in a separate repository. This project only
implements a REST client against it (`backend/src/modules/gateway-client`),
behind a mockable interface (`GATEWAY_USE_MOCK=true` by default) so the rest
of the system can be developed and tested without the real Gateway running.
The draft integration contract is in `docs/api-contract.md` §4 and is
explicitly marked pending joint finalization with the Gateway team.
