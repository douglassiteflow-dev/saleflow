# Pipeline v2 Sub-plan 1: Backend Deal Schema & Stages

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate Deal resource from v1 website-centric stages to v2 sales-process stages, add new fields, update API and frontend types.

**Architecture:** Refactor existing Deal Ash resource — new migration changes stage enum + adds fields, update resource definition, controller, tests, and frontend types/constants/hooks. No new resources in this sub-plan.

**Tech Stack:** Elixir/Ash Framework (backend), TypeScript/React (frontend), PostgreSQL, Vitest

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `backend/priv/repo/migrations/20260408120000_deal_v2_stages.exs` | Migration: new stages, new fields, remove contract_url |
| Modify | `backend/lib/saleflow/sales/deal.ex` | Ash resource: new stages, new attributes, updated actions |
| Modify | `backend/lib/saleflow/sales/sales.ex:691-761` | Domain functions: update_deal accepts new fields |
| Modify | `backend/lib/saleflow_web/controllers/deal_controller.ex` | Controller: serialize new fields, accept new params |
| Modify | `backend/test/saleflow/sales/deal_test.exs` | Unit tests for new stages and fields |
| Modify | `backend/test/saleflow_web/controllers/deal_controller_test.exs` | Controller tests for new stages and fields |
| Modify | `frontend/src/api/types.ts:345-379` | TypeScript types: DealStage, Deal interface |
| Modify | `frontend/src/lib/constants.ts` | Stage labels and pipeline stages array |
| Modify | `frontend/src/api/deals.ts:43-50` | UpdateDealParams: add new fields, remove contract_url |

---

### Task 1: Write migration

**Files:**
- Create: `backend/priv/repo/migrations/20260408120000_deal_v2_stages.exs`

- [ ] **Step 1: Create migration file**

```elixir
defmodule Saleflow.Repo.Migrations.DealV2Stages do
  use Ecto.Migration

  def up do
    # 1. Add new columns
    alter table(:deals) do
      add :meeting_outcome, :text
      add :needs_followup, :boolean, default: false, null: false
    end

    # 2. Remove old contract_url column
    alter table(:deals) do
      remove :contract_url
    end

    # 3. Migrate existing stages to v2 equivalents
    #    meeting_booked → booking_wizard (will be immediately advanced in most cases)
    #    needs_website, generating_website, reviewing, deployed → demo_scheduled
    #    demo_followup → meeting_completed
    #    contract_sent → contract_sent (same)
    #    signed, dns_launch → contract_sent (waiting on contract)
    #    won → won (same)
    #    cancelled → cancelled (same)
    execute """
    UPDATE deals SET stage = CASE
      WHEN stage = 'meeting_booked' THEN 'demo_scheduled'
      WHEN stage = 'needs_website' THEN 'demo_scheduled'
      WHEN stage = 'generating_website' THEN 'demo_scheduled'
      WHEN stage = 'reviewing' THEN 'demo_scheduled'
      WHEN stage = 'deployed' THEN 'demo_scheduled'
      WHEN stage = 'demo_followup' THEN 'meeting_completed'
      WHEN stage = 'contract_sent' THEN 'contract_sent'
      WHEN stage = 'signed' THEN 'contract_sent'
      WHEN stage = 'dns_launch' THEN 'contract_sent'
      WHEN stage = 'won' THEN 'won'
      WHEN stage = 'cancelled' THEN 'cancelled'
      ELSE stage
    END
    """
  end

  def down do
    alter table(:deals) do
      add :contract_url, :string
    end

    alter table(:deals) do
      remove :meeting_outcome
      remove :needs_followup
    end

    # Reverse stage mapping (best effort — some stages are lossy)
    execute """
    UPDATE deals SET stage = CASE
      WHEN stage = 'booking_wizard' THEN 'meeting_booked'
      WHEN stage = 'demo_scheduled' THEN 'deployed'
      WHEN stage = 'meeting_completed' THEN 'demo_followup'
      WHEN stage = 'questionnaire_sent' THEN 'demo_followup'
      WHEN stage = 'contract_sent' THEN 'contract_sent'
      WHEN stage = 'won' THEN 'won'
      WHEN stage = 'cancelled' THEN 'cancelled'
      ELSE stage
    END
    """
  end
end
```

