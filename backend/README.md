# SaleFlow Backend

Phoenix + Ash backend for SaleFlow — a sales lead management system with an agent queue, audit logging, and XLSX lead import.

## Stack

- **Phoenix 1.8** — JSON API (no LiveView)
- **Ash 3.7** + **AshPostgres 2.6** — Resource-based data layer
- **AshAuthentication 4.13** — Session-based auth (email + password)
- **Oban 2.20** — Background workers (auto-release, quarantine release)
- **PostgreSQL** — Primary database
- **ExCoveralls** — Test coverage reporting

## Setup

```bash
mix setup          # deps.get + ecto.create + ecto.migrate + seeds
mix phx.server     # start on port 4000
```

## Seed Data

```bash
mix run priv/repo/seeds.exs
```

Creates:
- `admin@saleflow.se` / `admin123` (admin)
- `agent@saleflow.se` / `agent123` (agent)
- 5 sample leads (Kroppex AB, Citymassage, Frisör Supreme AB, Byggmästarna i Norr AB, VVS Experten AB)

## Tests

```bash
mix test                    # run all tests
MIX_ENV=test mix coveralls  # run with coverage report
```

**243 tests, 0 failures — 88.9% coverage**

## API Routes

### Public

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/sign-in` | Sign in with email + password |

### Authenticated (`require_auth`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/auth/me` | Current user |
| POST | `/api/auth/sign-out` | Sign out |
| GET | `/api/leads` | List or search leads (`?q=term`) |
| GET | `/api/leads/:id` | Lead detail with calls + audit logs |
| POST | `/api/leads/next` | Dequeue next lead (atomic, skip-locked) |
| POST | `/api/leads/:id/outcome` | Submit call outcome |
| GET | `/api/meetings` | Upcoming scheduled meetings |
| POST | `/api/meetings` | Create a meeting |
| POST | `/api/meetings/:id/cancel` | Cancel a meeting |
| GET | `/api/audit` | Audit log (filterable by `user_id`, `action`) |

### Admin only (`require_auth` + `require_admin`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/users` | List all users |
| POST | `/api/admin/users` | Create user |
| GET | `/api/admin/stats` | Lead counts by status |
| POST | `/api/admin/import` | Import leads from XLSX |

## Domains

- **Accounts** — `User`, `Token` (AshAuthentication)
- **Sales** — `Lead`, `Assignment`, `CallLog`, `Meeting`, `Quarantine`
- **Audit** — `AuditLog` (append-only, fires on every mutating action)

## Workers (Oban)

- **AutoReleaseWorker** — Releases assignments older than 30 minutes (`*/5 * * * *`)
- **QuarantineReleaseWorker** — Releases expired quarantines (`0 * * * *`)

## Lead Statuses

`new` → `assigned` → `callback` / `meeting_booked` / `not_interested` / `customer` / `bad_number`

Leads in `quarantine` with an expired `quarantine_until` are returned to `new` by the worker.
