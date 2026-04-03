# Call History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the event log at `/history` with an agent call history page, clean HistoryTimeline to show only calls, and move the event log to `/admin/logs`.

**Architecture:** New backend endpoint `GET /api/calls/history` joins phone_calls → users → leads → call_logs. HistoryTimeline drops auditLogs prop entirely. Current history.tsx moves to admin-logs.tsx.

**Tech Stack:** Elixir/Phoenix, PostgreSQL, React, TanStack Query, TypeScript

---

### Task 1: Backend — add `GET /api/calls/history` endpoint

**Files:**
- Modify: `backend/lib/saleflow_web/controllers/call_controller.ex`
- Modify: `backend/lib/saleflow_web/router.ex`
- Create: `backend/test/saleflow_web/controllers/call_history_test.exs`

- [ ] **Step 1: Write failing test**

```elixir
# backend/test/saleflow_web/controllers/call_history_test.exs
defmodule SaleflowWeb.CallHistoryTest do
  use SaleflowWeb.ConnCase

  alias Saleflow.Sales
  alias Saleflow.Accounts

  @agent_params %{
    email: "history-agent@example.com",
    name: "History Agent",
    password: "password123",
    password_confirmation: "password123"
  }

  describe "GET /api/calls/history" do
    test "returns agent's outgoing calls for today", %{conn: conn} do
      {conn, agent} = register_and_log_in_user(conn)

      {:ok, lead} = Sales.create_lead(%{företag: "Test AB", telefon: "+46700000001"})

      {:ok, _} =
        Sales.create_phone_call(%{
          caller: "+46701111111",
          callee: "+46700000001",
          user_id: agent.id,
          duration: 42,
          direction: :outgoing
        })

      {:ok, _} =
        Sales.log_call(%{
          lead_id: lead.id,
          user_id: agent.id,
          outcome: :meeting_booked,
          notes: "Bokat demo"
        })

      conn = get(conn, "/api/calls/history")

      assert %{"calls" => [call]} = json_response(conn, 200)
      assert call["callee"] == "+46700000001"
      assert call["duration"] == 42
      assert call["user_name"] == agent.name
    end

    test "filters by date param", %{conn: conn} do
      {conn, _agent} = register_and_log_in_user(conn)

      conn = get(conn, "/api/calls/history?date=2020-01-01")

      assert %{"calls" => []} = json_response(conn, 200)
    end

    test "agent sees only own calls", %{conn: conn} do
      {conn, agent} = register_and_log_in_user(conn)

      {:ok, other} = Accounts.register(%{
        email: "other@example.com", name: "Other",
        password: "password123", password_confirmation: "password123"
      })

      {:ok, _} =
        Sales.create_phone_call(%{
          caller: "+46709999999",
          callee: "+46700000002",
          user_id: other.id,
          duration: 10,
          direction: :outgoing
        })

      conn = get(conn, "/api/calls/history")

      assert %{"calls" => []} = json_response(conn, 200)
    end

    test "requires authentication", %{conn: conn} do
      conn =
        conn
        |> Plug.Test.init_test_session(%{})
        |> get("/api/calls/history")

      assert json_response(conn, 401)
    end
  end
end
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && mix test test/saleflow_web/controllers/call_history_test.exs`
Expected: FAIL — no route matches GET /api/calls/history

- [ ] **Step 3: Add route**

In `backend/lib/saleflow_web/router.ex`, inside the authenticated scope (after line 98 `get "/calls/:id/recording"`), add:

```elixir
    get "/calls/history", CallController, :history
```

- [ ] **Step 4: Implement history action**

In `backend/lib/saleflow_web/controllers/call_controller.ex`, add at the end before the private helpers:

