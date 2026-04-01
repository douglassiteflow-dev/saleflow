# SaleFlow Backend API Reference

Base URL: `http://localhost:4000/api`

All responses are JSON. Authentication is session-based (cookie).

---

## Authentication

### POST /api/auth/sign-in

Sign in with email and password. Sets a session cookie.

**Request body:**
```json
{
  "email": "agent@example.com",
  "password": "password123"
}
```

**Response 200:**
```json
{
  "user": {
    "id": "uuid",
    "email": "agent@example.com",
    "name": "Jane Agent",
    "role": "agent"
  }
}
```

**Response 401:**
```json
{ "error": "Invalid email or password" }
```

---

### GET /api/auth/me

Returns the currently authenticated user.

**Requires:** Authentication

**Response 200:**
```json
{
  "user": {
    "id": "uuid",
    "email": "agent@example.com",
    "name": "Jane Agent",
    "role": "agent"
  }
}
```

**Response 401:**
```json
{ "error": "Authentication required" }
```

---

### POST /api/auth/sign-out

Clears the session. Requires authentication.

**Requires:** Authentication

**Response 200:**
```json
{ "ok": true }
```

---

## Leads

### GET /api/leads

List all leads, or search by company name.

**Requires:** Authentication

**Query params:**
| Param | Type   | Description                        |
|-------|--------|------------------------------------|
| `q`   | string | Optional. Search by company name.  |

**Response 200:**
```json
{
  "leads": [
    {
      "id": "uuid",
      "företag": "Acme AB",
      "telefon": "+46701234567",
      "epost": "info@acme.se",
      "hemsida": "https://acme.se",
      "adress": "Storgatan 1",
      "postnummer": "11122",
      "stad": "Stockholm",
      "bransch": "IT",
      "orgnr": "556000-0001",
      "omsättning_tkr": "5000",
      "vinst_tkr": "1000",
      "anställda": "25",
      "vd_namn": "Anna Svensson",
      "bolagsform": "AB",
      "status": "new",
      "quarantine_until": null,
      "callback_at": null,
      "imported_at": null,
      "inserted_at": "2026-03-31T10:00:00Z",
      "updated_at": "2026-03-31T10:00:00Z"
    }
  ]
}
```

---

### GET /api/leads/:id

Get a single lead with its call logs and audit trail.

**Requires:** Authentication

**Response 200:**
```json
{
  "lead": { "...lead fields..." },
  "calls": [
    {
      "id": "uuid",
      "lead_id": "uuid",
      "user_id": "uuid",
      "outcome": "no_answer",
      "notes": null,
      "called_at": "2026-03-31T10:00:00Z"
    }
  ],
  "audit_logs": [
    {
      "id": "uuid",
      "user_id": "uuid",
      "action": "lead.created",
      "resource_type": "Lead",
      "resource_id": "uuid",
      "changes": {},
      "metadata": {},
      "inserted_at": "2026-03-31T10:00:00Z"
    }
  ]
}
```

**Response 404:**
```json
{ "error": "Lead not found" }
```

---

### POST /api/leads/next

Dequeue the next available lead for the current agent. Atomically assigns the lead.

**Requires:** Authentication

**Response 200 (lead available):**
```json
{
  "lead": { "...lead fields with status: assigned..." }
}
```

**Response 200 (queue empty):**
```json
{
  "lead": null
}
```

---

### POST /api/leads/:id/outcome

Submit a call outcome for a lead. Logs the call, releases the assignment, and transitions the lead status.

**Requires:** Authentication

**Request body:**
```json
{
  "outcome": "meeting_booked",
  "notes": "Interested in premium plan",
  "title": "Demo meeting",
  "meeting_date": "2026-05-01",
  "meeting_time": "10:00:00",
  "meeting_notes": "Bring product samples",
  "callback_at": "2026-04-01T14:00:00Z"
}
```

**Outcome values and effects:**

| Outcome          | Lead status      | Side effect                    |
|------------------|------------------|--------------------------------|
| `meeting_booked` | `meeting_booked` | Creates a Meeting              |
| `callback`       | `callback`       | Sets `callback_at`             |
| `not_interested` | `quarantine`     | Creates a Quarantine (7 days)  |
| `no_answer`      | `new`            | Back in queue                  |
| `bad_number`     | `bad_number`     | -                              |
| `customer`       | `customer`       | -                              |

