# API Contract

Full machine-readable spec: generated OpenAPI at `/docs` (Swagger UI) and
`/docs-json` on the running backend. This file documents the conventions the
generated spec follows and the endpoint list being built toward, stage by
stage.

## 1. Common response envelope

Every response (success or error) uses the same shape
(`backend/src/common/interceptors/response.interceptor.ts` and
`all-exceptions.filter.ts`):

```json
{
  "success": true,
  "data": { },
  "meta": { },
  "error": null,
  "correlationId": "..."
}
```

```json
{
  "success": false,
  "data": null,
  "meta": {},
  "error": { "code": "VALIDATION_ERROR", "message": "Invalid request", "details": [] },
  "correlationId": "..."
}
```

`correlationId` is read from the inbound `X-Correlation-Id` header if the
caller supplies one, otherwise generated; always echoed back on the response
header too. A separate `X-Request-Id` is generated per-request (not
reusable across retries) for lower-level tracing.

Standard error `code`s: `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`,
`NOT_FOUND`, `CONFLICT`, `RATE_LIMITED`, `INTERNAL_ERROR`, plus
domain-specific codes raised via `AppException` (e.g.
`IDEMPOTENCY_KEY_REUSED`, `ROUTING_RULE_NOT_FOUND`) as each module is built.

## 2. Authentication

| Caller | Mechanism |
|---|---|
| Dashboard user | `Authorization: Bearer <JWT>` from `POST /api/v1/auth/login` |
| Partner | `X-Api-Key` + `X-Api-Secret` headers (see `docs/role-permission-matrix.md`) |
| Blockchain Gateway → Switching (webhook) | `X-Api-Key` shared secret (Stage 3; exact mechanism finalized with Gateway team) |

Routes are protected by default (global `JwtAuthGuard`); `@Public()` opts a
route out (health check, login, partner-facing endpoints which use
`ApiKeyAuthGuard` instead).

## 3. Endpoint inventory (baseline from master-task §8, build order per the
   execution stages in the project plan)

### Auth — Stage 0 ✅
```
POST /api/v1/auth/login
```

### Health — Stage 0 ✅
```
GET /health
```

### Partner Management — Stage 1 ✅
```
GET    /api/v1/partners                                    (ADMIN/OPERATOR/VIEWER)
GET    /api/v1/partners/{id}                                (ADMIN/OPERATOR/VIEWER)
POST   /api/v1/partners                                     (ADMIN/OPERATOR)
PUT    /api/v1/partners/{id}                                 (ADMIN/OPERATOR)
PATCH  /api/v1/partners/{id}/status                           (ADMIN/OPERATOR)
POST   /api/v1/partners/{id}/credentials                      (ADMIN)
PATCH  /api/v1/partners/{id}/credentials/{credentialId}/revoke (ADMIN)
```

`POST .../credentials` returns the raw `apiSecret` exactly once (bcrypt-hashed
at rest, per `docs/data-dictionary-erd.md`). List supports `search`, `type`,
`status`, `page`, `pageSize` query params and returns `meta.total` for
pagination.

### Routing Configuration — Stage 2 ✅
```
GET    /api/v1/routing-rules                (ADMIN/OPERATOR/VIEWER)
GET    /api/v1/routing-rules/{id}            (ADMIN/OPERATOR/VIEWER)
POST   /api/v1/routing-rules                 (ADMIN/OPERATOR)
PUT    /api/v1/routing-rules/{id}             (ADMIN/OPERATOR)
DELETE /api/v1/routing-rules/{id}              (ADMIN/OPERATOR)
```
`targetConfig.fieldMapping` (optional JSON object) drives the data
transformation layer - see §5 below.

