# Sales Domain

## Overview

The Sales domain (`Saleflow.Sales`) manages the core CRM entities. Currently it exposes the **Lead** resource. Assignment, CallLog, Meeting, and Quarantine resources will be added in Task 5.

---

## Lead Resource

Table: `leads`

### Fields

| Field             | Type               | Required | Default | Description                                      |
|-------------------|--------------------|----------|---------|--------------------------------------------------|
| `id`              | uuid               | auto     | —       | Primary key                                      |
| `företag`         | string             | yes      | —       | Company name                                     |
| `telefon`         | string             | yes      | —       | Phone number (E.164 format, e.g. `+46701234567`) |
| `epost`           | string             | no       | nil     | Email address                                    |
| `hemsida`         | string             | no       | nil     | Website URL                                      |
| `adress`          | string             | no       | nil     | Street address                                   |
| `postnummer`      | string             | no       | nil     | Postal code                                      |
| `stad`            | string             | no       | nil     | City                                             |
| `bransch`         | string             | no       | nil     | Industry                                         |
| `orgnr`           | string             | no       | nil     | Swedish organisation number                      |
| `omsättning_tkr`  | string             | no       | nil     | Revenue in KSEK                                  |
| `vinst_tkr`       | string             | no       | nil     | Profit in KSEK                                   |
| `anställda`       | string             | no       | nil     | Number of employees                              |
| `vd_namn`         | string             | no       | nil     | CEO name                                         |
| `bolagsform`      | string             | no       | nil     | Company form (e.g. AB, HB)                       |
| `status`          | atom               | yes      | `:new`  | Current workflow status (see Status Flow below)  |
| `quarantine_until`| utc_datetime_usec  | no       | nil     | Auto-set to now+7d when status → `:quarantine`   |
| `callback_at`     | utc_datetime_usec  | no       | nil     | Scheduled callback time                          |
| `imported_at`     | utc_datetime_usec  | no       | nil     | When the lead was imported from an XLSX file     |
| `inserted_at`     | utc_datetime       | auto     | —       | Row creation timestamp                           |
| `updated_at`      | utc_datetime       | auto     | —       | Row update timestamp                             |

### Status Flow

```
:new
  └─→ :assigned
        ├─→ :callback
        │     └─→ :meeting_booked
        │           └─→ :customer
        ├─→ :bad_number
        └─→ :quarantine  (auto-sets quarantine_until = now + 7 days)
```

Valid status values:

| Status            | Description                                                       |
|-------------------|-------------------------------------------------------------------|
| `:new`            | Freshly imported, not yet assigned to any agent                   |
| `:assigned`       | Assigned to a sales agent, currently being worked                 |
| `:callback`       | Agent marked for a scheduled callback; `callback_at` is set       |
| `:meeting_booked` | A sales meeting has been booked                                   |
| `:customer`       | Lead converted to a customer — terminal positive state            |
| `:bad_number`     | Phone number unreachable — terminal negative state                |
| `:quarantine`     | Temporarily excluded from the queue; `quarantine_until` auto-set  |

### Actions

#### `create :create`

Creates a new lead. Accepts all fields. Automatically creates an audit log entry with action `"lead.created"`.

```elixir
{:ok, lead} = Saleflow.Sales.Lead
|> Ash.Changeset.for_create(:create, %{
  företag: "Acme AB",
  telefon: "+46701234567",
  stad: "Stockholm"
})
|> Ash.create()
```

#### `update :update_status`

Updates lead status (and optionally `callback_at` / `quarantine_until`). When status is set to `:quarantine` and `quarantine_until` is not provided, it is automatically set to 7 days from now. Automatically creates an audit log entry with action `"lead.status_changed"`.

```elixir
{:ok, lead} = lead
|> Ash.Changeset.for_update(:update_status, %{status: :assigned})
|> Ash.update()

# Quarantine with auto-set quarantine_until
{:ok, lead} = lead
|> Ash.Changeset.for_update(:update_status, %{status: :quarantine})
|> Ash.update()
# lead.quarantine_until == ~U[...] (now + 7 days)
```

#### `read` (default)

Standard Ash read action. Use domain functions for common read patterns.

---

## Domain Functions

### `Saleflow.Sales.create_lead/1`

Creates a new lead. Required: `:företag`, `:telefon`. All other fields are optional.

```elixir
{:ok, lead} = Saleflow.Sales.create_lead(%{
  företag: "Acme AB",
  telefon: "+46701234567",
  bransch: "IT",
  stad: "Stockholm"
})
```

### `Saleflow.Sales.list_leads/0`

Returns all leads sorted by `inserted_at` ascending (oldest first).

```elixir
{:ok, leads} = Saleflow.Sales.list_leads()
```

### `Saleflow.Sales.search_leads/1`

Case-insensitive substring match on `företag`. Returns leads sorted by `inserted_at` ascending.

```elixir
{:ok, leads} = Saleflow.Sales.search_leads("Acme")
# Returns all leads whose företag contains "Acme"
```

### `Saleflow.Sales.get_lead/1`

Fetches a single lead by UUID. Returns `{:ok, lead}` or `{:error, %Ash.Error.Query.NotFound{}}`.

```elixir
{:ok, lead} = Saleflow.Sales.get_lead("550e8400-e29b-41d4-a716-446655440000")
```

### `Saleflow.Sales.update_lead_status/2`

Updates the status of a lead. Accepted params: `:status`, `:quarantine_until`, `:callback_at`.

```elixir
# Simple status update
{:ok, lead} = Saleflow.Sales.update_lead_status(lead, %{status: :assigned})

# Quarantine with auto quarantine_until
{:ok, lead} = Saleflow.Sales.update_lead_status(lead, %{status: :quarantine})

# Quarantine with explicit quarantine_until
{:ok, lead} = Saleflow.Sales.update_lead_status(lead, %{
  status: :quarantine,
  quarantine_until: ~U[2026-05-01 00:00:00Z]
})

# Callback with scheduled time
{:ok, lead} = Saleflow.Sales.update_lead_status(lead, %{
  status: :callback,
  callback_at: ~U[2026-04-05 10:00:00Z]
})
```

---

## Audit Logging

All mutating actions on leads are automatically captured via `Saleflow.Audit.Changes.CreateAuditLog`:

| Action                | Audit action string       |
|-----------------------|---------------------------|
| Lead created          | `"lead.created"`          |
| Lead status changed   | `"lead.status_changed"`   |

To retrieve audit logs for a lead:

```elixir
{:ok, logs} = Saleflow.Audit.list_for_resource("Lead", lead.id)
```

---

## Coming in Task 5

The following resources will be added to the Sales domain:

- **Assignment** — links a Lead to a User (sales agent); tracks current assignee
- **CallLog** — records each call attempt against a lead
- **Meeting** — booked meetings arising from lead work
- **Quarantine** — explicit quarantine records (beyond the status flag on Lead)