- [ ] **Step 2: Run migration**

Run: `cd backend && mix ecto.migrate`
Expected: Migration runs successfully, no errors.

- [ ] **Step 3: Commit**

```bash
git add backend/priv/repo/migrations/20260408120000_deal_v2_stages.exs
git commit -m "feat(pipeline-v2): add migration for new deal stages and fields"
```

---

### Task 2: Update Deal Ash resource

**Files:**
- Modify: `backend/lib/saleflow/sales/deal.ex`

- [ ] **Step 1: Update @stages list and moduledoc**

Replace the entire `@moduledoc`, `@stages`, `stages/0`, and `next_stage/1` block (lines 1-38):

```elixir
defmodule Saleflow.Sales.Deal do
  @moduledoc """
  Deal resource — represents a customer journey through the sales pipeline.

  ## Stages (fixed order, cannot skip)

      booking_wizard → demo_scheduled → meeting_completed →
      questionnaire_sent → contract_sent → won
  """

  use Ash.Resource,
    data_layer: AshPostgres.DataLayer,
    domain: Saleflow.Sales

  @stages [
    :booking_wizard,
    :demo_scheduled,
    :meeting_completed,
    :questionnaire_sent,
    :contract_sent,
    :won
  ]

  def stages, do: @stages

  def next_stage(current) do
    idx = Enum.find_index(@stages, &(&1 == current))

    if idx && idx < length(@stages) - 1 do
      {:ok, Enum.at(@stages, idx + 1)}
    else
      {:error, :no_next_stage}
    end
  end
```

- [ ] **Step 2: Update attributes block**

Replace the attributes block (lines 45-105) with:

```elixir
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

    attribute :stage, :atom do
      constraints one_of: [
        :booking_wizard,
        :demo_scheduled,
        :meeting_completed,
        :questionnaire_sent,
        :contract_sent,
        :won,
        :cancelled
      ]
      default :booking_wizard
      allow_nil? false
      public? true
    end

    attribute :website_url, :string do
      allow_nil? true
      public? true
    end

    attribute :domain, :string do
      allow_nil? true
      public? true
    end

    attribute :domain_sponsored, :boolean do
      default false
      allow_nil? false
      public? true
    end

    attribute :notes, :string do
      allow_nil? true
      public? true
    end

    attribute :meeting_outcome, :string do
      allow_nil? true
      public? true
    end

    attribute :needs_followup, :boolean do
      default false
      allow_nil? false
      public? true
    end

    create_timestamp :inserted_at
    update_timestamp :updated_at
  end
```

- [ ] **Step 3: Update actions block**

Replace the actions block (lines 107-154) with:

```elixir
  actions do
    defaults [:read]

    create :create do
      description "Create a new deal for a lead"
      accept [:lead_id, :user_id, :notes]

      change {Saleflow.Audit.Changes.CreateAuditLog, action: "deal.created"}
    end

    update :advance do
      description "Advance the deal to the next pipeline stage"
      require_atomic? false

      change fn changeset, _context ->
        current = Ash.Changeset.get_attribute(changeset, :stage)

        case Saleflow.Sales.Deal.next_stage(current) do
          {:ok, next} ->
            Ash.Changeset.force_change_attribute(changeset, :stage, next)

          {:error, :no_next_stage} ->
            Ash.Changeset.add_error(changeset, field: :stage, message: "already at final stage")
        end
      end

      change {Saleflow.Audit.Changes.CreateAuditLog, action: "deal.advanced"}
    end

    update :cancel do
      description "Cancel a deal"
      require_atomic? false

      change fn changeset, _context ->
        Ash.Changeset.force_change_attribute(changeset, :stage, :cancelled)
      end

      change {Saleflow.Audit.Changes.CreateAuditLog, action: "deal.cancelled"}
    end

    update :update_fields do
      description "Update editable fields on a deal"
      require_atomic? false
      accept [:notes, :website_url, :domain, :domain_sponsored, :meeting_outcome, :needs_followup]

      change {Saleflow.Audit.Changes.CreateAuditLog, action: "deal.updated"}
    end
  end
```

- [ ] **Step 4: Commit**

```bash
git add backend/lib/saleflow/sales/deal.ex
git commit -m "feat(pipeline-v2): update Deal resource with v2 stages and fields"
```