### Merchant Transaction API (partner-facing, API key/secret auth) — Stage 2 ✅
```
POST /api/v1/transactions                  (Idempotency-Key header required)
GET  /api/v1/transactions/{switchingTransactionId}
GET  /api/v1/transactions/{switchingTransactionId}/status
```
`{id}`/`{switchingTransactionId}` is the human-referenceable id returned at
creation, not the internal UUID. Scoped to the authenticated partner's own
transactions - looking up another partner's transaction returns 404, not 403
(doesn't reveal existence).

### Transaction Monitoring (dashboard, JWT auth) — Stage 2 ✅ / Stage 4
```
GET /api/v1/transactions                                (search/filter/paginate, all partners)
GET /api/v1/transactions/by-reference/{switchingTransactionId}   (detail + status history + routing info)
```
**Implementation note (not in the original master-task baseline):** the
baseline listed `GET /api/v1/transactions/{id}` for both the partner-facing
and dashboard APIs. Giving both a literal single-segment `:id` route on the
same path+method is not resolvable (one guard would shadow the other), so
the dashboard single-transaction lookup was placed under a distinct
`by-reference/` segment instead, keeping the two auth mechanisms (API key vs
JWT) cleanly separated. Documented here per the "report assumptions, don't
silently invent" rule rather than left unstated.

### Data Transformation
A routing rule's `targetConfig.fieldMapping` (`{"amount": "total_amount"}`)
renames payload fields before a transaction leaves ROUTING for PROCESSING;
the result is stored as `Transaction.transformedPayload` alongside the
untouched original `payload`. Deliberately simple (flat rename only, no
nested paths or type coercion) for the MVP - see
`backend/src/common/utils/transform.util.ts`.

### Webhooks (inbound from Gateway) — Stage 3 ✅
```
POST /api/v1/webhooks/gateway        (X-Api-Key: GATEWAY_WEBHOOK_API_KEY)
```
Body: `{ gatewayRequestId, correlationId?, status, blockchainTxHash?, errorMessage? }`
(status is one of `submitted|pending|confirmed|failed|timeout`, see §4 below).
Always responds `200 { received: true, applied: boolean }` - `applied: false`
means no transaction matched `gatewayRequestId` (persisted as a WebhookEvent
for inspection either way); the endpoint never 404s so an upstream Gateway
won't retry indefinitely over a problem on our side.

### Dashboard — Stage 4 ✅
```
GET /api/v1/dashboard/summary?windowHours=24   (ADMIN/OPERATOR/VIEWER)
```
Returns exactly the metrics proposal §5.6/§10 name - traffic (request
count/error rate/avg latency), transaction volume + status breakdown
(all 9 statuses always present, zero-filled), partner activity (top 10),
endpoint activity (top 10). No KPI invented beyond that list.

### Audit — Stage 4 ✅
```
GET /api/v1/audit-logs                (ADMIN/OPERATOR; filters: actorType, actorId, correlationId, endpoint)
GET /api/v1/audit-logs/{id}            (ADMIN/OPERATOR)
```
One row per API request (dashboard or partner-facing), written by
`AuditLogMiddleware` on `res.on('finish')` - not a NestJS interceptor,
since interceptors run before the framework finalizes the response status
code (especially with `@HttpCode()`), so 'finish' is the only point
status/duration are guaranteed accurate.

### Reconciliation — Stage 4 ✅
```
GET  /api/v1/reconciliation                 (ADMIN/OPERATOR; filter: matched=true|false)
POST /api/v1/reconciliation/run             (ADMIN/OPERATOR; body: { windowHours? })
```
Compares each gateway-routed transaction's Switching-side status against a
live `queryStatus` call to the Gateway and records a `ReconciliationRecord`
either way (match or mismatch) - it only observes and records, it never
mutates transaction state itself (that stays the webhook/polling job's
job in `orchestration`). Also runs automatically every hour
(`JobsService.runScheduledReconciliation`, 24h lookback).

## 4. Blockchain Gateway Integration Contract — **DRAFT, pending joint
   finalization with the Gateway team**

The real Blockchain Gateway is built by a separate team in a separate repo;
no shared contract exists yet. Per proposal §6, this contract is supposed to
be a **joint deliverable** finalized at project kickoff. Since that joint
session hasn't happened, Stage 3 implements the Switching side against the
draft below, behind an interface (`backend/src/modules/gateway-client`) with
a mock implementation — so the rest of the system isn't blocked waiting for
the real Gateway. **This section must be reviewed and reconciled with the
Gateway team before go-live; treat every detail here as provisional.**

### Base URL / environments
`GATEWAY_BASE_URL` env var — dev/staging/prod each point at a different
Gateway deployment. `GATEWAY_USE_MOCK=true` bypasses the HTTP call entirely
for local dev/tests.

### Auth
`X-Api-Key: <GATEWAY_API_KEY>` header (placeholder — real mechanism TBD with
Gateway team; could be mTLS, OAuth2 client-credentials, etc.)

### Submit a blockchain-bound transaction
```
POST {GATEWAY_BASE_URL}/v1/transactions
Headers: X-Api-Key, X-Correlation-Id, Idempotency-Key

Request:
{
  "correlationId": "string",
  "idempotencyKey": "string",
  "transactionType": "string",
  "payload": { }
}

Response 202:
{
  "gatewayRequestId": "string",
  "status": "submitted"
}
```

### Query status
```
GET {GATEWAY_BASE_URL}/v1/transactions/{gatewayRequestId}

Response 200:
{
  "gatewayRequestId": "string",
  "status": "submitted" | "pending" | "confirmed" | "failed" | "timeout",
  "blockchainTxHash": "string | null",
  "errorMessage": "string | null"
}
```

### Inbound callback (Gateway → Switching)
```
POST {SWITCHING_BASE_URL}/api/v1/webhooks/gateway
Headers: X-Api-Key

Body:
{
  "gatewayRequestId": "string",
  "correlationId": "string",
  "status": "confirmed" | "failed" | "timeout",
  "blockchainTxHash": "string | null",
  "errorMessage": "string | null"
}
```

### Status mapping
See `docs/transaction-status-model.md` §"Blockchain Gateway status mapping".

### Switching-side retry/timeout implementation (Stage 3 ✅)
Implemented in `backend/src/modules/orchestration` and
`backend/src/modules/jobs`:
- **Dispatch** happens synchronously inside the partner's `POST
  /transactions` request, right after the transaction reaches PROCESSING
  (via an internal event, not a direct call - see
  `transactions.service.ts`'s comment on why). If the Gateway's `submit`
  call fails or exceeds `GATEWAY_TIMEOUT_MS`, the transaction moves to
  TIMEOUT and a retry job is enqueued.
- **Retry queue**: a DB-backed `job_queue` table (no Redis - see
  `docs/architecture.md` §3), polled every 5s. Backoff is `attempt *
  RETRY_BACKOFF_BASE_MS`; after `RETRY_MAX_ATTEMPTS` the transaction is
  failed outright (`errorCode: RETRY_EXHAUSTED`).
- **Stuck-transaction scanner**: every 10s, catches PROCESSING/PENDING
  transactions that haven't moved in `TRANSACTION_PENDING_TIMEOUT_MS` (e.g.
  a crashed process mid-dispatch, or a PENDING transaction the Gateway never
  confirmed) and routes them into the same TIMEOUT → retry path.
- **Polling fallback**: every 5s, PENDING transactions with a
  `gatewayRequestId` are also queried directly (`GET
  /v1/transactions/{gatewayRequestId}`) as a safety net alongside the
  webhook - whichever arrives first wins; the other is a no-op (status
  already applied).
- **Non-Gateway targets** (`targetService !== "BLOCKCHAIN_GATEWAY"`): if the
  routing rule's `targetConfig.endpointUrl` is set, Switching POSTs the
  transformed payload there and maps 2xx→SUCCESS, else→FAILED. If no
  `endpointUrl` is configured, the transaction completes SUCCESS
  immediately with that noted in its status history - no generic
  "business service protocol" is specified anywhere in the source
  documents, so nothing beyond this mechanical forward-or-complete
  behavior was invented.

### Still open (flagged, not silently decided)
- Exact auth mechanism for both directions.
- Retry/timeout policy the Gateway itself enforces (affects how
  aggressively Switching should retry on its side).
- Webhook signature/verification scheme.
- Idempotency semantics on the Gateway's own submit endpoint.

These are `DECISION REQUIRED` items per the master-task's operating rules —
not assumed, not invented, called out here for the joint session.
