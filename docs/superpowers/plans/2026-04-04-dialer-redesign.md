# Dialer Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the dialer into a LeadDesk-inspired tabbed layout with mini-leaderboard, action bar, inline outcome panel, lead comments, and callback/history/meetings tabs — all in one view.

**Architecture:** New `LeadComment` Ash resource for per-lead comments. New `GET /api/callbacks` endpoint. Frontend: complete dialer rewrite with tab-based navigation, extracted sub-components (MiniLeaderboard, DialerActionBar, LeadComments, OutcomeInline), reusing existing history/meetings components inside tabs.

**Tech Stack:** Elixir/Phoenix, Ash Framework, React, TanStack Query, TypeScript

---

### Task 1: Backend — LeadComment resource + endpoints

**Files:**
- Create: `backend/lib/saleflow/sales/lead_comment.ex`
- Modify: `backend/lib/saleflow/sales/sales.ex`
- Modify: `backend/lib/saleflow_web/controllers/lead_controller.ex`
- Modify: `backend/lib/saleflow_web/router.ex`
- Create: `backend/test/saleflow_web/controllers/lead_comment_test.exs`

- [ ] **Step 1: Create LeadComment Ash resource**

```elixir
# backend/lib/saleflow/sales/lead_comment.ex
defmodule Saleflow.Sales.LeadComment do
  use Ash.Resource,
    data_layer: AshPostgres.DataLayer,
    domain: Saleflow.Sales

  postgres do
    table "lead_comments"
    repo Saleflow.Repo
  end

  attributes do
    uuid_primary_key :id

    attribute :lead_id, :uuid do
      allow_nil? false
      public? true
    end

    attribute :user_id, :uuid do
      allow_nil? false
      public? true
    end

    attribute :text, :string do
      allow_nil? false
      public? true
    end

    create_timestamp :inserted_at
  end

  actions do
    defaults [:read]

    create :create do
      accept [:lead_id, :user_id, :text]
    end

    read :for_lead do
      argument :lead_id, :uuid, allow_nil?: false
      filter expr(lead_id == ^arg(:lead_id))
      prepare build(sort: [inserted_at: :desc])
    end
  end
end
```

Register in Sales domain (`backend/lib/saleflow/sales/sales.ex`): add `resource Saleflow.Sales.LeadComment` to the resources block.

- [ ] **Step 2: Generate and write migration**

```bash
cd backend && mix ecto.gen.migration create_lead_comments
```

```elixir
defmodule Saleflow.Repo.Migrations.CreateLeadComments do
  use Ecto.Migration

  def change do
    create table(:lead_comments, primary_key: false) do
      add :id, :uuid, primary_key: true, default: fragment("gen_random_uuid()")
      add :lead_id, references(:leads, type: :uuid, on_delete: :delete_all), null: false
      add :user_id, references(:users, type: :uuid, on_delete: :delete_all), null: false
      add :text, :text, null: false
      add :inserted_at, :utc_datetime_usec, null: false, default: fragment("now()")
    end

    create index(:lead_comments, [:lead_id])
  end
end
```

Run: `mix ecto.migrate`

- [ ] **Step 3: Add endpoints to LeadController**

In `backend/lib/saleflow_web/controllers/lead_controller.ex`, add:

```elixir
  def comments(conn, %{"id" => lead_id}) do
    {:ok, comments} =
      Saleflow.Sales.LeadComment
      |> Ash.Query.for_read(:for_lead, %{lead_id: lead_id})
      |> Ash.read()

    {:ok, users} = Saleflow.Accounts.list_users()
    user_names = Map.new(users, fn u -> {u.id, u.name} end)

    json(conn, %{
      comments: Enum.map(comments, fn c ->
        %{
          id: c.id,
          lead_id: c.lead_id,
          user_id: c.user_id,
          user_name: Map.get(user_names, c.user_id, "Okänd"),
          text: c.text,
          inserted_at: c.inserted_at
        }
      end)
    })
  end

  def create_comment(conn, %{"id" => lead_id, "text" => text}) do
    user = conn.assigns.current_user

    case Saleflow.Sales.LeadComment
         |> Ash.Changeset.for_create(:create, %{lead_id: lead_id, user_id: user.id, text: text})
         |> Ash.create() do
      {:ok, comment} ->
        conn |> put_status(201) |> json(%{ok: true, id: comment.id})

      {:error, _} ->
        conn |> put_status(422) |> json(%{error: "Kunde inte spara kommentar"})
    end
  end
```