---

### Task 3: Update Deal unit tests

**Files:**
- Modify: `backend/test/saleflow/sales/deal_test.exs`

- [ ] **Step 1: Update create test to expect :booking_wizard**

Replace the `create_deal/1` describe block (lines 28-55):

```elixir
  describe "create_deal/1" do
    test "creates a deal with valid params" do
      lead = create_lead!()
      user = create_user!()

      assert {:ok, deal} =
               Sales.create_deal(%{
                 lead_id: lead.id,
                 user_id: user.id
               })

      assert deal.lead_id == lead.id
      assert deal.user_id == user.id
      assert deal.stage == :booking_wizard
      assert deal.website_url == nil
      assert deal.domain_sponsored == false
      assert deal.meeting_outcome == nil
      assert deal.needs_followup == false
    end

    test "rejects deal without lead_id" do
      user = create_user!()
      assert {:error, _} = Sales.create_deal(%{user_id: user.id})
    end

    test "rejects deal without user_id" do
      lead = create_lead!()
      assert {:error, _} = Sales.create_deal(%{lead_id: lead.id})
    end
  end
```

- [ ] **Step 2: Update advance tests for v2 stages**

Replace the `advance_deal/1` describe block (lines 57-111):

```elixir
  describe "advance_deal/1" do
    test "advances deal to next stage" do
      lead = create_lead!()
      user = create_user!()
      {:ok, deal} = Sales.create_deal(%{lead_id: lead.id, user_id: user.id})

      assert deal.stage == :booking_wizard
      {:ok, deal} = Sales.advance_deal(deal)
      assert deal.stage == :demo_scheduled
      {:ok, deal} = Sales.advance_deal(deal)
      assert deal.stage == :meeting_completed
    end

    test "advances through all stages in order" do
      lead = create_lead!()
      user = create_user!()
      {:ok, deal} = Sales.create_deal(%{lead_id: lead.id, user_id: user.id})

      expected_stages = [
        :demo_scheduled,
        :meeting_completed,
        :questionnaire_sent,
        :contract_sent,
        :won
      ]

      deal =
        Enum.reduce(expected_stages, deal, fn expected_stage, current_deal ->
          {:ok, advanced} = Sales.advance_deal(current_deal)
          assert advanced.stage == expected_stage
          advanced
        end)

      assert deal.stage == :won
    end

    test "cannot advance past won" do
      lead = create_lead!()
      user = create_user!()
      {:ok, deal} = Sales.create_deal(%{lead_id: lead.id, user_id: user.id})

      # Advance through all 5 steps to reach :won
      deal =
        Enum.reduce(1..5, deal, fn _, d ->
          {:ok, advanced} = Sales.advance_deal(d)
          advanced
        end)

      assert deal.stage == :won
      assert {:error, _} = Sales.advance_deal(deal)
    end
  end
```

- [ ] **Step 3: Update update_deal tests for new fields**

Replace the `update_deal/2` describe block (lines 113-141) and add new field tests:

```elixir
  describe "update_deal/2" do
    test "updates notes" do
      lead = create_lead!()
      user = create_user!()
      {:ok, deal} = Sales.create_deal(%{lead_id: lead.id, user_id: user.id})

      {:ok, updated} = Sales.update_deal(deal, %{notes: "Important customer"})
      assert updated.notes == "Important customer"
    end

    test "updates website_url" do
      lead = create_lead!()
      user = create_user!()
      {:ok, deal} = Sales.create_deal(%{lead_id: lead.id, user_id: user.id})

      {:ok, updated} = Sales.update_deal(deal, %{website_url: "https://example.vercel.app"})
      assert updated.website_url == "https://example.vercel.app"
    end

    test "updates domain fields" do
      lead = create_lead!()
      user = create_user!()
      {:ok, deal} = Sales.create_deal(%{lead_id: lead.id, user_id: user.id})

      {:ok, updated} = Sales.update_deal(deal, %{domain: "example.se", domain_sponsored: true})
      assert updated.domain == "example.se"
      assert updated.domain_sponsored == true
    end

    test "updates meeting_outcome" do
      lead = create_lead!()
      user = create_user!()
      {:ok, deal} = Sales.create_deal(%{lead_id: lead.id, user_id: user.id})

      {:ok, updated} = Sales.update_deal(deal, %{meeting_outcome: "Kunden var positiv, vill se offert"})
      assert updated.meeting_outcome == "Kunden var positiv, vill se offert"
    end

    test "updates needs_followup" do
      lead = create_lead!()
      user = create_user!()
      {:ok, deal} = Sales.create_deal(%{lead_id: lead.id, user_id: user.id})

      {:ok, updated} = Sales.update_deal(deal, %{needs_followup: true})
      assert updated.needs_followup == true
    end
  end
```

