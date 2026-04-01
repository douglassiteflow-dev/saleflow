# Background Workers

SaleFlow uses [Oban](https://hexdocs.pm/oban) for background job processing. Workers are located in `lib/saleflow/workers/`.

## Configuration

```elixir
# config/config.exs
config :saleflow, Oban,
  repo: Saleflow.Repo,
  queues: [default: 10, scheduled: 5],
  plugins: [
    {Oban.Plugins.Cron, crontab: [
      {"*/5 * * * *", Saleflow.Workers.AutoReleaseWorker},
      {"0 * * * *",   Saleflow.Workers.QuarantineReleaseWorker}
    ]}
  ]
```

In test environment, Oban is configured with `testing: :inline`, allowing workers to be invoked directly:

```elixir
config :saleflow, Oban, testing: :inline
```

---

## AutoReleaseWorker

**Module:** `Saleflow.Workers.AutoReleaseWorker`
**Schedule:** every 5 minutes (`*/5 * * * *`)
**Queue:** `scheduled`

### Purpose

Finds and releases assignments that have been active for more than 30 minutes without the agent completing or logging an outcome. This prevents leads from being stuck in `:assigned` status indefinitely when an agent disconnects, crashes, or forgets to act.

### Algorithm

1. Query `assignments` for rows where `released_at IS NULL` and `assigned_at < (now - 30 minutes)`.
2. For each stale assignment:
   a. Release it via `Sales.release_assignment/2` with reason `:timeout`.
   b. Reload the associated lead; if its status is still `:assigned`, reset it to `:new` so it re-enters the queue.
   c. Create an audit log entry with action `"assignment.auto_released"`.

### Example

```elixir
# Called automatically by Oban cron, but can be invoked directly in tests:
:ok = Saleflow.Workers.AutoReleaseWorker.perform(%Oban.Job{})
```

### Audit log

| Field           | Value                                                  |
|-----------------|--------------------------------------------------------|
| `action`        | `"assignment.auto_released"`                           |
| `resource_type` | `"Assignment"`                                         |
| `resource_id`   | Assignment UUID                                        |
| `changes`       | `%{"release_reason" => %{"from" => nil, "to" => "timeout"}}` |
| `metadata`      | `%{"worker" => "AutoReleaseWorker"}`                   |

---

## QuarantineReleaseWorker

**Module:** `Saleflow.Workers.QuarantineReleaseWorker`
**Schedule:** every hour (`0 * * * *`)
**Queue:** `scheduled`

### Purpose

Finds leads that were quarantined (status `:quarantine`) and whose `quarantine_until` timestamp has passed, and returns them to the queue by resetting their status to `:new` and clearing `quarantine_until`.

### Algorithm

1. Query `leads` for rows where `status = 'quarantine'` and `quarantine_until < NOW()`.
2. For each expired lead:
   a. Call `Sales.update_lead_status/2` with `%{status: :new, quarantine_until: nil}`.
   b. Create an audit log entry with action `"lead.quarantine_released"`.

### Example

```elixir
:ok = Saleflow.Workers.QuarantineReleaseWorker.perform(%Oban.Job{})
```

### Audit log

| Field           | Value                                                                   |
|-----------------|-------------------------------------------------------------------------|
| `action`        | `"lead.quarantine_released"`                                            |
| `resource_type` | `"Lead"`                                                                |
| `resource_id`   | Lead UUID                                                               |
| `changes`       | `%{"status" => %{"from" => "quarantine", "to" => "new"}, "quarantine_until" => ...}` |
| `metadata`      | `%{"worker" => "QuarantineReleaseWorker"}`                              |

---

## Testing Workers

Since test config uses `testing: :inline`, workers are called directly in tests:

```elixir
# Backdate an assignment's timestamp using raw SQL (Ash doesn't allow setting assigned_at)
Saleflow.Repo.query!(
  "UPDATE assignments SET assigned_at = assigned_at - ($1 * INTERVAL '1 minute') WHERE id = $2",
  [35, Ecto.UUID.dump!(assignment.id)]
)

# Then invoke the worker directly
:ok = Saleflow.Workers.AutoReleaseWorker.perform(%Oban.Job{})
```

Worker tests use `async: false` because they issue raw SQL updates to shared tables.
