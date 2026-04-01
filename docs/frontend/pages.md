# Pages Reference

Detailed breakdown of all SaleFlow pages, their components, and user flows.

## Login Page (`/login`)

**File:** `src/pages/login.tsx`

### Overview

Unauthenticated login form. Redirects to dashboard if user is already logged in.

### Layout

- Centered container (max-width: 400px)
- Page background: slate-50
- Logo: "SaleFlow" in indigo-600
- Subtitle: "Logga in på ditt konto" (Swedish)

### Components

**Form Fields:**

1. **Email input**
   - Type: email
   - Autocomplete: email
   - Placeholder: "namn@foretag.se"
   - Required

2. **Password input**
   - Type: password
   - Autocomplete: current-password
   - Placeholder: "••••••••"
   - Required

**UI Elements:**

- `Card` container wrapping form
- `Input` component for both fields
- `Button` (primary, size lg) spanning full width
- Error message panel (if login fails)

### States

- **Loading:** Shows "Laddar..." while checking auth
- **Authenticated:** Redirects to `/dashboard`
- **Form submitting:** Button text changes to "Loggar in...", button disabled
- **Error:** Red error message panel with error details

### Data Flow

1. User enters email + password
2. Form submit → `login.mutate({ email, password })`
3. Success → Navigate to `/dashboard`
4. Error → Display error message

### API Integration

- Endpoint: `POST /api/auth/login`
- Hook: `useLogin()` from `@/api/auth`
- Hook: `useMe()` to check current auth status

### Key Code

```tsx
function handleSubmit(e: FormEvent) {
  e.preventDefault();
  login.mutate({ email, password }, {
    onSuccess: () => void navigate("/dashboard"),
  });
}

if (isLoading) return <p>Laddar...</p>;
if (user) return <Navigate to="/dashboard" replace />;
```

---

## Dashboard Page (`/dashboard`)

**File:** `src/pages/dashboard.tsx`

### Overview

Agent home page showing daily metrics, upcoming meetings, and pending callbacks. Main navigation hub.

### Layout

- Full-width container with max-width constraint
- Sections stacked vertically (space-y-8)
- Header with title and "Next customer" action button

### Components

#### Header
- Title: "Dashboard"
- Button: "Nästa kund" (navigate to `/dialer`)

#### Stats Cards Section
```
[Calls Today] [Leads Remaining] [Meetings]
```

Three `StatCard` components in responsive grid:
- 1 column on mobile
- 3 columns on sm+ screens
- Each shows label + numeric value or "—" if loading

**StatCard component** (`src/components/stat-card.tsx`):
- Props: `label` (string), `value` (number | string)
- Displays in card with larger font size

#### Today's Meetings Section

**Card container** with title "Dagens möten"

- Shows meetings scheduled for today with status = "scheduled"
- Empty state: "Inga möten inbokade för idag."
- List items showing:
  - Meeting title
  - Lead company or name (if linked)
  - Meeting datetime (formatted)
  - Status badge
- Dividers between items

#### Callbacks Section

**Card container** with title "Återuppringningar"

- Shows leads with status = "callback"
- Empty state: "Inga återuppringningar i kö."
- List items showing:
  - Lead company or name
  - Phone number (formatted, monospace, in indigo-600)
  - Callback datetime (if set)
  - Status badge

### Data Flow

1. Load page → Fetch stats, meetings, leads
2. Filter meetings: today's date + scheduled status
3. Filter leads: callback status
4. Display all data or loading states
5. Click "Next customer" → Navigate to `/dialer`

### API Integration

- `useAdminStats()` — Dashboard stats (calls_today, leads_remaining)
- `useMeetings()` — All meetings for user
- `useLeads()` — All leads for user

### Utility Functions

- `formatDateTime(isoString)` — Format ISO datetime to readable format
- `formatPhone(phoneNumber)` — Format phone with Swedish conventions
- `todayDateString()` — Get YYYY-MM-DD for today

### Key Features

- **Real-time filtering:** Meetings and callbacks filtered in component
- **Responsive grid:** Stats cards adapt to screen size
- **Formatted display:** All dates/phones formatted for readability
- **Empty states:** Clear messaging when no meetings or callbacks

---

## Dialer Page (`/dialer`)

**File:** `src/pages/dialer.tsx`

### Overview

Main call interface for agents. Shows current lead details, records call outcomes, displays history.

### Layout

Two-column grid with history timeline below:
- Left (3fr): Lead info card
- Right (2fr): Outcome panel
- Full width: History timeline

### Components

#### Page States

**State 1: No Lead Loaded**
- Centered message: "Redo att börja ringa?"
- Subtitle: "Tryck på knappen nedan för att hämta nästa kund i kön."
- Button: "Nästa kund" or "Hämtar..." if loading
- Error display if next lead fetch fails

**State 2: Loading Lead Detail**
- Centered: "Laddar kund..."

**State 3: Error**
- Centered error message: "Kunde inte ladda kunddata."

**State 4: Lead Loaded (Main State)**

##### Header
- Title: Lead company name or "{first_name} {last_name}"
- Action buttons:
  - "Hoppa över" (skip) → Moves to next lead without recording outcome
  - "Dashboard" → Navigate to `/dashboard`

##### Two-Column Grid

**Left Column: LeadInfo Component**

Card showing all lead details:
- Title: Company name or full name
- Status badge (top-right)
- Info rows for each field (conditionally displayed):
  - Phone (clickable tel: link, indigo-600, monospace)
  - Org number (monospace)
  - Address
  - Zip code (monospace)
  - City
  - Industry
  - Revenue (formatted currency)
  - Profit (formatted currency)
  - Employees (number)
  - CEO name
  - Company type
  - Email (clickable mailto: link, indigo-600)
  - Notes