- [ ] **Step 4: Run deal unit tests**

Run: `cd backend && mix test test/saleflow/sales/deal_test.exs --trace`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/test/saleflow/sales/deal_test.exs
git commit -m "test(pipeline-v2): update deal unit tests for v2 stages and fields"
```

---

### Task 4: Update DealController

**Files:**
- Modify: `backend/lib/saleflow_web/controllers/deal_controller.ex`

- [ ] **Step 1: Update serialize_deal_simple to include new fields, remove contract_url**

Replace `serialize_deal_simple/1` (lines 213-227):

```elixir
  defp serialize_deal_simple(deal) do
    %{
      id: deal.id,
      lead_id: deal.lead_id,
      user_id: deal.user_id,
      stage: deal.stage,
      notes: deal.notes,
      website_url: deal.website_url,
      domain: deal.domain,
      domain_sponsored: deal.domain_sponsored,
      meeting_outcome: deal.meeting_outcome,
      needs_followup: deal.needs_followup,
      inserted_at: deal.inserted_at,
      updated_at: deal.updated_at
    }
  end
```

- [ ] **Step 2: Update the update action to accept new fields, remove contract_url**

Replace the `update_params` block in `update/2` (lines 91-98):

```elixir
      update_params =
        %{}
        |> maybe_put(:notes, params["notes"])
        |> maybe_put(:website_url, params["website_url"])
        |> maybe_put(:domain, params["domain"])
        |> maybe_put(:domain_sponsored, params["domain_sponsored"])
        |> maybe_put(:meeting_outcome, params["meeting_outcome"])
        |> maybe_put(:needs_followup, params["needs_followup"])
```

- [ ] **Step 3: Commit**

```bash
git add backend/lib/saleflow_web/controllers/deal_controller.ex
git commit -m "feat(pipeline-v2): update DealController for v2 fields"
```

---

### Task 5: Update DealController tests

**Files:**
- Modify: `backend/test/saleflow_web/controllers/deal_controller_test.exs`

- [ ] **Step 1: Update advance test to expect new stage**

Replace the advance test (lines 163-168):

```elixir
    test "advances deal to next stage", %{conn: conn} do
      lead = create_lead!()
      {agent_conn, agent} = create_agent!(conn)
      deal = create_deal!(lead, agent)
      assert deal.stage == :booking_wizard

      resp = post(agent_conn, "/api/deals/#{deal.id}/advance")
      body = json_response(resp, 200)
      assert body["deal"]["stage"] == "demo_scheduled"
    end
```

- [ ] **Step 2: Update admin advance test**

Replace line 191:

```elixir
      assert json_response(resp, 200)["deal"]["stage"] == "demo_scheduled"
