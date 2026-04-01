# SaleFlow — Design Spec

## Overview

Sales CRM for outbound calling. Agents log in, get the next available lead, call, log outcome, move on. No lead is ever shared between two agents simultaneously. Every action is audit-logged. Imported leads are companies without websites — the sales pitch is selling them one.

## Stack

### Backend
- Elixir 1.18+, Phoenix 1.8, Ash 3.7, AshPostgres 2.6, AshAuthentication 4.13
- PostgreSQL
- ExUnit for backend tests (100% coverage target)

### Frontend
- React 19, TypeScript strict, Vite
- shadcn/ui, Tailwind CSS v4
- TanStack Query for data fetching
- Vitest for component tests, Playwright for E2E
- 100% test coverage target

### API
- Phoenix JSON controllers (REST)
- Session-based auth (cookie)

---

## Domain: Accounts

### User
| Field | Type | Notes |
|-------|------|-------|
| id | uuid | PK |
| email | string | unique, required |
| hashed_password | string | AshAuthentication |
| name | string | required |
| role | enum | :admin, :agent |
| inserted_at | utc_datetime | |
| updated_at | utc_datetime | |

**Actions:** register (admin only), sign_in, sign_out, list, update, deactivate

---

## Domain: Sales

### Lead
| Field | Type | Notes |
|-------|------|-------|
| id | uuid | PK |
| företag | string | company name |
| telefon | string | E.164 format |
| epost | string | nullable |
| hemsida | string | nullable |
| adress | string | nullable |
| postnummer | string | nullable |
| stad | string | nullable |
| bransch | string | nullable |
| orgnr | string | nullable |
| omsättning_tkr | string | nullable |
| vinst_tkr | string | nullable |
| anställda | string | nullable |
| vd_namn | string | nullable |
| bolagsform | string | nullable |
| status | enum | :new, :assigned, :callback, :meeting_booked, :quarantine, :bad_number, :customer |
| quarantine_until | utc_datetime | nullable, set when status=quarantine |
| callback_at | utc_datetime | nullable, set when status=callback |
| imported_at | utc_datetime | when the lead was imported |
| inserted_at | utc_datetime | |
| updated_at | utc_datetime | |

**Actions:** import_batch (admin, from xlsx), get_next (agent), update_status, search, list

### Assignment
| Field | Type | Notes |
|-------|------|-------|
| id | uuid | PK |
| lead_id | uuid | FK → Lead |
| user_id | uuid | FK → User |
| assigned_at | utc_datetime | |
| released_at | utc_datetime | nullable, set on release |
| release_reason | enum | :outcome_logged, :timeout, :manual |

**Actions:** assign, release

**Constraint:** Only one active assignment per lead (released_at IS NULL).

### CallLog
| Field | Type | Notes |
|-------|------|-------|
| id | uuid | PK |
| lead_id | uuid | FK → Lead |
| user_id | uuid | FK → User |
| outcome | enum | :meeting_booked, :callback, :not_interested, :no_answer, :bad_number, :customer, :other |
| notes | text | nullable |
| called_at | utc_datetime | |

**Actions:** create, list_for_lead, list_for_user

### Meeting
| Field | Type | Notes |
|-------|------|-------|
| id | uuid | PK |
| lead_id | uuid | FK → Lead |
| user_id | uuid | FK → User (booker) |
| title | string | required |
| meeting_date | date | required |
| meeting_time | time | required |
| notes | text | nullable |
| google_calendar_id | string | nullable, for future integration |
| status | enum | :scheduled, :completed, :cancelled |
| inserted_at | utc_datetime | |
| updated_at | utc_datetime | |

**Actions:** create, update, cancel, list_upcoming, list_for_lead

### Quarantine
| Field | Type | Notes |
|-------|------|-------|
| id | uuid | PK |
| lead_id | uuid | FK → Lead |
| user_id | uuid | FK → User (who quarantined) |
| reason | string | required |
| quarantined_at | utc_datetime | |
| released_at | utc_datetime | auto-calculated: quarantined_at + 7 days |

**Actions:** create, list_active, release_expired (scheduled job)

---

## Domain: Audit

### AuditLog
| Field | Type | Notes |
|-------|------|-------|
| id | uuid | PK |
| user_id | uuid | FK → User, nullable (system events) |
| action | string | e.g. "lead.status_changed", "call.logged", "meeting.created" |
| resource_type | string | e.g. "Lead", "Meeting" |
| resource_id | uuid | |
| changes | map | JSON of what changed: %{field => %{from, to}} |
| metadata | map | extra context (IP, user agent, etc.) |
| inserted_at | utc_datetime | |

**Every mutating action across all domains writes to AuditLog.** Implemented as an Ash change/after_action hook on all create/update/destroy actions.

**Actions:** list (filterable by user, resource, action, date range), list_for_resource

---

## Lead Queue Logic

### get_next algorithm
```
1. Find oldest lead WHERE:
   - status = 'new' OR (status = 'quarantine' AND quarantine_until < now())
   - No active Assignment exists (released_at IS NOT NULL or no assignment)
   - NOT callback (those are shown separately to the assigned agent)
2. Create Assignment (lead_id, user_id, assigned_at=now)
3. Set lead.status = 'assigned'
4. Return lead with full data
5. All in a single transaction with FOR UPDATE SKIP LOCKED
```

### Outcome handling
| Outcome | Lead status | Queue effect |
|---------|------------|--------------|
| Möte bokat | meeting_booked | Out of queue |
| Återkom (datum) | callback | Out of queue, shown to same agent on callback_at |
| Ej intresserad | quarantine | Out for 7 days, then back as 'new' |
| Ej svar | new | Back in queue immediately (bottom) |
| Fel nummer | bad_number | Out permanently |
| Kund | customer | Out permanently |