```elixir
  @doc "List outgoing calls with lead/outcome data for the agent's call history."
  def history(conn, params) do
    user = conn.assigns.current_user
    date = parse_date(params["date"]) || Date.utc_today()

    query = """
    SELECT
      pc.id, pc.caller, pc.callee, pc.duration, pc.direction::text,
      pc.received_at, pc.user_id, pc.lead_id, pc.recording_key,
      u.name as user_name,
      l.företag as lead_name,
      cl.outcome::text, cl.notes
    FROM phone_calls pc
    LEFT JOIN users u ON u.id = pc.user_id
    LEFT JOIN leads l ON l.id = pc.lead_id
    LEFT JOIN LATERAL (
      SELECT outcome, notes FROM call_logs
      WHERE call_logs.lead_id = pc.lead_id
        AND call_logs.user_id = pc.user_id
        AND call_logs.called_at::date = pc.received_at::date
      ORDER BY call_logs.called_at DESC
      LIMIT 1
    ) cl ON true
    WHERE pc.direction = 'outgoing'
      AND pc.received_at::date = $1
    """

    {query, query_params} =
      case user.role do
        :admin ->
          {query <> " ORDER BY pc.received_at DESC", [date]}

        _ ->
          uid = Ecto.UUID.dump!(user.id)
          {query <> " AND pc.user_id = $2 ORDER BY pc.received_at DESC", [date, uid]}
      end

    {:ok, %{rows: rows}} = Saleflow.Repo.query(query, query_params)

    calls =
      Enum.map(rows, fn [id, caller, callee, duration, direction, received_at, user_id,
                          lead_id, recording_key, user_name, lead_name, outcome, notes] ->
        %{
          id: Saleflow.Sales.decode_uuid(id),
          caller: caller,
          callee: callee,
          duration: duration || 0,
          direction: direction,
          received_at: received_at && NaiveDateTime.to_iso8601(received_at),
          user_id: user_id && Saleflow.Sales.decode_uuid(user_id),
          user_name: user_name,
          lead_id: lead_id && Saleflow.Sales.decode_uuid(lead_id),
          lead_name: lead_name,
          has_recording: recording_key != nil,
          outcome: outcome,
          notes: notes
        }
      end)

    json(conn, %{calls: calls})
  end

  defp parse_date(nil), do: nil
  defp parse_date(str) when is_binary(str) do
    case Date.from_iso8601(str) do
      {:ok, date} -> date
      _ -> nil
    end
  end
```

- [ ] **Step 5: Run tests**

Run: `cd backend && mix test test/saleflow_web/controllers/call_history_test.exs`
Expected: all pass

- [ ] **Step 6: Run full suite**

Run: `cd backend && mix test`
Expected: all pass

- [ ] **Step 7: Commit**

```bash
git add backend/lib/saleflow_web/controllers/call_controller.ex backend/lib/saleflow_web/router.ex backend/test/saleflow_web/controllers/call_history_test.exs
git commit -m "feat: add GET /api/calls/history endpoint for agent call history"
```

---

### Task 2: Frontend — add `useCallHistory` hook and types

**Files:**
- Create: `frontend/src/api/calls.ts`
- Modify: `frontend/src/api/types.ts`

- [ ] **Step 1: Add CallHistoryEntry type**

Add to `frontend/src/api/types.ts` after the `CallLog` interface (after line 98):

```typescript
export interface CallHistoryEntry {
  id: string;
  caller: string;
  callee: string;
  duration: number;
  direction: string;
  received_at: string;
  user_id: string | null;
  user_name: string | null;
  lead_id: string | null;
  lead_name: string | null;
  has_recording: boolean;
  outcome: string | null;
  notes: string | null;
}
```

- [ ] **Step 2: Create calls API hook**

```typescript
// frontend/src/api/calls.ts
import { useQuery } from "@tanstack/react-query";
import { api } from "./client";
import type { CallHistoryEntry } from "./types";

export function useCallHistory(date: string) {
  return useQuery<CallHistoryEntry[]>({
    queryKey: ["calls", "history", date],
    queryFn: async () => {
      const data = await api<{ calls: CallHistoryEntry[] }>(
        `/api/calls/history?date=${date}`
      );
      return data.calls;
    },
    staleTime: 30_000,
    refetchInterval: 30_000,
  });
}
```

- [ ] **Step 3: TypeScript check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/api/calls.ts frontend/src/api/types.ts
git commit -m "feat: add useCallHistory hook and CallHistoryEntry type"
```

---

### Task 3: Frontend — new `/history` page (agent call history)

**Files:**
- Rewrite: `frontend/src/pages/history.tsx`

- [ ] **Step 1: Rewrite history.tsx**

```typescript
// frontend/src/pages/history.tsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCallHistory } from "@/api/calls";
import { useMe } from "@/api/auth";
import { formatDateTime } from "@/lib/format";
import Loader from "@/components/kokonutui/loader";

