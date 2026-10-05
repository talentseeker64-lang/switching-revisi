# Architecture — Digital Switching System

## 1. System boundary

Digital Switching System (this repo) is an **integration hub**. It is not a
blockchain system and does not become one.

| Area | Digital Switching System | Blockchain Gateway (external) |
|---|---|---|
| Partner/ecosystem routing | ✓ | — |
| Business rules & validation | ✓ | — |
| Transaction orchestration | ✓ | Executes the blockchain leg only |
| Data transformation | ✓ | — |
| Blockchain RPC, wallet, private key, signing, gas/broadcast | **never** | ✓ |
| Blockchain monitoring | context & status only | ✓ |
| Ecosystem audit trail | ✓ | Gateway keeps its own |
| Blockchain TX hash | stores as reference | generates |
| Reconciliation | ✓ (compares its records against Gateway-reported status) | provides blockchain status/data |

This mirrors proposal §7 "Batas Tanggung Jawab" exactly. The Switching
System never stores a private key, never signs, never talks to an RPC node.

## 2. Component diagram

```
                         PARTNERS / APPLICATIONS
        (Koperasi, Petani, Toko/Warung, Logistik, Payment Gateway,
         E-commerce/Marketplace, ...)
                              │  HTTPS/REST (API key + secret)
                              ▼
┌───────────────────────────────────────────────────────────────┐
│                  DIGITAL SWITCHING SYSTEM (this repo)          │
│                                                                 │
│  ┌───────────────┐  ┌───────────────┐  ┌─────────────────────┐│
│  │ Partner Mgmt  │  │ API Gateway /  │  │ Routing & Switching ││
│  │               │  │ Auth (JWT +    │  │ Engine              ││
│  │               │  │ API key)       │  │                     ││
│  └───────────────┘  └───────────────┘  └─────────────────────┘│
│  ┌───────────────┐  ┌───────────────┐  ┌─────────────────────┐│
│  │ Transaction    │  │ Transformation │  │ Audit / Monitoring  ││
│  │ Orchestration  │  │ & Validation   │  │ / Reconciliation    ││
│  └───────────────┘  └───────────────┘  └─────────────────────┘│
│  ┌─────────────────────────────┐                               │
│  │ Gateway Client (REST,        │                               │
│  │ mockable) + DB-backed retry  │                               │
│  │ / timeout job queue          │                               │
│  └───────────┬───────────────────┘                             │
└──────────────┼───────────────────────────────────────────────┘
               │ REST API (Integration Contract — docs/api-contract.md)
               ▼
   ┌─────────────────────────┐
   │  BLOCKCHAIN GATEWAY      │   ← separate team, separate repo
   │  RPC / wallet / signing  │
   │  / gas / broadcast       │
   └────────────┬─────────────┘
                │ RPC
                ▼
           BLOCKCHAIN NETWORK
```

## 3. Deployment concept

- Backend: NestJS (Node.js), stateless, horizontally scalable; Dockerfile +
  docker-compose provided for container deployment behind Nginx.
- Frontend: Next.js dashboard, deployed separately (static/SSR), talks to the
  backend only via its public REST API.
- Database: PostgreSQL (dev: hosted Neon instance via `DATABASE_URL`; prod:
  any managed/self-hosted Postgres).
- Async/retry: DB-backed job queue (`job_queue` table) polled by a
  `@nestjs/schedule` cron worker inside the same backend process — no Redis
  dependency for the MVP. BullMQ + Redis is a documented upgrade path if
  throughput requires a dedicated broker later.
- Reverse proxy: Nginx terminates TLS and forwards to backend/frontend
  containers (see root `docker-compose.yml`).

## 4. Transaction sequence (happy path, with blockchain leg)

```
Partner            Switching System                 Blockchain Gateway
  │  POST /transactions                                      │
  ├──────────────────►│                                       │
  │                    │ auth (API key) → validate → route    │
  │                    │ status: RECEIVED→VALIDATING→ROUTING   │
  │                    │ persist transaction, idempotency key  │
  │                    │ status: PROCESSING                    │
  │                    ├──────────────────────────────────────►│
  │                    │   POST /gateway/transactions          │
  │                    │                                       │ validate, sign, broadcast
  │                    │◄──────────────────────────────────────┤
  │                    │   { gatewayRequestId, status: submitted }
  │                    │ status: PENDING                       │
  │                    │                                       │ (async) blockchain confirms
  │                    │◄──────────────────────────────────────┤
  │                    │   webhook: { status: confirmed, txHash }
  │                    │ status: SUCCESS, store blockchainTxHash
  │◄───────────────────┤                                       │
  │  GET /transactions/{id}/status → SUCCESS                   │
```

Failure/timeout/retry paths are defined in
`docs/transaction-status-model.md`.

## 5. Module ↔ responsibility map (folds the master-task's 3-engineer
   ownership into this repo's module boundaries)

| Module (`backend/src/modules/*`) | Responsibility (master-task owner) |
|---|---|
| `auth` | Authentication/authorization platform (E1) |
| `partners` | Partner/Merchant configuration API (E3) |
| `routing` | Routing configuration + engine (E3 API / E2 engine) |
| `transactions` | Merchant Transaction API, lifecycle, idempotency (E2) |
| `orchestration` | Sequencing, transformation, validation (E2) |
| `gateway-client` | Switching → Blockchain Gateway API (E2 + E1 contract) |
| `webhooks` | Inbound Gateway callback (E2) |
| `jobs` | Retry/timeout worker (E2) |
| `audit` | Audit trail log + query API (E1 foundation / E3 API) |
| `monitoring` | Dashboard summary API (E3) |
| `reconciliation` | Reconciliation job/report (E2 support / E1 review) |

## 6. Principles (proposal §8.1)

API-first · loose coupling · system independence · secure by design ·
centralized monitoring · configurable integration · scalable & extensible ·
separation of business logic and infrastructure.