- [ ] **Step 4: Add routes**

In `backend/lib/saleflow_web/router.ex`, in the authenticated scope after `post "/leads/:id/outcome"` (line 56), add:

```elixir
    get "/leads/:id/comments", LeadController, :comments
    post "/leads/:id/comments", LeadController, :create_comment
```

- [ ] **Step 5: Write tests, run, commit**

Write tests for GET/POST comments. Run `mix test`. Commit: `feat: add LeadComment resource with endpoints`

---

### Task 2: Backend — Callbacks endpoint

**Files:**
- Modify: `backend/lib/saleflow_web/controllers/lead_controller.ex`
- Modify: `backend/lib/saleflow_web/router.ex`

- [ ] **Step 1: Add callbacks action to LeadController**

```elixir
  def callbacks(conn, _params) do
    user = conn.assigns.current_user
    require Ash.Query

    {:ok, leads} =
      Saleflow.Sales.Lead
      |> Ash.Query.filter(status == :callback)
      |> Ash.Query.sort(callback_at: :asc)
      |> Ash.read()

    filtered =
      case user.role do
        :admin -> leads
        _ ->
          {:ok, %{rows: rows}} =
            Saleflow.Repo.query(
              "SELECT DISTINCT lead_id FROM assignments WHERE user_id = $1",
              [Ecto.UUID.dump!(user.id)]
            )
          my_lead_ids = Enum.map(rows, fn [id] -> Saleflow.Sales.decode_uuid(id) end)
          Enum.filter(leads, fn l -> l.id in my_lead_ids end)
      end

    json(conn, %{callbacks: Enum.map(filtered, &serialize_lead/1)})
  end
```

- [ ] **Step 2: Add route**

In authenticated scope, add:
```elixir
    get "/callbacks", LeadController, :callbacks
```

- [ ] **Step 3: Test, run, commit**

Run `mix test`. Commit: `feat: add GET /api/callbacks endpoint`

---

### Task 3: Frontend — API hooks for comments + callbacks

**Files:**
- Create: `frontend/src/api/comments.ts`
- Modify: `frontend/src/api/types.ts`
- Modify: `frontend/src/api/leads.ts` (add callbacks hook)

- [ ] **Step 1: Add types**

Add to `frontend/src/api/types.ts`:
```typescript
export interface LeadComment {
  id: string;
  lead_id: string;
  user_id: string;
  user_name: string;
  text: string;
  inserted_at: string;
}
```

- [ ] **Step 2: Create comments hooks**

```typescript
// frontend/src/api/comments.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import type { LeadComment } from "./types";

export function useLeadComments(leadId: string | undefined) {
  return useQuery<LeadComment[]>({
    queryKey: ["leads", leadId, "comments"],
    queryFn: async () => {
      const data = await api<{ comments: LeadComment[] }>(`/api/leads/${leadId}/comments`);
      return data.comments;
    },
    enabled: !!leadId,
  });
}

export function useCreateComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ leadId, text }: { leadId: string; text: string }) => {
      return api(`/api/leads/${leadId}/comments`, {
        method: "POST",
        body: JSON.stringify({ text }),
      });
    },
    onSuccess: (_data, { leadId }) => {
      void qc.invalidateQueries({ queryKey: ["leads", leadId, "comments"] });
    },
  });
}
```

- [ ] **Step 3: Add callbacks hook**

Add to `frontend/src/api/leads.ts`:
```typescript
export function useCallbacks() {
  return useQuery<Lead[]>({
    queryKey: ["callbacks"],
    queryFn: async () => {
      const data = await api<{ callbacks: Lead[] }>("/api/callbacks");
      return data.callbacks;
    },
    refetchInterval: 30_000,
  });
}
```

