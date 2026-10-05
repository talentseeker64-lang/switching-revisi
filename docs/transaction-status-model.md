# Transaction Status Model

Source of truth: `backend/prisma/schema.prisma` → `TransactionStatus` enum,
enforced centrally by the transaction state-transition service in the
`transactions` module (Stage 2) — no other module writes `Transaction.status`
directly.

## States

```
RECEIVED → VALIDATING → ROUTING → PROCESSING → PENDING → SUCCESS
```

Terminal/error states, reachable from any non-terminal state:

```
FAILED       — validation/routing/business-rule rejection, or Gateway
               reported a permanent failure
TIMEOUT      — no response from the downstream/Gateway within policy;
               distinct from FAILED because it's retried first (see below)
CANCELLED    — explicitly cancelled by an operator before reaching a
               terminal state
```

## Transitions

| From | To | Trigger |
|---|---|---|
| — | RECEIVED | Partner submits a transaction (idempotency key checked first) |
| RECEIVED | VALIDATING | Orchestration picks up the transaction |
| VALIDATING | ROUTING | Validation passes |
| VALIDATING | FAILED | Validation fails (bad payload, unknown partner, etc.) |
| ROUTING | PROCESSING | A routing rule matched a target (Gateway or business service) |
| ROUTING | FAILED | No routing rule matched |
| PROCESSING | PENDING | Target (e.g. Gateway) accepted the request, result not yet final |
| PROCESSING | SUCCESS | Target completed synchronously (e.g. no external endpoint configured for a non-Gateway rule) |
| PROCESSING | TIMEOUT | No response within the configured timeout → enqueued for retry |
| PROCESSING | FAILED | Target rejected the request synchronously |
| PENDING | SUCCESS | Gateway callback/poll reports a confirmed terminal success |
| PENDING | FAILED | Gateway callback/poll reports a terminal failure |
| PENDING | TIMEOUT | Stuck-transaction scanner: no resolution within `TRANSACTION_PENDING_TIMEOUT_MS` |
| TIMEOUT | PROCESSING | Retry job re-attempts the call (bounded by `RETRY_MAX_ATTEMPTS`) |
| TIMEOUT | SUCCESS | A late Gateway callback/poll arrives after the scanner already timed it out |
| TIMEOUT | FAILED | Retry attempts exhausted (`errorCode: RETRY_EXHAUSTED`) |
| any non-terminal | CANCELLED | Operator cancellation (dashboard action) |

Every transition is written to `TransactionStatusHistory` with
`fromStatus`, `toStatus`, `reason`, and `actor` (`system` or a user id) —
this is the audit trail a transaction's lifecycle can be reconstructed from.

## Blockchain Gateway status mapping

The Gateway is a separate system with its own status vocabulary. The
Switching System never exposes Gateway statuses directly to partners — it
maps them onto the table above:

| Gateway status (docs/api-contract.md — DRAFT) | Switching status |
|---|---|
| `submitted` | PROCESSING |
| `pending` | PENDING |
| `confirmed` | SUCCESS |
| `failed` | FAILED |
| `timeout` | TIMEOUT |

This mapping is implemented in one place
(`backend/src/modules/orchestration`) so a change to the Gateway's
vocabulary never needs more than one file touched, and partners are shielded
from Gateway-internal status naming changes.

## Idempotency

`Transaction` has a unique constraint on `(partnerId, idempotencyKey)`. A
repeated submission with the same key for the same partner returns the
existing transaction's current state instead of creating a duplicate — it
does **not** re-run orchestration/validation.