```

- [ ] **Step 3: Remove contract_url from update tests, add new field tests**

Replace the `PATCH /api/deals/:id` describe block (lines 199-252):

```elixir
  describe "PATCH /api/deals/:id" do
    test "updates notes", %{conn: conn} do
      lead = create_lead!()
      {agent_conn, agent} = create_agent!(conn)
      deal = create_deal!(lead, agent)

      resp = patch(agent_conn, "/api/deals/#{deal.id}", %{"notes" => "Updated notes"})
      body = json_response(resp, 200)
      assert body["deal"]["notes"] == "Updated notes"
    end

    test "updates website_url", %{conn: conn} do
      lead = create_lead!()
      {agent_conn, agent} = create_agent!(conn)
      deal = create_deal!(lead, agent)

      resp =
        patch(agent_conn, "/api/deals/#{deal.id}", %{
          "website_url" => "https://example.com"
        })

      body = json_response(resp, 200)
      assert body["deal"]["website_url"] == "https://example.com"
    end

    test "updates domain and domain_sponsored", %{conn: conn} do
      lead = create_lead!()
      {agent_conn, agent} = create_agent!(conn)
      deal = create_deal!(lead, agent)

      resp =
        patch(agent_conn, "/api/deals/#{deal.id}", %{
          "domain" => "example.se",
          "domain_sponsored" => true
        })

      body = json_response(resp, 200)
      assert body["deal"]["domain"] == "example.se"
      assert body["deal"]["domain_sponsored"] == true
    end

    test "updates meeting_outcome", %{conn: conn} do
      lead = create_lead!()
      {agent_conn, agent} = create_agent!(conn)
      deal = create_deal!(lead, agent)

      resp =
        patch(agent_conn, "/api/deals/#{deal.id}", %{
          "meeting_outcome" => "Kunden var positiv"
        })

      body = json_response(resp, 200)
      assert body["deal"]["meeting_outcome"] == "Kunden var positiv"
    end

    test "updates needs_followup", %{conn: conn} do
      lead = create_lead!()
      {agent_conn, agent} = create_agent!(conn)
      deal = create_deal!(lead, agent)

      resp =
        patch(agent_conn, "/api/deals/#{deal.id}", %{
          "needs_followup" => true
        })

      body = json_response(resp, 200)
      assert body["deal"]["needs_followup"] == true
    end

    test "agent cannot update another agent's deal", %{conn: conn} do
      lead = create_lead!()
      {_other_conn, other_agent} = create_agent!(conn, %{name: "Other"})
      deal = create_deal!(lead, other_agent)

      {agent_conn, _agent} = create_agent!(build_conn(), %{name: "Me"})

      resp = patch(agent_conn, "/api/deals/#{deal.id}", %{"notes" => "hack"})
      assert json_response(resp, 403)
    end
  end
```

- [ ] **Step 4: Update auto-deal test to expect :booking_wizard**

In the `POST /api/leads/:id/outcome` describe block, update the assertion on line 280:

```elixir
      assert deal.stage == :booking_wizard
```

- [ ] **Step 5: Run all deal controller tests**

Run: `cd backend && mix test test/saleflow_web/controllers/deal_controller_test.exs --trace`
Expected: All tests pass.

- [ ] **Step 6: Run full backend test suite**

Run: `cd backend && mix test --trace`
Expected: All tests pass. If any other tests reference old stages (e.g., `:meeting_booked`, `:needs_website`), update them.

- [ ] **Step 7: Commit**

```bash
git add backend/test/saleflow_web/controllers/deal_controller_test.exs
git commit -m "test(pipeline-v2): update controller tests for v2 stages and fields"
```

---

### Task 6: Update frontend types

**Files:**
- Modify: `frontend/src/api/types.ts:345-379`

- [ ] **Step 1: Update DealStage type and Deal interface**

Replace lines 345-379 in `frontend/src/api/types.ts`:

```typescript
export type DealStage =
  | "booking_wizard"
  | "demo_scheduled"
  | "meeting_completed"
  | "questionnaire_sent"
  | "contract_sent"
  | "won"
  | "cancelled";

export interface Deal {
  id: string;
  lead_id: string;
  user_id: string;
  stage: DealStage;
  website_url: string | null;
  domain: string | null;
  domain_sponsored: boolean;
  notes: string | null;
  meeting_outcome: string | null;
  needs_followup: boolean;
  lead_name: string | null;
  user_name: string | null;
  inserted_at: string;
  updated_at: string;
}

