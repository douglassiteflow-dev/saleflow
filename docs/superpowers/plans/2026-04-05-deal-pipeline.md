# Deal Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Deal pipeline that takes a customer from booked meeting through website generation, demo, contract signing, and DNS launch.

**Architecture:** New `Deal` Ash resource in the Sales domain with a fixed stage enum. Saleflow backend proxies Flowing AI API calls. Frontend adds pipeline pages for admin and deal/customer tabs in the agent Electron dialer.

**Tech Stack:** Elixir/Ash (backend), React/TypeScript/TanStack Query (frontend), Vitest (frontend tests), ExUnit (backend tests)

---

## File Structure

### Backend — New Files
| File | Responsibility |
|------|---------------|
| `backend/lib/saleflow/sales/deal.ex` | Deal Ash resource |
| `backend/lib/saleflow_web/controllers/deal_controller.ex` | Deal REST API |
| `backend/lib/saleflow/flowing_ai.ex` | Flowing AI HTTP client |
| `backend/priv/repo/migrations/TIMESTAMP_create_deals.exs` | Deal table + meeting deal_id |
| `backend/test/saleflow/sales/deal_test.exs` | Deal resource tests |
| `backend/test/saleflow_web/controllers/deal_controller_test.exs` | Deal API tests |
| `backend/test/saleflow/flowing_ai_test.exs` | Flowing AI client tests |

### Backend — Modified Files
| File | Change |
|------|--------|
| `backend/lib/saleflow/sales/sales.ex` | Add Deal resource + domain functions |
| `backend/lib/saleflow/sales/meeting.ex` | Add `deal_id` attribute |
| `backend/lib/saleflow_web/router.ex` | Add deal routes |
| `backend/lib/saleflow_web/controllers/lead_controller.ex` | Auto-create deal on meeting_booked outcome |

### Frontend — New Files
| File | Responsibility |
|------|---------------|
| `frontend/src/api/deals.ts` | Deal API hooks |
| `frontend/src/pages/pipeline.tsx` | Admin pipeline list page |
| `frontend/src/pages/pipeline-detail.tsx` | Admin deal detail page |
| `frontend/src/pages/customers.tsx` | Admin customers page |
| `frontend/src/pages/customer-detail.tsx` | Admin customer detail page |
| `frontend/src/components/deal-stage-indicator.tsx` | Shared stage stepper component |
| `frontend/src/components/dialer/deals-tab.tsx` | Agent deals tab |
| `frontend/src/components/dialer/deal-detail-tab.tsx` | Agent deal detail view |
| `frontend/src/components/dialer/customers-tab.tsx` | Agent customers tab |
| `frontend/src/pages/__tests__/pipeline.test.tsx` | Pipeline page tests |
| `frontend/src/pages/__tests__/pipeline-detail.test.tsx` | Pipeline detail tests |
| `frontend/src/pages/__tests__/customers.test.tsx` | Customers page tests |
| `frontend/src/components/__tests__/deal-stage-indicator.test.tsx` | Stage indicator tests |
| `frontend/src/components/dialer/__tests__/deals-tab.test.tsx` | Agent deals tab tests |
| `frontend/src/components/dialer/__tests__/deal-detail-tab.test.tsx` | Agent deal detail tests |
| `frontend/src/components/dialer/__tests__/customers-tab.test.tsx` | Agent customers tab tests |

### Frontend — Modified Files
| File | Change |
|------|--------|
| `frontend/src/api/types.ts` | Add Deal, DealStage, DealDetailData types |
| `frontend/src/app.tsx` | Add pipeline, customers routes |
| `frontend/src/pages/dialer.tsx` | Add Deals + Kunder tabs |
| `frontend/src/components/dialer/outcome-inline.tsx` | No change needed (deal created backend-side) |

---

## Task 1: Deal Migration

**Files:**
- Create: `backend/priv/repo/migrations/TIMESTAMP_create_deals.exs`

- [ ] **Step 1: Generate migration file**

Run:
```bash
cd backend && mix ash.generate_migrations --name create_deals
```