- [ ] **Step 4: TypeScript check, commit**

Run: `npx tsc --noEmit`. Commit: `feat: add comment and callback API hooks`

---

### Task 4: Frontend — Dialer sub-components

**Files:**
- Create: `frontend/src/components/dialer/mini-leaderboard.tsx`
- Create: `frontend/src/components/dialer/action-bar.tsx`
- Create: `frontend/src/components/dialer/lead-comments.tsx`
- Create: `frontend/src/components/dialer/outcome-inline.tsx`
- Create: `frontend/src/components/dialer/dialer-tabs.tsx`

- [ ] **Step 1: MiniLeaderboard**

Horisontell rad med agent-kort. Props: `entries: LeaderboardEntry[]`, `currentUserId: string`. Varje kort visar ranking, namn, samtal, möten. Current user markerad. Uses `useLeaderboard` data.

- [ ] **Step 2: ActionBar**

Props: `phone: string`, `onDial`, `onSkip`, `onNext`, `isDialing`, `isSkipping`, `isNexting`. Grön ring-knapp + monospace nummer + Hoppa över + Nästa kund.

- [ ] **Step 3: LeadComments**

Props: `leadId: string`. Uses `useLeadComments` + `useCreateComment`. Visar kommentarslista (agent, datum, text) + input med spara-knapp.

- [ ] **Step 4: OutcomeInline**

Extrahera utfall-logiken från OutcomePanel till en enklare inline-version utan Card-wrapper. 2x3 grid med knappar + antecknings-textarea. Props: `leadId`, `companyName`, `leadData`, `onOutcomeSubmitted`.

- [ ] **Step 5: DialerTabs**

Tab-komponent med 4 flikar. Props: `activeTab`, `onTabChange`, `callbackCount`, `meetingCount`. Renderar tab-bar med badges.

- [ ] **Step 6: TypeScript check, commit**

Commit: `feat: add dialer sub-components`

---

### Task 5: Frontend — Rewrite dialer page

**Files:**
- Rewrite: `frontend/src/pages/dialer.tsx`

- [ ] **Step 1: Rewrite dialer with new layout**

Complete rewrite of `pages/dialer.tsx`:

- Import all new sub-components
- State: `activeTab` ("dialer" | "callbacks" | "history" | "meetings"), `currentLeadId`
- Layout:
  1. `<DialerTabs>` at top
  2. `<MiniLeaderboard>` below tabs
  3. `<ActionBar>` below leaderboard
  4. Main content based on activeTab:
     - "dialer": 2-column layout (kundinfo+nummer+kommentarer | utfall+anteckningar) + historik-tabell i botten
     - "callbacks": callback-lista (reuse useCallbacks)
     - "history": reuse HistoryPage content inline
     - "meetings": reuse MeetingsPage content inline
- Kundinfo-kolumnen: 2 sub-columns (info grid + snabblänkar | nummer + kommentarer)
- Follow exact dashboard design tokens

- [ ] **Step 2: TypeScript check**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Test locally**

Open http://localhost:5173/dialer — verify:
- Tabs switch content
- Leaderboard shows agents
- Ring/Hoppa över/Nästa kund works
- Outcome buttons submit correctly
- Comments load and save
- Callbacks tab shows callback leads
- History tab shows call history
- Meetings tab shows meetings

- [ ] **Step 4: Commit**

Commit: `feat: rewrite dialer with tabbed LeadDesk-inspired layout`

---

### Task 6: Clean up + deploy

- [ ] **Step 1: Run full backend tests**

Run: `cd backend && mix test`

- [ ] **Step 2: Run frontend type check**

Run: `cd frontend && npx tsc --noEmit`

- [ ] **Step 3: Verify locally**

Test full flow on localhost:5173

- [ ] **Step 4: Deploy to production**

```bash
cd /Users/douglassiteflow/dev/saleflow
fly deploy --app saleflow-app
fly ssh console --app saleflow-app -C "/app/bin/saleflow eval 'Saleflow.Release.migrate()'"
```

- [ ] **Step 5: Verify in production**

Test dialer on sale.siteflow.se