export interface DealDetailData {
  deal: Deal;
  lead: Lead;
  meetings: Meeting[];
  audit_logs: AuditLog[];
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/api/types.ts
git commit -m "feat(pipeline-v2): update frontend DealStage and Deal types for v2"
```

---

### Task 7: Update frontend constants

**Files:**
- Modify: `frontend/src/lib/constants.ts`

- [ ] **Step 1: Update STAGE_LABELS and PIPELINE_STAGES**

Replace lines 25-49 in `frontend/src/lib/constants.ts`:

```typescript
export const STAGE_LABELS: Record<string, string> = {
  booking_wizard: "Bokning pågår",
  demo_scheduled: "Demo schemalagd",
  meeting_completed: "Möte genomfört",
  questionnaire_sent: "Formulär skickat",
  contract_sent: "Avtal skickat",
  won: "Kund",
  cancelled: "Avbruten",
};

export const PIPELINE_STAGES: { key: DealStage; label: string }[] = [
  { key: "booking_wizard", label: "Bokning pågår" },
  { key: "demo_scheduled", label: "Demo schemalagd" },
  { key: "meeting_completed", label: "Möte genomfört" },
  { key: "questionnaire_sent", label: "Formulär skickat" },
  { key: "contract_sent", label: "Avtal skickat" },
];
```

Note: `won` excluded from `PIPELINE_STAGES` (same pattern as v1 — active pipeline only).

- [ ] **Step 2: Commit**

```bash
git add frontend/src/lib/constants.ts
git commit -m "feat(pipeline-v2): update stage labels and pipeline stages for v2"
```

---

### Task 8: Update frontend API hooks

**Files:**
- Modify: `frontend/src/api/deals.ts:43-50`

- [ ] **Step 1: Update UpdateDealParams interface**

Replace lines 43-50 in `frontend/src/api/deals.ts`:

```typescript
export interface UpdateDealParams {
  id: string;
  notes?: string;
  website_url?: string;
  domain?: string;
  domain_sponsored?: boolean;
  meeting_outcome?: string;
  needs_followup?: boolean;
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/api/deals.ts
git commit -m "feat(pipeline-v2): update UpdateDealParams for v2 fields"
```

---

### Task 9: Fix remaining frontend references to old stages

**Files:**
- Modify: `frontend/src/pages/pipeline.tsx`
- Modify: `frontend/src/pages/pipeline-detail.tsx`
- Modify: `frontend/src/components/deal-stage-indicator.tsx`
- Modify: `frontend/src/components/dialer/deals-tab.tsx`
- Modify: `frontend/src/components/dialer/deal-detail-tab.tsx`

- [ ] **Step 1: Search for all old stage references**

Run: `cd frontend && grep -rn "meeting_booked\|needs_website\|generating_website\|reviewing\|deployed\|demo_followup\|dns_launch\|signed\|contract_url" src/ --include="*.tsx" --include="*.ts"`

This will find all files referencing old v1 stages.

- [ ] **Step 2: Update each file**

For every file found, replace old stage references with v2 equivalents:
- `meeting_booked` → `booking_wizard`
- `needs_website` → removed (no equivalent)
- `generating_website` → removed
- `reviewing` → removed
- `deployed` → removed
- `demo_followup` → `meeting_completed`
- `signed` → removed
- `dns_launch` → removed
- `contract_url` → remove all references

The pipeline page groups deals by stage — update to use new stages.
The deal-detail page has stage-specific UI — update to new stage keys.
The stage indicator component renders stages — already driven by `PIPELINE_STAGES` constant.
The dialer tabs use stage-colored badges — update badge colors to new stages.

- [ ] **Step 3: Update frontend tests**

Run: `cd frontend && grep -rn "meeting_booked\|needs_website\|generating_website\|reviewing\|deployed\|demo_followup\|dns_launch\|contract_url" src/ --include="*.test.tsx" --include="*.test.ts"`

Update all test files to reference v2 stages.

- [ ] **Step 4: Run frontend tests**

Run: `cd frontend && npx vitest run`
Expected: All tests pass.

- [ ] **Step 5: Run TypeScript type check**

Run: `cd frontend && npx tsc --noEmit`
Expected: No type errors. If any files reference `contract_url` on the `Deal` type, fix them.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/
git commit -m "feat(pipeline-v2): update all frontend components for v2 stages"
```

---

### Task 10: Final validation

- [ ] **Step 1: Run full backend test suite**

Run: `cd backend && mix test --trace`
Expected: All tests pass, 0 failures.

- [ ] **Step 2: Run full frontend test suite**

Run: `cd frontend && npx vitest run`
Expected: All tests pass, 0 failures.

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 4: Verify backend compiles without warnings**

Run: `cd backend && mix compile --warnings-as-errors`
Expected: Compilation success, 0 warnings.

- [ ] **Step 5: Commit any remaining fixes**

```bash
git add -A
git commit -m "fix(pipeline-v2): resolve remaining v2 migration issues"
```
