# Sales Domain

## Overview

The Sales domain (`Saleflow.Sales`) manages the core CRM entities:

- **Lead** — a prospective customer (company) that sales agents work through
- **Assignment** — links a Lead to a User (sales agent) for the duration of a call session
- **CallLog** — records every call attempt made by an agent against a lead
- **Meeting** — a booked sales meeting arising from lead work
- **Quarantine** — an explicit 7-day exclusion record that removes a lead from the call queue

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
{:ok, lead} = Saleflow.Sales.create_lead(%{
  företag: "Acme AB",
  telefon: "+46701234567",
  stad: "Stockholm"
})
```

#### `update :update_status`

Updates lead status (and optionally `callback_at` / `quarantine_until`). When status is set to `:quarantine` and `quarantine_until` is not provided, it is automatically set to 7 days from now. Automatically creates an audit log entry with action `"lead.status_changed"`.

```elixir
{:ok, lead} = Saleflow.Sales.update_lead_status(lead, %{status: :assigned})

# Quarantine with auto-set quarantine_until
{:ok, lead} = Saleflow.Sales.update_lead_status(lead, %{status: :quarantine})
# lead.quarantine_until == ~U[...] (now + 7 days)
```

---

## Assignment Resource

Table: `assignments`

Represents the assignment of a lead to a sales agent. An active assignment has `released_at = nil`. Only one active assignment per user is expected at a time.

### Fields

| Field            | Type               | Required | Default | Description                                      |
|------------------|--------------------|----------|---------|--------------------------------------------------|
| `id`             | uuid               | auto     | —       | Primary key                                      |
| `lead_id`        | uuid               | yes      | —       | The lead being assigned                          |
| `user_id`        | uuid               | yes      | —       | The agent the lead is assigned to                |
| `assigned_at`    | utc_datetime_usec  | auto     | now     | When the assignment was created                  |
| `released_at`    | utc_datetime_usec  | no       | nil     | When the assignment ended (nil = still active)   |
| `release_reason` | atom               | no       | nil     | Why the assignment ended (see below)             |

Release reasons: `:outcome_logged`, `:timeout`, `:manual`

### Actions

#### `create :assign`

Assigns a lead to a user. Auto-sets `assigned_at = now`. Creates audit log `"assignment.created"`.

#### `update :release`

Releases an assignment. Accepts `:release_reason`. Auto-sets `released_at = now`. Creates audit log `"assignment.released"`.

---

## CallLog Resource

Table: `call_logs`

Records every call attempt made by an agent against a lead.

### Fields

| Field       | Type               | Required | Default | Description                                      |
|-------------|--------------------|----------|---------|--------------------------------------------------|
| `id`        | uuid               | auto     | —       | Primary key                                      |
| `lead_id`   | uuid               | yes      | —       | The lead that was called                         |
| `user_id`   | uuid               | yes      | —       | The agent who made the call                      |
| `outcome`   | atom               | yes      | —       | Result of the call (see below)                   |
| `notes`     | string             | no       | nil     | Free-text notes about the call                   |
| `called_at` | utc_datetime_usec  | auto     | now     | When the call was made                           |

Outcome values: `:meeting_booked`, `:callback`, `:not_interested`, `:no_answer`, `:bad_number`, `:customer`, `:other`

### Actions

#### `create :create`

Logs a call. Accepts `:lead_id`, `:user_id`, `:outcome`, `:notes`. Auto-sets `called_at = now`. Creates audit log `"call.logged"`.

---

## Meeting Resource

Table: `meetings`

Records a booked sales meeting for a lead.

### Fields

| Field               | Type               | Required | Default      | Description                              |
|---------------------|--------------------|----------|--------------|------------------------------------------|
| `id`                | uuid               | auto     | —            | Primary key                              |
| `lead_id`           | uuid               | yes      | —            | The lead the meeting is for              |
| `user_id`           | uuid               | yes      | —            | The agent who booked the meeting         |
| `title`             | string             | yes      | —            | Meeting title / subject                  |
| `meeting_date`      | date               | yes      | —            | Date of the meeting                      |
| `meeting_time`      | time               | yes      | —            | Time of the meeting                      |
| `notes`             | string             | no       | nil          | Free-text notes                          |
| `google_calendar_id`| string             | no       | nil          | Google Calendar event ID (future use)    |
| `status`            | atom               | yes      | `:scheduled` | Current status (see below)               |
| `inserted_at`       | utc_datetime       | auto     | —            | Row creation timestamp                   |
| `updated_at`        | utc_datetime       | auto     | —            | Row update timestamp                     |

Status values: `:scheduled`, `:completed`, `:cancelled`

### Actions

#### `create :create`

Creates a meeting with status `:scheduled`. Accepts `:lead_id`, `:user_id`, `:title`, `:meeting_date`, `:meeting_time`, `:notes`. Creates audit log `"meeting.created"`.

#### `update :cancel`

Sets status to `:cancelled`. Creates audit log `"meeting.cancelled"`.

#### `update :complete`

Sets status to `:completed`. Creates audit log `"meeting.completed"`.

---

## Quarantine Resource

Table: `quarantines`

An explicit quarantine record excluding a lead from the call queue for 7 days.

### Fields

| Field           | Type               | Required | Default | Description                                      |
|-----------------|--------------------|----------|---------|--------------------------------------------------|
| `id`            | uuid               | auto     | —       | Primary key                                      |
| `lead_id`       | uuid               | yes      | —       | The lead being quarantined                       |
| `user_id`       | uuid               | yes      | —       | The agent who triggered the quarantine           |
| `reason`        | string             | yes      | —       | Why the lead was quarantined                     |
| `quarantined_at`| utc_datetime_usec  | auto     | now     | When the quarantine started                      |
| `released_at`   | utc_datetime_usec  | auto     | now+7d  | When the quarantine expires (auto-calculated)    |

### Actions

#### `create :create`

Quarantines a lead. Accepts `:lead_id`, `:user_id`, `:reason`. Auto-sets `quarantined_at = now` and `released_at = now + 7 days`. Creates audit log `"quarantine.created"`.

---

## Domain Functions

### Lead functions

#### `Saleflow.Sales.create_lead/1`

```elixir
{:ok, lead} = Saleflow.Sales.create_lead(%{företag: "Acme AB", telefon: "+46701234567"})
```

#### `Saleflow.Sales.list_leads/0`

Returns all leads sorted by `inserted_at` ascending.

#### `Saleflow.Sales.search_leads/1`

Case-insensitive substring match on `företag`.

```elixir
{:ok, leads} = Saleflow.Sales.search_leads("Acme")
```

#### `Saleflow.Sales.get_lead/1`

```elixir
{:ok, lead} = Saleflow.Sales.get_lead("550e8400-e29b-41d4-a716-446655440000")
```

#### `Saleflow.Sales.update_lead_status/2`

```elixir
{:ok, lead} = Saleflow.Sales.update_lead_status(lead, %{status: :assigned})
{:ok, lead} = Saleflow.Sales.update_lead_status(lead, %{status: :quarantine})
```

### Assignment functions

#### `Saleflow.Sales.assign_lead/2`

```elixir
{:ok, assignment} = Saleflow.Sales.assign_lead(lead, user)
```

#### `Saleflow.Sales.release_assignment/2`

```elixir
{:ok, assignment} = Saleflow.Sales.release_assignment(assignment, :manual)
# reason: :outcome_logged | :timeout | :manual
```

#### `Saleflow.Sales.get_active_assignment/1`

Returns `{:ok, assignment}` or `{:ok, nil}` when no active assignment.

```elixir
{:ok, assignment_or_nil} = Saleflow.Sales.get_active_assignment(user)
```

### CallLog functions

#### `Saleflow.Sales.log_call/1`

```elixir
{:ok, call} = Saleflow.Sales.log_call(%{
  lead_id: lead.id,
  user_id: user.id,
  outcome: :callback,
  notes: "Call back Wednesday"
})
```

#### `Saleflow.Sales.list_calls_for_lead/1`

Returns calls for a lead sorted by `called_at` descending.

```elixir
{:ok, calls} = Saleflow.Sales.list_calls_for_lead(lead.id)
```

#### `Saleflow.Sales.list_calls_for_user/1`

```elixir
{:ok, calls} = Saleflow.Sales.list_calls_for_user(user.id)
```

### Meeting functions

#### `Saleflow.Sales.create_meeting/1`

```elixir
{:ok, meeting} = Saleflow.Sales.create_meeting(%{
  lead_id: lead.id,
  user_id: user.id,
  title: "Product Demo",
  meeting_date: ~D[2026-05-15],
  meeting_time: ~T[10:00:00]
})
```

#### `Saleflow.Sales.cancel_meeting/1`

```elixir
{:ok, meeting} = Saleflow.Sales.cancel_meeting(meeting)
```

#### `Saleflow.Sales.complete_meeting/1`

```elixir
{:ok, meeting} = Saleflow.Sales.complete_meeting(meeting)
```

#### `Saleflow.Sales.list_upcoming_meetings/0`

Returns scheduled meetings with `meeting_date >= today`, sorted by date ascending.

```elixir
{:ok, meetings} = Saleflow.Sales.list_upcoming_meetings()
```

#### `Saleflow.Sales.list_meetings_for_lead/1`

```elixir
{:ok, meetings} = Saleflow.Sales.list_meetings_for_lead(lead.id)
```

### Quarantine functions

#### `Saleflow.Sales.create_quarantine/1`

```elixir
{:ok, q} = Saleflow.Sales.create_quarantine(%{
  lead_id: lead.id,
  user_id: user.id,
  reason: "Prospect requested no contact for 1 week"
})
# q.released_at == quarantined_at + 7 days
```

#### `Saleflow.Sales.list_active_quarantines/0`

Returns quarantine records where `released_at > now`, sorted by `released_at` ascending.

```elixir
{:ok, quarantines} = Saleflow.Sales.list_active_quarantines()
```

---

## Audit Logging

All mutating actions are automatically captured via `Saleflow.Audit.Changes.CreateAuditLog`:

| Resource   | Action              | Audit action string         |
|------------|---------------------|-----------------------------|
| Lead       | create              | `"lead.created"`            |
| Lead       | update_status       | `"lead.status_changed"`     |
| Assignment | assign              | `"assignment.created"`      |
| Assignment | release             | `"assignment.released"`     |
| CallLog    | create              | `"call.logged"`             |
| Meeting    | create              | `"meeting.created"`         |
| Meeting    | cancel              | `"meeting.cancelled"`       |
| Meeting    | complete            | `"meeting.completed"`       |
| Quarantine | create              | `"quarantine.created"`      |

To retrieve audit logs for any resource:

```elixir
{:ok, logs} = Saleflow.Audit.list_for_resource("Assignment", assignment.id)
{:ok, logs} = Saleflow.Audit.list_for_resource("Meeting", meeting.id)
```
