# Dashboard & Historik Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign dashboard with Clean & Minimal design, add goal system, Telavox webhook for real call tracking, conversion KPI, and refresh history table UI.

**Architecture:** Two-phase approach. Fas 1 adds backend resources (Goal, PhoneCall), webhook endpoint, conversion query, then rebuilds dashboard frontend. Fas 2 refreshes history table UI. All backend work uses Ash 3.7 resources with raw SQL for analytics. Frontend uses React + shadcn components.

**Tech Stack:** Elixir/Ash 3.7, PostgreSQL, Phoenix controllers, React 19, TypeScript, TanStack Query, Tailwind CSS, shadcn/ui

---

## File Structure

### Backend — New Files
- `backend/lib/saleflow/sales/goal.ex` — Goal Ash resource
- `backend/lib/saleflow/sales/phone_call.ex` — PhoneCall Ash resource
- `backend/lib/saleflow_web/controllers/goal_controller.ex` — Goal CRUD endpoints
- `backend/lib/saleflow_web/controllers/webhook_controller.ex` — Telavox webhook endpoint
- `backend/lib/saleflow_web/plugs/verify_telavox.ex` — IP/auth verification plug
- `backend/test/saleflow/sales/goal_test.exs` — Goal tests
- `backend/test/saleflow/sales/phone_call_test.exs` — PhoneCall tests
- `backend/test/saleflow_web/controllers/webhook_controller_test.exs` — Webhook tests
- `backend/test/saleflow_web/controllers/goal_controller_test.exs` — Goal controller tests

### Backend — Modified Files
- `backend/lib/saleflow/sales/sales.ex` — Add Goal + PhoneCall to domain, add helper functions
- `backend/lib/saleflow/accounts/user.ex` — Add phone_number attribute
- `backend/lib/saleflow_web/router.ex` — Add goal + webhook routes
- `backend/lib/saleflow_web/controllers/dashboard_controller.ex` — Add conversion KPI, switch to PhoneCall counts

### Frontend — New Files
- `frontend/src/api/goals.ts` — Goal API hooks
- `frontend/src/components/goal-progress.tsx` — Goal progress bars component
- `frontend/src/components/ui/progress.tsx` — shadcn Progress component

### Frontend — Modified Files
- `frontend/src/api/types.ts` — Add Goal, PhoneCall, updated DashboardData types
- `frontend/src/api/dashboard.ts` — Update dashboard hook with new response shape
- `frontend/src/pages/dashboard.tsx` — Complete rewrite with new design
- `frontend/src/components/stat-card.tsx` — Restyle to Clean & Minimal
- `frontend/src/components/leaderboard.tsx` — Restyle with new design
- `frontend/src/pages/history.tsx` — Visual refresh (Fas 2)

### Migrations
- `backend/priv/repo/migrations/YYYYMMDDHHMMSS_add_goals.exs`
- `backend/priv/repo/migrations/YYYYMMDDHHMMSS_add_phone_calls.exs`
- `backend/priv/repo/migrations/YYYYMMDDHHMMSS_add_user_phone_number.exs`

---

## Task 1: PhoneCall Resource + Migration

**Files:**
- Create: `backend/lib/saleflow/sales/phone_call.ex`
- Modify: `backend/lib/saleflow/sales/sales.ex`
- Test: `backend/test/saleflow/sales/phone_call_test.exs`

- [ ] **Step 1: Write the PhoneCall test**

```elixir
# backend/test/saleflow/sales/phone_call_test.exs
defmodule Saleflow.Sales.PhoneCallTest do
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

  describe "create_phone_call/1" do
    test "creates a phone call with all required fields" do
      lead = create_lead!()
      user = create_user!()

      assert {:ok, call} =
               Sales.create_phone_call(%{
                 lead_id: lead.id,
                 user_id: user.id,
                 caller: "+46701111111",
                 callee: "+46701234567",
                 duration: 145
               })

      assert call.lead_id == lead.id
      assert call.user_id == user.id
      assert call.caller == "+46701111111"
      assert call.callee == "+46701234567"
      assert call.duration == 145
      refute is_nil(call.received_at)
    end

    test "creates a phone call without lead/user match (nullable)" do
      assert {:ok, call} =
               Sales.create_phone_call(%{
                 caller: "+46709999999",
                 callee: "+46708888888",
                 duration: 30
               })

      assert is_nil(call.lead_id)
      assert is_nil(call.user_id)
      assert call.duration == 30
    end

    test "defaults duration to 0" do
      assert {:ok, call} =
               Sales.create_phone_call(%{
                 caller: "+46709999999",
                 callee: "+46708888888"
               })

      assert call.duration == 0
    end
  end

  describe "count_phone_calls_today/1" do
    test "counts only today's calls for a user" do
      user = create_user!()

      {:ok, _} =
        Sales.create_phone_call(%{
          user_id: user.id,
          caller: "+46701111111",
          callee: "+46702222222",
          duration: 60
        })

      {:ok, _} =
        Sales.create_phone_call(%{
          user_id: user.id,
          caller: "+46701111111",
          callee: "+46703333333",
          duration: 120
        })

      assert {:ok, 2} = Sales.count_phone_calls_today(user.id)
    end

    test "returns 0 when no calls today" do
      user = create_user!()
      assert {:ok, 0} = Sales.count_phone_calls_today(user.id)
    end
  end
end
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && mix test test/saleflow/sales/phone_call_test.exs --trace`
Expected: FAIL — `create_phone_call` and `count_phone_calls_today` not defined

- [ ] **Step 3: Create the PhoneCall Ash resource**

```elixir
# backend/lib/saleflow/sales/phone_call.ex
defmodule Saleflow.Sales.PhoneCall do
  @moduledoc """
  PhoneCall resource for SaleFlow.

  Records actual phone calls received via Telavox webhook. Unlike CallLog
  (which records agent-logged outcomes), PhoneCall tracks verified calls
  from the PBX system.
  """

  use Ash.Resource,
    data_layer: AshPostgres.DataLayer,
    domain: Saleflow.Sales

  postgres do
    table "phone_calls"
    repo Saleflow.Repo
  end

  attributes do
    uuid_primary_key :id

    attribute :lead_id, :uuid do
      allow_nil? true
      public? true
    end

    attribute :user_id, :uuid do
      allow_nil? true
      public? true
    end

    attribute :caller, :string do
      allow_nil? false
      public? true
    end

    attribute :callee, :string do
      allow_nil? false
      public? true
    end

    attribute :duration, :integer do
      allow_nil? false
      default 0
      public? true
    end

    attribute :call_log_id, :uuid do
      allow_nil? true
      public? true
    end

    attribute :received_at, :utc_datetime_usec do
      allow_nil? false
      public? true
    end

    create_timestamp :inserted_at
  end

  actions do
    defaults [:read]

    create :create do
      description "Record a phone call from Telavox webhook"
      accept [:lead_id, :user_id, :caller, :callee, :duration, :call_log_id]

      change fn changeset, _context ->
        Ash.Changeset.force_change_attribute(changeset, :received_at, DateTime.utc_now())
      end
    end
  end
end
```

- [ ] **Step 4: Register PhoneCall in the Sales domain**

Add to `backend/lib/saleflow/sales/sales.ex` in the `resources do` block:

