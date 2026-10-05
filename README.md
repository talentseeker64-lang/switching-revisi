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


## Penyesuaian 

## File Switching yang Ditambah / Diubah (Total 6 File)
Lokasi root:`D:\switching-main\backend\`

### ✨ File BARU (Dibuat dari Nol — 1 File)
File Deskripsi 1 webhook-crypto.util.ts Core crypto utility untuk HMAC-SHA256 webhook. Berisi:`computeHmacSha256Hex` ,`buildSignedPayload (timestamp+"."+rawBody)` ,`verifyWebhookSignature` (timestamp tolerance + constant-time compare),`signOutgoingWebhookRequest` , export type`HeaderConvention` + const`DEFAULT_TOLERANCE_MS=300000` .

### 🔧 File DIMODIFIKASI (Diedit dari original — 5 File)
 File Perubahan Utama 2 gateway-webhook.guard.ts Guard utama upgrade dual-layer :
 • Layer 1 TETAP (unchanged): cek`x-api-key` via`timingSafeStringEqual` (original baris 17-18 user)
 • Layer 2 BARU: HMAC-SHA256 verify via`verifyWebhookSignature()`
 • Graceful rollout : jika`GATEWAY_WEBHOOK_SHARED_SECRET` kosong → skip layer2; jika`SIGNATURE_REQUIRED=false` → mismatch tidak reject dulu. 3 main.ts Capture raw body untuk HMAC (KRITIS — tanpa ini signature mismatch 100%):
 •`NestFactory.create(AppModule, {..., bodyParser: false })` → disable Nest body parser default
 • Install sendiri`express.json({ verify: callback })` → save byte asli ke`(req as any).rawBody` 4 .env.example Tambah 10 ENV var BARU :
 • §INBOUND:`GATEWAY_WEBHOOK_SHARED_SECRET` ,`_TOLERANCE_MS` ,`_SIGNATURE_REQUIRED`
 • §OUTBOUND:`GATEWAY_OUTBOUND_SHARED_SECRET` ,`_HEADER_CONVENTION`
 • §Operational:`TRANSACTION_PENDING_TIMEOUT_MS` ,`RETRY_BACKOFF_BASE_MS` ,`RETRY_MAX_ATTEMPTS` 5 env.validation.ts Joi schema untuk semua ENV baru (tambahan line 20-35): default value sesuai rekomendasi user (10s timeout, retry 5x, 5s backoff, 60s pending, tolerance 5 menit). 6 http-gateway-client.service.ts Sign outgoing request Switching → Gateway :
 • Jika`outboundSecret` di-set → setiap non-GET request ditambahkan signature header (`X-<prefix>-Signature` +`X-<prefix>-Timestamp` )
 • Format hash SAMA PERSIS dengan inbound:`timestamp + "." + rawBodyJSON.stringify()`

### 📊 Perbandingan: Switching ↔ BukuPencatatan (Konsistensi 100%)
Kontrak Signature Switching BukuPencatatan Header signature inbound `X-Gateway-Signature` ✅ SAMA Header timestamp inbound `X-Gateway-Timestamp` (UNIX ms) ✅ SAMA Hash input `timestamp + "." + rawBodyUTF8` ✅ SAMA Algoritma HMAC-SHA256 ✅ SAMA Encoding signature hex (lowercase) ✅ SAMA Compare method `timingSafeEqual` via wrapper ✅ SAMA (`timingSafeStringEqual` ) Tolerance default 5 menit (300.000 ms) ✅ SAMA Graceful rollout flag `SHARED_SECRET kosong=skip` ,`REQUIRED=false=log-only` ✅ SAMA

### 📁 File di Switching yang TIDAK Diubah (Tetap Original)
Sebagai referensi, ini file-file di modul webhook & gateway-client yang KITA SENTUH SAMA SEKALI (tidak butuh diubah):

- `webhooks.service.ts` ,`webhooks.controller.ts` ,`webhooks.module.ts` (logic business tetap jalan)
- `gateway-webhook.dto.ts` (DTO camelCase status enum — kita pertahankan)
- `mock-gateway-client.service.ts` (mock client untuk testing)
- `gateway-client.interface.ts` ,`gateway-client.module.ts` ,`gateway-status.util.ts`
- `timing-safe-equal.util.ts` (sudah valid dipakai dari awal)
Semua perubahan sudah 100% backward compatible — jika Gateway team belum deploy signing, tinggal biarkan`GATEWAY_WEBHOOK_SHARED_SECRET=` (kosong) dan`SIGNATURE_REQUIRED=false` di`.env` switching-main → semua flow pre-HMAC TETAP BERJALAN NORMAL.