**Response 200:**
```json
{ "ok": true }
```

**Response 422:**
```json
{ "error": "Failed to process outcome" }
```

---

## Meetings

### GET /api/meetings

List upcoming scheduled meetings (status = scheduled, date >= today).

**Requires:** Authentication

**Response 200:**
```json
{
  "meetings": [
    {
      "id": "uuid",
      "lead_id": "uuid",
      "user_id": "uuid",
      "title": "Demo",
      "meeting_date": "2026-05-01",
      "meeting_time": "10:00:00",
      "notes": null,
      "status": "scheduled",
      "inserted_at": "2026-03-31T10:00:00Z"
    }
  ]
}
```

---

### POST /api/meetings

Create a new meeting.

**Requires:** Authentication

**Request body:**
```json
{
  "lead_id": "uuid",
  "title": "Sales Demo",
  "meeting_date": "2026-06-01",
  "meeting_time": "14:30:00",
  "notes": "Optional notes"
}
```

**Response 201:**
```json
{
  "meeting": { "...meeting fields..." }
}
```

**Response 422:**
```json
{ "error": "Failed to create meeting" }
```

---

### POST /api/meetings/:id/cancel

Cancel a scheduled meeting.

**Requires:** Authentication

**Response 200:**
```json
{
  "meeting": { "...meeting fields with status: cancelled..." }
}
```

**Response 404:**
```json
{ "error": "Meeting not found" }
```

---

## Audit Logs

### GET /api/audit

List audit logs with optional filters.

**Requires:** Authentication

**Query params:**
| Param     | Type   | Description                    |
|-----------|--------|--------------------------------|
| `user_id` | uuid   | Filter by user who performed action |
| `action`  | string | Filter by action name (e.g. `lead.created`) |

**Response 200:**
```json
{
  "audit_logs": [
    {
      "id": "uuid",
      "user_id": "uuid",
      "action": "lead.created",
      "resource_type": "Lead",
      "resource_id": "uuid",
      "changes": {},
      "metadata": {},
      "inserted_at": "2026-03-31T10:00:00Z"
    }
  ]
}
```

---

## Admin (requires admin role)

### GET /api/admin/users

List all users.

**Requires:** Authentication + Admin role

**Response 200:**
```json
{
  "users": [
    {
      "id": "uuid",
      "email": "admin@example.com",
      "name": "Admin User",
      "role": "admin"
    }
  ]
}
```

**Response 403:**
```json
{ "error": "Admin access required" }
```

---

### POST /api/admin/users

Create a new user.

**Requires:** Authentication + Admin role

**Request body:**
```json
{
  "email": "new@example.com",
  "name": "New Agent",
  "password": "password123",
  "password_confirmation": "password123",
  "role": "agent"
}
```

**Response 201:**
```json
{
  "user": {
    "id": "uuid",
    "email": "new@example.com",
    "name": "New Agent",
    "role": "agent"
  }
}
```

**Response 422:**
```json
{ "error": "Failed to create user" }
```

---

### GET /api/admin/stats

Lead counts grouped by status.

**Requires:** Authentication + Admin role

**Response 200:**
```json
{
  "stats": {
    "new": 15,
    "assigned": 3,
    "meeting_booked": 7,
    "customer": 12,
    "quarantine": 2,
    "bad_number": 1
  }
}
```

---

### POST /api/admin/import

Import leads from an XLSX file. Deduplicates by phone number.

**Requires:** Authentication + Admin role

**Request:** `multipart/form-data` with `file` field containing XLSX.

**Response 201:**
```json
{
  "created": 47,
  "skipped": 3
}
```

**Response 400:**
```json
{ "error": "file upload is required" }
```

**Response 422:**
```json
{ "error": "Import failed: ..." }
```

---

## Error Responses

All endpoints return consistent error JSON:

| Status | Meaning                  |
|--------|--------------------------|
| 400    | Bad request / missing params |
| 401    | Not authenticated        |
| 403    | Not authorized (admin required) |
| 404    | Resource not found       |
| 422    | Validation / processing error |
| 500    | Internal server error    |
