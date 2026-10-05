# Data Dictionary / ERD

Source of truth: `backend/prisma/schema.prisma`. This document explains the
*why* behind each model; field-level types live in the schema itself.

## Entity relationship overview

```
User (dashboard operator, RBAC)

Partner ──< ApiCredential
   │  │
   │  └──< RoutingRule (optional partner scope)
   │
   └──< Transaction ──< TransactionStatusHistory
              │    │  └──< WebhookEvent (Gateway callbacks)
              │    └──< ReconciliationRecord
              │
              └── RoutingRule (which rule routed it, nullable)

JobQueue (independent — DB-backed retry/timeout worker)
AuditLog (independent — every API call, any actor)
```

## Models

### User
Dashboard operators (not partners). `role` drives `RolesGuard`
(`docs/role-permission-matrix.md`). `passwordHash` — bcrypt, never the raw
password; never logged (see `redact` config in `app.module.ts`'s pino
logger).

### Partner
One row per ecosystem participant (Koperasi, Resi Gudang, Petani, Peternak,
Nelayan, Pekebun, Toko/Warung, Logistik, Penyedia Alsintan, Penggilingan
Padi, Distributor, Payment Gateway, E-commerce/Marketplace, ...) — the
`PartnerType` enum enumerates exactly the list from proposal §2. `code` is a
short, URL/log-safe unique identifier used in routing rules and correlation
IDs. `status` gates whether the partner's credentials can authenticate at
all (`ApiKeyAuthGuard` checks this).

### ApiCredential
A partner can have multiple credentials (key rotation without downtime:
issue new, revoke old). `apiKey` is a public-ish lookup value; `apiSecretHash`
is bcrypt — the raw secret is shown to the operator **once**, at creation
time, and never stored or retrievable again (standard API-key UX).

### RoutingRule
`transactionType` + optional `partnerId` (null = applies to any partner) +
`priority` (lower number = evaluated first) select a `targetService`
(e.g. `BLOCKCHAIN_GATEWAY`, or a named business service) and optional
`targetConfig` JSON (e.g. an endpoint override) for the orchestration layer
to call. `isActive` lets rules be staged/disabled without deletion.

### Transaction
The central record. `switchingTransactionId` is this system's own
human-referenceable ID (separate from `id`, the internal UUID primary key);
`businessTransactionId` is whatever ID the partner's own system uses;
`correlationId` ties together logs/audit entries for one request across
modules; `idempotencyKey` (unique per partner) prevents duplicate
processing of a retried client request. `gatewayRequestId` and
`blockchainTxHash` are populated once the Gateway leg runs — note the
Switching System stores the hash only as a **reference**, it never generates
one (that's the Gateway's job, per the system boundary in
`docs/architecture.md`).

### TransactionStatusHistory
Append-only log of every status transition a transaction goes through — see
`docs/transaction-status-model.md`.

### AuditLog
One row per API call (dashboard or partner-facing), capturing exactly the
fields proposal §5.8 requires: actor, endpoint, method, timestamp, IP
(`ipAddress`), request ID, correlation ID, response status, error message -
plus `durationMs` (latency, feeding the dashboard's avg-latency metric).
Populated by `AuditLogMiddleware` (Stage 4) via `res.on('finish')`, not
scattered manually through controllers - see
`docs/api-contract.md`'s Audit section for why middleware rather than an
interceptor.

### WebhookEvent
Raw inbound callbacks from the Blockchain Gateway, kept even if processing
later fails (`status: FAILED`) so nothing is silently dropped — a failed
webhook can be replayed/inspected instead of being lost.

### JobQueue
The DB-backed substitute for a Redis/BullMQ queue (see
`docs/architecture.md` §3 for why). Used for two job types:
`RETRY_GATEWAY_CALL` (a PROCESSING/TIMEOUT transaction's Gateway call needs
retrying) and `TIMEOUT_CHECK` (scan for transactions stuck past their
timeout window). `nextRunAt` + a cron worker implement backoff without
needing a message broker.

### ReconciliationRecord
One row per reconciliation check: what the Switching System believes a
transaction's status is vs. what the Gateway last reported, and whether they
agree (`matched`). This is what the reconciliation report (proposal §5.7,
§10) is built from.

## Fields intentionally **not** in this schema

- Blockchain private keys, wallet seeds, signing material — never touch this
  system (system boundary, enforced at the design level, not just by
  omission here).
- Raw partner API secrets or dashboard passwords — only their hashes.
