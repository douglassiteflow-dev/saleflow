# Meetings Redesign + Performance — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rich meeting cards with lead data + detail page + performance optimization across the app.

**Architecture:** Extend Meeting resource with update action, join lead/user data in serialization, add combined dashboard endpoint. Frontend: meeting detail page, lazy loading, optimistic updates.

**Tech Stack:** Existing Elixir/Phoenix/Ash backend + React/TypeScript frontend

---

## Task Overview

| # | Task | Scope |
|---|------|-------|
| 1 | Backend: Meeting update + enriched serialization + detail endpoint | Backend |
| 2 | Backend: Combined dashboard endpoint | Backend |
| 3 | Frontend: Updated Meeting types + hooks | Frontend |
| 4 | Frontend: Meeting detail page + improved list | Frontend |
| 5 | Frontend: Performance (lazy loading + staleTime + optimistic updates) | Frontend |
| 6 | Deploy staging + verify + deploy prod | Deploy |

---

### Task 1: Backend — Meeting enrichment + update + detail

**What to do:**

1. Add `:update` action to Meeting resource accepting [:meeting_date, :meeting_time, :notes, :status] with audit log
2. Add `update_meeting/2` to Sales domain
3. Add `get_meeting_detail/1` to Sales domain — returns meeting + lead + calls + audit
4. Modify `serialize_meeting` in meeting_controller to include lead data + user_name
5. Add `show` action (GET /api/meetings/:id) to meeting_controller
6. Add `update` action (PUT /api/meetings/:id) to meeting_controller
7. Add routes to router.ex
8. Meetings list: include lead data by loading lead for each meeting
9. Role-scope: agents see own meetings, admins see all (already done for index, apply to show/update)
10. Tests for all new endpoints
11. Commit

**Key details:**
- Meeting resource already has :cancel and :complete actions — add a general :update that accepts all fields
- To get lead data: do a separate `Sales.get_lead(meeting.lead_id)` per meeting (simple, no Ash join needed)
- To get user_name: build user_id → name map from Accounts.list_users()
- show returns: `{meeting, lead, calls, audit_logs}` — similar to lead_controller.show
- update: validates status is one of [:scheduled, :completed, :cancelled], audit logs the change

---

### Task 2: Backend — Combined dashboard endpoint

**What to do:**

1. Add `dashboard` action to a new DashboardController (or add to AdminController)
2. Endpoint: GET /api/dashboard (authenticated, not admin-only)
3. Returns:
   - `stats`: lead counts by status (same as admin/stats but available to all)
   - `todays_meetings`: meetings for today for current user (or all for admin)
   - `callbacks`: leads with status=callback assigned to current user (or all for admin)
   - `my_stats`: {calls_today, meetings_today, total_calls, total_meetings} for current user
4. Add route to authenticated scope
5. Single DB round-trip per section (4 queries total, no N+1)
6. Tests
7. Commit

**Key details:**
- Stats query: reuse existing raw SQL from admin_controller.stats
- Today's meetings: filter by meeting_date = today, include lead data
- Callbacks: filter leads by status = :callback, for agents also filter by assignment
- My stats: count call_logs and meetings where user_id = current_user and date = today

---

### Task 3: Frontend — Updated Meeting types + hooks

**What to do:**

1. Update Meeting interface in types.ts — add `user_name`, `lead` (nested object), `updated_at`
2. Add `MeetingLead` interface for the nested lead data
3. Add `useMeetingDetail(id)` hook — GET /api/meetings/:id
4. Add `useUpdateMeeting()` hook — PUT /api/meetings/:id
5. Add `useDashboard()` hook — GET /api/dashboard (replaces separate useAdminStats + useMeetings + useLeads on dashboard)
6. Add DashboardData type
7. Build must pass
8. Commit

---

### Task 4: Frontend — Meeting detail page + improved list

**What to do:**

1. Create `/meetings/:id` page (src/pages/meeting-detail.tsx):
   - Header: title + status badge + action buttons (Markera genomförd, Avboka, Boka om)
   - Two-column layout:
     - Left: meeting info (datum, tid, agent, anteckningar, påminnelse-status)
     - Right: lead info (företag, telefon clickable, Google Maps-länk, bransch, omsättning, VD, källa badge)
   - Edit form: datum, tid, anteckningar, status dropdown + spara-knapp
   - Bottom: HistoryTimeline with calls + audit for this lead

2. Modify meetings list page (src/pages/meetings.tsx):
   - Add columns: Företag, Agent, Bransch
   - Click row → navigate to /meetings/:id
   - Add filter tabs: Kommande / Idag / Alla / Genomförda / Avbokade

3. Modify dashboard (src/pages/dashboard.tsx):
   - Use `useDashboard()` hook instead of 3 separate hooks
   - Single API call for all dashboard data

4. Add route /meetings/:id to app.tsx

5. Build must pass
6. Commit

**Google Maps link format:**
```
https://www.google.com/maps/search/${encodeURIComponent([adress, postnummer, stad].filter(Boolean).join(" "))}
```

---

### Task 5: Frontend — Performance optimization

**What to do:**

1. **Lazy loading**: wrap admin pages + history + profile in React.lazy + Suspense:
   ```typescript
   const AdminUsersPage = lazy(() => import("@/pages/admin-users").then(m => ({ default: m.AdminUsersPage })));
   ```
   Keep login, dashboard, dialer, meetings as eager imports.

2. **Increase staleTime**:
   - Dashboard: 60_000
   - Meetings list: 60_000
   - Lead detail: 30_000 (keep responsive)
   - Auth me: 300_000 (already set)

3. **Optimistic updates**:
   - Cancel meeting: `onMutate` removes from cache, `onError` reverts
   - Submit outcome in dialer: immediately transition to "fetching next" state
   - Skip lead: fire outcome mutation, don't await, immediately fetch next

4. **Dialer optimization**: when `useNextLead` returns full lead data, set it as `useLeadDetail` cache to avoid double-fetch:
   ```typescript
   onSuccess: (lead) => {
     if (lead) {
       queryClient.setQueryData(["leads", "detail", lead.id], { lead, calls: [], audit_logs: [] });
     }
   }
   ```

5. Build + verify bundle size reduced
6. Commit

---

### Task 6: Deploy

1. Deploy staging: `fly deploy -a saleflow-staging -c fly.staging.toml`
2. Run migrations: `fly ssh console -a saleflow-staging -C "/app/bin/saleflow eval 'Saleflow.Release.migrate()'"`
3. Test on staging
4. Deploy prod: `fly deploy -a saleflow-app`
5. Run prod migrations
6. Verify prod

---

## Summary

| Task | What | Tests |
|------|------|-------|
| 1 | Backend meeting enrichment + update + detail | 15+ |
| 2 | Backend combined dashboard endpoint | 10+ |
| 3 | Frontend types + hooks | Build pass |
| 4 | Frontend meeting detail page + list | Build pass |
| 5 | Frontend performance | Build pass + bundle size check |
| 6 | Deploy staging → prod | Manual verify |