### Auto-release
- Oban job runs every 5 minutes
- Releases assignments older than 30 min without outcome
- Lead goes back to 'new'

### Quarantine release
- Oban job runs every hour
- Finds quarantined leads where quarantine_until < now()
- Sets status back to 'new'

---

## Design System — Hard Rules

All values below are the ONLY values used in the app. No exceptions.

### Theme
- Light background: white (#FFFFFF) with slate-50 (#F8FAFC) panels
- Text: slate-900 primary, slate-500 secondary
- Accent: indigo-600 (#4F46E5) for primary actions
- Success: emerald-600, Warning: amber-500, Danger: rose-600
- Borders: slate-200

### Typography
- Font: Inter (system fallback: -apple-system, sans-serif)
- Page title: 24px/600
- Section title: 18px/600
- Body: 14px/400
- Label: 12px/500 uppercase tracking-wide slate-500
- Mono (orgnr, telefon): JetBrains Mono / monospace, 13px

### Spacing (only these values)
- Page padding: 24px
- Card padding: 20px
- Section gap: 24px
- Element gap (within card): 12px
- Button padding: 10px 16px
- Input padding: 8px 12px

### Components
- Cards: white bg, 1px slate-200 border, rounded-lg (8px), no shadow
- Buttons: rounded-md (6px), font-weight 500, 14px
  - Primary: indigo-600 bg, white text
  - Secondary: white bg, slate-200 border, slate-700 text
  - Danger: rose-600 bg, white text
  - Outcome buttons: large (h-12), full color coding
- Inputs: white bg, 1px slate-300 border, rounded-md, 14px
- Tables: no border, slate-50 header bg, slate-200 row dividers
- Badges: rounded-full, 12px, font-weight 500

### Layout
- Max content width: 1280px, centered
- Sidebar: 240px fixed, slate-50 bg
- Top bar: 56px height, white bg, bottom border

These values are defined ONCE in a shared config and referenced everywhere. No hardcoded values in components.

---

## Frontend Pages

### 1. Login (/login)
- Centered card, email + password, submit button
- Redirect to /dashboard on success

### 2. Dashboard (/dashboard)
- Stats bar: calls today, meetings booked, leads remaining
- "Nästa kund" primary button (large, centered)
- Upcoming callbacks list (leads assigned to this agent with callback_at approaching)
- Today's meetings list

### 3. Customer Card (/leads/:id)
- Left column: company info (namn, orgnr in mono, telefon as clickable tel: link, adress, stad, bransch, omsättning, anställda, VD)
- Right column: outcome buttons (large, color-coded), notes textarea, callback date picker
- Bottom: full history timeline (all CallLogs + AuditLogs for this lead, chronological)
- On outcome submit → auto-navigate to next lead or back to dashboard

### 4. Meetings (/meetings)
- Table of all meetings: date, time, company, agent, status
- Click to view/edit
- Create meeting modal: lead (auto-filled from customer card), date, time, title, notes

### 5. History (/history)
- Searchable/filterable table of all CallLogs
- Filters: agent, outcome, date range, search by company name
- Click row → opens lead detail

### 6. Admin — Users (/admin/users)
- Table of users: name, email, role, calls today, meetings booked
- Create/edit user modal
- Deactivate user

### 7. Admin — Import (/admin/import)
- Drag-and-drop xlsx upload
- Preview first 10 rows
- Confirm → backend parses and creates leads
- Shows import result: X created, Y duplicates skipped

### 8. Admin — Stats (/admin/stats)
- Per-agent: calls, meetings, conversion rate
- Per-day graph (simple bar chart)
- Lead funnel: new → assigned → outcome breakdown

---

## Testing Strategy

### Backend (ExUnit) — 100% coverage
- **Unit tests:** Every Ash action tested individually (create, read, update, destroy)
- **Queue tests:** get_next returns correct lead, respects locks, handles concurrent agents
- **Quarantine tests:** leads return after 7 days, not before
- **Audit tests:** every action produces correct audit log entry
- **Auth tests:** login, logout, role-based access
- **Import tests:** xlsx parsing, duplicate detection, validation

### Frontend (Vitest) — 100% coverage
- **Component tests:** every component renders correctly with mock data
- **Form tests:** validation, submission, error states
- **Queue flow:** get next → show card → submit outcome → navigate

### E2E (Playwright)
- **Full flow:** login → get lead → call → log outcome → next lead
- **Quarantine flow:** mark not interested → verify gone → verify returns after 7 days
- **Meeting flow:** book meeting → appears in meetings list
- **Multi-user:** two agents never get same lead
- **Import flow:** admin uploads xlsx → leads appear in queue
- **Audit:** every action visible in history

---

## File Structure

```
saleflow/
├── backend/                    # Phoenix + Ash
│   ├── lib/saleflow/
│   │   ├── accounts/           # User, auth
│   │   ├── sales/              # Lead, Assignment, CallLog, Meeting, Quarantine
│   │   ├── audit/              # AuditLog
│   │   └── workers/            # Oban jobs (auto-release, quarantine-release)
│   ├── lib/saleflow_web/
│   │   ├── controllers/        # JSON API controllers
│   │   ├── plugs/              # Auth plugs
│   │   └── router.ex
│   └── test/
├── frontend/                   # React + Vite
│   ├── src/
│   │   ├── components/         # Shared UI components
│   │   ├── design/             # Design tokens, theme config
│   │   ├── pages/              # Page components
│   │   ├── api/                # API client + TanStack Query hooks
│   │   └── lib/                # Utilities
│   ├── tests/                  # Vitest component tests
│   └── e2e/                    # Playwright E2E tests
└── docs/
```