```elixir
resource Saleflow.Sales.PhoneCall
```

Add helper functions at the end of the module, before the final `end`:

```elixir
  # ---------------------------------------------------------------------------
  # PhoneCall functions
  # ---------------------------------------------------------------------------

  @doc """
  Records a phone call (from Telavox webhook).

  Required params: `:caller`, `:callee`
  Optional params: `:lead_id`, `:user_id`, `:duration`, `:call_log_id`
  """
  @spec create_phone_call(map()) :: {:ok, Saleflow.Sales.PhoneCall.t()} | {:error, Ash.Error.t()}
  def create_phone_call(params) do
    Saleflow.Sales.PhoneCall
    |> Ash.Changeset.for_create(:create, params)
    |> Ash.create()
  end

  @doc """
  Counts phone calls made by a user today.
  """
  @spec count_phone_calls_today(Ecto.UUID.t()) :: {:ok, integer()} | {:error, term()}
  def count_phone_calls_today(user_id) do
    query = """
    SELECT COUNT(*)
    FROM phone_calls
    WHERE user_id = $1
      AND received_at::date = CURRENT_DATE
    """

    case Repo.query(query, [Ecto.UUID.dump!(user_id)]) do
      {:ok, %{rows: [[count]]}} -> {:ok, count}
      {:error, error} -> {:error, error}
    end
  end
```

- [ ] **Step 5: Generate and run migration**

Run: `cd backend && mix ash_postgres.generate_migrations --name add_phone_calls`

Then verify the migration was created and add indexes manually if not present:

```elixir
create index(:phone_calls, [:callee])
create index(:phone_calls, [:user_id])
create index(:phone_calls, [:received_at])
```