const OUTCOME_LABELS: Record<string, string> = {
  meeting_booked: "Möte bokat",
  callback: "Återuppringning",
  not_interested: "Ej intresserad",
  no_answer: "Ej svar",
  call_later: "Ring senare",
  bad_number: "Fel nummer",
  customer: "Kund",
  other: "Övrigt",
};

const OUTCOME_COLORS: Record<string, string> = {
  meeting_booked: "bg-emerald-100 text-emerald-700",
  callback: "bg-amber-100 text-amber-700",
  not_interested: "bg-rose-100 text-rose-700",
  no_answer: "bg-slate-100 text-slate-600",
  call_later: "bg-blue-100 text-blue-700",
  bad_number: "bg-red-100 text-red-700",
  customer: "bg-indigo-100 text-indigo-700",
  other: "bg-slate-100 text-slate-600",
};

function formatDuration(seconds: number): string {
  if (seconds === 0) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function HistoryPage() {
  const [date, setDate] = useState(todayISO);
  const navigate = useNavigate();
  const { data: user } = useMe();
  const { data: calls, isLoading } = useCallHistory(date);
  const isAdmin = user?.role === "admin";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-[22px] font-light tracking-[-0.5px] text-[var(--color-text-primary)]">
          Samtalshistorik
        </h1>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="h-9 rounded-[10px] border border-[var(--color-border-input)] bg-[var(--color-bg-primary)] px-3 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20"
        />
      </div>

      <div className="overflow-hidden rounded-[14px] bg-[var(--color-bg-primary)] shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        {isLoading ? (
          <div className="p-[var(--spacing-card)]">
            <Loader size="sm" title="Laddar samtal..." />
          </div>
        ) : !calls || calls.length === 0 ? (
          <p className="p-[var(--spacing-card)] text-sm text-[var(--color-text-secondary)]">
            Inga samtal {date === todayISO() ? "idag" : `den ${date}`}.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  <th className="px-5 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-[var(--color-text-secondary)]">
                    Tid
                  </th>
                  <th className="px-5 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-[var(--color-text-secondary)]">
                    Företag
                  </th>
                  <th className="px-5 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-[var(--color-text-secondary)]">
                    Telefon
                  </th>
                  {isAdmin && (
                    <th className="px-5 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-[var(--color-text-secondary)]">
                      Agent
                    </th>
                  )}
                  <th className="px-5 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-[var(--color-text-secondary)]">
                    Längd
                  </th>
                  <th className="px-5 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-[var(--color-text-secondary)]">
                    Utfall
                  </th>
                </tr>
              </thead>
              <tbody>
                {calls.map((call, i) => (
                  <tr
                    key={call.id}
                    onClick={() => call.lead_id && void navigate(`/leads/${call.lead_id}`)}
                    className={[
                      i !== calls.length - 1 ? "border-b border-slate-50" : "",
                      call.lead_id ? "cursor-pointer transition-colors hover:bg-[var(--color-bg-panel)]" : "",
                    ].filter(Boolean).join(" ")}
                  >
                    <td className="whitespace-nowrap px-5 py-3.5 font-mono text-xs text-[var(--color-text-secondary)]">
                      {formatDateTime(call.received_at)}
                    </td>
                    <td className="px-5 py-3.5 font-medium text-[var(--color-text-primary)]">
                      {call.lead_name ?? "Okänt företag"}
                    </td>
                    <td className="px-5 py-3.5 text-[var(--color-text-secondary)]">
                      {call.callee}
                    </td>
                    {isAdmin && (
                      <td className="px-5 py-3.5 font-medium text-[var(--color-accent)]">
                        {call.user_name ?? "—"}
                      </td>
                    )}
                    <td className="px-5 py-3.5 text-[var(--color-text-secondary)]">
                      {formatDuration(call.duration)}
                    </td>
                    <td className="px-5 py-3.5">
                      {call.outcome ? (
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${OUTCOME_COLORS[call.outcome] ?? "bg-slate-100 text-slate-600"}`}>
                          {OUTCOME_LABELS[call.outcome] ?? call.outcome}
                        </span>
                      ) : (
                        <span className="text-[var(--color-text-secondary)]">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: TypeScript check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/history.tsx
git commit -m "feat: rewrite /history as agent call history with date picker"
```

---

### Task 4: Simplify HistoryTimeline — calls only

**Files:**
- Modify: `frontend/src/components/history-timeline.tsx`
- Modify: `frontend/src/pages/lead-detail.tsx`
- Modify: `frontend/src/pages/dialer.tsx`
- Modify: `frontend/src/pages/meeting-detail.tsx`

- [ ] **Step 1: Rewrite HistoryTimeline to only accept callLogs**

Replace `frontend/src/components/history-timeline.tsx` entirely:

```typescript
import type { CallLog } from "@/api/types";
import { Card, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/cn";

const OUTCOME_LABELS: Record<string, string> = {
  meeting_booked: "Möte bokat",
  callback: "Återuppringning",
  not_interested: "Ej intresserad",
  no_answer: "Ej svar",
  call_later: "Ring senare",
  bad_number: "Fel nummer",
  customer: "Kund",
  other: "Övrigt",
};

function dotColor(outcome: string): string {
  if (outcome === "meeting_booked") return "bg-emerald-500";
  if (outcome === "not_interested") return "bg-rose-500";
  if (outcome === "customer") return "bg-indigo-500";
  if (outcome === "callback") return "bg-amber-500";
  if (outcome === "bad_number") return "bg-red-500";
  return "bg-indigo-400";
}

interface HistoryTimelineProps {
  callLogs?: CallLog[];
}

export function HistoryTimeline({ callLogs = [] }: HistoryTimelineProps) {
  const sorted = [...callLogs].sort(
    (a, b) => new Date(b.called_at).getTime() - new Date(a.called_at).getTime()
  );

  return (
    <Card>
      <CardTitle className="mb-4">Samtalshistorik</CardTitle>

      {sorted.length === 0 ? (
        <p className="text-sm text-[var(--color-text-secondary)]">
          Inga samtal ännu.
        </p>
      ) : (
        <ol className="relative ml-3 space-y-0">
          {sorted.map((call, idx) => (
            <li key={call.id} className="relative pl-6 pb-5 last:pb-0">
              {idx < sorted.length - 1 && (
                <span
                  className="absolute left-[7px] top-3 bottom-0 w-px bg-[var(--color-border)]"
                  aria-hidden
                />
              )}

              <span
                className={cn(
                  "absolute left-0 top-1.5 w-3.5 h-3.5 rounded-full border-2 border-white",
                  dotColor(call.outcome ?? ""),
                )}
                aria-hidden
              />

              <div>
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-sm font-medium text-[var(--color-text-primary)]">
                    {OUTCOME_LABELS[call.outcome ?? ""] ?? "Samtal"}
                  </span>
                  {call.user_name && (
                    <span className="text-[11px] font-semibold text-[var(--color-text-primary)]">
                      — {call.user_name}
                    </span>
                  )}
                  <span className="text-[11px] font-mono text-[var(--color-text-secondary)]">
                    {formatDateTime(call.called_at)}
                  </span>
                </div>

                {call.notes && (
                  <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                    {call.notes}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
```

- [ ] **Step 2: Update lead-detail.tsx — remove auditLogs**

In `frontend/src/pages/lead-detail.tsx`, change line 29 and 42-45:

```typescript
  const { lead, calls } = leadData;

  // ...

  <HistoryTimeline callLogs={calls} />
```

Remove `audit_logs: auditLogs` from destructuring. Remove `auditLogs` prop.

- [ ] **Step 3: Update dialer.tsx — remove auditLogs**

In `frontend/src/pages/dialer.tsx`, line 87 destructures `audit_logs`. Change to:

```typescript
  const { lead, calls } = leadData;
```

And line 122 where HistoryTimeline is used:

```typescript
  <HistoryTimeline callLogs={calls} />
```

- [ ] **Step 4: Check meeting-detail.tsx**

Read `frontend/src/pages/meeting-detail.tsx` and remove auditLogs prop from HistoryTimeline if present.

- [ ] **Step 5: TypeScript check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/history-timeline.tsx frontend/src/pages/lead-detail.tsx frontend/src/pages/dialer.tsx frontend/src/pages/meeting-detail.tsx
git commit -m "refactor: HistoryTimeline shows only calls, remove audit logs"
```

---

### Task 5: Move event log to `/admin/logs`

**Files:**
- Create: `frontend/src/pages/admin-logs.tsx`
- Modify: `frontend/src/app.tsx`
- Modify: `frontend/src/components/sidebar.tsx`

- [ ] **Step 1: Create admin-logs.tsx**

Copy the ORIGINAL history.tsx content (the audit log version) from git before our rewrite:

```bash
cd /Users/douglassiteflow/dev/saleflow
git show 83e87d2:frontend/src/pages/history.tsx > frontend/src/pages/admin-logs.tsx
```

Then edit the file: rename the export from `HistoryPage` to `AdminLogsPage` and change the title from "Historik" to "Händelselogg".

- [ ] **Step 2: Update app.tsx — add admin/logs route, update history import**

In `frontend/src/app.tsx`:

Remove the lazy import for HistoryPage (line 19) and replace with eager import:

```typescript
import { HistoryPage } from "@/pages/history";
```

Add lazy import for AdminLogsPage:

```typescript
const AdminLogsPage = lazy(() => import("@/pages/admin-logs").then((m) => ({ default: m.AdminLogsPage })));
```

Change the `/history` route (line 54) from Suspense-wrapped to direct:

```typescript
<Route path="/history" element={<HistoryPage />} />
```

Add new admin route inside the AdminRoute section (after line 61):

```typescript
<Route path="/admin/logs" element={<Suspense fallback={<LazyFallback />}><AdminLogsPage /></Suspense>} />
```

- [ ] **Step 3: Update sidebar — add Loggar under Admin**

In `frontend/src/components/sidebar.tsx`, add after line 108 (after "Förfrågningar"):

```typescript
              <NavItem to="/admin/logs" label="Loggar" />
```

- [ ] **Step 4: TypeScript check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/admin-logs.tsx frontend/src/app.tsx frontend/src/components/sidebar.tsx
git commit -m "feat: move event log to /admin/logs, add Loggar to admin sidebar"
```

---

### Task 6: Update tests

**Files:**
- Modify: `frontend/src/pages/__tests__/history.test.tsx`
- Modify: `frontend/src/components/__tests__/history-timeline.test.tsx`
- Modify: `frontend/src/components/__tests__/sidebar.test.tsx`

- [ ] **Step 1: Update history page test**

Rewrite `frontend/src/pages/__tests__/history.test.tsx` to test the new call history page. Mock `useCallHistory` and `useMe`, verify table renders call data, date picker works.

- [ ] **Step 2: Update HistoryTimeline test**

Update `frontend/src/components/__tests__/history-timeline.test.tsx` — remove all audit log tests, test only with callLogs prop. Verify it shows "Samtalshistorik" heading and "Inga samtal ännu." for empty state.

- [ ] **Step 3: Update sidebar test**

Update `frontend/src/components/__tests__/sidebar.test.tsx` — verify "Loggar" appears for admin users.

- [ ] **Step 4: Run frontend tests**

Run: `cd frontend && npx vitest run`
Expected: all pass

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/__tests__/history.test.tsx frontend/src/components/__tests__/history-timeline.test.tsx frontend/src/components/__tests__/sidebar.test.tsx
git commit -m "test: update tests for call history and admin logs"
```

---

### Task 7: Clean up unused audit imports

**Files:**
- Modify: `frontend/src/api/leads.ts`
- Modify: `frontend/src/api/types.ts` (if needed)

- [ ] **Step 1: Remove AuditLog from LeadDetailData**

In `frontend/src/api/leads.ts`, remove `audit_logs` from `LeadDetailData` interface (line 33):

```typescript
export interface LeadDetailData {
  lead: Lead;
  calls: CallLog[];
}
```

Remove `AuditLog` from the import on line 3.

- [ ] **Step 2: TypeScript check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors. If other files still import AuditLog, leave the type definition. Only remove unused imports.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/api/leads.ts
git commit -m "chore: remove AuditLog from LeadDetailData"
```

---

### Task 8: Deploy and verify

- [ ] **Step 1: Run full backend test suite**

Run: `cd backend && mix test`
Expected: all pass

- [ ] **Step 2: Run full frontend type check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Deploy to staging**

Run: `cd /Users/douglassiteflow/dev/saleflow && fly deploy --app saleflow-staging`
Expected: healthy deployment

- [ ] **Step 4: Deploy to production**

Run: `fly deploy --app saleflow-app`
Expected: healthy deployment

- [ ] **Step 5: Verify**

- Open `/history` — should show agent's calls for today with date picker
- Open `/admin/logs` (as admin) — should show the old event log
- Open a lead detail page — HistoryTimeline should show only calls with outcomes
- Sidebar shows "Loggar" under Admin section
