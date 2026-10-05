# Role & Permission Matrix

## Dashboard users (JWT-authenticated, `User.role`)

| Module | ADMIN | OPERATOR | VIEWER |
|---|---|---|---|
| Partner Management — view | ✓ | ✓ | ✓ |
| Partner Management — create/edit/activate/deactivate | ✓ | ✓ | — |
| Partner credentials — issue/revoke | ✓ | — | — |
| Routing Rules — view | ✓ | ✓ | ✓ |
| Routing Rules — create/edit/activate/deactivate | ✓ | ✓ | — |
| Transactions — view/inquiry | ✓ | ✓ | ✓ |
| Transactions — manual retry/cancel (ops action) | ✓ | ✓ | — |
| Dashboard / Monitoring — view | ✓ | ✓ | ✓ |
| Audit Log — view | ✓ | ✓ | — |
| Reconciliation — view/run | ✓ | ✓ | — |
| User management (dashboard accounts) | ✓ | — | — |
| System configuration (env/integration settings) | ✓ | — | — |

Enforced via the `@Roles()` decorator + `RolesGuard` on each controller
method (`backend/src/modules/auth/guards/roles.guard.ts`). `ADMIN` is a
superset of `OPERATOR`, which is a superset of `VIEWER`'s read access — this
is expressed explicitly per-route, not implicitly inherited, so every
endpoint's access is auditable by reading its decorator.

## Partner-facing API (API key + secret authenticated, `ApiCredential`)

Partners authenticate with their own `apiKey`/`apiSecret` pair (per
`Partner`/`ApiCredential` — see `docs/data-dictionary-erd.md`) and can only:

- submit transactions on their own behalf (`POST /api/v1/transactions`);
- query the status/detail of **their own** transactions;
- receive webhook callbacks they've registered (future: outbound callback
  URL per partner, not in MVP scope — partners poll status via the inquiry
  API for now).

A partner credential has no access to dashboard endpoints, other partners'
data, routing configuration, or audit logs.

## System actor (internal)

Background jobs (`jobs` module) and the webhook receiver from the
Blockchain Gateway act as the `SYSTEM` actor in `AuditLog.actorType` — they
are not a separate authenticated principal, they run inside the backend
process itself.
