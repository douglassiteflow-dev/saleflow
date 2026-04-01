# Audit Domain

## Purpose

Every mutating action in SaleFlow is logged. The Audit domain provides an append-only record of who did what, to which resource, and exactly what changed. This supports compliance requirements, debugging, and user-visible activity history.

No audit log is ever updated or deleted.

## AuditLog Fields

| Field           | Type       | Required | Description                                                         |
|-----------------|------------|----------|---------------------------------------------------------------------|
| `id`            | uuid       | auto     | Primary key                                                         |
| `user_id`       | uuid       | no       | ID of the acting user; `nil` for system-generated events            |
| `action`        | string     | yes      | Dot-namespaced event name, e.g. `"lead.created"`, `"call.logged"`  |
| `resource_type` | string     | yes      | Module name of the affected resource, e.g. `"Lead"`, `"Meeting"`   |
| `resource_id`   | uuid       | yes      | ID of the affected resource                                         |
| `changes`       | map        | no       | Field-level diff: `%{"field" => %{"from" => old, "to" => new}}`    |
| `metadata`      | map        | no       | Extra context such as `%{"ip" => "1.2.3.4"}`                       |
| `inserted_at`   | utc_datetime | auto   | When the log was created                                            |

## Domain Functions

### `Saleflow.Audit.create_log/1`

Creates a new audit log entry. Returns `{:ok, log}` or `{:error, reason}`.

```elixir
# System event (no actor)
{:ok, log} = Saleflow.Audit.create_log(%{
  action: "lead.created",
  resource_type: "Lead",
  resource_id: lead.id,
  changes: %{"status" => %{"from" => nil, "to" => "new"}}
})

# User-triggered event
{:ok, log} = Saleflow.Audit.create_log(%{
  user_id: current_user.id,
  action: "meeting.created",
  resource_type: "Meeting",
  resource_id: meeting.id,
  changes: %{},
  metadata: %{"ip" => conn.remote_ip |> :inet.ntoa() |> to_string()}
})
```

### `Saleflow.Audit.list_for_resource/2`

Returns all logs for a specific resource, sorted by `inserted_at` descending (most recent first).

```elixir
{:ok, logs} = Saleflow.Audit.list_for_resource("Lead", lead.id)
```

### `Saleflow.Audit.list_logs/1`

Returns logs across all resources with optional filters. Omit a key to not filter on it. Sorted by `inserted_at` descending.

```elixir
# All logs
{:ok, logs} = Saleflow.Audit.list_logs(%{})

# Filter by user
{:ok, logs} = Saleflow.Audit.list_logs(%{user_id: user.id})

# Filter by action
{:ok, logs} = Saleflow.Audit.list_logs(%{action: "lead.created"})

# Combined filter
{:ok, logs} = Saleflow.Audit.list_logs(%{user_id: user.id, action: "meeting.created"})
```

## Automatic Audit Logging with `CreateAuditLog` Change

`Saleflow.Audit.Changes.CreateAuditLog` is a reusable Ash Resource Change that automatically creates an audit log after any successful mutating action. It runs in an `after_action` callback so it never rolls back the original operation.

### Options

- `:action` (required) — the audit action string to record

### Adding to a Resource Action

```elixir
defmodule Saleflow.Sales.Lead do
  use Ash.Resource, ...

  actions do
    create :create do
      accept [:phone, :name, :status]
      change {Saleflow.Audit.Changes.CreateAuditLog, action: "lead.created"}
    end

    update :update_status do
      accept [:status]
      change {Saleflow.Audit.Changes.CreateAuditLog, action: "lead.status_changed"}
    end
  end
end
```

### What Gets Captured

- **`action`** — the string passed via the `:action` option
- **`resource_type`** — the last segment of the resource module name (e.g. `"Lead"` from `Saleflow.Sales.Lead`)
- **`resource_id`** — `result.id` from the created/updated record
- **`user_id`** — extracted from `changeset.context.private.actor.id` when the action is called with `actor: user`; `nil` for system calls
- **`changes`** — a diff map of attributes that changed, in `%{"field" => %{"from" => old, "to" => new}}` format

### Failure Behaviour

If audit log creation fails for any reason, a `Logger.warning/1` is emitted and the original action result is returned unchanged. Audit failures never propagate to callers.

## Naming Conventions

Use dot-separated `resource.verb` format for action names:

| Event                          | Action string              |
|--------------------------------|----------------------------|
| Lead created                   | `lead.created`             |
| Lead status changed            | `lead.status_changed`      |
| Lead assigned to agent         | `lead.assigned`            |
| Lead released from agent       | `lead.released`            |
| Lead quarantined               | `lead.quarantined`         |
| Call logged against a lead     | `call.logged`              |
| Meeting created                | `meeting.created`          |
| XLSX import completed          | `import.completed`         |

## Database

Table: `audit_logs`. Created by migration `add_audit_logs`. No foreign key constraints on `user_id` or `resource_id` — audit logs are intentionally decoupled from their referenced records so they survive deletions.