Each info row:
- Label: 11px, uppercase, medium weight, secondary text
- Value: 14px, primary text (or monospace if flagged)
- Divider between rows (last row has none)

**Right Column: OutcomePanel Component**

Card for recording call outcome:
- Title: "Utfall"
- 2-column grid of outcome buttons (6 total):
  1. "Möte bokat" (meeting_booked) — Green
  2. "Återuppringning" (callback) — Amber
  3. "Inte intresserad" (not_interested) — Red
  4. "Svarar ej" (no_answer) — Gray
  5. "Fel nummer" (bad_number) — Dark gray
  6. "Kund" (customer) — Indigo

Outcome button behavior:
- First click: Select (shows "Bekräfta: {label}", highlighted)
- Second click: Submit (record outcome)
- Colors: Custom border/bg colors matching outcome theme
- Disabled during submission

Conditional fields (shown based on selected outcome):
- **Callback:** Datetime-local input for callback time
- **Meeting booked:** Date input + Time input (both required)
- **All outcomes:** Textarea for notes (3 rows, optional)

Error display: Red panel with validation/submission errors

Hint text: "Välj ett utfall ovan — klicka igen för att bekräfta." (when nothing selected)

##### History Timeline

Shows call logs and audit logs sorted newest-first.

**Entry types:**

**Call Log Entry:**
- Dot: Indigo circle
- Vertical line (if not last)
- Outcome label or "Samtal"
- Timestamp (formatted)
- Agent name (if present)
- Notes (if present)

**Audit Log Entry:**
- Dot: Slate gray circle
- Vertical line (if not last)
- Action label
- Timestamp (formatted)
- Details (if present, as JSON monospace)

### Data Flow

1. Page loads → No lead selected, show "Nästa kund" button
2. Click "Nästa kund" → Fetch next unassigned lead
3. Lead received → Set currentLeadId, fetch lead detail
4. Lead detail loaded → Show full dialer interface
5. Select outcome → Highlight button
6. Click again to confirm → Submit outcome to API
7. Success → Reset form, auto-fetch next lead
8. Agent can click "Hoppa över" at any time → Clear lead, go back to step 1

### API Integration

- `useNextLead()` — Get next unassigned lead (mutation)
- `useLeadDetail(id)` — Get lead with details, call_logs, audit_logs
- `useSubmitOutcome(leadId)` — Record call outcome (mutation)

### Key Features

- **Confirmation UI:** Click twice to confirm outcome (prevents accidents)
- **Conditional inputs:** Meeting/callback forms only show when needed
- **Auto-next:** Automatically fetches next lead after outcome
- **Rich history:** Combined call + audit logs with visual timeline
- **Swedish messaging:** All UI text in Swedish

---

## Lead Detail Page (`/leads/:id`)

**File:** `src/pages/lead-detail.tsx`

### Overview

Read-only lead profile view. Shows same information as dialer but without outcome recording or interactive elements.

### Layout

Similar to dialer but without outcome panel:
- Title: Lead company or name
- 3fr 2fr grid (with empty right column for balance)
- History timeline below

### States

**Loading State:**
- Centered: "Laddar kund..."

**Error State:**
- Centered error message with details

**Loaded State (Main):**

#### Header
- Title: Lead company or name (h1 style)

#### Lead Info Card
- Same as dialer (LeadInfo component)
- Full card layout with all fields

#### Empty Right Column
- Placeholder `<div />` for layout balance

#### History Timeline
- Same as dialer (HistoryTimeline component)

### Data Flow

1. Page loads with lead ID from URL params
2. Fetch lead detail via `useLeadDetail(id)`
3. Loading state → Show "Laddar kund..."
4. Success → Display lead info + history
5. Error → Show error message

### API Integration

- `useLeadDetail(id)` — Fetch lead with call_logs + audit_logs

### Key Features

- **Read-only view:** No editing or outcome recording
- **Route-based navigation:** Accessible from anywhere via `/leads/:id`
- **Same component reuse:** Reuses LeadInfo and HistoryTimeline from dialer
- **Consistent layout:** 3fr 2fr grid matches dialer for visual consistency

---

## Component Hierarchy

```
App (router setup)
├── LoginPage (unauthenticated)
└── ProtectedRoute (requires auth)
    └── Layout
        ├── Sidebar (nav)
        ├── Topbar (header + logout)
        └── main
            ├── DashboardPage
            │   ├── StatCard (x3)
            │   └── Card (meetings & callbacks)
            ├── DialerPage
            │   ├── LeadInfo
            │   ├── OutcomePanel
            │   └── HistoryTimeline
            └── LeadDetailPage
                ├── LeadInfo
                └── HistoryTimeline
```

## Navigation Flow

```
/login (unauthenticated)
  ↓
/dashboard (authenticated)
  ├→ /dialer (start call)
  │   ├→ Outcome → Next lead (loop)
  │   ├→ /leads/:id (view any lead)
  │   └→ Back to /dashboard
  ├→ /leads/:id (from any list)
  └→ Logout → /login
```

---

## Accessibility Notes

- All buttons have focus-visible states (ring outline)
- Form inputs associated with labels
- Status badges use color + text for meaning
- Semantic HTML used throughout
- Loading states clearly indicated
- Error messages displayed to user

## Performance Considerations

- React Query caching with 30s stale time
- 1 retry on query failure
- Lead detail query only runs when ID is set
- History timeline: Combined sort/filter on client (data size is small)

## Internationalization

All user-facing text is in Swedish (sv-SE):
- Form labels: "E-post", "Lösenord"
- Button labels: "Logga in", "Nästa kund", "Hoppa över"
- Status messages: "Laddar...", error messages with context
- Page titles: "Dashboard", outcome labels with Swedish names
- Utilities handle formatting (phone, currency, dates)
