# SaleFlow Frontend Pages + Tests — Implementation Plan (2B of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete all remaining frontend pages (meetings, history, admin) and achieve 100% test coverage with Vitest + Playwright E2E.

**Architecture:** Extends the existing React SPA with additional pages. Vitest for component/hook tests. Playwright for full E2E flows against the real backend.

**Tech Stack:** React 19, TypeScript strict, Vite 6, Vitest, @testing-library/react, Playwright

---

## Tasks

### Task 1: Meetings page (/meetings)

**Files:**
- Create: `frontend/src/pages/meetings.tsx`
- Create: `frontend/src/components/meeting-form.tsx`
- Modify: `frontend/src/app.tsx` — add /meetings route
- Modify: `frontend/src/components/sidebar.tsx` — enable Möten link

Meetings page with:
- Table of all upcoming meetings (date, time, company name, agent, status badge)
- "Nytt möte" button opens inline form (not modal — keep it simple)
- MeetingForm: lead_id (text input), title, date, time, notes. Submit via useCreateMeeting
- Cancel button on each meeting row via useCancelMeeting
- Uses design system: table with slate-50 header, no borders, slate-200 row dividers

Enable the "Möten" sidebar link (remove disabled state).
Add `<Route path="/meetings" element={<MeetingsPage />} />` to app.tsx.

Commit separately.

---

### Task 2: History page (/history)

**Files:**
- Create: `frontend/src/pages/history.tsx`
- Modify: `frontend/src/app.tsx` — add /history route
- Modify: `frontend/src/components/sidebar.tsx` — enable Historik link
- Create: `frontend/src/api/audit.ts` — audit hooks

History page with:
- Searchable table of all call logs (from GET /api/leads with search, then detail per lead)
- Actually: use GET /api/audit endpoint for full audit trail
- Filters: search by text (free text input), filter by action type (dropdown)
- Table columns: timestamp, action, resource type, user, details
- Click row → navigate to /leads/:id
- useAuditLogs(filters) hook calling GET /api/audit

Enable "Historik" sidebar link.
Add route to app.tsx.

Commit separately.

---

### Task 3: Admin pages (/admin/users, /admin/import, /admin/stats)

**Files:**
- Create: `frontend/src/pages/admin-users.tsx`
- Create: `frontend/src/pages/admin-import.tsx`
- Create: `frontend/src/pages/admin-stats.tsx`
- Modify: `frontend/src/app.tsx` — add admin routes with admin guard
- Modify: `frontend/src/components/sidebar.tsx` — enable admin links
- Modify: `frontend/src/components/protected-route.tsx` — add AdminRoute

**Admin Users (/admin/users):**
- Table: name, email, role (badge), created date
- "Ny användare" button → inline form (email, name, password, password_confirmation, role select)
- Uses useAdminUsers + useCreateUser

**Admin Import (/admin/import):**
- File upload area (input type="file" accept=".xlsx")
- "Importera" button
- Shows result: "X leads skapade, Y hoppades över"
- Uses useImportLeads

**Admin Stats (/admin/stats):**
- Stats cards showing lead counts per status (from useAdminStats)
- Simple bar representation using div widths

AdminRoute in protected-route.tsx:
```typescript
export function AdminRoute() {
  const { data: user, isLoading } = useMe();
  if (isLoading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== "admin") return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}
```

Enable all admin sidebar links. Add admin routes to app.tsx wrapped in AdminRoute.

Commit separately.

---

### Task 4: Vitest setup + component tests

**Files:**
- Create: `frontend/vitest.config.ts`
- Create: `frontend/src/test/setup.ts`
- Create: `frontend/src/test/utils.tsx` — render helper with providers
- Create: tests for all components and hooks

Install: `npm install -D vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom msw`

Vitest config with jsdom environment, path aliases, coverage.

Test setup with @testing-library/jest-dom matchers.

Test utils: `renderWithProviders` that wraps component in QueryClientProvider + BrowserRouter.

MSW (Mock Service Worker) for mocking API calls in tests.

Write tests for:
- UI components: Button (renders, variants, disabled), Input (renders, change), Card (renders), Badge (all statuses)
- Auth hooks: useMe (success, 401), useLogin (success, error), useLogout
- Lead hooks: useLeads, useLeadDetail, useNextLead, useSubmitOutcome
- Pages: Login (renders form, submits, shows error), Dashboard (renders stats), Dialer (idle state, loaded state), LeadDetail (renders info)
- Components: LeadInfo (renders all fields, phone link), OutcomePanel (renders buttons, two-click flow), HistoryTimeline (renders entries sorted), Sidebar (renders links, admin section), StatCard

Target: 100% coverage on all src/ files.

Commit separately.

---

### Task 5: Playwright E2E setup + tests

**Files:**
- Create: `frontend/playwright.config.ts`
- Create: `frontend/e2e/` directory with test files

Install: `npm install -D @playwright/test && npx playwright install chromium`

Playwright config: baseURL http://localhost:5173, webServer starts both backend + frontend.

E2E tests (requires backend running with seed data):
1. Login flow: visit /login → enter credentials → redirected to /dashboard
2. Login fail: wrong password → error shown
3. Dashboard: shows stats, meetings section visible
4. Dialer flow: navigate to /dialer → click "Nästa kund" → lead card shown → submit outcome → next lead
5. Meeting booking: in dialer → select "Möte bokat" → fill date/time → confirm → check /meetings
6. Lead detail: navigate to /leads/:id → info displayed
7. Admin guard: agent cannot access /admin/users → redirected
8. Import flow (admin): upload xlsx → see result

Commit separately.

---

## Summary

| Task | What |
|------|------|
| 1 | Meetings page |
| 2 | History page + audit hooks |
| 3 | Admin pages (users, import, stats) |
| 4 | Vitest component/hook tests (100% coverage) |
| 5 | Playwright E2E tests |