Run: `cd backend && mix ecto.migrate`

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd backend && mix test test/saleflow/sales/phone_call_test.exs --trace`
Expected: All tests PASS

- [ ] **Step 7: Commit**

```bash
git add backend/lib/saleflow/sales/phone_call.ex backend/lib/saleflow/sales/sales.ex backend/test/saleflow/sales/phone_call_test.exs backend/priv/repo/migrations/*phone_calls*
git commit -m "feat: add PhoneCall resource for Telavox call tracking"
```

---

## Task 2: Goal Resource + Migration

**Files:**
- Create: `backend/lib/saleflow/sales/goal.ex`
- Modify: `backend/lib/saleflow/sales/sales.ex`
- Test: `backend/test/saleflow/sales/goal_test.exs`

- [ ] **Step 1: Write the Goal test**

```elixir
# backend/test/saleflow/sales/goal_test.exs
defmodule Saleflow.Sales.GoalTest do
  use Saleflow.DataCase, async: true

  alias Saleflow.Sales

  defp create_user!(role \\ :agent) do
    unique = System.unique_integer([:positive])

    {:ok, user} =
      Saleflow.Accounts.User
      |> Ash.Changeset.for_create(:register_with_password, %{
        email: "user#{unique}@test.se",
        name: "User #{unique}",
        role: role,
        password: "Password123!",
        password_confirmation: "Password123!"
      })
      |> Ash.create()

    user
  end

  describe "create_goal/1" do
    test "creates a global goal" do
      admin = create_user!(:admin)

      assert {:ok, goal} =
               Sales.create_goal(%{
                 scope: :global,
                 metric: :meetings_per_week,
                 target_value: 10,
                 set_by_id: admin.id,
                 period: :weekly
               })

      assert goal.scope == :global
      assert goal.metric == :meetings_per_week
      assert goal.target_value == 10
      assert goal.active == true
      assert is_nil(goal.user_id)
    end

    test "creates a personal goal for an agent" do
      agent = create_user!(:agent)

      assert {:ok, goal} =
               Sales.create_goal(%{
                 scope: :personal,
                 metric: :calls_per_day,
                 target_value: 40,
                 user_id: agent.id,
                 set_by_id: agent.id,
                 period: :daily
               })

      assert goal.scope == :personal
      assert goal.user_id == agent.id
      assert goal.set_by_id == agent.id
    end

    test "creates an admin-set goal for a specific agent" do
      admin = create_user!(:admin)
      agent = create_user!(:agent)

      assert {:ok, goal} =
               Sales.create_goal(%{
                 scope: :personal,
                 metric: :meetings_per_week,
                 target_value: 15,
                 user_id: agent.id,
                 set_by_id: admin.id,
                 period: :weekly
               })

      assert goal.user_id == agent.id
      assert goal.set_by_id == admin.id
    end
  end

  describe "list_active_goals/1" do
    test "returns active goals for a user respecting priority" do
      admin = create_user!(:admin)
      agent = create_user!(:agent)

      {:ok, _global} =
        Sales.create_goal(%{
          scope: :global,
          metric: :meetings_per_week,
          target_value: 10,
          set_by_id: admin.id,
          period: :weekly
        })

      {:ok, _personal} =
        Sales.create_goal(%{
          scope: :personal,
          metric: :meetings_per_week,
          target_value: 15,
          user_id: agent.id,
          set_by_id: admin.id,
          period: :weekly
        })

      assert {:ok, goals} = Sales.list_active_goals(agent.id)
      # Personal goal should override global for same metric
      meeting_goals = Enum.filter(goals, &(&1.metric == :meetings_per_week))
      assert length(meeting_goals) == 1
      assert hd(meeting_goals).target_value == 15
    end
  end

  describe "deactivate_goal/1" do
    test "sets active to false" do
      admin = create_user!(:admin)

      {:ok, goal} =
        Sales.create_goal(%{
          scope: :global,
          metric: :meetings_per_week,
          target_value: 10,
          set_by_id: admin.id,
          period: :weekly
        })

      assert {:ok, updated} = Sales.deactivate_goal(goal)
      assert updated.active == false
    end
  end
end
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && mix test test/saleflow/sales/goal_test.exs --trace`
Expected: FAIL — `create_goal`, `list_active_goals`, `deactivate_goal` not defined

- [ ] **Step 3: Create the Goal Ash resource**

```elixir
# backend/lib/saleflow/sales/goal.ex
defmodule Saleflow.Sales.Goal do
  @moduledoc """
  Goal resource for SaleFlow.

  Represents a performance target that can be global (all agents),
  or personal (set by admin for a specific agent, or self-set by agent).

  Priority when displaying: admin-set personal > self-set personal > global.
  """

  use Ash.Resource,
    data_layer: AshPostgres.DataLayer,
    domain: Saleflow.Sales

  postgres do
    table "goals"
    repo Saleflow.Repo
  end

  attributes do
    uuid_primary_key :id

    attribute :scope, :atom do
      constraints one_of: [:global, :team, :personal]
      allow_nil? false
      public? true
    end

    attribute :metric, :atom do
      constraints one_of: [:meetings_per_week, :calls_per_day]
      allow_nil? false
      public? true
    end

    attribute :target_value, :integer do
      allow_nil? false
      public? true
    end

    attribute :user_id, :uuid do
      allow_nil? true
      public? true
    end

    attribute :set_by_id, :uuid do
      allow_nil? false
      public? true
    end

    attribute :active, :boolean do
      default true
      allow_nil? false
      public? true
    end

    attribute :period, :atom do
      constraints one_of: [:daily, :weekly]
      allow_nil? false
      public? true
    end

    create_timestamp :inserted_at
    update_timestamp :updated_at
  end

  actions do
    defaults [:read]

    create :create do
      description "Create a new goal"
      accept [:scope, :metric, :target_value, :user_id, :set_by_id, :period]
    end

    update :update do
      description "Update goal target value"
      require_atomic? false
      accept [:target_value, :active]
    end

    update :deactivate do
      description "Soft-delete a goal"
      require_atomic? false

      change fn changeset, _context ->
        Ash.Changeset.force_change_attribute(changeset, :active, false)
      end
    end
  end
end
```

- [ ] **Step 4: Register Goal in Sales domain and add helper functions**

Add to `backend/lib/saleflow/sales/sales.ex` in the `resources do` block:

```elixir
resource Saleflow.Sales.Goal
```

Add helper functions:

```elixir
  # ---------------------------------------------------------------------------
  # Goal functions
  # ---------------------------------------------------------------------------

  @doc """
  Creates a new goal.

  Required params: `:scope`, `:metric`, `:target_value`, `:set_by_id`, `:period`
  Optional params: `:user_id` (required for personal scope)
  """
  @spec create_goal(map()) :: {:ok, Saleflow.Sales.Goal.t()} | {:error, Ash.Error.t()}
  def create_goal(params) do
    Saleflow.Sales.Goal
    |> Ash.Changeset.for_create(:create, params)
    |> Ash.create()
  end

  @doc """
  Returns the effective active goals for a user. For each metric, returns the
  highest-priority goal: personal (admin-set) > personal (self-set) > global.
  """
  @spec list_active_goals(Ecto.UUID.t()) :: {:ok, list(Saleflow.Sales.Goal.t())} | {:error, Ash.Error.t()}
  def list_active_goals(user_id) do
    require Ash.Query

    {:ok, all_goals} =
      Saleflow.Sales.Goal
      |> Ash.Query.filter(active == true)
      |> Ash.Query.filter(is_nil(user_id) or user_id == ^user_id)
      |> Ash.read()

    # Group by metric, pick highest priority per metric
    effective =
      all_goals
      |> Enum.group_by(& &1.metric)
      |> Enum.map(fn {_metric, goals} ->
        goals
        |> Enum.sort_by(fn g ->
          cond do
            g.scope == :personal and g.user_id != nil and g.set_by_id != g.user_id -> 0
            g.scope == :personal and g.user_id != nil and g.set_by_id == g.user_id -> 1
            g.scope == :global -> 2
            true -> 3
          end
        end)
        |> hd()
      end)

    {:ok, effective}
  end

  @doc """
  Updates a goal's target value.
  """
  @spec update_goal(Saleflow.Sales.Goal.t(), map()) ::
          {:ok, Saleflow.Sales.Goal.t()} | {:error, Ash.Error.t()}
  def update_goal(goal, params) do
    goal
    |> Ash.Changeset.for_update(:update, params)
    |> Ash.update()
  end

  @doc """
  Soft-deletes a goal by setting active to false.
  """
  @spec deactivate_goal(Saleflow.Sales.Goal.t()) ::
          {:ok, Saleflow.Sales.Goal.t()} | {:error, Ash.Error.t()}
  def deactivate_goal(goal) do
    goal
    |> Ash.Changeset.for_update(:deactivate, %{})
    |> Ash.update()
  end
```

- [ ] **Step 5: Generate and run migration**

Run: `cd backend && mix ash_postgres.generate_migrations --name add_goals`
Run: `cd backend && mix ecto.migrate`

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd backend && mix test test/saleflow/sales/goal_test.exs --trace`
Expected: All tests PASS

- [ ] **Step 7: Commit**

```bash
git add backend/lib/saleflow/sales/goal.ex backend/lib/saleflow/sales/sales.ex backend/test/saleflow/sales/goal_test.exs backend/priv/repo/migrations/*goals*
git commit -m "feat: add Goal resource with priority-based resolution"
```

---

## Task 3: Add phone_number to User

**Files:**
- Modify: `backend/lib/saleflow/accounts/user.ex`
- Modify: `backend/lib/saleflow_web/controllers/admin_controller.ex` (user serialization)

- [ ] **Step 1: Add phone_number attribute to User resource**

In `backend/lib/saleflow/accounts/user.ex`, add inside the `attributes do` block, after the `role` attribute:

```elixir
    attribute :phone_number, :string do
      allow_nil? true
      public? true
    end
```

Also add `phone_number` to the `accept` list in the `update_user` action:

```elixir
    update :update_user do
      description "Update user name, role, or phone number"
      accept [:name, :role, :phone_number]
    end
```

- [ ] **Step 2: Generate and run migration**

Run: `cd backend && mix ash_postgres.generate_migrations --name add_user_phone_number`

Verify the migration adds:
```elixir
alter table(:users) do
  add :phone_number, :text
end

create unique_index(:users, [:phone_number], name: "users_phone_number_index")
```

If the unique index isn't auto-generated, add it manually. Then add an identity in user.ex:

```elixir
  identities do
    identity :unique_email, [:email]
    identity :unique_phone_number, [:phone_number]
  end
```

Run: `cd backend && mix ecto.migrate`

- [ ] **Step 3: Run existing tests to verify nothing broke**

Run: `cd backend && mix test --trace`
Expected: All existing tests PASS

- [ ] **Step 4: Commit**

```bash
git add backend/lib/saleflow/accounts/user.ex backend/priv/repo/migrations/*phone_number*
git commit -m "feat: add phone_number field to User for Telavox matching"
```

---

## Task 4: Telavox Webhook Endpoint

**Files:**
- Create: `backend/lib/saleflow_web/plugs/verify_telavox.ex`
- Create: `backend/lib/saleflow_web/controllers/webhook_controller.ex`
- Modify: `backend/lib/saleflow_web/router.ex`
- Test: `backend/test/saleflow_web/controllers/webhook_controller_test.exs`

- [ ] **Step 1: Write the webhook controller test**

```elixir
# backend/test/saleflow_web/controllers/webhook_controller_test.exs
defmodule SaleflowWeb.WebhookControllerTest do
  use SaleflowWeb.ConnCase, async: true

  alias Saleflow.Sales

  defp create_lead!(telefon) do
    unique = System.unique_integer([:positive])
    {:ok, lead} = Sales.create_lead(%{företag: "Test AB #{unique}", telefon: telefon})
    lead
  end

  defp create_user_with_phone!(phone) do
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

    {:ok, user} =
      user
      |> Ash.Changeset.for_update(:update_user, %{phone_number: phone})
      |> Ash.update()

    user
  end

  describe "POST /api/webhooks/telavox/hangup" do
    test "creates a PhoneCall and matches lead + agent" do
      lead = create_lead!("+46812345678")
      user = create_user_with_phone!("+46701111111")

      conn =
        build_conn()
        |> put_req_header("content-type", "application/json")
        |> put_req_header("x-telavox-secret", Application.get_env(:saleflow, :telavox_webhook_secret, "test-secret"))
        |> post("/api/webhooks/telavox/hangup", %{
          "caller" => "+46701111111",
          "callee" => "+46812345678",
          "duration" => 145
        })

      assert json_response(conn, 200)["ok"] == true

      # Verify PhoneCall was created with correct associations
      {:ok, %{rows: rows}} = Saleflow.Repo.query("SELECT lead_id, user_id, duration FROM phone_calls LIMIT 1")
      assert length(rows) == 1
    end

    test "creates a PhoneCall even when lead/agent not matched" do
      conn =
        build_conn()
        |> put_req_header("content-type", "application/json")
        |> put_req_header("x-telavox-secret", Application.get_env(:saleflow, :telavox_webhook_secret, "test-secret"))
        |> post("/api/webhooks/telavox/hangup", %{
          "caller" => "+46709999999",
          "callee" => "+46708888888",
          "duration" => 30
        })

      assert json_response(conn, 200)["ok"] == true
    end

    test "rejects request without valid secret" do
      conn =
        build_conn()
        |> put_req_header("content-type", "application/json")
        |> post("/api/webhooks/telavox/hangup", %{
          "caller" => "+46709999999",
          "callee" => "+46708888888",
          "duration" => 30
        })

      assert json_response(conn, 401)["error"]
    end
  end
end
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && mix test test/saleflow_web/controllers/webhook_controller_test.exs --trace`
Expected: FAIL — route not found

- [ ] **Step 3: Create the VerifyTelavox plug**

```elixir
# backend/lib/saleflow_web/plugs/verify_telavox.ex
defmodule SaleflowWeb.Plugs.VerifyTelavox do
  @moduledoc """
  Verifies Telavox webhook requests via a shared secret header.
  """

  import Plug.Conn

  def init(opts), do: opts

  def call(conn, _opts) do
    expected = Application.get_env(:saleflow, :telavox_webhook_secret, "")
    provided = get_req_header(conn, "x-telavox-secret") |> List.first()

    if expected != "" and provided == expected do
      conn
    else
      conn
      |> put_status(401)
      |> Phoenix.Controller.json(%{error: "Unauthorized"})
      |> halt()
    end
  end
end
```

- [ ] **Step 4: Create the WebhookController**

```elixir
# backend/lib/saleflow_web/controllers/webhook_controller.ex
defmodule SaleflowWeb.WebhookController do
  use SaleflowWeb, :controller

  alias Saleflow.Sales
  alias Saleflow.Repo

  @doc """
  Receives Telavox hangup webhook. Matches caller/callee to agent/lead
  and creates a PhoneCall record.
  """
  def telavox_hangup(conn, params) do
    caller = Map.get(params, "caller", "")
    callee = Map.get(params, "callee", "")
    duration = Map.get(params, "duration", 0)

    # Match callee to lead by phone number
    lead_id = find_lead_by_phone(callee)

    # Match caller to agent by phone number
    user_id = find_user_by_phone(caller)

    case Sales.create_phone_call(%{
           caller: caller,
           callee: callee,
           duration: duration,
           lead_id: lead_id,
           user_id: user_id
         }) do
      {:ok, _phone_call} ->
        json(conn, %{ok: true})

      {:error, _error} ->
        conn
        |> put_status(422)
        |> json(%{error: "Failed to create phone call record"})
    end
  end

  defp find_lead_by_phone(phone) when phone == "" or is_nil(phone), do: nil

  defp find_lead_by_phone(phone) do
    case Repo.query("SELECT id FROM leads WHERE telefon = $1 LIMIT 1", [phone]) do
      {:ok, %{rows: [[id]]}} -> Sales.decode_uuid(id)
      _ -> nil
    end
  end

  defp find_user_by_phone(phone) when phone == "" or is_nil(phone), do: nil

  defp find_user_by_phone(phone) do
    case Repo.query("SELECT id FROM users WHERE phone_number = $1 LIMIT 1", [phone]) do
      {:ok, %{rows: [[id]]}} -> Sales.decode_uuid(id)
      _ -> nil
    end
  end
end
```

- [ ] **Step 5: Add webhook route to router**

In `backend/lib/saleflow_web/router.ex`, add a new scope **before** the public `/api` scope:

```elixir
  # Telavox webhook (no session auth, uses shared secret)
  scope "/api/webhooks", SaleflowWeb do
    pipe_through :api
    plug SaleflowWeb.Plugs.VerifyTelavox

    post "/telavox/hangup", WebhookController, :telavox_hangup
  end
```

**Note:** If Phoenix doesn't allow `plug` inside `scope`, instead create a pipeline:

```elixir
  pipeline :verify_telavox do
    plug SaleflowWeb.Plugs.VerifyTelavox
  end

  scope "/api/webhooks", SaleflowWeb do
    pipe_through [:api, :verify_telavox]

    post "/telavox/hangup", WebhookController, :telavox_hangup
  end
```

- [ ] **Step 6: Add telavox_webhook_secret to config**

In `backend/config/config.exs` or `backend/config/runtime.exs`, add:

```elixir
config :saleflow, telavox_webhook_secret: System.get_env("TELAVOX_WEBHOOK_SECRET") || ""
```

For test config in `backend/config/test.exs`:

```elixir
config :saleflow, telavox_webhook_secret: "test-secret"
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd backend && mix test test/saleflow_web/controllers/webhook_controller_test.exs --trace`
Expected: All tests PASS

- [ ] **Step 8: Commit**

```bash
git add backend/lib/saleflow_web/plugs/verify_telavox.ex backend/lib/saleflow_web/controllers/webhook_controller.ex backend/lib/saleflow_web/router.ex backend/config/ backend/test/saleflow_web/controllers/webhook_controller_test.exs
git commit -m "feat: add Telavox webhook endpoint for call tracking"
```

---

## Task 5: Goal CRUD Controller

**Files:**
- Create: `backend/lib/saleflow_web/controllers/goal_controller.ex`
- Modify: `backend/lib/saleflow_web/router.ex`
- Test: `backend/test/saleflow_web/controllers/goal_controller_test.exs`

- [ ] **Step 1: Write the goal controller test**

```elixir
# backend/test/saleflow_web/controllers/goal_controller_test.exs
defmodule SaleflowWeb.GoalControllerTest do
  use SaleflowWeb.ConnCase, async: true

  alias Saleflow.Sales

  defp create_user!(role \\ :agent) do
    unique = System.unique_integer([:positive])

    {:ok, user} =
      Saleflow.Accounts.User
      |> Ash.Changeset.for_create(:register_with_password, %{
        email: "user#{unique}@test.se",
        name: "User #{unique}",
        role: role,
        password: "Password123!",
        password_confirmation: "Password123!"
      })
      |> Ash.create()

    user
  end

  defp auth_conn(conn, user) do
    # Use the test auth helper to set current_user
    conn
    |> Plug.Conn.assign(:current_user, user)
  end

  describe "GET /api/goals" do
    test "returns active goals for the current user" do
      admin = create_user!(:admin)
      agent = create_user!(:agent)

      {:ok, _goal} =
        Sales.create_goal(%{
          scope: :global,
          metric: :meetings_per_week,
          target_value: 10,
          set_by_id: admin.id,
          period: :weekly
        })

      conn =
        build_conn()
        |> auth_conn(agent)
        |> get("/api/goals")

      assert %{"goals" => goals} = json_response(conn, 200)
      assert length(goals) == 1
      assert hd(goals)["target_value"] == 10
    end
  end

  describe "POST /api/goals" do
    test "agent can create personal goal" do
      agent = create_user!(:agent)

      conn =
        build_conn()
        |> auth_conn(agent)
        |> post("/api/goals", %{
          "scope" => "personal",
          "metric" => "calls_per_day",
          "target_value" => 40,
          "period" => "daily"
        })

      assert %{"goal" => goal} = json_response(conn, 201)
      assert goal["scope"] == "personal"
      assert goal["user_id"] == agent.id
    end

    test "admin can create global goal" do
      admin = create_user!(:admin)

      conn =
        build_conn()
        |> auth_conn(admin)
        |> post("/api/goals", %{
          "scope" => "global",
          "metric" => "meetings_per_week",
          "target_value" => 15,
          "period" => "weekly"
        })

      assert %{"goal" => goal} = json_response(conn, 201)
      assert goal["scope"] == "global"
    end

    test "agent cannot create global goal" do
      agent = create_user!(:agent)

      conn =
        build_conn()
        |> auth_conn(agent)
        |> post("/api/goals", %{
          "scope" => "global",
          "metric" => "meetings_per_week",
          "target_value" => 15,
          "period" => "weekly"
        })

      assert json_response(conn, 403)
    end
  end

  describe "DELETE /api/goals/:id" do
    test "deactivates a goal" do
      admin = create_user!(:admin)

      {:ok, goal} =
        Sales.create_goal(%{
          scope: :global,
          metric: :meetings_per_week,
          target_value: 10,
          set_by_id: admin.id,
          period: :weekly
        })

      conn =
        build_conn()
        |> auth_conn(admin)
        |> delete("/api/goals/#{goal.id}")

      assert json_response(conn, 200)["ok"] == true
    end
  end
end
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && mix test test/saleflow_web/controllers/goal_controller_test.exs --trace`
Expected: FAIL — routes not found

- [ ] **Step 3: Create the GoalController**

```elixir
# backend/lib/saleflow_web/controllers/goal_controller.ex
defmodule SaleflowWeb.GoalController do
  use SaleflowWeb, :controller

  alias Saleflow.Sales

  def index(conn, _params) do
    user = conn.assigns.current_user

    case Sales.list_active_goals(user.id) do
      {:ok, goals} ->
        json(conn, %{goals: Enum.map(goals, &serialize_goal/1)})

      {:error, _} ->
        json(conn, %{goals: []})
    end
  end

  def create(conn, params) do
    user = conn.assigns.current_user
    scope = String.to_existing_atom(params["scope"] || "personal")

    # Agents can only create personal goals
    if user.role != :admin and scope != :personal do
      conn
      |> put_status(403)
      |> json(%{error: "Agents can only create personal goals"})
    else
      goal_params = %{
        scope: scope,
        metric: String.to_existing_atom(params["metric"]),
        target_value: params["target_value"],
        user_id: if(scope == :personal, do: params["user_id"] || user.id, else: nil),
        set_by_id: user.id,
        period: String.to_existing_atom(params["period"])
      }

      case Sales.create_goal(goal_params) do
        {:ok, goal} ->
          conn
          |> put_status(201)
          |> json(%{goal: serialize_goal(goal)})

        {:error, error} ->
          conn
          |> put_status(422)
          |> json(%{error: inspect(error)})
      end
    end
  end

  def update(conn, %{"id" => id} = params) do
    user = conn.assigns.current_user

    with {:ok, goal} <- Ash.get(Saleflow.Sales.Goal, id),
         true <- can_manage?(user, goal),
         {:ok, updated} <- Sales.update_goal(goal, %{target_value: params["target_value"]}) do
      json(conn, %{goal: serialize_goal(updated)})
    else
      false ->
        conn |> put_status(403) |> json(%{error: "Forbidden"})

      {:error, error} ->
        conn |> put_status(422) |> json(%{error: inspect(error)})
    end
  end

  def delete(conn, %{"id" => id}) do
    user = conn.assigns.current_user

    with {:ok, goal} <- Ash.get(Saleflow.Sales.Goal, id),
         true <- can_manage?(user, goal),
         {:ok, _} <- Sales.deactivate_goal(goal) do
      json(conn, %{ok: true})
    else
      false ->
        conn |> put_status(403) |> json(%{error: "Forbidden"})

      {:error, error} ->
        conn |> put_status(422) |> json(%{error: inspect(error)})
    end
  end

  defp can_manage?(user, goal) do
    user.role == :admin or goal.set_by_id == user.id
  end

  defp serialize_goal(goal) do
    %{
      id: goal.id,
      scope: goal.scope,
      metric: goal.metric,
      target_value: goal.target_value,
      user_id: goal.user_id,
      set_by_id: goal.set_by_id,
      active: goal.active,
      period: goal.period,
      inserted_at: goal.inserted_at,
      updated_at: goal.updated_at
    }
  end
end
```

- [ ] **Step 4: Add goal routes to router**

In `backend/lib/saleflow_web/router.ex`, add to the authenticated scope:

```elixir
    get "/goals", GoalController, :index
    post "/goals", GoalController, :create
    patch "/goals/:id", GoalController, :update
    delete "/goals/:id", GoalController, :delete
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && mix test test/saleflow_web/controllers/goal_controller_test.exs --trace`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add backend/lib/saleflow_web/controllers/goal_controller.ex backend/lib/saleflow_web/router.ex backend/test/saleflow_web/controllers/goal_controller_test.exs
git commit -m "feat: add Goal CRUD endpoints with role-based access"
```

---

## Task 6: Dashboard Conversion KPI + PhoneCall-based Stats

**Files:**
- Modify: `backend/lib/saleflow_web/controllers/dashboard_controller.ex`

- [ ] **Step 1: Update dashboard controller to include conversion and use PhoneCall counts**

In `backend/lib/saleflow_web/controllers/dashboard_controller.ex`, update the `index` function. Replace the `my_stats` line and add conversion:

```elixir
  def index(conn, _params) do
    user = conn.assigns.current_user
    today = Date.utc_today()

    # 1. Lead stats
    stats = compute_lead_stats()

    # 2. Today's meetings
    {:ok, meetings} =
      case user.role do
        :admin -> Sales.list_all_meetings()
        _ -> Sales.list_all_meetings_for_user(user.id)
      end

    todays_meetings =
      meetings
      |> Enum.filter(fn m -> m.meeting_date == today and m.status == :scheduled end)
      |> enrich_meetings()

    # 3. Callbacks
    callbacks = compute_callbacks(user)

    # 4. My stats (now using PhoneCall for call counts)
    my_stats = compute_my_stats_v2(user)

    # 5. Conversion KPI
    conversion = compute_conversion(user)

    # 6. Goal progress
    goal_progress = compute_goal_progress(user)

    json(conn, %{
      stats: stats,
      todays_meetings: todays_meetings,
      callbacks: callbacks,
      my_stats: my_stats,
      conversion: conversion,
      goal_progress: goal_progress
    })
  end
```

Add the new private helpers:

```elixir
  defp compute_my_stats_v2(user) do
    user_id_binary = Ecto.UUID.dump!(user.id)

    query =
      case user.role do
        :admin ->
          """
          SELECT
            (SELECT COUNT(*) FROM phone_calls WHERE received_at::date = CURRENT_DATE) as calls_today,
            (SELECT COUNT(*) FROM phone_calls) as total_calls,
            (SELECT COUNT(*) FROM meetings WHERE inserted_at::date = CURRENT_DATE AND status != 'cancelled') as meetings_today,
            (SELECT COUNT(*) FROM meetings WHERE status != 'cancelled') as total_meetings
          """

        _ ->
          """
          SELECT
            (SELECT COUNT(*) FROM phone_calls WHERE user_id = $1 AND received_at::date = CURRENT_DATE) as calls_today,
            (SELECT COUNT(*) FROM phone_calls WHERE user_id = $1) as total_calls,
            (SELECT COUNT(*) FROM meetings WHERE user_id = $1 AND inserted_at::date = CURRENT_DATE AND status != 'cancelled') as meetings_today,
            (SELECT COUNT(*) FROM meetings WHERE user_id = $1 AND status != 'cancelled') as total_meetings
          """
      end

    params = if user.role == :admin, do: [], else: [user_id_binary]

    case Repo.query(query, params) do
      {:ok, %{rows: [[calls_today, total_calls, meetings_today, total_meetings]]}} ->
        %{
          calls_today: calls_today,
          total_calls: total_calls,
          meetings_today: meetings_today,
          total_meetings: total_meetings
        }

      _ ->
        %{calls_today: 0, total_calls: 0, meetings_today: 0, total_meetings: 0}
    end
  end

  defp compute_conversion(user) do
    user_id_binary = Ecto.UUID.dump!(user.id)

    query =
      case user.role do
        :admin ->
          """
          SELECT
            (SELECT COUNT(*) FROM phone_calls WHERE received_at::date = CURRENT_DATE) as calls_today,
            (SELECT COUNT(*) FROM meetings WHERE inserted_at::date = CURRENT_DATE AND status != 'cancelled') as meetings_today
          """

        _ ->
          """
          SELECT
            (SELECT COUNT(*) FROM phone_calls WHERE user_id = $1 AND received_at::date = CURRENT_DATE) as calls_today,
            (SELECT COUNT(*) FROM meetings WHERE user_id = $1 AND inserted_at::date = CURRENT_DATE AND status != 'cancelled') as meetings_today
          """
      end

    params = if user.role == :admin, do: [], else: [user_id_binary]

    case Repo.query(query, params) do
      {:ok, %{rows: [[calls, meetings]]}} ->
        rate = if calls > 0, do: Float.round(meetings / calls * 100, 1), else: 0.0
        %{calls_today: calls, meetings_today: meetings, rate: rate}

      _ ->
        %{calls_today: 0, meetings_today: 0, rate: 0.0}
    end
  end

  defp compute_goal_progress(user) do
    case Sales.list_active_goals(user.id) do
      {:ok, goals} ->
        Enum.map(goals, fn goal ->
          current = compute_current_value(user, goal)

          %{
            id: goal.id,
            metric: goal.metric,
            period: goal.period,
            target_value: goal.target_value,
            current_value: current,
            scope: goal.scope
          }
        end)

      _ ->
        []
    end
  end

  defp compute_current_value(user, goal) do
    user_id_binary = Ecto.UUID.dump!(user.id)

    case {goal.metric, goal.period} do
      {:calls_per_day, :daily} ->
        case Repo.query(
               "SELECT COUNT(*) FROM phone_calls WHERE user_id = $1 AND received_at::date = CURRENT_DATE",
               [user_id_binary]
             ) do
          {:ok, %{rows: [[count]]}} -> count
          _ -> 0
        end

      {:meetings_per_week, :weekly} ->
        case Repo.query(
               "SELECT COUNT(*) FROM meetings WHERE user_id = $1 AND status != 'cancelled' AND date_trunc('week', inserted_at) = date_trunc('week', CURRENT_DATE)",
               [user_id_binary]
             ) do
          {:ok, %{rows: [[count]]}} -> count
          _ -> 0
        end

      _ ->
        0
    end
  end
```

- [ ] **Step 2: Update leaderboard to use PhoneCall counts**

Replace the leaderboard SQL query:

```elixir
  def leaderboard(conn, _params) do
    query = """
    SELECT u.id, u.name,
      COALESCE(c.calls_today, 0) as calls_today,
      COALESCE(m.booked_today, 0) as meetings_booked_today,
      COALESCE(m.cancelled_today, 0) as meetings_cancelled_today,
      COALESCE(m.booked_today, 0) - COALESCE(m.cancelled_today, 0) as net_meetings_today
    FROM users u
    LEFT JOIN (
      SELECT user_id, COUNT(*) as calls_today
      FROM phone_calls
      WHERE received_at::date = CURRENT_DATE
      GROUP BY user_id
    ) c ON c.user_id = u.id
    LEFT JOIN (
      SELECT user_id,
        COUNT(*) FILTER (WHERE status = 'scheduled' OR status = 'completed') as booked_today,
        COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled_today
      FROM meetings
      WHERE inserted_at::date = CURRENT_DATE
      GROUP BY user_id
    ) m ON m.user_id = u.id
    WHERE u.role = 'agent' OR (c.calls_today > 0 OR m.booked_today > 0)
    ORDER BY COALESCE(m.booked_today, 0) - COALESCE(m.cancelled_today, 0) DESC,
             COALESCE(c.calls_today, 0) DESC
    """

    {:ok, %{rows: rows, columns: _cols}} = Repo.query(query)

    entries =
      Enum.map(rows, fn [id, name, calls_today, meetings_booked_today, meetings_cancelled_today, net_meetings_today] ->
        %{
          user_id: Ecto.UUID.cast!(id),
          name: name,
          calls_today: calls_today,
          meetings_booked_today: meetings_booked_today,
          meetings_cancelled_today: meetings_cancelled_today,
          net_meetings_today: net_meetings_today
        }
      end)

    json(conn, %{leaderboard: entries})
  end
```

- [ ] **Step 3: Run all backend tests**

Run: `cd backend && mix test --trace`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add backend/lib/saleflow_web/controllers/dashboard_controller.ex
git commit -m "feat: add conversion KPI, goal progress, switch to PhoneCall-based stats"
```

---

## Task 7: Frontend Types + API Hooks

**Files:**
- Modify: `frontend/src/api/types.ts`
- Modify: `frontend/src/api/dashboard.ts`
- Create: `frontend/src/api/goals.ts`

- [ ] **Step 1: Update TypeScript types**

Add to `frontend/src/api/types.ts`:

```typescript
export type GoalScope = "global" | "team" | "personal";
export type GoalMetric = "meetings_per_week" | "calls_per_day";
export type GoalPeriod = "daily" | "weekly";

export interface Goal {
  id: string;
  scope: GoalScope;
  metric: GoalMetric;
  target_value: number;
  user_id: string | null;
  set_by_id: string;
  active: boolean;
  period: GoalPeriod;
  inserted_at: string;
  updated_at: string;
}

export interface GoalProgress {
  id: string;
  metric: GoalMetric;
  period: GoalPeriod;
  target_value: number;
  current_value: number;
  scope: GoalScope;
}

export interface ConversionData {
  calls_today: number;
  meetings_today: number;
  rate: number;
}
```

Update the `DashboardData` interface:

```typescript
export interface DashboardData {
  stats: Stats;
  todays_meetings: Meeting[];
  callbacks: Lead[];
  my_stats: MyStats;
  conversion: ConversionData;
  goal_progress: GoalProgress[];
}
```

- [ ] **Step 2: Create goals API hook**

```typescript
// frontend/src/api/goals.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import type { Goal } from "./types";

export function useGoals() {
  return useQuery<Goal[]>({
    queryKey: ["goals"],
    queryFn: async () => {
      const data = await api<{ goals: Goal[] }>("/api/goals");
      return data.goals;
    },
  });
}

export function useCreateGoal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      scope: string;
      metric: string;
      target_value: number;
      period: string;
      user_id?: string;
    }) => {
      return api<{ goal: Goal }>("/api/goals", {
        method: "POST",
        body: JSON.stringify(params),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["goals"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useDeleteGoal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (goalId: string) => {
      return api<{ ok: boolean }>(`/api/goals/${goalId}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["goals"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/api/types.ts frontend/src/api/dashboard.ts frontend/src/api/goals.ts
git commit -m "feat: add Goal types and API hooks, update DashboardData type"
```

---

## Task 8: shadcn Progress Component

**Files:**
- Create: `frontend/src/components/ui/progress.tsx`

- [ ] **Step 1: Create the Progress component**

```typescript
// frontend/src/components/ui/progress.tsx
import { type HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export interface ProgressProps extends HTMLAttributes<HTMLDivElement> {
  value: number;
  max?: number;
  variant?: "indigo" | "green";
}

export function Progress({
  value,
  max = 100,
  variant = "indigo",
  className,
  ...props
}: ProgressProps) {
  const percentage = Math.min((value / max) * 100, 100);
  const isComplete = value >= max;
  const effectiveVariant = isComplete ? "green" : variant;

  const gradients = {
    indigo: "bg-gradient-to-r from-indigo-500 to-indigo-400",
    green: "bg-gradient-to-r from-emerald-500 to-emerald-400",
  };

  return (
    <div
      className={cn("h-2 w-full rounded-full bg-slate-100", className)}
      {...props}
    >
      <div
        className={cn(
          "h-full rounded-full transition-all duration-500",
          gradients[effectiveVariant],
        )}
        style={{ width: `${percentage}%` }}
      />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/ui/progress.tsx
git commit -m "feat: add shadcn-style Progress component with gradient variants"
```

---

## Task 9: GoalProgress Component

**Files:**
- Create: `frontend/src/components/goal-progress.tsx`

- [ ] **Step 1: Create the GoalProgress component**

```typescript
// frontend/src/components/goal-progress.tsx
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { GoalProgress as GoalProgressType } from "@/api/types";

interface GoalProgressProps {
  goals: GoalProgressType[];
}

const METRIC_LABELS: Record<string, string> = {
  meetings_per_week: "Möten denna vecka",
  calls_per_day: "Samtal per dag",
};

function getWeekInfo(): string {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const diff = now.getTime() - start.getTime();
  const oneWeek = 604800000;
  const weekNum = Math.ceil((diff / oneWeek + start.getDay() + 1) / 7);
  const dayOfWeek = now.getDay() === 0 ? 7 : now.getDay();
  return `v.${weekNum} · ${dayOfWeek} av 7 dagar`;
}

export function GoalProgress({ goals }: GoalProgressProps) {
  if (goals.length === 0) return null;

  return (
    <Card className="!rounded-[14px] !border-0 !shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      <div className="flex items-center justify-between mb-4">
        <span className="text-[13px] font-semibold text-slate-900">
          Veckans mål
        </span>
        <span className="text-[11px] text-slate-400">{getWeekInfo()}</span>
      </div>
      <div className="space-y-3.5">
        {goals.map((goal) => {
          const isComplete = goal.current_value >= goal.target_value;

          return (
            <div key={goal.id}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[13px] text-slate-700">
                  {METRIC_LABELS[goal.metric] ?? goal.metric}
                </span>
                <span className="text-[13px] text-slate-900 font-medium">
                  {goal.current_value}{" "}
                  <span className="text-slate-400 font-normal">
                    / {goal.target_value}
                  </span>
                  {isComplete && (
                    <span className="text-emerald-500 ml-1">✓</span>
                  )}
                </span>
              </div>
              <Progress value={goal.current_value} max={goal.target_value} />
            </div>
          );
        })}
      </div>
    </Card>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/goal-progress.tsx
git commit -m "feat: add GoalProgress component with progress bars"
```

---

## Task 10: Restyle StatCard + Leaderboard

**Files:**
- Modify: `frontend/src/components/stat-card.tsx`
- Modify: `frontend/src/components/leaderboard.tsx`

- [ ] **Step 1: Restyle StatCard to Clean & Minimal**

Replace `frontend/src/components/stat-card.tsx`:

```typescript
import { memo } from "react";
import { cn } from "@/lib/cn";

interface StatCardProps {
  label: string;
  value: number | string;
  suffix?: string;
  className?: string;
}

export const StatCard = memo(function StatCard({
  label,
  value,
  suffix,
  className,
}: StatCardProps) {
  return (
    <div
      className={cn(
        "rounded-[14px] bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]",
        className,
      )}
    >
      <p className="text-[11px] font-medium uppercase tracking-[1px] text-slate-400">
        {label}
      </p>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="text-[40px] font-light leading-none tracking-[-2px] text-slate-900">
          {value}
        </span>
        {suffix && (
          <span className="text-lg font-light text-slate-400">{suffix}</span>
        )}
      </div>
    </div>
  );
});
```

- [ ] **Step 2: Restyle Leaderboard to Clean & Minimal**

Replace `frontend/src/components/leaderboard.tsx`:

```typescript
import { Card } from "@/components/ui/card";
import type { LeaderboardEntry } from "@/api/dashboard";

interface LeaderboardProps {
  entries: LeaderboardEntry[];
  currentUserId?: string;
}

export function Leaderboard({ entries, currentUserId }: LeaderboardProps) {
  if (entries.length === 0) {
    return (
      <Card className="!rounded-[14px] !border-0 !shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div className="flex items-center justify-between mb-4">
          <span className="text-[13px] font-semibold text-slate-900">
            Leaderboard
          </span>
        </div>
        <p className="text-sm text-slate-400">Ingen aktivitet ännu idag</p>
      </Card>
    );
  }

  return (
    <Card className="!rounded-[14px] !border-0 !shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      <div className="flex items-center justify-between mb-4">
        <span className="text-[13px] font-semibold text-slate-900">
          Leaderboard
        </span>
        <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-[10px] font-semibold tracking-wide text-blue-600">
          LIVE
        </span>
      </div>
      <div className="space-y-1.5">
        {entries.map((entry, index) => {
          const isCurrentUser = entry.user_id === currentUserId;
          const isTop = index === 0;

          return (
            <div
              key={entry.user_id}
              className={cn(
                "flex items-center gap-3 rounded-[10px] px-3.5 py-2.5",
                isCurrentUser ? "bg-slate-50" : "",
              )}
            >
              <div
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                  isTop
                    ? "bg-gradient-to-br from-indigo-500 to-violet-500 text-white"
                    : "bg-slate-200 text-slate-500",
                )}
              >
                {index + 1}
              </div>
              <div className="flex-1 min-w-0">
                <span
                  className={cn(
                    "text-sm",
                    isTop ? "font-medium text-slate-900" : "text-slate-500",
                  )}
                >
                  {entry.name}
                  {isCurrentUser && (
                    <span className="ml-1.5 text-xs font-normal text-indigo-500">
                      (du)
                    </span>
                  )}
                </span>
              </div>
              <div className="text-right shrink-0">
                <div
                  className={cn(
                    "text-[13px] font-semibold",
                    isTop ? "text-slate-900" : "text-slate-700",
                  )}
                >
                  {entry.net_meetings_today} möten
                </div>
                <div className="text-[11px] text-slate-400">
                  {entry.calls_today} samtal
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function cn(...classes: (string | false | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}
```

**Note:** Remove the duplicate local `cn` function if `@/lib/cn` is already imported — use the import instead.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/stat-card.tsx frontend/src/components/leaderboard.tsx
git commit -m "feat: restyle StatCard and Leaderboard to Clean & Minimal design"
```

---

## Task 11: Dashboard Page Rewrite

**Files:**
- Modify: `frontend/src/pages/dashboard.tsx`

- [ ] **Step 1: Rewrite the dashboard page**

Replace `frontend/src/pages/dashboard.tsx`:

```typescript
import { useNavigate } from "react-router-dom";
import { useDashboard, useLeaderboard } from "@/api/dashboard";
import { useMe } from "@/api/auth";
import { Leaderboard } from "@/components/leaderboard";
import { StatCard } from "@/components/stat-card";
import { GoalProgress } from "@/components/goal-progress";
import { Button } from "@/components/ui/button";

function formatDate(): string {
  return new Date().toLocaleDateString("sv-SE", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

export function DashboardPage() {
  const navigate = useNavigate();
  const { data: user } = useMe();
  const { data: dashboard, isLoading } = useDashboard();
  const { data: leaderboard } = useLeaderboard();

  const myStats = dashboard?.my_stats;
  const conversion = dashboard?.conversion;
  const goalProgress = dashboard?.goal_progress ?? [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-light tracking-[-0.5px] text-slate-900">
            Hej {user?.name?.split(" ")[0] ?? ""}
          </h1>
          <p className="mt-0.5 text-[13px] text-slate-400">{formatDate()}</p>
        </div>
        <Button variant="primary" onClick={() => void navigate("/dialer")}>
          Nästa kund →
        </Button>
      </div>

      {/* Personal KPIs */}
      <div className="grid grid-cols-3 gap-3.5">
        <StatCard
          label="Samtal idag"
          value={isLoading ? "—" : (myStats?.calls_today ?? 0)}
        />
        <StatCard
          label="Möten idag"
          value={isLoading ? "—" : (myStats?.meetings_today ?? 0)}
        />
        <StatCard
          label="Konvertering"
          value={isLoading ? "—" : (conversion?.rate ?? 0)}
          suffix="%"
        />
      </div>

      {/* Goals */}
      <GoalProgress goals={goalProgress} />

      {/* Leaderboard */}
      <Leaderboard entries={leaderboard ?? []} currentUserId={user?.id} />
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/dashboard.tsx
git commit -m "feat: rewrite dashboard with Clean & Minimal design"
```

---

## Task 12: History Page Visual Refresh (Fas 2)

**Files:**
- Modify: `frontend/src/pages/history.tsx`

- [ ] **Step 1: Update history page styling**

Update the history page with Clean & Minimal styling. Key changes to make in `frontend/src/pages/history.tsx`:

1. Replace the raw `<select>` with a styled select that matches the design system
2. Add color-coded dots before event names based on action type
3. Update table styling to match dashboard (14px corners, soft shadows, more padding)
4. Update header to match dashboard's lightweight style

Replace the return JSX:

```typescript
  // Add this helper function inside the component, before the return:
  function actionDot(action: string): string {
    if (action.startsWith("meeting.")) return "bg-emerald-400";
    if (action.startsWith("call.")) return "bg-blue-400";
    if (action.startsWith("lead.status")) return "bg-amber-400";
    return "bg-slate-300";
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-[22px] font-light tracking-[-0.5px] text-slate-900">
          Historik
        </h1>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Sök händelse..."
          className="max-w-xs"
        />
        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="h-9 rounded-[10px] border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
        >
          {ACTION_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="rounded-[14px] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h3 className="text-[13px] font-semibold text-slate-900">
            Händelselogg
          </h3>
        </div>

        {isLoading ? (
          <div className="p-5">
            <Loader size="sm" title="Laddar historik" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="p-5 text-sm text-slate-400">
            Inga händelser hittades.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="px-5 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-slate-400">
                    Tidpunkt
                  </th>
                  <th className="px-5 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-slate-400">
                    Händelse
                  </th>
                  <th className="px-5 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-slate-400">
                    Resurstyp
                  </th>
                  <th className="px-5 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-slate-400">
                    Av
                  </th>
                  <th className="px-5 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-slate-400">
                    Ändringar
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((log: AuditLog, i: number) => {
                  const isClickable =
                    log.action.startsWith("lead.") ||
                    log.action.startsWith("call.") ||
                    log.action.startsWith("meeting.");
                  return (
                    <tr
                      key={log.id}
                      onClick={() => handleRowClick(log)}
                      className={[
                        i !== filtered.length - 1
                          ? "border-b border-slate-50"
                          : "",
                        isClickable
                          ? "cursor-pointer hover:bg-slate-50/50 transition-colors"
                          : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      <td className="px-5 py-3.5 font-mono text-xs text-slate-400 whitespace-nowrap">
                        {formatDateTime(log.inserted_at)}
                      </td>
                      <td className="px-5 py-3.5 text-slate-900">
                        <span className="flex items-center gap-2">
                          <span
                            className={`inline-block h-2 w-2 rounded-full ${actionDot(log.action)}`}
                          />
                          {actionLabel(log.action)}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-slate-500">
                        {resourceLabel(log.resource_type)}
                      </td>
                      <td className="px-5 py-3.5">
                        {log.user_name ? (
                          <span className="font-medium text-indigo-500">
                            {log.user_name}
                          </span>
                        ) : (
                          <span className="text-slate-400">System</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-slate-500 max-w-xs truncate">
                        {changesSummary(log.changes, log.action)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
```

- [ ] **Step 2: Verify it compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/history.tsx
git commit -m "feat: refresh history page with Clean & Minimal design"
```

---

## Task 13: Final Integration Test

- [ ] **Step 1: Run all backend tests**

Run: `cd backend && mix test --trace`
Expected: All tests PASS

- [ ] **Step 2: Run frontend type check**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Run frontend build**

Run: `cd frontend && npm run build`
Expected: Build succeeds

- [ ] **Step 4: Start the app and verify manually**

Run: `cd backend && mix phx.server`
Open http://localhost:4000 in browser. Verify:
- Dashboard shows new Clean & Minimal design
- KPI cards display with thin typography
- Goal progress section appears (empty if no goals set)
- Leaderboard has gradient badge for #1
- History page has color-coded dots and refreshed styling

- [ ] **Step 5: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: integration fixes for dashboard & history redesign"
```