If the generator does not produce the expected migration (since we haven't created the resource yet), create it manually:

```bash
cd backend && mix ecto.gen.migration create_deals
```

- [ ] **Step 2: Write migration**

Open the generated migration file and replace the contents:

```elixir
defmodule Saleflow.Repo.Migrations.CreateDeals do
  use Ecto.Migration

  def change do
    create table(:deals, primary_key: false) do
      add :id, :uuid, primary_key: true
      add :lead_id, references(:leads, type: :uuid, on_delete: :restrict), null: false
      add :user_id, references(:users, type: :uuid, on_delete: :restrict), null: false
      add :stage, :string, null: false, default: "meeting_booked"
      add :website_url, :string
      add :contract_url, :string
      add :domain, :string
      add :domain_sponsored, :boolean, null: false, default: false
      add :notes, :text

      timestamps(type: :utc_datetime_usec)
    end

    create index(:deals, [:lead_id])
    create index(:deals, [:user_id])
    create index(:deals, [:stage])

    alter table(:meetings) do
      add :deal_id, references(:deals, type: :uuid, on_delete: :nilify_all)
    end

    create index(:meetings, [:deal_id])
  end
end
```

- [ ] **Step 3: Run migration**

Run: `cd backend && mix ecto.migrate`
Expected: Migration runs successfully, `deals` table created, `meetings.deal_id` column added.

- [ ] **Step 4: Commit**

```bash
git add backend/priv/repo/migrations/*create_deals*
git commit -m "feat: add deals migration with meeting deal_id"
```

---

## Task 2: Deal Ash Resource

**Files:**
- Create: `backend/lib/saleflow/sales/deal.ex`
- Modify: `backend/lib/saleflow/sales/sales.ex` (add resource)
- Test: `backend/test/saleflow/sales/deal_test.exs`

- [ ] **Step 1: Write failing test for deal creation**

```elixir
# backend/test/saleflow/sales/deal_test.exs
defmodule Saleflow.Sales.DealTest do
  use Saleflow.DataCase, async: true

  alias Saleflow.Sales

  defp create_lead! do
    unique = System.unique_integer([:positive])
    {:ok, lead} = Sales.create_lead(%{företag: "Test AB #{unique}", telefon: "+46701234567"})
    lead
  end

  defp create_user! do
    unique = System.unique_integer([:positive])

    {:ok, user} =
      Saleflow.Accounts.User
      |> Ash.Changeset.for_create(:register_with_password, %{
        email: "agent#{unique}@test.se",
        name: "Agent #{unique}",
        password: "Password123!",
        password_confirmation: "Password123!"
      })
      |> Ash.create()

    user
  end

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
      assert deal.stage == :meeting_booked
      assert deal.website_url == nil
      assert deal.domain_sponsored == false
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
end
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && mix test test/saleflow/sales/deal_test.exs`
Expected: FAIL — `Sales.create_deal/1` undefined.

- [ ] **Step 3: Create Deal resource**

```elixir
# backend/lib/saleflow/sales/deal.ex
defmodule Saleflow.Sales.Deal do
  @moduledoc """
  Deal resource — represents a customer journey through the sales pipeline.

  ## Stages (fixed order, cannot skip)

      meeting_booked → needs_website → generating_website → reviewing →
      deployed → demo_followup → contract_sent → signed → dns_launch → won
  """

  use Ash.Resource,
    data_layer: AshPostgres.DataLayer,
    domain: Saleflow.Sales

  @stages [
    :meeting_booked,
    :needs_website,
    :generating_website,
    :reviewing,
    :deployed,
    :demo_followup,
    :contract_sent,
    :signed,
    :dns_launch,
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

  postgres do
    table "deals"
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

    attribute :stage, :atom do
      constraints one_of: [
        :meeting_booked,
        :needs_website,
        :generating_website,
        :reviewing,
        :deployed,
        :demo_followup,
        :contract_sent,
        :signed,
        :dns_launch,
        :won
      ]
      default :meeting_booked
      allow_nil? false
      public? true
    end

    attribute :website_url, :string do
      allow_nil? true
      public? true
    end

    attribute :contract_url, :string do
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

    create_timestamp :inserted_at
    update_timestamp :updated_at
  end

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

    update :update_fields do
      description "Update editable fields on a deal"
      require_atomic? false
      accept [:notes, :website_url, :contract_url, :domain, :domain_sponsored]

      change {Saleflow.Audit.Changes.CreateAuditLog, action: "deal.updated"}
    end
  end
end
```

- [ ] **Step 4: Register Deal in Sales domain**

Add to `backend/lib/saleflow/sales/sales.ex` inside the `resources do` block:

```elixir
resource Saleflow.Sales.Deal
```

- [ ] **Step 5: Add domain functions for Deal**

Add to `backend/lib/saleflow/sales/sales.ex` after the existing functions:

```elixir
  # ── Deals ──────────────────────────────────────────────────────────────

  def create_deal(params) do
    Saleflow.Sales.Deal
    |> Ash.Changeset.for_create(:create, params)
    |> Ash.create()
  end

  def advance_deal(deal) do
    deal
    |> Ash.Changeset.for_update(:advance, %{})
    |> Ash.update()
  end

  def update_deal(deal, params) do
    deal
    |> Ash.Changeset.for_update(:update_fields, params)
    |> Ash.update()
  end

  def get_deal(id) do
    Saleflow.Sales.Deal
    |> Ash.get(id)
  end

  def list_deals do
    Saleflow.Sales.Deal
    |> Ash.read()
  end

  def list_deals_for_user(user_id) do
    Saleflow.Sales.Deal
    |> Ash.Query.filter(user_id == ^user_id)
    |> Ash.Query.sort(updated_at: :desc)
    |> Ash.read()
  end

  def get_active_deal_for_lead(lead_id) do
    Saleflow.Sales.Deal
    |> Ash.Query.filter(lead_id == ^lead_id and stage != :won)
    |> Ash.Query.sort(inserted_at: :desc)
    |> Ash.Query.limit(1)
    |> Ash.read()
    |> case do
      {:ok, [deal | _]} -> {:ok, deal}
      {:ok, []} -> {:ok, nil}
      error -> error
    end
  end
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd backend && mix test test/saleflow/sales/deal_test.exs`
Expected: All 3 tests PASS.

- [ ] **Step 7: Write test for advance_deal**

Add to `deal_test.exs`:

```elixir
  describe "advance_deal/1" do
    test "advances deal to next stage" do
      lead = create_lead!()
      user = create_user!()
      {:ok, deal} = Sales.create_deal(%{lead_id: lead.id, user_id: user.id})

      assert deal.stage == :meeting_booked
      {:ok, deal} = Sales.advance_deal(deal)
      assert deal.stage == :needs_website
      {:ok, deal} = Sales.advance_deal(deal)
      assert deal.stage == :generating_website
    end

    test "advances through all stages in order" do
      lead = create_lead!()
      user = create_user!()
      {:ok, deal} = Sales.create_deal(%{lead_id: lead.id, user_id: user.id})

      expected_stages = [
        :needs_website,
        :generating_website,
        :reviewing,
        :deployed,
        :demo_followup,
        :contract_sent,
        :signed,
        :dns_launch,
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

      # Advance to won
      deal =
        Enum.reduce(1..9, deal, fn _, d ->
          {:ok, advanced} = Sales.advance_deal(d)
          advanced
        end)

      assert deal.stage == :won
      assert {:error, _} = Sales.advance_deal(deal)
    end
  end
```

- [ ] **Step 8: Run test to verify it passes**

Run: `cd backend && mix test test/saleflow/sales/deal_test.exs`
Expected: All 6 tests PASS.

- [ ] **Step 9: Write test for update_deal and list functions**

Add to `deal_test.exs`:

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
  end

  describe "list_deals_for_user/1" do
    test "returns only deals for given user" do
      lead1 = create_lead!()
      lead2 = create_lead!()
      user1 = create_user!()
      user2 = create_user!()

      {:ok, _d1} = Sales.create_deal(%{lead_id: lead1.id, user_id: user1.id})
      {:ok, _d2} = Sales.create_deal(%{lead_id: lead2.id, user_id: user2.id})

      {:ok, deals} = Sales.list_deals_for_user(user1.id)
      assert length(deals) == 1
      assert hd(deals).user_id == user1.id
    end
  end

  describe "get_active_deal_for_lead/1" do
    test "returns active deal for lead" do
      lead = create_lead!()
      user = create_user!()
      {:ok, deal} = Sales.create_deal(%{lead_id: lead.id, user_id: user.id})

      assert {:ok, found} = Sales.get_active_deal_for_lead(lead.id)
      assert found.id == deal.id
    end

    test "returns nil when no active deal" do
      lead = create_lead!()
      assert {:ok, nil} = Sales.get_active_deal_for_lead(lead.id)
    end
  end
```

- [ ] **Step 10: Run all deal tests**

Run: `cd backend && mix test test/saleflow/sales/deal_test.exs`
Expected: All 11 tests PASS.

- [ ] **Step 11: Commit**

```bash
git add backend/lib/saleflow/sales/deal.ex backend/lib/saleflow/sales/sales.ex backend/test/saleflow/sales/deal_test.exs
git commit -m "feat: add Deal resource with stages, advance, and domain functions"
```

---

## Task 3: Update Meeting Resource with deal_id

**Files:**
- Modify: `backend/lib/saleflow/sales/meeting.ex`
- Test: `backend/test/saleflow/sales/deal_test.exs` (add meeting-deal tests)

- [ ] **Step 1: Write failing test for meeting with deal_id**

Add to `deal_test.exs`:

```elixir
  describe "meeting-deal association" do
    test "meeting can be created with deal_id" do
      lead = create_lead!()
      user = create_user!()
      {:ok, deal} = Sales.create_deal(%{lead_id: lead.id, user_id: user.id})

      {:ok, meeting} =
        Sales.create_meeting(%{
          lead_id: lead.id,
          user_id: user.id,
          title: "Demo",
          meeting_date: Date.utc_today() |> Date.add(7),
          meeting_time: ~T[10:00:00],
          deal_id: deal.id
        })

      assert meeting.deal_id == deal.id
    end

    test "meeting can be created without deal_id" do
      lead = create_lead!()
      user = create_user!()

      {:ok, meeting} =
        Sales.create_meeting(%{
          lead_id: lead.id,
          user_id: user.id,
          title: "Demo",
          meeting_date: Date.utc_today() |> Date.add(7),
          meeting_time: ~T[10:00:00]
        })

      assert meeting.deal_id == nil
    end
  end
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && mix test test/saleflow/sales/deal_test.exs --only describe:"meeting-deal association"`
Expected: FAIL — `deal_id` not accepted by meeting create action.

- [ ] **Step 3: Add deal_id to Meeting resource**

In `backend/lib/saleflow/sales/meeting.ex`, add attribute after `attendee_name`:

```elixir
    attribute :deal_id, :uuid do
      allow_nil? true
      public? true
    end
```

And add `:deal_id` to the `accept` list in the `:create` action:

```elixir
    create :create do
      description "Create a new meeting for a lead"
      accept [:lead_id, :user_id, :title, :meeting_date, :meeting_time, :notes, :duration_minutes, :attendee_email, :attendee_name, :deal_id]

      change {Saleflow.Audit.Changes.CreateAuditLog, action: "meeting.created"}
    end
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && mix test test/saleflow/sales/deal_test.exs`
Expected: All 13 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/lib/saleflow/sales/meeting.ex backend/test/saleflow/sales/deal_test.exs
git commit -m "feat: add deal_id to Meeting resource"
```

---

## Task 4: Deal Controller

**Files:**
- Create: `backend/lib/saleflow_web/controllers/deal_controller.ex`
- Modify: `backend/lib/saleflow_web/router.ex`
- Test: `backend/test/saleflow_web/controllers/deal_controller_test.exs`

- [ ] **Step 1: Write failing test for deal index**

```elixir
# backend/test/saleflow_web/controllers/deal_controller_test.exs
defmodule SaleflowWeb.DealControllerTest do
  use SaleflowWeb.ConnCase, async: true

  alias Saleflow.Sales

  defp create_lead! do
    unique = System.unique_integer([:positive])
    {:ok, lead} = Sales.create_lead(%{företag: "Test AB #{unique}", telefon: "+46701234567"})
    lead
  end

  defp create_user!(role \\ :agent) do
    unique = System.unique_integer([:positive])

    {:ok, user} =
      Saleflow.Accounts.User
      |> Ash.Changeset.for_create(:register_with_password, %{
        email: "user#{unique}@test.se",
        name: "User #{unique}",
        password: "Password123!",
        password_confirmation: "Password123!",
        role: role
      })
      |> Ash.create()

    user
  end

  defp create_deal!(lead, user) do
    {:ok, deal} = Sales.create_deal(%{lead_id: lead.id, user_id: user.id})
    deal
  end

  defp auth_conn(conn, user) do
    conn
    |> Plug.Test.init_test_session(%{user_id: user.id})
    |> assign(:current_user, user)
  end

  describe "GET /api/deals" do
    test "agent sees only own deals", %{conn: conn} do
      agent = create_user!(:agent)
      other = create_user!(:agent)
      lead1 = create_lead!()
      lead2 = create_lead!()
      _deal1 = create_deal!(lead1, agent)
      _deal2 = create_deal!(lead2, other)

      conn = auth_conn(conn, agent) |> get("/api/deals")
      assert %{"deals" => deals} = json_response(conn, 200)
      assert length(deals) == 1
      assert hd(deals)["user_id"] == agent.id
    end

    test "admin sees all deals", %{conn: conn} do
      admin = create_user!(:admin)
      agent = create_user!(:agent)
      lead1 = create_lead!()
      lead2 = create_lead!()
      _deal1 = create_deal!(lead1, agent)
      _deal2 = create_deal!(lead2, agent)

      conn = auth_conn(conn, admin) |> get("/api/deals")
      assert %{"deals" => deals} = json_response(conn, 200)
      assert length(deals) == 2
    end
  end

  describe "GET /api/deals/:id" do
    test "returns deal with lead and meetings", %{conn: conn} do
      agent = create_user!(:agent)
      lead = create_lead!()
      deal = create_deal!(lead, agent)

      {:ok, _meeting} =
        Sales.create_meeting(%{
          lead_id: lead.id,
          user_id: agent.id,
          title: "Demo",
          meeting_date: Date.utc_today() |> Date.add(7),
          meeting_time: ~T[10:00:00],
          deal_id: deal.id
        })

      conn = auth_conn(conn, agent) |> get("/api/deals/#{deal.id}")
      assert %{"deal" => d, "lead" => l, "meetings" => m} = json_response(conn, 200)
      assert d["id"] == deal.id
      assert d["stage"] == "meeting_booked"
      assert l["id"] == lead.id
      assert length(m) == 1
    end
  end

  describe "POST /api/deals/:id/advance" do
    test "advances deal to next stage", %{conn: conn} do
      admin = create_user!(:admin)
      lead = create_lead!()
      deal = create_deal!(lead, admin)

      conn = auth_conn(conn, admin) |> post("/api/deals/#{deal.id}/advance")
      assert %{"deal" => d} = json_response(conn, 200)
      assert d["stage"] == "needs_website"
    end
  end

  describe "PATCH /api/deals/:id" do
    test "updates deal fields", %{conn: conn} do
      agent = create_user!(:agent)
      lead = create_lead!()
      deal = create_deal!(lead, agent)

      conn =
        auth_conn(conn, agent)
        |> patch("/api/deals/#{deal.id}", %{notes: "VIP customer", domain: "example.se"})

      assert %{"deal" => d} = json_response(conn, 200)
      assert d["notes"] == "VIP customer"
      assert d["domain"] == "example.se"
    end
  end
end
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && mix test test/saleflow_web/controllers/deal_controller_test.exs`
Expected: FAIL — route not found / controller not defined.

- [ ] **Step 3: Create DealController**

```elixir
# backend/lib/saleflow_web/controllers/deal_controller.ex
defmodule SaleflowWeb.DealController do
  use SaleflowWeb, :controller

  alias Saleflow.Sales

  def index(conn, _params) do
    user = conn.assigns.current_user

    {:ok, deals} =
      if user.role == :admin do
        Sales.list_deals()
      else
        Sales.list_deals_for_user(user.id)
      end

    # Enrich with lead company name and agent name
    enriched =
      Enum.map(deals, fn deal ->
        lead_name =
          case Sales.get_lead(deal.lead_id) do
            {:ok, lead} -> lead.företag
            _ -> nil
          end

        user_name =
          case Saleflow.Accounts.get_user(deal.user_id) do
            {:ok, u} -> u.name
            _ -> nil
          end

        serialize_deal(deal)
        |> Map.put(:lead_name, lead_name)
        |> Map.put(:user_name, user_name)
      end)

    json(conn, %{deals: enriched})
  end

  def show(conn, %{"id" => id}) do
    user = conn.assigns.current_user

    with {:ok, deal} <- Sales.get_deal(id),
         :ok <- authorize_deal(deal, user),
         {:ok, lead} <- Sales.get_lead(deal.lead_id),
         {:ok, meetings} <- Sales.list_meetings_for_lead(deal.lead_id),
         {:ok, audit_logs} <- Saleflow.Audit.list_for_resource("Deal", deal.id) do
      deal_meetings = Enum.filter(meetings, &(&1.deal_id == deal.id))

      json(conn, %{
        deal: serialize_deal(deal),
        lead: serialize_lead(lead),
        meetings: Enum.map(deal_meetings, &serialize_meeting/1),
        audit_logs: Enum.map(audit_logs, &serialize_audit/1)
      })
    else
      {:error, _} -> conn |> put_status(404) |> json(%{error: "Deal not found"})
    end
  end

  def advance(conn, %{"id" => id}) do
    user = conn.assigns.current_user

    with {:ok, deal} <- Sales.get_deal(id),
         :ok <- authorize_deal(deal, user),
         {:ok, advanced} <- Sales.advance_deal(deal) do
      json(conn, %{deal: serialize_deal(advanced)})
    else
      {:error, _} -> conn |> put_status(422) |> json(%{error: "Cannot advance deal"})
    end
  end

  def update(conn, %{"id" => id} = params) do
    user = conn.assigns.current_user
    fields = Map.take(params, ["notes", "website_url", "contract_url", "domain", "domain_sponsored"])
    atomized = Map.new(fields, fn {k, v} -> {String.to_existing_atom(k), v} end)

    with {:ok, deal} <- Sales.get_deal(id),
         :ok <- authorize_deal(deal, user),
         {:ok, updated} <- Sales.update_deal(deal, atomized) do
      json(conn, %{deal: serialize_deal(updated)})
    else
      {:error, _} -> conn |> put_status(422) |> json(%{error: "Cannot update deal"})
    end
  end

  defp authorize_deal(deal, user) do
    if user.role == :admin || deal.user_id == user.id do
      :ok
    else
      {:error, :forbidden}
    end
  end

  defp serialize_deal(deal) do
    %{
      id: deal.id,
      lead_id: deal.lead_id,
      user_id: deal.user_id,
      stage: to_string(deal.stage),
      website_url: deal.website_url,
      contract_url: deal.contract_url,
      domain: deal.domain,
      domain_sponsored: deal.domain_sponsored,
      notes: deal.notes,
      inserted_at: deal.inserted_at && DateTime.to_iso8601(deal.inserted_at),
      updated_at: deal.updated_at && DateTime.to_iso8601(deal.updated_at)
    }
  end

  defp serialize_lead(lead) do
    %{
      id: lead.id,
      företag: lead.företag,
      telefon: lead.telefon,
      epost: lead.epost,
      adress: lead.adress,
      postnummer: lead.postnummer,
      stad: lead.stad,
      bransch: lead.bransch,
      orgnr: lead.orgnr,
      omsättning_tkr: lead.omsättning_tkr,
      vd_namn: lead.vd_namn,
      källa: lead.källa,
      status: to_string(lead.status)
    }
  end

  defp serialize_meeting(meeting) do
    %{
      id: meeting.id,
      title: meeting.title,
      meeting_date: meeting.meeting_date && Date.to_iso8601(meeting.meeting_date),
      meeting_time: meeting.meeting_time && Time.to_iso8601(meeting.meeting_time),
      status: to_string(meeting.status),
      duration_minutes: meeting.duration_minutes,
      teams_join_url: meeting.teams_join_url,
      attendee_name: meeting.attendee_name,
      deal_id: meeting.deal_id,
      inserted_at: meeting.inserted_at && DateTime.to_iso8601(meeting.inserted_at)
    }
  end

  defp serialize_audit(log) do
    %{
      id: log.id,
      action: log.action,
      user_id: log.user_id,
      changes: log.changes,
      inserted_at: log.inserted_at && DateTime.to_iso8601(log.inserted_at)
    }
  end
end
```

- [ ] **Step 4: Add routes**

In `backend/lib/saleflow_web/router.ex`, add to the authenticated scope (after the notifications routes):

```elixir
    # Deals
    get "/deals", DealController, :index
    get "/deals/:id", DealController, :show
    post "/deals/:id/advance", DealController, :advance
    patch "/deals/:id", DealController, :update
```

- [ ] **Step 5: Run tests**

Run: `cd backend && mix test test/saleflow_web/controllers/deal_controller_test.exs`
Expected: All 4 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/lib/saleflow_web/controllers/deal_controller.ex backend/lib/saleflow_web/router.ex backend/test/saleflow_web/controllers/deal_controller_test.exs
git commit -m "feat: add DealController with index, show, advance, update"
```

---

## Task 5: Auto-create Deal on Meeting Booked

**Files:**
- Modify: `backend/lib/saleflow_web/controllers/lead_controller.ex`
- Test: `backend/test/saleflow_web/controllers/deal_controller_test.exs` (add integration test)

- [ ] **Step 1: Write failing test**

Add to `deal_controller_test.exs`:

```elixir
  describe "auto-create deal on meeting_booked outcome" do
    test "creates a deal when none exists", %{conn: conn} do
      agent = create_user!(:agent)
      lead = create_lead!()

      # Assign lead to agent first
      {:ok, _assignment} = Sales.assign_lead(lead, agent)

      conn =
        auth_conn(conn, agent)
        |> post("/api/leads/#{lead.id}/outcome", %{
          outcome: "meeting_booked",
          notes: "Bra samtal",
          title: "Demo möte",
          meeting_date: Date.utc_today() |> Date.add(7) |> Date.to_iso8601(),
          meeting_time: "14:00",
          duration_minutes: 30
        })

      assert %{"ok" => true} = json_response(conn, 200)

      # Verify deal was created
      {:ok, deal} = Sales.get_active_deal_for_lead(lead.id)
      refute is_nil(deal)
      assert deal.user_id == agent.id
      assert deal.stage == :meeting_booked
    end

    test "reuses existing deal for subsequent meetings", %{conn: conn} do
      agent = create_user!(:agent)
      lead = create_lead!()
      existing_deal = create_deal!(lead, agent)

      # Advance deal to demo_followup (where multiple meetings happen)
      {:ok, deal} = Sales.advance_deal(existing_deal)
      {:ok, deal} = Sales.advance_deal(deal)
      {:ok, deal} = Sales.advance_deal(deal)
      {:ok, deal} = Sales.advance_deal(deal)
      {:ok, _deal} = Sales.advance_deal(deal)
      # Now at demo_followup

      {:ok, _assignment} = Sales.assign_lead(lead, agent)

      conn =
        auth_conn(conn, agent)
        |> post("/api/leads/#{lead.id}/outcome", %{
          outcome: "meeting_booked",
          notes: "Uppföljning",
          title: "Uppföljningsmöte",
          meeting_date: Date.utc_today() |> Date.add(14) |> Date.to_iso8601(),
          meeting_time: "10:00",
          duration_minutes: 30
        })

      assert %{"ok" => true} = json_response(conn, 200)

      # Verify no new deal was created — same deal reused
      {:ok, deals} = Sales.list_deals_for_user(agent.id)
      assert length(deals) == 1
    end
  end
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && mix test test/saleflow_web/controllers/deal_controller_test.exs --only describe:"auto-create deal"`
Expected: FAIL — deal not created during outcome.

- [ ] **Step 3: Modify lead_controller.ex outcome action**

In `backend/lib/saleflow_web/controllers/lead_controller.ex`, find the `apply_outcome` function clause for `"meeting_booked"`. After the meeting is created, add deal logic:

```elixir
# Inside the meeting_booked clause, after the meeting is successfully created:
# Find or create deal, then link meeting to deal
deal_id =
  case Sales.get_active_deal_for_lead(lead.id) do
    {:ok, nil} ->
      {:ok, deal} = Sales.create_deal(%{lead_id: lead.id, user_id: user.id})
      deal.id

    {:ok, existing_deal} ->
      existing_deal.id
  end

# Update the meeting with deal_id
meeting
|> Ash.Changeset.for_update(:update, %{})
|> Ash.Changeset.force_change_attribute(:deal_id, deal_id)
|> Ash.update()
```

Note: The exact integration point depends on the current structure of `apply_outcome`. Read the function carefully and insert the deal logic right after the meeting creation succeeds.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && mix test test/saleflow_web/controllers/deal_controller_test.exs`
Expected: All tests PASS.

- [ ] **Step 5: Run full backend test suite**

Run: `cd backend && mix test`
Expected: All tests PASS (no regressions).

- [ ] **Step 6: Commit**

```bash
git add backend/lib/saleflow_web/controllers/lead_controller.ex backend/test/saleflow_web/controllers/deal_controller_test.exs
git commit -m "feat: auto-create deal on meeting_booked outcome"
```

---

## Task 6: Frontend Types and API Hooks

**Files:**
- Modify: `frontend/src/api/types.ts`
- Create: `frontend/src/api/deals.ts`

- [ ] **Step 1: Add Deal types**

Add to the end of `frontend/src/api/types.ts`:

```typescript
export type DealStage =
  | "meeting_booked"
  | "needs_website"
  | "generating_website"
  | "reviewing"
  | "deployed"
  | "demo_followup"
  | "contract_sent"
  | "signed"
  | "dns_launch"
  | "won";

export interface Deal {
  id: string;
  lead_id: string;
  user_id: string;
  stage: DealStage;
  website_url: string | null;
  contract_url: string | null;
  domain: string | null;
  domain_sponsored: boolean;
  notes: string | null;
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

- [ ] **Step 2: Create deals API hooks**

```typescript
// frontend/src/api/deals.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "./client";
import type { Deal, DealDetailData } from "./types";

export function useDeals() {
  return useQuery<Deal[]>({
    queryKey: ["deals"],
    queryFn: async () => {
      const data = await api<{ deals: Deal[] }>("/api/deals");
      return data.deals;
    },
    staleTime: 30_000,
  });
}

export function useDealDetail(id: string | null | undefined) {
  return useQuery<DealDetailData>({
    queryKey: ["deals", "detail", id],
    queryFn: async () => {
      const data = await api<DealDetailData>(`/api/deals/${id}`);
      return data;
    },
    enabled: !!id,
    staleTime: 30_000,
  });
}

export function useAdvanceDeal() {
  const queryClient = useQueryClient();

  return useMutation<Deal, ApiError, string>({
    mutationFn: (id) =>
      api<{ deal: Deal }>(`/api/deals/${id}/advance`, {
        method: "POST",
      }).then((r) => r.deal),
    onSuccess: (_data, id) => {
      void queryClient.invalidateQueries({ queryKey: ["deals"] });
      void queryClient.invalidateQueries({ queryKey: ["deals", "detail", id] });
    },
  });
}

export interface UpdateDealParams {
  id: string;
  notes?: string;
  website_url?: string;
  contract_url?: string;
  domain?: string;
  domain_sponsored?: boolean;
}

export function useUpdateDeal() {
  const queryClient = useQueryClient();

  return useMutation<Deal, ApiError, UpdateDealParams>({
    mutationFn: ({ id, ...params }) =>
      api<{ deal: Deal }>(`/api/deals/${id}`, {
        method: "PATCH",
        body: JSON.stringify(params),
      }).then((r) => r.deal),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["deals"] });
      void queryClient.invalidateQueries({ queryKey: ["deals", "detail", variables.id] });
    },
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/api/types.ts frontend/src/api/deals.ts
git commit -m "feat: add Deal types and API hooks"
```

---

## Task 7: DealStageIndicator Component

**Files:**
- Create: `frontend/src/components/deal-stage-indicator.tsx`
- Test: `frontend/src/components/__tests__/deal-stage-indicator.test.tsx`

- [ ] **Step 1: Write failing test**

```typescript
// frontend/src/components/__tests__/deal-stage-indicator.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DealStageIndicator } from "../deal-stage-indicator";

const STAGE_LABELS = [
  "Möte bokat",
  "Behöver hemsida",
  "Genereras",
  "Granskning",
  "Deployad",
  "Demo & uppföljning",
  "Avtal skickat",
  "Signerat",
  "DNS & Lansering",
  "Klar",
];

describe("DealStageIndicator", () => {
  it("renders all stage labels", () => {
    render(<DealStageIndicator currentStage="meeting_booked" />);

    for (const label of STAGE_LABELS) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("marks completed stages", () => {
    render(<DealStageIndicator currentStage="reviewing" />);

    // meeting_booked, needs_website, generating_website should be completed
    const steps = screen.getAllByTestId("stage-step");
    expect(steps[0]).toHaveAttribute("data-state", "completed");
    expect(steps[1]).toHaveAttribute("data-state", "completed");
    expect(steps[2]).toHaveAttribute("data-state", "completed");
    expect(steps[3]).toHaveAttribute("data-state", "current");
    expect(steps[4]).toHaveAttribute("data-state", "upcoming");
  });

  it("marks all stages completed when won", () => {
    render(<DealStageIndicator currentStage="won" />);

    const steps = screen.getAllByTestId("stage-step");
    for (const step of steps) {
      expect(step).toHaveAttribute("data-state", "completed");
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/__tests__/deal-stage-indicator.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement component**

```typescript
// frontend/src/components/deal-stage-indicator.tsx
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";
import type { DealStage } from "@/api/types";

const STAGES: { key: DealStage; label: string }[] = [
  { key: "meeting_booked", label: "Möte bokat" },
  { key: "needs_website", label: "Behöver hemsida" },
  { key: "generating_website", label: "Genereras" },
  { key: "reviewing", label: "Granskning" },
  { key: "deployed", label: "Deployad" },
  { key: "demo_followup", label: "Demo & uppföljning" },
  { key: "contract_sent", label: "Avtal skickat" },
  { key: "signed", label: "Signerat" },
  { key: "dns_launch", label: "DNS & Lansering" },
  { key: "won", label: "Klar" },
];

interface Props {
  currentStage: DealStage;
}

export function DealStageIndicator({ currentStage }: Props) {
  const currentIdx = STAGES.findIndex((s) => s.key === currentStage);

  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-2">
      {STAGES.map((stage, idx) => {
        const state =
          idx < currentIdx
            ? "completed"
            : idx === currentIdx
              ? "current"
              : "upcoming";

        return (
          <div
            key={stage.key}
            data-testid="stage-step"
            data-state={state}
            className="flex items-center gap-1"
          >
            <div
              className={cn(
                "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-medium",
                state === "completed" &&
                  "bg-[var(--color-status-success)] text-white",
                state === "current" &&
                  "bg-[var(--color-accent-primary)] text-white",
                state === "upcoming" &&
                  "bg-[var(--color-border-default)] text-[var(--color-text-secondary)]",
              )}
            >
              {state === "completed" ? (
                <Check className="h-3 w-3" />
              ) : (
                idx + 1
              )}
            </div>
            <span
              className={cn(
                "whitespace-nowrap text-[11px]",
                state === "current"
                  ? "font-medium text-[var(--color-text-primary)]"
                  : "text-[var(--color-text-secondary)]",
              )}
            >
              {stage.label}
            </span>
            {idx < STAGES.length - 1 && (
              <div
                className={cn(
                  "h-px w-4 shrink-0",
                  idx < currentIdx
                    ? "bg-[var(--color-status-success)]"
                    : "bg-[var(--color-border-default)]",
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/components/__tests__/deal-stage-indicator.test.tsx`
Expected: All 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/deal-stage-indicator.tsx frontend/src/components/__tests__/deal-stage-indicator.test.tsx
git commit -m "feat: add DealStageIndicator component"
```

---

## Task 8: Pipeline Page (Admin)

**Files:**
- Create: `frontend/src/pages/pipeline.tsx`
- Modify: `frontend/src/app.tsx`
- Test: `frontend/src/pages/__tests__/pipeline.test.tsx`

- [ ] **Step 1: Write failing test**

```typescript
// frontend/src/pages/__tests__/pipeline.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PipelinePage } from "../pipeline";

const navigateMock = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => navigateMock };
});

const useDealsMock = vi.fn();
vi.mock("@/api/deals", () => ({
  useDeals: () => useDealsMock(),
}));

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <BrowserRouter>{children}</BrowserRouter>
    </QueryClientProvider>
  );
}

describe("PipelinePage", () => {
  beforeEach(() => {
    navigateMock.mockClear();
  });

  it("renders loading state", () => {
    useDealsMock.mockReturnValue({ data: undefined, isLoading: true });
    render(<PipelinePage />, { wrapper: Wrapper });
    expect(screen.getByText("Pipeline")).toBeInTheDocument();
  });

  it("groups deals by stage", () => {
    useDealsMock.mockReturnValue({
      data: [
        { id: "d1", stage: "meeting_booked", lead_id: "l1", user_id: "u1", inserted_at: "2026-04-01T00:00:00Z", updated_at: "2026-04-01T00:00:00Z" },
        { id: "d2", stage: "meeting_booked", lead_id: "l2", user_id: "u1", inserted_at: "2026-04-01T00:00:00Z", updated_at: "2026-04-01T00:00:00Z" },
        { id: "d3", stage: "needs_website", lead_id: "l3", user_id: "u1", inserted_at: "2026-04-01T00:00:00Z", updated_at: "2026-04-01T00:00:00Z" },
      ],
      isLoading: false,
    });

    render(<PipelinePage />, { wrapper: Wrapper });
    expect(screen.getByText(/Möte bokat \(2\)/)).toBeInTheDocument();
    expect(screen.getByText(/Behöver hemsida \(1\)/)).toBeInTheDocument();
  });

  it("hides stages with no deals", () => {
    useDealsMock.mockReturnValue({
      data: [
        { id: "d1", stage: "deployed", lead_id: "l1", user_id: "u1", inserted_at: "2026-04-01T00:00:00Z", updated_at: "2026-04-01T00:00:00Z" },
      ],
      isLoading: false,
    });

    render(<PipelinePage />, { wrapper: Wrapper });
    expect(screen.getByText(/Deployad \(1\)/)).toBeInTheDocument();
    expect(screen.queryByText(/Möte bokat/)).not.toBeInTheDocument();
  });

  it("shows empty state when no deals", () => {
    useDealsMock.mockReturnValue({ data: [], isLoading: false });
    render(<PipelinePage />, { wrapper: Wrapper });
    expect(screen.getByText(/Inga aktiva deals/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/pages/__tests__/pipeline.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement pipeline page**

```typescript
// frontend/src/pages/pipeline.tsx
import { useNavigate } from "react-router-dom";
import { useDeals } from "@/api/deals";
import { Badge } from "@/components/ui/badge";
import { Loader } from "@/components/kokonutui/loader";
import type { Deal, DealStage } from "@/api/types";

const STAGE_CONFIG: { key: DealStage; label: string }[] = [
  { key: "meeting_booked", label: "Möte bokat" },
  { key: "needs_website", label: "Behöver hemsida" },
  { key: "generating_website", label: "Genereras" },
  { key: "reviewing", label: "Granskning" },
  { key: "deployed", label: "Deployad" },
  { key: "demo_followup", label: "Demo & uppföljning" },
  { key: "contract_sent", label: "Avtal skickat" },
  { key: "signed", label: "Signerat" },
  { key: "dns_launch", label: "DNS & Lansering" },
];

function timeInStage(deal: Deal): string {
  const updated = new Date(deal.updated_at);
  const now = new Date();
  const diffMs = now.getTime() - updated.getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days === 0) return "Idag";
  if (days === 1) return "1 dag";
  return `${days} dagar`;
}

export function PipelinePage() {
  const navigate = useNavigate();
  const { data: deals, isLoading } = useDeals();

  const activeDeals = (deals ?? []).filter((d) => d.stage !== "won");

  const grouped = STAGE_CONFIG.map((stage) => ({
    ...stage,
    deals: activeDeals.filter((d) => d.stage === stage.key),
  })).filter((g) => g.deals.length > 0);

  return (
    <div className="space-y-6">
      <h1 className="text-[22px] font-light tracking-[-0.5px] text-[var(--color-text-primary)]">
        Pipeline
      </h1>

      {isLoading && <Loader title="Laddar pipeline..." />}

      {!isLoading && grouped.length === 0 && (
        <p className="text-[var(--color-text-secondary)]">Inga aktiva deals</p>
      )}

      {grouped.map((group) => (
        <section key={group.key}>
          <h2 className="mb-3 text-[14px] font-medium uppercase tracking-[0.05em] text-[var(--color-text-secondary)]">
            {group.label} ({group.deals.length})
          </h2>
          <div className="overflow-hidden rounded-[14px] border border-[var(--color-border-default)] bg-[var(--color-bg-panel)]">
            {group.deals.map((deal, idx) => (
              <button
                key={deal.id}
                onClick={() => navigate(`/pipeline/${deal.id}`)}
                className={`flex w-full items-center justify-between px-[var(--spacing-card)] py-3 text-left hover:bg-[var(--color-bg-primary)] ${
                  idx > 0
                    ? "border-t border-[var(--color-border-default)]"
                    : ""
                }`}
              >
                <span className="text-[14px] font-medium text-[var(--color-text-primary)]">
                  {deal.lead_name ?? deal.lead_id}
                </span>
                <div className="flex items-center gap-3">
                  <span className="text-[12px] text-[var(--color-text-secondary)]">
                    {timeInStage(deal)}
                  </span>
                  <Badge status={deal.stage} />
                </div>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Add route in app.tsx**

In `frontend/src/app.tsx`, add lazy import at the top with other lazy imports:

```typescript
const PipelinePage = lazy(() => import("@/pages/pipeline").then((m) => ({ default: m.PipelinePage })));
const PipelineDetailPage = lazy(() => import("@/pages/pipeline-detail").then((m) => ({ default: m.PipelineDetailPage })));
const CustomersPage = lazy(() => import("@/pages/customers").then((m) => ({ default: m.CustomersPage })));
const CustomerDetailPage = lazy(() => import("@/pages/customer-detail").then((m) => ({ default: m.CustomerDetailPage })));
```

Add routes inside the admin-protected Layout routes:

```tsx
<Route path="/pipeline" element={<Suspense fallback={<Loader />}><PipelinePage /></Suspense>} />
<Route path="/pipeline/:id" element={<Suspense fallback={<Loader />}><PipelineDetailPage /></Suspense>} />
<Route path="/customers" element={<Suspense fallback={<Loader />}><CustomersPage /></Suspense>} />
<Route path="/customers/:id" element={<Suspense fallback={<Loader />}><CustomerDetailPage /></Suspense>} />
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/pages/__tests__/pipeline.test.tsx`
Expected: All 4 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/pipeline.tsx frontend/src/pages/__tests__/pipeline.test.tsx frontend/src/app.tsx
git commit -m "feat: add admin pipeline page with stage grouping"
```

---

## Task 9: Pipeline Detail Page (Admin)

**Files:**
- Create: `frontend/src/pages/pipeline-detail.tsx`
- Test: `frontend/src/pages/__tests__/pipeline-detail.test.tsx`

- [ ] **Step 1: Write failing test**

```typescript
// frontend/src/pages/__tests__/pipeline-detail.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PipelineDetailPage } from "../pipeline-detail";

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useParams: () => ({ id: "d1" }), useNavigate: () => vi.fn() };
});

const useDealDetailMock = vi.fn();
const useAdvanceDealMock = vi.fn();
const useUpdateDealMock = vi.fn();

vi.mock("@/api/deals", () => ({
  useDealDetail: () => useDealDetailMock(),
  useAdvanceDeal: () => useAdvanceDealMock(),
  useUpdateDeal: () => useUpdateDealMock(),
}));

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <BrowserRouter>{children}</BrowserRouter>
    </QueryClientProvider>
  );
}

const mockDealData = {
  deal: {
    id: "d1",
    lead_id: "l1",
    user_id: "u1",
    stage: "needs_website",
    website_url: null,
    contract_url: null,
    domain: null,
    domain_sponsored: false,
    notes: null,
    inserted_at: "2026-04-01T00:00:00Z",
    updated_at: "2026-04-01T00:00:00Z",
  },
  lead: {
    id: "l1",
    företag: "Acme AB",
    telefon: "+46701234567",
    epost: "info@acme.se",
    adress: "Storgatan 1",
    postnummer: "11122",
    stad: "Stockholm",
    bransch: "IT",
    orgnr: "5591234567",
    omsättning_tkr: "5000",
    vd_namn: "Anna Svensson",
    källa: "bokadirekt",
    status: "meeting_booked",
  },
  meetings: [
    {
      id: "m1",
      title: "Demo",
      meeting_date: "2026-04-10",
      meeting_time: "14:00:00",
      status: "scheduled",
      duration_minutes: 30,
      teams_join_url: null,
      attendee_name: null,
      deal_id: "d1",
      inserted_at: "2026-04-01T00:00:00Z",
    },
  ],
  audit_logs: [],
};

describe("PipelineDetailPage", () => {
  beforeEach(() => {
    useAdvanceDealMock.mockReturnValue({ mutate: vi.fn(), isPending: false });
    useUpdateDealMock.mockReturnValue({ mutate: vi.fn(), isPending: false });
  });

  it("renders deal info and lead info", () => {
    useDealDetailMock.mockReturnValue({ data: mockDealData, isLoading: false });

    render(<PipelineDetailPage />, { wrapper: Wrapper });

    expect(screen.getByText("Acme AB")).toBeInTheDocument();
    expect(screen.getByText("+46701234567")).toBeInTheDocument();
    expect(screen.getByText("Anna Svensson")).toBeInTheDocument();
  });

  it("shows stage indicator", () => {
    useDealDetailMock.mockReturnValue({ data: mockDealData, isLoading: false });

    render(<PipelineDetailPage />, { wrapper: Wrapper });

    expect(screen.getByText("Behöver hemsida")).toBeInTheDocument();
  });

  it("shows meetings list", () => {
    useDealDetailMock.mockReturnValue({ data: mockDealData, isLoading: false });

    render(<PipelineDetailPage />, { wrapper: Wrapper });

    expect(screen.getByText("Demo")).toBeInTheDocument();
  });

  it("shows loading state", () => {
    useDealDetailMock.mockReturnValue({ data: undefined, isLoading: true });

    render(<PipelineDetailPage />, { wrapper: Wrapper });

    expect(screen.getByText(/Laddar/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/pages/__tests__/pipeline-detail.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement pipeline detail page**

```typescript
// frontend/src/pages/pipeline-detail.tsx
import { useParams, useNavigate } from "react-router-dom";
import { useDealDetail, useAdvanceDeal, useUpdateDeal } from "@/api/deals";
import { DealStageIndicator } from "@/components/deal-stage-indicator";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader } from "@/components/kokonutui/loader";
import { ArrowLeft, ExternalLink, MapPin } from "lucide-react";
import type { DealStage } from "@/api/types";

const ACTION_LABELS: Partial<Record<DealStage, string>> = {
  meeting_booked: "Gå vidare",
  needs_website: "Konfigurera & Generera",
  reviewing: "Deploya",
  deployed: "Markera skickad",
  signed: "Starta DNS",
  dns_launch: "Markera klar",
};

export function PipelineDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data, isLoading } = useDealDetail(id);
  const advanceDeal = useAdvanceDeal();
  const updateDeal = useUpdateDeal();

  if (isLoading || !data) {
    return <Loader title="Laddar deal..." />;
  }

  const { deal, lead, meetings } = data;
  const actionLabel = ACTION_LABELS[deal.stage as DealStage];

  const handleAdvance = () => {
    if (id) advanceDeal.mutate(id);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate("/pipeline")}
          className="text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-[22px] font-light tracking-[-0.5px] text-[var(--color-text-primary)]">
          {lead.företag}
        </h1>
      </div>

      <DealStageIndicator currentStage={deal.stage as DealStage} />

      <div className="grid grid-cols-1 gap-[var(--spacing-element)] lg:grid-cols-3">
        {/* Left column — Deal info (2/3) */}
        <div className="space-y-[var(--spacing-element)] lg:col-span-2">
          {/* Actions */}
          {actionLabel && deal.stage !== "won" && (
            <Card>
              <CardTitle>Åtgärd</CardTitle>
              <Button
                variant="primary"
                onClick={handleAdvance}
                disabled={advanceDeal.isPending}
              >
                {actionLabel}
              </Button>
            </Card>
          )}

          {/* Website URL */}
          {deal.website_url && (
            <Card>
              <CardTitle>Demo-hemsida</CardTitle>
              <a
                href={deal.website_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[14px] text-[var(--color-accent-primary)] hover:underline"
              >
                {deal.website_url}
                <ExternalLink className="h-3 w-3" />
              </a>
            </Card>
          )}

          {/* Meetings */}
          <Card>
            <CardTitle>Möten ({meetings.length})</CardTitle>
            {meetings.length === 0 && (
              <p className="text-[14px] text-[var(--color-text-secondary)]">Inga möten</p>
            )}
            {meetings.map((m) => (
              <div
                key={m.id}
                className="flex items-center justify-between border-b border-[var(--color-border-default)] py-2 last:border-0"
              >
                <div>
                  <span className="text-[14px] font-medium">{m.title}</span>
                  <span className="ml-2 text-[12px] text-[var(--color-text-secondary)]">
                    {m.meeting_date} {m.meeting_time?.slice(0, 5)}
                  </span>
                </div>
                <Badge status={m.status} />
              </div>
            ))}
          </Card>

          {/* Notes */}
          <Card>
            <CardTitle>Anteckningar</CardTitle>
            <p className="text-[14px] text-[var(--color-text-secondary)]">
              {deal.notes ?? "Inga anteckningar"}
            </p>
          </Card>
        </div>

        {/* Right column — Lead info (1/3) */}
        <div className="space-y-[var(--spacing-element)]">
          <Card>
            <CardTitle>Företagsinformation</CardTitle>
            <dl className="space-y-2 text-[14px]">
              <InfoRow label="Företag" value={lead.företag} />
              <InfoRow label="Telefon" value={lead.telefon} />
              <InfoRow label="E-post" value={lead.epost} />
              <InfoRow label="Adress" value={lead.adress} />
              <InfoRow label="Postnummer" value={lead.postnummer} />
              <InfoRow label="Stad" value={lead.stad} />
              <InfoRow label="Bransch" value={lead.bransch} />
              <InfoRow label="Orgnr" value={lead.orgnr} />
              <InfoRow label="Omsättning" value={lead.omsättning_tkr ? `${lead.omsättning_tkr} tkr` : null} />
              <InfoRow label="VD" value={lead.vd_namn} />
            </dl>
            {lead.adress && (
              <a
                href={`https://maps.google.com/?q=${encodeURIComponent(`${lead.adress}, ${lead.stad ?? ""}`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex items-center gap-1 text-[12px] text-[var(--color-accent-primary)] hover:underline"
              >
                <MapPin className="h-3 w-3" />
                Visa på karta
              </a>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex justify-between">
      <dt className="text-[var(--color-text-secondary)]">{label}</dt>
      <dd className="font-medium text-[var(--color-text-primary)]">{value}</dd>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/pages/__tests__/pipeline-detail.test.tsx`
Expected: All 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/pipeline-detail.tsx frontend/src/pages/__tests__/pipeline-detail.test.tsx
git commit -m "feat: add admin pipeline detail page"
```

---

## Task 10: Customers Page (Admin)

**Files:**
- Create: `frontend/src/pages/customers.tsx`
- Create: `frontend/src/pages/customer-detail.tsx`
- Test: `frontend/src/pages/__tests__/customers.test.tsx`

- [ ] **Step 1: Write failing test**

```typescript
// frontend/src/pages/__tests__/customers.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CustomersPage } from "../customers";

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => vi.fn() };
});

const useDealsMock = vi.fn();
vi.mock("@/api/deals", () => ({
  useDeals: () => useDealsMock(),
}));

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <BrowserRouter>{children}</BrowserRouter>
    </QueryClientProvider>
  );
}

describe("CustomersPage", () => {
  it("shows only won deals", () => {
    useDealsMock.mockReturnValue({
      data: [
        { id: "d1", stage: "won", lead_id: "l1", user_id: "u1", domain: "example.se", inserted_at: "2026-04-01T00:00:00Z", updated_at: "2026-04-01T00:00:00Z" },
        { id: "d2", stage: "deployed", lead_id: "l2", user_id: "u1", domain: null, inserted_at: "2026-04-01T00:00:00Z", updated_at: "2026-04-01T00:00:00Z" },
      ],
      isLoading: false,
    });

    render(<CustomersPage />, { wrapper: Wrapper });
    expect(screen.getByText("Kunder (1)")).toBeInTheDocument();
  });

  it("shows empty state", () => {
    useDealsMock.mockReturnValue({ data: [], isLoading: false });
    render(<CustomersPage />, { wrapper: Wrapper });
    expect(screen.getByText(/Inga kunder/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/pages/__tests__/customers.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement customers page**

```typescript
// frontend/src/pages/customers.tsx
import { useNavigate } from "react-router-dom";
import { useDeals } from "@/api/deals";
import { Loader } from "@/components/kokonutui/loader";

export function CustomersPage() {
  const navigate = useNavigate();
  const { data: deals, isLoading } = useDeals();

  const customers = (deals ?? []).filter((d) => d.stage === "won");

  return (
    <div className="space-y-6">
      <h1 className="text-[22px] font-light tracking-[-0.5px] text-[var(--color-text-primary)]">
        Kunder ({customers.length})
      </h1>

      {isLoading && <Loader title="Laddar kunder..." />}

      {!isLoading && customers.length === 0 && (
        <p className="text-[var(--color-text-secondary)]">Inga kunder ännu</p>
      )}

      {customers.length > 0 && (
        <div className="overflow-hidden rounded-[14px] border border-[var(--color-border-default)] bg-[var(--color-bg-panel)]">
          {customers.map((deal, idx) => (
            <button
              key={deal.id}
              onClick={() => navigate(`/customers/${deal.id}`)}
              className={`flex w-full items-center justify-between px-[var(--spacing-card)] py-3 text-left hover:bg-[var(--color-bg-primary)] ${
                idx > 0
                  ? "border-t border-[var(--color-border-default)]"
                  : ""
              }`}
            >
              <span className="text-[14px] font-medium text-[var(--color-text-primary)]">
                {deal.lead_id}
              </span>
              <div className="flex items-center gap-3">
                {deal.domain && (
                  <span className="text-[12px] text-[var(--color-text-secondary)]">
                    {deal.domain}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Create customer detail page (placeholder — reuses pipeline-detail pattern)**

```typescript
// frontend/src/pages/customer-detail.tsx
import { useParams, useNavigate } from "react-router-dom";
import { useDealDetail } from "@/api/deals";
import { DealStageIndicator } from "@/components/deal-stage-indicator";
import { Card, CardTitle } from "@/components/ui/card";
import { Loader } from "@/components/kokonutui/loader";
import { ArrowLeft, ExternalLink } from "lucide-react";
import type { DealStage } from "@/api/types";

export function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data, isLoading } = useDealDetail(id);

  if (isLoading || !data) {
    return <Loader title="Laddar kund..." />;
  }

  const { deal, lead, meetings } = data;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate("/customers")}
          className="text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-[22px] font-light tracking-[-0.5px] text-[var(--color-text-primary)]">
          {lead.företag}
        </h1>
      </div>

      <DealStageIndicator currentStage={deal.stage as DealStage} />

      <div className="grid grid-cols-1 gap-[var(--spacing-element)] lg:grid-cols-3">
        <div className="space-y-[var(--spacing-element)] lg:col-span-2">
          {deal.website_url && (
            <Card>
              <CardTitle>Hemsida</CardTitle>
              <a
                href={deal.website_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[14px] text-[var(--color-accent-primary)] hover:underline"
              >
                {deal.website_url}
                <ExternalLink className="h-3 w-3" />
              </a>
            </Card>
          )}

          {deal.domain && (
            <Card>
              <CardTitle>Domän</CardTitle>
              <p className="text-[14px]">
                {deal.domain}
                {deal.domain_sponsored && (
                  <span className="ml-2 text-[12px] text-[var(--color-text-secondary)]">
                    (Sponsored 12 mån)
                  </span>
                )}
              </p>
            </Card>
          )}

          <Card>
            <CardTitle>Möten ({meetings.length})</CardTitle>
            {meetings.map((m) => (
              <div
                key={m.id}
                className="flex items-center justify-between border-b border-[var(--color-border-default)] py-2 last:border-0"
              >
                <span className="text-[14px] font-medium">{m.title}</span>
                <span className="text-[12px] text-[var(--color-text-secondary)]">
                  {m.meeting_date}
                </span>
              </div>
            ))}
          </Card>
        </div>

        <div>
          <Card>
            <CardTitle>Företagsinformation</CardTitle>
            <dl className="space-y-2 text-[14px]">
              {lead.företag && <InfoRow label="Företag" value={lead.företag} />}
              {lead.telefon && <InfoRow label="Telefon" value={lead.telefon} />}
              {lead.epost && <InfoRow label="E-post" value={lead.epost} />}
              {lead.stad && <InfoRow label="Stad" value={lead.stad} />}
              {lead.bransch && <InfoRow label="Bransch" value={lead.bransch} />}
              {lead.vd_namn && <InfoRow label="VD" value={lead.vd_namn} />}
            </dl>
          </Card>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-[var(--color-text-secondary)]">{label}</dt>
      <dd className="font-medium text-[var(--color-text-primary)]">{value}</dd>
    </div>
  );
}
```

- [ ] **Step 5: Run tests**

Run: `cd frontend && npx vitest run src/pages/__tests__/customers.test.tsx`
Expected: All 2 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/customers.tsx frontend/src/pages/customer-detail.tsx frontend/src/pages/__tests__/customers.test.tsx
git commit -m "feat: add admin customers page and customer detail"
```

---

## Task 11: Agent Deals Tab in Dialer

**Files:**
- Create: `frontend/src/components/dialer/deals-tab.tsx`
- Create: `frontend/src/components/dialer/deal-detail-tab.tsx`
- Create: `frontend/src/components/dialer/customers-tab.tsx`
- Modify: `frontend/src/pages/dialer.tsx`
- Test: `frontend/src/components/dialer/__tests__/deals-tab.test.tsx`

- [ ] **Step 1: Write failing test for deals tab**

```typescript
// frontend/src/components/dialer/__tests__/deals-tab.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DealsTab } from "../deals-tab";

const useDealsMock = vi.fn();
vi.mock("@/api/deals", () => ({
  useDeals: () => useDealsMock(),
}));

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("DealsTab", () => {
  it("renders deals list", () => {
    useDealsMock.mockReturnValue({
      data: [
        {
          id: "d1",
          stage: "deployed",
          lead_id: "l1",
          user_id: "u1",
          website_url: "https://test.vercel.app",
          inserted_at: "2026-04-01T00:00:00Z",
          updated_at: "2026-04-01T00:00:00Z",
        },
      ],
      isLoading: false,
    });

    render(<DealsTab onSelectDeal={vi.fn()} />, { wrapper: Wrapper });
    expect(screen.getByText(/Deployad/i)).toBeInTheDocument();
  });

  it("shows empty state", () => {
    useDealsMock.mockReturnValue({ data: [], isLoading: false });
    render(<DealsTab onSelectDeal={vi.fn()} />, { wrapper: Wrapper });
    expect(screen.getByText(/Inga deals/)).toBeInTheDocument();
  });

  it("filters out won deals", () => {
    useDealsMock.mockReturnValue({
      data: [
        { id: "d1", stage: "won", lead_id: "l1", user_id: "u1", inserted_at: "2026-04-01T00:00:00Z", updated_at: "2026-04-01T00:00:00Z" },
        { id: "d2", stage: "deployed", lead_id: "l2", user_id: "u1", inserted_at: "2026-04-01T00:00:00Z", updated_at: "2026-04-01T00:00:00Z" },
      ],
      isLoading: false,
    });

    render(<DealsTab onSelectDeal={vi.fn()} />, { wrapper: Wrapper });
    expect(screen.getAllByTestId("deal-row")).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/dialer/__tests__/deals-tab.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement DealsTab**

```typescript
// frontend/src/components/dialer/deals-tab.tsx
import { useDeals } from "@/api/deals";
import { Badge } from "@/components/ui/badge";
import { Loader } from "@/components/kokonutui/loader";

const STAGE_LABELS: Record<string, string> = {
  meeting_booked: "Möte bokat",
  needs_website: "Väntar på hemsida",
  generating_website: "Hemsida genereras",
  reviewing: "Granskning",
  deployed: "Demo-länk redo",
  demo_followup: "Demo & uppföljning",
  contract_sent: "Avtal skickat",
  signed: "Signerat",
  dns_launch: "DNS & Lansering",
};

interface Props {
  onSelectDeal: (dealId: string) => void;
}

export function DealsTab({ onSelectDeal }: Props) {
  const { data: deals, isLoading } = useDeals();

  const activeDeals = (deals ?? []).filter((d) => d.stage !== "won");

  if (isLoading) return <Loader title="Laddar deals..." />;

  if (activeDeals.length === 0) {
    return (
      <p className="py-8 text-center text-[14px] text-[var(--color-text-secondary)]">
        Inga deals ännu
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {activeDeals.map((deal) => (
        <button
          key={deal.id}
          data-testid="deal-row"
          onClick={() => onSelectDeal(deal.id)}
          className="flex w-full items-center justify-between rounded-[8px] border border-[var(--color-border-default)] bg-[var(--color-bg-panel)] px-[var(--spacing-card)] py-3 text-left hover:bg-[var(--color-bg-primary)]"
        >
          <span className="text-[14px] font-medium text-[var(--color-text-primary)]">
            {deal.lead_id}
          </span>
          <Badge status={deal.stage}>
            {STAGE_LABELS[deal.stage] ?? deal.stage}
          </Badge>
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Implement DealDetailTab**

```typescript
// frontend/src/components/dialer/deal-detail-tab.tsx
import { useDealDetail } from "@/api/deals";
import { DealStageIndicator } from "@/components/deal-stage-indicator";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader } from "@/components/kokonutui/loader";
import { ArrowLeft, Copy, ExternalLink } from "lucide-react";
import type { DealStage } from "@/api/types";

interface Props {
  dealId: string;
  onBack: () => void;
}

export function DealDetailTab({ dealId, onBack }: Props) {
  const { data, isLoading } = useDealDetail(dealId);

  if (isLoading || !data) return <Loader title="Laddar deal..." />;

  const { deal, lead, meetings } = data;

  const copyUrl = () => {
    if (deal.website_url) void navigator.clipboard.writeText(deal.website_url);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button onClick={onBack} className="text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h3 className="text-[16px] font-medium">{lead.företag}</h3>
      </div>

      <DealStageIndicator currentStage={deal.stage as DealStage} />

      {/* Demo link — prominent */}
      {deal.website_url && (
        <div className="rounded-[8px] border border-[var(--color-status-success)] bg-green-50 p-3">
          <p className="mb-1 text-[12px] font-medium uppercase tracking-[0.05em] text-[var(--color-status-success)]">
            Demo-länk
          </p>
          <div className="flex items-center gap-2">
            <a
              href={deal.website_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[14px] text-[var(--color-accent-primary)] hover:underline"
            >
              {deal.website_url}
            </a>
            <button onClick={copyUrl} className="text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]">
              <Copy className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}

      {/* Meetings */}
      <div>
        <h4 className="mb-2 text-[12px] font-medium uppercase tracking-[0.05em] text-[var(--color-text-secondary)]">
          Möten
        </h4>
        {meetings.map((m) => (
          <div key={m.id} className="flex items-center justify-between py-2">
            <span className="text-[14px]">{m.title}</span>
            <div className="flex items-center gap-2">
              <span className="text-[12px] text-[var(--color-text-secondary)]">
                {m.meeting_date} {m.meeting_time?.slice(0, 5)}
              </span>
              <Badge status={m.status} />
            </div>
          </div>
        ))}
      </div>

      {/* Lead info */}
      <div>
        <h4 className="mb-2 text-[12px] font-medium uppercase tracking-[0.05em] text-[var(--color-text-secondary)]">
          Företag
        </h4>
        <div className="space-y-1 text-[14px]">
          <p>{lead.telefon}</p>
          {lead.epost && <p>{lead.epost}</p>}
          {lead.adress && <p>{lead.adress}, {lead.stad}</p>}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Implement CustomersTab**

```typescript
// frontend/src/components/dialer/customers-tab.tsx
import { useDeals } from "@/api/deals";
import { Loader } from "@/components/kokonutui/loader";

interface Props {
  onSelectDeal: (dealId: string) => void;
}

export function CustomersTab({ onSelectDeal }: Props) {
  const { data: deals, isLoading } = useDeals();

  const customers = (deals ?? []).filter((d) => d.stage === "won");

  if (isLoading) return <Loader title="Laddar kunder..." />;

  if (customers.length === 0) {
    return (
      <p className="py-8 text-center text-[14px] text-[var(--color-text-secondary)]">
        Inga kunder ännu
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {customers.map((deal) => (
        <button
          key={deal.id}
          onClick={() => onSelectDeal(deal.id)}
          className="flex w-full items-center justify-between rounded-[8px] border border-[var(--color-border-default)] bg-[var(--color-bg-panel)] px-[var(--spacing-card)] py-3 text-left hover:bg-[var(--color-bg-primary)]"
        >
          <span className="text-[14px] font-medium text-[var(--color-text-primary)]">
            {deal.lead_id}
          </span>
          {deal.domain && (
            <span className="text-[12px] text-[var(--color-text-secondary)]">{deal.domain}</span>
          )}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 6: Add tabs to dialer.tsx**

In `frontend/src/pages/dialer.tsx`, add imports:

```typescript
import { DealsTab } from "@/components/dialer/deals-tab";
import { DealDetailTab } from "@/components/dialer/deal-detail-tab";
import { CustomersTab } from "@/components/dialer/customers-tab";
```

Add state for selected deal:

```typescript
const [selectedDealId, setSelectedDealId] = useState<string | null>(null);
```

Add "Deals" and "Kunder" to the tabs array (after existing tabs like "Meetings"). Add the tab content rendering in the tab switch/conditional:

For "Deals" tab:
```tsx
{selectedDealId ? (
  <DealDetailTab dealId={selectedDealId} onBack={() => setSelectedDealId(null)} />
) : (
  <DealsTab onSelectDeal={setSelectedDealId} />
)}
```

For "Kunder" tab:
```tsx
{selectedDealId ? (
  <DealDetailTab dealId={selectedDealId} onBack={() => setSelectedDealId(null)} />
) : (
  <CustomersTab onSelectDeal={setSelectedDealId} />
)}
```

- [ ] **Step 7: Run tests**

Run: `cd frontend && npx vitest run src/components/dialer/__tests__/deals-tab.test.tsx`
Expected: All 3 tests PASS.

- [ ] **Step 8: Run full frontend test suite**

Run: `cd frontend && npx vitest run`
Expected: All tests PASS (no regressions).

- [ ] **Step 9: Commit**

```bash
git add frontend/src/components/dialer/deals-tab.tsx frontend/src/components/dialer/deal-detail-tab.tsx frontend/src/components/dialer/customers-tab.tsx frontend/src/components/dialer/__tests__/deals-tab.test.tsx frontend/src/pages/dialer.tsx
git commit -m "feat: add deals and customers tabs to agent dialer"
```

---

## Task 12: Flowing AI Proxy (Backend)

**Files:**
- Create: `backend/lib/saleflow/flowing_ai.ex`
- Modify: `backend/lib/saleflow_web/controllers/deal_controller.ex`
- Modify: `backend/lib/saleflow_web/router.ex`
- Test: `backend/test/saleflow/flowing_ai_test.exs`

- [ ] **Step 1: Write failing test for FlowingAi client**

```elixir
# backend/test/saleflow/flowing_ai_test.exs
defmodule Saleflow.FlowingAiTest do
  use ExUnit.Case, async: true

  alias Saleflow.FlowingAi

  describe "base_url/0" do
    test "returns configured URL" do
      assert FlowingAi.base_url() =~ "http"
    end
  end

  describe "scrape_url/1" do
    test "builds correct endpoint path" do
      assert FlowingAi.scrape_url("https://bokadirekt.se/places/test") ==
               "#{FlowingAi.base_url()}/api/scrape"
    end
  end

  describe "generate_url/0" do
    test "builds correct endpoint path" do
      assert FlowingAi.generate_url() == "#{FlowingAi.base_url()}/api/generate"
    end
  end

  describe "deploy_url/1" do
    test "builds correct endpoint path" do
      assert FlowingAi.deploy_url("test-slug") == "#{FlowingAi.base_url()}/api/deploy/test-slug"
    end
  end

  describe "logs_url/1" do
    test "builds correct endpoint path" do
      assert FlowingAi.logs_url("test-slug") ==
               "#{FlowingAi.base_url()}/api/generate/test-slug/logs"
    end
  end
end
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && mix test test/saleflow/flowing_ai_test.exs`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement FlowingAi client**

```elixir
# backend/lib/saleflow/flowing_ai.ex
defmodule Saleflow.FlowingAi do
  @moduledoc """
  HTTP client for the Flowing AI website generator API.
  """

  def base_url do
    Application.get_env(:saleflow, :flowing_ai_url, "http://localhost:1337")
  end

  def scrape_url(_bokadirekt_url), do: "#{base_url()}/api/scrape"
  def generate_url, do: "#{base_url()}/api/generate"
  def deploy_url(slug), do: "#{base_url()}/api/deploy/#{slug}"
  def logs_url(slug), do: "#{base_url()}/api/generate/#{slug}/logs"
  def status_url(slug), do: "#{base_url()}/api/generate/#{slug}/status"

  def scrape(bokadirekt_url) do
    body = Jason.encode!(%{url: bokadirekt_url})

    case Req.post("#{base_url()}/api/scrape", body: body, headers: [{"content-type", "application/json"}]) do
      {:ok, %{status: 200, body: data}} -> {:ok, data}
      {:ok, %{status: status, body: body}} -> {:error, "Flowing AI returned #{status}: #{inspect(body)}"}
      {:error, reason} -> {:error, reason}
    end
  end

  def generate(slug, selected_images, selected_services, customer_id \\ nil) do
    body =
      Jason.encode!(%{
        slug: slug,
        selectedImages: selected_images,
        selectedServices: selected_services,
        customerId: customer_id
      })

    case Req.post("#{base_url()}/api/generate", body: body, headers: [{"content-type", "application/json"}]) do
      {:ok, %{status: 200, body: data}} -> {:ok, data}
      {:ok, %{status: status, body: body}} -> {:error, "Flowing AI returned #{status}: #{inspect(body)}"}
      {:error, reason} -> {:error, reason}
    end
  end

  def deploy(slug) do
    case Req.post("#{base_url()}/api/deploy/#{slug}", body: "", headers: [{"content-type", "application/json"}]) do
      {:ok, %{status: 200, body: data}} -> {:ok, data}
      {:ok, %{status: status, body: body}} -> {:error, "Flowing AI returned #{status}: #{inspect(body)}"}
      {:error, reason} -> {:error, reason}
    end
  end
end
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && mix test test/saleflow/flowing_ai_test.exs`
Expected: All 4 tests PASS.

- [ ] **Step 5: Add proxy actions to DealController**

Add to `backend/lib/saleflow_web/controllers/deal_controller.ex`:

```elixir
  def scrape(conn, %{"id" => id, "url" => url}) do
    user = conn.assigns.current_user

    with {:ok, deal} <- Sales.get_deal(id),
         :ok <- authorize_admin(user),
         {:ok, data} <- Saleflow.FlowingAi.scrape(url) do
      json(conn, %{ok: true, data: data})
    else
      {:error, reason} -> conn |> put_status(422) |> json(%{error: inspect(reason)})
    end
  end

  def generate(conn, %{"id" => id} = params) do
    user = conn.assigns.current_user

    with {:ok, deal} <- Sales.get_deal(id),
         :ok <- authorize_admin(user),
         {:ok, data} <- Saleflow.FlowingAi.generate(
           params["slug"],
           params["selectedImages"],
           params["selectedServices"]
         ),
         {:ok, _} <- Sales.advance_deal(deal) do
      json(conn, %{ok: true, data: data})
    else
      {:error, reason} -> conn |> put_status(422) |> json(%{error: inspect(reason)})
    end
  end

  def deploy(conn, %{"id" => id, "slug" => slug}) do
    user = conn.assigns.current_user

    with {:ok, deal} <- Sales.get_deal(id),
         :ok <- authorize_admin(user),
         {:ok, data} <- Saleflow.FlowingAi.deploy(slug),
         {:ok, _} <- Sales.update_deal(deal, %{website_url: data["url"]}) do
      json(conn, %{ok: true, url: data["url"]})
    else
      {:error, reason} -> conn |> put_status(422) |> json(%{error: inspect(reason)})
    end
  end

  defp authorize_admin(user) do
    if user.role == :admin, do: :ok, else: {:error, :forbidden}
  end
```

- [ ] **Step 6: Add proxy routes**

In `backend/lib/saleflow_web/router.ex`, add to the admin scope:

```elixir
    # Deal Flowing AI proxy
    post "/deals/:id/scrape", DealController, :scrape
    post "/deals/:id/generate", DealController, :generate
    post "/deals/:id/deploy", DealController, :deploy
```

- [ ] **Step 7: Run full backend test suite**

Run: `cd backend && mix test`
Expected: All tests PASS.

- [ ] **Step 8: Commit**

```bash
git add backend/lib/saleflow/flowing_ai.ex backend/lib/saleflow_web/controllers/deal_controller.ex backend/lib/saleflow_web/router.ex backend/test/saleflow/flowing_ai_test.exs
git commit -m "feat: add Flowing AI proxy client and deal controller actions"
```

---

## Task 13: Add Pipeline & Customers to Admin Sidebar

**Files:**
- Modify: The sidebar/navigation component (find the existing sidebar)

- [ ] **Step 1: Find the sidebar component**

Run: `cd frontend && grep -r "Pipeline\|/pipeline\|sidebar" src/components/ --include="*.tsx" -l`

Locate the sidebar component that renders the navigation links.

- [ ] **Step 2: Add Pipeline and Kunder links**

Add two new navigation items to the admin section of the sidebar:

```tsx
{ label: "Pipeline", href: "/pipeline", icon: GitBranch },
{ label: "Kunder", href: "/customers", icon: Users },
```

Import icons:
```typescript
import { GitBranch, Users } from "lucide-react";
```

Place these after the Dashboard link and before the existing admin links.

- [ ] **Step 3: Verify navigation works**

Run: `cd frontend && npx vitest run`
Expected: All tests PASS (no regressions).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/
git commit -m "feat: add Pipeline and Kunder to admin sidebar navigation"
```

---

## Task 14: Final Integration Test

- [ ] **Step 1: Run full backend test suite**

Run: `cd backend && mix test`
Expected: All tests PASS, 100% relevant coverage.

- [ ] **Step 2: Run full frontend test suite**

Run: `cd frontend && npx vitest run`
Expected: All tests PASS, no regressions.

- [ ] **Step 3: Run TypeScript check**

Run: `cd frontend && npx tsc --noEmit`
Expected: No type errors.

- [ ] **Step 4: Run linter**

Run: `cd frontend && npx eslint src/ --ext .ts,.tsx`
Expected: No errors.

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: deal pipeline — complete implementation"
```
