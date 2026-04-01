# SaleFlow Backend Documentation

## Stack
- Elixir 1.18+, Phoenix 1.8, Ash 3.7
- PostgreSQL via AshPostgres
- AshAuthentication (email + password)
- Oban for background jobs
- ExUnit + ExCoveralls for tests

## Setup
```bash
cd backend
mix deps.get
mix ecto.create
mix ecto.migrate
mix run priv/repo/seeds.exs
mix phx.server  # runs on port 4000
```

## Domains
- [Accounts](./accounts.md) — User authentication
- [Sales](./sales.md) — Lead, Assignment, CallLog, Meeting, Quarantine
- [Audit](./audit.md) — AuditLog (full trail of every action)
- [Workers](./workers.md) — Oban background jobs
- [API](./api.md) — REST JSON endpoints
