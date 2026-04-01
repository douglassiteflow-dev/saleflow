# SaleFlow Frontend

Sales dialing platform frontend — built with React, Vite, TypeScript, and Tailwind CSS v4.

## Stack

- **Framework:** React 19 + React Router v7
- **Build tool:** Vite 8
- **Language:** TypeScript 5.9
- **Styling:** Tailwind CSS v4 (CSS-only config, no JS file)
- **Data fetching:** TanStack React Query v5
- **Icons:** Lucide React
- **UI utilities:** clsx, tailwind-merge, class-variance-authority
- **API communication:** Native Fetch API with custom client

## Quick Start

### Setup

```bash
cd frontend
npm install
```

### Development

```bash
npm run dev
```

Runs on `http://localhost:5173` with API proxy to `http://localhost:4000/api`.

### Build

```bash
npm run build
```

Compiles TypeScript (`tsc -b`) and bundles with Vite. Output to `dist/`.

### Lint

```bash
npm lint
```

ESLint with TypeScript support and React Hooks rules.

## Project Structure

```
src/
├── api/              # API client, hooks, types
│   ├── client.ts     # Fetch wrapper + ApiError class
│   ├── types.ts      # TypeScript interfaces (User, Lead, Meeting, etc.)
│   ├── auth.ts       # useMe(), useLogin() hooks
│   ├── leads.ts      # useLeads(), useLeadDetail(), useNextLead(), useSubmitOutcome()
│   ├── meetings.ts   # useMeetings() hook
│   └── admin.ts      # useAdminStats() hook
├── components/       # Reusable components
│   ├── ui/           # Base UI components (Button, Input, Card, Badge)
│   ├── layout.tsx    # Sidebar + Topbar + Outlet container
│   ├── sidebar.tsx   # Navigation with role-based items
│   ├── topbar.tsx    # Header with logout
│   ├── protected-route.tsx # Route guard for auth
│   ├── stat-card.tsx # Dashboard stat display
│   ├── lead-info.tsx # Lead details panel
│   ├── outcome-panel.tsx # Call outcome selector + form
│   └── history-timeline.tsx # Call/audit log timeline
├── design/
│   └── tokens.ts     # Design tokens (colors, spacing, typography)
├── lib/              # Utilities
│   ├── cn.ts         # clsx + tailwind-merge
│   └── format.ts     # Phone, currency, date formatting
├── pages/            # Page components
│   ├── login.tsx     # /login — login form
│   ├── dashboard.tsx # /dashboard — stats + today's meetings + callbacks
│   ├── dialer.tsx    # /dialer — active call interface
│   └── lead-detail.tsx # /leads/:id — lead info + history
├── app.tsx           # Routes definition
└── main.tsx          # React app mount + CSS import
```

## Pages Overview

### Login (`/login`)
- Email + password form
- Redirects to dashboard if already authenticated
- Shows loading state while checking auth
- Error messages from failed login attempts

### Dashboard (`/dashboard`)
- **Stats cards:** Calls today, leads remaining, meetings count
- **Today's meetings:** Scheduled meetings for current day
- **Callbacks queue:** Leads awaiting callback
- "Next customer" button to launch dialer

### Dialer (`/dialer`)
- **Lead info panel:** All customer details (company, phone, address, financial data, etc.)
- **Outcome panel:** 6 call result buttons (Meeting booked, Callback, Not interested, No answer, Bad number, Customer)
  - Click once to select, twice to confirm
  - Conditional fields for callback datetime and meeting date/time
  - Notes textarea for all outcomes
- **History timeline:** Combined call logs + audit logs (newest first)
- "Skip" button to move to next lead without recording outcome
- Auto-fetches next lead after outcome submission

### Lead Detail (`/leads/:id`)
- Read-only view of lead details and history
- Accessible from dashboard or dialer navigation
- Same info panel + timeline as dialer (no outcome recording)

## Auth Flow

1. **Check current user:** `useMe()` on app load (via ProtectedRoute)
2. **Login:** `useLogin()` mutation sends email+password to `/api/auth/login`
3. **Session:** Cookies stored with `credentials: "include"` in fetch requests
4. **Logout:** Navigates to `/login` (API logout assumed handled server-side)

## API Integration

All API calls go through `/api` proxy (Vite config routes to `http://localhost:4000`).

### Key Endpoints

- `POST /api/auth/login` — Login
- `GET /api/auth/me` — Current user
- `GET /api/leads` — All leads
- `GET /api/leads/:id` — Lead details (includes call_logs + audit_logs)
- `POST /api/leads/next` — Get next unassigned lead
- `POST /api/leads/:id/outcome` — Record call outcome
- `GET /api/meetings` — All meetings
- `GET /api/admin/stats` — Dashboard stats

## Design System

See [design-system.md](./design-system.md) for complete token reference.

## Component API Reference

### Button

```tsx
<Button variant="primary" | "secondary" | "danger" | "outcome" size="default" | "lg">
  Click me
</Button>
```

### Card

```tsx
<Card>
  <CardTitle>Section Title</CardTitle>
  Content here
</Card>
```

### Badge

```tsx
<Badge status="new" | "assigned" | "callback" | "meeting_booked" | ... />
```

### Input

```tsx
<Input type="email" placeholder="..." />
```

## Development Patterns

### Using Hooks

```tsx
import { useLeads } from "@/api/leads";

function MyComponent() {
  const { data: leads, isLoading, isError, error } = useLeads();

  if (isLoading) return <p>Loading...</p>;
  if (isError) return <p>{error.message}</p>;

  return <ul>{leads?.map(l => <li key={l.id}>{l.company}</li>)}</ul>;
}
```

### Mutations

```tsx
import { useLogin } from "@/api/auth";

function LoginForm() {
  const login = useLogin();

  return (
    <form onSubmit={(e) => {
      e.preventDefault();
      login.mutate({ email, password }, {
        onSuccess: () => navigate("/dashboard"),
        onError: (err) => console.error(err.message),
      });
    }}>
      <button disabled={login.isPending}>
        {login.isPending ? "Logging in..." : "Log in"}
      </button>
      {login.isError && <p>{login.error.message}</p>}
    </form>
  );
}
```

### Class Names

Use the `cn()` utility to merge Tailwind classes:

```tsx
import { cn } from "@/lib/cn";

export function Component({ className, ...props }) {
  return <div className={cn("base-classes", className)} {...props} />;
}
```

### CSS Variables

All design tokens are CSS variables (via `@theme inline` in tailwind.css):

```tsx
<div style={{ color: "var(--color-accent)" }}>Using design token</div>
// Or via Tailwind:
<div className="bg-[var(--color-bg-panel)]">With bracket notation</div>
```

## Testing & Validation

Currently no test setup. Jest/Vitest can be added if needed.

Linting uses ESLint with TypeScript plugin and React Hooks plugin. Run `npm lint` before commits.

## Browser Support

Modern browsers (ES2020+). Built for Chrome, Firefox, Safari, Edge.

## Key Learnings & Notes

- **Tailwind v4:** CSS-only configuration in tailwind.css via `@theme inline` — no tailwind.config.ts
- **Design tokens:** Centralized in src/design/tokens.ts (TypeScript) and mirrored in tailwind.css
- **Outcome flow:** Select outcome, then click again to confirm (UX prevents accidental clicks)
- **API auth:** Session-based via cookies, no JWT bearer tokens
- **Lead workflow:** Dashboard → Dialer → Outcome → Next Lead (automated loop)
- **Swedish UI:** All user-facing text is in Swedish (sv-SE)
