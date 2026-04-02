# SaleFlow — Meetings Redesign + Performance — Design Spec

## Overview

Two independent work packages:
1. **Meetings redesign** — full meeting cards with lead data, detail page, rebooking, calendar view
2. **Performance optimization** — lazy loading, reduced API calls, optimistic updates

---

## Part 1: Meetings Redesign

### Backend Changes

#### Modified: GET /api/meetings
Returns meetings with joined lead + user data:

```json
{
  "meetings": [
    {
      "id": "uuid",
      "title": "Möte med Kroppex AB",
      "meeting_date": "2026-04-10",
      "meeting_time": "14:00:00",
      "notes": "Visa hemsida-demo",
      "status": "scheduled",
      "reminded_at": null,
      "inserted_at": "2026-04-02T10:00:00Z",
      "updated_at": "2026-04-02T10:00:00Z",
      "user_id": "uuid",
      "user_name": "Douglas",
      "lead_id": "uuid",
      "lead": {
        "företag": "Kroppex AB",
        "telefon": "+46812345678",
        "stad": "Stockholm",
        "adress": "Storgatan 1",
        "postnummer": "11122",
        "bransch": "Hälsa",
        "orgnr": "5591485619",
        "omsättning_tkr": "500",
        "vd_namn": "Anna Svensson",
        "källa": "bokadirekt"
      }
    }
  ]
}
```

#### New: GET /api/meetings/:id
Returns single meeting with full lead data + call history:

```json
{
  "meeting": { "...as above..." },
  "calls": [ "...call logs for this lead..." ],
  "audit_logs": [ "...audit logs for this meeting..." ]
}
```

#### New: PUT /api/meetings/:id
Update meeting (rebook, change notes, mark completed):

```json
{
  "meeting_date": "2026-04-15",
  "meeting_time": "10:00:00",
  "notes": "Uppdaterad anteckning",
  "status": "completed"
}
```

#### Sales domain changes
- `list_upcoming_meetings` and `list_upcoming_meetings_for_user` — preload lead data + user name
- New: `get_meeting_detail(id)` — meeting + lead + calls + audit
- New: `update_meeting(meeting, params)` — update date/time/notes/status with audit log
- Add `:update` action to Meeting resource accepting [:meeting_date, :meeting_time, :notes, :status]

### Frontend Changes

#### Modified: Meeting type (types.ts)
Add lead data + user_name to Meeting interface:

```typescript
interface Meeting {
  id: string;
  lead_id: string;
  user_id: string;
  user_name: string | null;
  title: string;
  meeting_date: string;
  meeting_time: string;
  notes: string | null;
  status: "scheduled" | "completed" | "cancelled";
  reminded_at: string | null;
  inserted_at: string;
  updated_at: string;
  lead: {
    företag: string;
    telefon: string;
    stad: string | null;
    adress: string | null;
    postnummer: string | null;
    bransch: string | null;
    orgnr: string | null;
    omsättning_tkr: string | null;
    vd_namn: string | null;
    källa: string | null;
  } | null;
}
```

#### New hooks (api/meetings.ts)
- `useMeetingDetail(id)` — GET /api/meetings/:id
- `useUpdateMeeting()` — PUT /api/meetings/:id

#### Modified: Meetings list page (/meetings)
- Table columns: Datum, Tid, Företag, Agent, Status, Bransch
- Click row → navigate to /meetings/:id
- Filters: Kommande / Idag / Alla / Genomförda / Avbokade
- Agent name shown in each row

#### New: Meeting detail page (/meetings/:id)
Full meeting card with:
- Header: title + status badge + rebook/cancel buttons
- Left column: meeting info (datum, tid, agent, anteckningar, påminnelse-status)
- Right column: lead info (företag, telefon clickable, adress med Google Maps-länk, bransch, omsättning, VD)
- Bottom: redigera-formulär (datum, tid, anteckningar, status dropdown)
- Below: lead historik (samtalslogg + audit)

#### Google Maps link
```
https://www.google.com/maps/search/{adress}+{postnummer}+{stad}
```

#### Modified: Dialer outcome
When "Möte bokat" — meeting_date and meeting_time must be filled in correctly (validated client-side).

---

## Part 2: Performance Optimization

### 1. Lazy loading (React.lazy)
Split admin pages into separate chunks:
- `admin-users.tsx`
- `admin-import.tsx`
- `admin-stats.tsx`
- `admin-lists.tsx`
- `admin-requests.tsx`
- `history.tsx`
- `profile.tsx`

Only login, dashboard, dialer, meetings load eagerly (the core sales flow).

### 2. Reduce API calls
- **Dashboard**: combine stats + meetings + callbacks into one endpoint `GET /api/dashboard` that returns all three
- **Dialer next lead**: `POST /api/leads/next` already returns full lead data — make `useLeadDetail` skip if we already have the data from next-lead response
- **Meetings list**: single request already, just add lead data to it (Part 1)

### 3. Optimistic updates
- **Submit outcome**: immediately show "loading next" instead of waiting for outcome response
- **Cancel meeting**: immediately remove from list, revert on error
- **Skip lead**: immediately fetch next while outcome submits in background

### 4. Bundle optimization
- Import lucide-react icons individually: `import { Monitor } from "lucide-react"` (already done, verify)
- Verify no barrel imports from large packages

### 5. Increase staleTime
- Dashboard stats: 60s (was 30s)
- Meetings list: 60s
- Lead detail: 30s (keep responsive for dialer)
- Auth me: 5 min (already set)

### 6. Combined dashboard endpoint

New: `GET /api/dashboard`

Returns all data needed for dashboard in one request:
```json
{
  "stats": { "total_leads": 5786, "new": 70, ... },
  "todays_meetings": [ ... ],
  "callbacks": [ ... ],
  "my_stats": { "calls_today": 5, "meetings_today": 1 }
}
```

---

## Testing
- Backend: tests for new meeting endpoints, dashboard endpoint
- Frontend: update meeting tests, add meeting detail tests
- All existing tests must pass
- 100% coverage maintained

## Deploy
- Staging first, then prod after verification
