# SaleFlow Backend — Implementation Plan (1 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete Elixir/Phoenix/Ash backend with auth, lead queue, audit logging, and 100% test coverage.

**Architecture:** Phoenix 1.8 app with Ash 3.7 domains (Accounts, Sales, Audit). PostgreSQL via AshPostgres. Session-based auth via AshAuthentication. Oban for background jobs. JSON REST API via Phoenix controllers.

**Tech Stack:** Elixir 1.18, Phoenix 1.8, Ash 3.7, AshPostgres 2.6, AshAuthentication 4.13, Oban 2.20, PostgreSQL, ExUnit

---

### Task 1: Scaffold Phoenix project

**Files:**
- Create: `backend/` (entire Phoenix project)

- [ ] **Step 1: Generate Phoenix project**

```bash
cd ~/dev/saleflow
mix phx.new backend --no-html --no-assets --no-live --no-mailer --no-dashboard --binary-id
cd backend
```

- [ ] **Step 2: Add dependencies to mix.exs**

Replace the `deps` function in `backend/mix.exs`:

```elixir
defp deps do
  [
    {:phoenix, "~> 1.8"},
    {:phoenix_ecto, "~> 4.6"},
    {:ecto_sql, "~> 3.12"},
    {:postgrex, ">= 0.0.0"},
    {:jason, "~> 1.4"},
    {:plug_cowboy, "~> 2.7"},
    {:cors_plug, "~> 3.0"},
    # Ash
    {:ash, "~> 3.7"},
    {:ash_postgres, "~> 2.6"},
    {:ash_authentication, "~> 4.13"},
    {:ash_authentication_phoenix, "~> 2.4"},
    # Background jobs
    {:oban, "~> 2.20"},
    # XLSX parsing
    {:xlsxir, "~> 1.6"},
    # Test coverage
    {:excoveralls, "~> 0.18", only: :test},
  ]
end
```

- [ ] **Step 3: Configure Ash in config/config.exs**

Add to `backend/config/config.exs`:

```elixir
config :saleflow, :ash_domains, [
  Saleflow.Accounts,
  Saleflow.Sales,
  Saleflow.Audit
]

config :saleflow, Oban,
  repo: Saleflow.Repo,
  queues: [default: 10, scheduled: 5]
```

- [ ] **Step 4: Configure test coverage in mix.exs**

Add to project config in `backend/mix.exs`:

```elixir
def project do
  [
    app: :saleflow,
    version: "0.1.0",
    elixir: "~> 1.18",
    elixirc_paths: elixirc_paths(Mix.env()),
    start_permanent: Mix.env() == :prod,
    aliases: aliases(),
    deps: deps(),
    test_coverage: [tool: ExCoveralls],
    preferred_cli_env: [
      coveralls: :test,
      "coveralls.detail": :test,
      "coveralls.html": :test
    ]
  ]
end
```

- [ ] **Step 5: Install deps and create database**

```bash
cd ~/dev/saleflow/backend
mix deps.get
mix ecto.create
```

- [ ] **Step 6: Commit**

```bash
cd ~/dev/saleflow
git add backend/
git commit -m "feat: scaffold Phoenix backend with Ash + Oban deps"
```

---

### Task 2: Accounts domain — User resource + auth

**Files:**
- Create: `backend/lib/saleflow/accounts/accounts.ex`
- Create: `backend/lib/saleflow/accounts/user.ex`
- Create: `backend/test/saleflow/accounts/user_test.exs`

- [ ] **Step 1: Write failing test for user registration**

Create `backend/test/saleflow/accounts/user_test.exs`:

```elixir
defmodule Saleflow.Accounts.UserTest do
  use Saleflow.DataCase, async: true

  alias Saleflow.Accounts
  alias Saleflow.Accounts.User

  describe "register" do
    test "creates a user with valid params" do
      assert {:ok, user} =
               Accounts.register(%{
                 email: "agent@test.com",
                 password: "password123",
                 password_confirmation: "password123",
                 name: "Test Agent",
                 role: :agent
               })

      assert user.email == "agent@test.com"
      assert user.name == "Test Agent"
      assert user.role == :agent
    end

    test "rejects duplicate email" do
      params = %{
        email: "agent@test.com",
        password: "password123",
        password_confirmation: "password123",
        name: "Test Agent",
        role: :agent
      }

      assert {:ok, _} = Accounts.register(params)
      assert {:error, _} = Accounts.register(params)
    end

    test "rejects missing required fields" do
      assert {:error, _} = Accounts.register(%{email: "x@x.com"})
    end
  end

  describe "sign_in" do
    setup do
      {:ok, user} =
        Accounts.register(%{
          email: "agent@test.com",
          password: "password123",
          password_confirmation: "password123",
          name: "Agent",
          role: :agent
        })

      %{user: user}
    end

    test "signs in with valid credentials", %{user: _user} do
      assert {:ok, user} =
               Accounts.sign_in(%{email: "agent@test.com", password: "password123"})

      assert user.email == "agent@test.com"
    end

    test "rejects invalid password" do
      assert {:error, _} =
               Accounts.sign_in(%{email: "agent@test.com", password: "wrong"})
    end
  end

  describe "list_users" do
    test "returns all users" do
      {:ok, _} =
        Accounts.register(%{
          email: "a@test.com",
          password: "password123",
          password_confirmation: "password123",
          name: "A",
          role: :agent
        })

      {:ok, _} =
        Accounts.register(%{
          email: "b@test.com",
          password: "password123",
          password_confirmation: "password123",
          name: "B",
          role: :admin
        })

      assert {:ok, users} = Accounts.list_users()
      assert length(users) == 2
    end
  end
end
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd ~/dev/saleflow/backend
mix test test/saleflow/accounts/user_test.exs
```

Expected: compilation error — `Saleflow.Accounts` not defined

- [ ] **Step 3: Create Accounts domain**

Create `backend/lib/saleflow/accounts/accounts.ex`:

```elixir
defmodule Saleflow.Accounts do
  use Ash.Domain

  resources do
    resource Saleflow.Accounts.User
  end

  def register(params) do
    Saleflow.Accounts.User
    |> Ash.Changeset.for_create(:register_with_password, params)
    |> Ash.create()
  end

  def sign_in(params) do
    Saleflow.Accounts.User
    |> Ash.Changeset.for_action(:sign_in_with_password, params)
    |> Ash.read_one()
  end

  def list_users do
    Saleflow.Accounts.User
    |> Ash.read()
  end
end
```

- [ ] **Step 4: Create User resource**

Create `backend/lib/saleflow/accounts/user.ex`:

```elixir
defmodule Saleflow.Accounts.User do
  use Ash.Resource,
    domain: Saleflow.Accounts,
    data_layer: AshPostgres.DataLayer,
    extensions: [AshAuthentication]

  postgres do
    table "users"
    repo Saleflow.Repo
  end

  authentication do
    strategies do
      password :password do
        identity_field :email
        sign_in_tokens_enabled? true
      end
    end

    tokens do
      enabled? true
      token_resource Saleflow.Accounts.Token
      signing_secret fn _, _ ->
        Application.fetch_env(:saleflow, :token_signing_secret)
      end
    end
  end

  attributes do
    uuid_primary_key :id

    attribute :email, :ci_string do
      allow_nil? false
      public? true
    end

    attribute :name, :string do
      allow_nil? false
      public? true
    end

    attribute :role, :atom do
      constraints one_of: [:admin, :agent]
      default :agent
      allow_nil? false
      public? true
    end

    attribute :hashed_password, :string, allow_nil?: false, sensitive?: true

    create_timestamp :inserted_at
    update_timestamp :updated_at
  end

  identities do
    identity :unique_email, [:email]
  end

  actions do
    defaults [:read]

    create :register_with_password do
      accept [:email, :name, :role]
      argument :password, :string, allow_nil?: false, sensitive?: true
      argument :password_confirmation, :string, allow_nil?: false, sensitive?: true

      validate confirm(:password, :password_confirmation)

      change AshAuthentication.Strategy.Password.HashPasswordChange
      change AshAuthentication.GenerateTokenChange
    end

    read :sign_in_with_password do
      argument :email, :ci_string, allow_nil?: false
      argument :password, :string, allow_nil?: false, sensitive?: true

      prepare AshAuthentication.Strategy.Password.SignInPreparation
    end

    read :list do
      prepare build(sort: [inserted_at: :asc])
    end

    update :update_user do
      accept [:name, :role]
    end
  end
end
```

- [ ] **Step 5: Create Token resource**

Create `backend/lib/saleflow/accounts/token.ex`:

```elixir
defmodule Saleflow.Accounts.Token do
  use Ash.Resource,
    domain: Saleflow.Accounts,
    data_layer: AshPostgres.DataLayer,
    extensions: [AshAuthentication.TokenResource]

  postgres do
    table "tokens"
    repo Saleflow.Repo
  end

  token do
    api Saleflow.Accounts
  end
end
```

- [ ] **Step 6: Generate migrations and migrate**

```bash
cd ~/dev/saleflow/backend
mix ash_postgres.generate_migrations --name add_users
mix ecto.migrate
```

- [ ] **Step 7: Run tests**

```bash
mix test test/saleflow/accounts/user_test.exs
```

Expected: all 5 tests pass

- [ ] **Step 8: Commit**

```bash
cd ~/dev/saleflow
git add backend/
git commit -m "feat: add Accounts domain with User auth (register, sign_in)"
```

---

### Task 3: Audit domain — AuditLog resource

**Files:**
- Create: `backend/lib/saleflow/audit/audit.ex`
- Create: `backend/lib/saleflow/audit/audit_log.ex`
- Create: `backend/lib/saleflow/audit/changes/create_audit_log.ex`
- Create: `backend/test/saleflow/audit/audit_log_test.exs`

- [ ] **Step 1: Write failing test**

Create `backend/test/saleflow/audit/audit_log_test.exs`:

```elixir
defmodule Saleflow.Audit.AuditLogTest do
  use Saleflow.DataCase, async: true

  alias Saleflow.Audit
  alias Saleflow.Audit.AuditLog

  describe "create_log" do
    test "creates an audit log entry" do
      assert {:ok, log} =
               Audit.create_log(%{
                 action: "lead.created",
                 resource_type: "Lead",
                 resource_id: Ash.UUID.generate(),
                 changes: %{"status" => %{"from" => nil, "to" => "new"}},
                 metadata: %{"ip" => "127.0.0.1"}
               })

      assert log.action == "lead.created"
      assert log.resource_type == "Lead"
      assert log.changes["status"]["to"] == "new"
    end

    test "creates log with user_id" do
      {:ok, user} =
        Saleflow.Accounts.register(%{
          email: "agent@test.com",
          password: "password123",
          password_confirmation: "password123",
          name: "Agent",
          role: :agent
        })

      assert {:ok, log} =
               Audit.create_log(%{
                 user_id: user.id,
                 action: "lead.status_changed",
                 resource_type: "Lead",
                 resource_id: Ash.UUID.generate(),
                 changes: %{}
               })

      assert log.user_id == user.id
    end
  end

  describe "list_for_resource" do
    test "returns logs for a specific resource" do
      resource_id = Ash.UUID.generate()
      other_id = Ash.UUID.generate()

      Audit.create_log(%{
        action: "lead.created",
        resource_type: "Lead",
        resource_id: resource_id,
        changes: %{}
      })

      Audit.create_log(%{
        action: "lead.created",
        resource_type: "Lead",
        resource_id: other_id,
        changes: %{}
      })

      assert {:ok, logs} = Audit.list_for_resource("Lead", resource_id)
      assert length(logs) == 1
      assert hd(logs).resource_id == resource_id
    end
  end
end
```

- [ ] **Step 2: Run test to verify it fails**

```bash
mix test test/saleflow/audit/audit_log_test.exs
```

Expected: compilation error — `Saleflow.Audit` not defined

- [ ] **Step 3: Create Audit domain**

Create `backend/lib/saleflow/audit/audit.ex`:

```elixir
defmodule Saleflow.Audit do
  use Ash.Domain

  resources do
    resource Saleflow.Audit.AuditLog
  end

  def create_log(params) do
    Saleflow.Audit.AuditLog
    |> Ash.Changeset.for_create(:create, params)
    |> Ash.create()
  end

  def list_for_resource(resource_type, resource_id) do
    Saleflow.Audit.AuditLog
    |> Ash.Query.filter(resource_type == ^resource_type and resource_id == ^resource_id)
    |> Ash.Query.sort(inserted_at: :desc)
    |> Ash.read()
  end

  def list_logs(filters \\ %{}) do
    query = Saleflow.Audit.AuditLog |> Ash.Query.sort(inserted_at: :desc)

    query =
      case Map.get(filters, :user_id) do
        nil -> query
        uid -> Ash.Query.filter(query, user_id == ^uid)
      end

    query =
      case Map.get(filters, :action) do
        nil -> query
        act -> Ash.Query.filter(query, action == ^act)
      end

    Ash.read(query)
  end
end
```

- [ ] **Step 4: Create AuditLog resource**

Create `backend/lib/saleflow/audit/audit_log.ex`:

```elixir
defmodule Saleflow.Audit.AuditLog do
  use Ash.Resource,
    domain: Saleflow.Audit,
    data_layer: AshPostgres.DataLayer

  postgres do
    table "audit_logs"
    repo Saleflow.Repo
  end

  attributes do
    uuid_primary_key :id

    attribute :user_id, :uuid, public?: true
    attribute :action, :string, allow_nil?: false, public?: true
    attribute :resource_type, :string, allow_nil?: false, public?: true
    attribute :resource_id, :uuid, allow_nil?: false, public?: true
    attribute :changes, :map, default: %{}, public?: true
    attribute :metadata, :map, default: %{}, public?: true

    create_timestamp :inserted_at
  end

  actions do
    defaults [:read]

    create :create do
      accept [:user_id, :action, :resource_type, :resource_id, :changes, :metadata]
    end
  end
end
```

- [ ] **Step 5: Create reusable audit change module**

Create `backend/lib/saleflow/audit/changes/create_audit_log.ex`:

```elixir
defmodule Saleflow.Audit.Changes.CreateAuditLog do
  use Ash.Resource.Change

  @impl true
  def change(changeset, opts, _context) do
    action_name = opts[:action] || "#{changeset.resource |> Module.split() |> List.last() |> String.downcase()}.#{changeset.action.name}"

    Ash.Changeset.after_action(changeset, fn _changeset, result ->
      changes =
        changeset
        |> Ash.Changeset.get_changes()
        |> Enum.into(%{}, fn {key, value} ->
          old_value = Map.get(changeset.data || %{}, key)
          {to_string(key), %{"from" => inspect(old_value), "to" => inspect(value)}}
        end)

      actor = changeset.context[:private][:actor] || %{}
      user_id = Map.get(actor, :id)

      Saleflow.Audit.create_log(%{
        user_id: user_id,
        action: action_name,
        resource_type: changeset.resource |> Module.split() |> List.last(),
        resource_id: result.id,
        changes: changes
      })

      {:ok, result}
    end)
  end
end
```

- [ ] **Step 6: Generate migrations and migrate**

```bash
mix ash_postgres.generate_migrations --name add_audit_logs
mix ecto.migrate
```

- [ ] **Step 7: Run tests**

```bash
mix test test/saleflow/audit/audit_log_test.exs
```

Expected: all 3 tests pass

- [ ] **Step 8: Commit**

```bash
cd ~/dev/saleflow
git add backend/
git commit -m "feat: add Audit domain with AuditLog + reusable change hook"
```

---

### Task 4: Sales domain — Lead resource

**Files:**
- Create: `backend/lib/saleflow/sales/sales.ex`
- Create: `backend/lib/saleflow/sales/lead.ex`
- Create: `backend/test/saleflow/sales/lead_test.exs`

- [ ] **Step 1: Write failing test**

Create `backend/test/saleflow/sales/lead_test.exs`:

```elixir
defmodule Saleflow.Sales.LeadTest do
  use Saleflow.DataCase, async: true

  alias Saleflow.Sales

  @valid_lead %{
    företag: "Test AB",
    telefon: "+46701234567",
    stad: "Stockholm",
    bransch: "IT",
    orgnr: "5591234567",
    status: :new
  }

  describe "create_lead" do
    test "creates a lead with valid params" do
      assert {:ok, lead} = Sales.create_lead(@valid_lead)
      assert lead.företag == "Test AB"
      assert lead.telefon == "+46701234567"
      assert lead.status == :new
    end

    test "rejects lead without required fields" do
      assert {:error, _} = Sales.create_lead(%{})
    end
  end

  describe "list_leads" do
    test "returns all leads" do
      {:ok, _} = Sales.create_lead(@valid_lead)
      {:ok, _} = Sales.create_lead(%{@valid_lead | företag: "Other AB", telefon: "+46709999999"})
      assert {:ok, leads} = Sales.list_leads()
      assert length(leads) == 2
    end
  end

  describe "search_leads" do
    test "searches by company name" do
      {:ok, _} = Sales.create_lead(@valid_lead)
      {:ok, _} = Sales.create_lead(%{@valid_lead | företag: "Bygg AB", telefon: "+46709999999"})
      assert {:ok, leads} = Sales.search_leads("Test")
      assert length(leads) == 1
      assert hd(leads).företag == "Test AB"
    end
  end

  describe "update_status" do
    test "updates lead status" do
      {:ok, lead} = Sales.create_lead(@valid_lead)
      assert {:ok, updated} = Sales.update_lead_status(lead, %{status: :assigned})
      assert updated.status == :assigned
    end

    test "sets quarantine_until when quarantined" do
      {:ok, lead} = Sales.create_lead(@valid_lead)
      assert {:ok, updated} = Sales.update_lead_status(lead, %{status: :quarantine})
      assert updated.quarantine_until != nil
      assert DateTime.compare(updated.quarantine_until, DateTime.utc_now()) == :gt
    end
  end
end
```

- [ ] **Step 2: Run test to verify it fails**

```bash
mix test test/saleflow/sales/lead_test.exs
```

Expected: compilation error

- [ ] **Step 3: Create Sales domain**

Create `backend/lib/saleflow/sales/sales.ex`:

```elixir
defmodule Saleflow.Sales do
  use Ash.Domain

  resources do
    resource Saleflow.Sales.Lead
    resource Saleflow.Sales.Assignment
    resource Saleflow.Sales.CallLog
    resource Saleflow.Sales.Meeting
    resource Saleflow.Sales.Quarantine
  end

  def create_lead(params) do
    Saleflow.Sales.Lead
    |> Ash.Changeset.for_create(:create, params)
    |> Ash.create()
  end

  def list_leads do
    Saleflow.Sales.Lead
    |> Ash.Query.sort(inserted_at: :asc)
    |> Ash.read()
  end

  def search_leads(query) do
    Saleflow.Sales.Lead
    |> Ash.Query.filter(contains(företag, ^query))
    |> Ash.Query.sort(inserted_at: :asc)
    |> Ash.read()
  end

  def update_lead_status(lead, params) do
    lead
    |> Ash.Changeset.for_update(:update_status, params)
    |> Ash.update()
  end

  def get_lead(id) do
    Saleflow.Sales.Lead
    |> Ash.get(id)
  end
end
```

- [ ] **Step 4: Create Lead resource**

Create `backend/lib/saleflow/sales/lead.ex`:

```elixir
defmodule Saleflow.Sales.Lead do
  use Ash.Resource,
    domain: Saleflow.Sales,
    data_layer: AshPostgres.DataLayer

  postgres do
    table "leads"
    repo Saleflow.Repo
  end

  attributes do
    uuid_primary_key :id

    attribute :företag, :string, allow_nil?: false, public?: true
    attribute :telefon, :string, allow_nil?: false, public?: true
    attribute :epost, :string, public?: true
    attribute :hemsida, :string, public?: true
    attribute :adress, :string, public?: true
    attribute :postnummer, :string, public?: true
    attribute :stad, :string, public?: true
    attribute :bransch, :string, public?: true
    attribute :orgnr, :string, public?: true
    attribute :omsättning_tkr, :string, public?: true
    attribute :vinst_tkr, :string, public?: true
    attribute :anställda, :string, public?: true
    attribute :vd_namn, :string, public?: true
    attribute :bolagsform, :string, public?: true

    attribute :status, :atom do
      constraints one_of: [:new, :assigned, :callback, :meeting_booked, :quarantine, :bad_number, :customer]
      default :new
      allow_nil? false
      public? true
    end

    attribute :quarantine_until, :utc_datetime_usec, public?: true
    attribute :callback_at, :utc_datetime_usec, public?: true
    attribute :imported_at, :utc_datetime_usec, public?: true

    create_timestamp :inserted_at
    update_timestamp :updated_at
  end

  actions do
    defaults [:read]

    create :create do
      accept [
        :företag, :telefon, :epost, :hemsida, :adress, :postnummer, :stad,
        :bransch, :orgnr, :omsättning_tkr, :vinst_tkr, :anställda, :vd_namn,
        :bolagsform, :status, :imported_at
      ]

      change {Saleflow.Audit.Changes.CreateAuditLog, action: "lead.created"}
    end

    update :update_status do
      accept [:status, :quarantine_until, :callback_at]

      change fn changeset, _context ->
        case Ash.Changeset.get_attribute(changeset, :status) do
          :quarantine ->
            quarantine_until = DateTime.add(DateTime.utc_now(), 7 * 24 * 3600, :second)
            Ash.Changeset.force_change_attribute(changeset, :quarantine_until, quarantine_until)

          _ ->
            changeset
        end
      end

      change {Saleflow.Audit.Changes.CreateAuditLog, action: "lead.status_changed"}
    end
  end
end
```

- [ ] **Step 5: Generate migrations and migrate**

```bash
mix ash_postgres.generate_migrations --name add_leads
mix ecto.migrate
```

- [ ] **Step 6: Run tests**

```bash
mix test test/saleflow/sales/lead_test.exs
```

Expected: all 5 tests pass

- [ ] **Step 7: Commit**

```bash
cd ~/dev/saleflow
git add backend/
git commit -m "feat: add Sales domain with Lead resource + audit logging"
```

---

### Task 5: Assignment + CallLog + Meeting + Quarantine resources

**Files:**
- Create: `backend/lib/saleflow/sales/assignment.ex`
- Create: `backend/lib/saleflow/sales/call_log.ex`
- Create: `backend/lib/saleflow/sales/meeting.ex`
- Create: `backend/lib/saleflow/sales/quarantine.ex`
- Create: `backend/test/saleflow/sales/assignment_test.exs`
- Create: `backend/test/saleflow/sales/call_log_test.exs`
- Create: `backend/test/saleflow/sales/meeting_test.exs`

- [ ] **Step 1: Write failing tests for Assignment**

Create `backend/test/saleflow/sales/assignment_test.exs`:

```elixir
defmodule Saleflow.Sales.AssignmentTest do
  use Saleflow.DataCase, async: true

  alias Saleflow.Sales

  setup do
    {:ok, user} =
      Saleflow.Accounts.register(%{
        email: "agent@test.com",
        password: "password123",
        password_confirmation: "password123",
        name: "Agent",
        role: :agent
      })

    {:ok, lead} =
      Sales.create_lead(%{företag: "Test AB", telefon: "+46701234567", status: :new})

    %{user: user, lead: lead}
  end

  describe "assign" do
    test "creates an assignment", %{user: user, lead: lead} do
      assert {:ok, assignment} = Sales.assign_lead(lead, user)
      assert assignment.lead_id == lead.id
      assert assignment.user_id == user.id
      assert assignment.released_at == nil
    end
  end

  describe "release" do
    test "releases an assignment", %{user: user, lead: lead} do
      {:ok, assignment} = Sales.assign_lead(lead, user)
      assert {:ok, released} = Sales.release_assignment(assignment, :outcome_logged)
      assert released.released_at != nil
      assert released.release_reason == :outcome_logged
    end
  end
end
```

- [ ] **Step 2: Write failing tests for CallLog**

Create `backend/test/saleflow/sales/call_log_test.exs`:

```elixir
defmodule Saleflow.Sales.CallLogTest do
  use Saleflow.DataCase, async: true

  alias Saleflow.Sales

  setup do
    {:ok, user} =
      Saleflow.Accounts.register(%{
        email: "agent@test.com",
        password: "password123",
        password_confirmation: "password123",
        name: "Agent",
        role: :agent
      })

    {:ok, lead} =
      Sales.create_lead(%{företag: "Test AB", telefon: "+46701234567", status: :new})

    %{user: user, lead: lead}
  end

  describe "log_call" do
    test "creates a call log entry", %{user: user, lead: lead} do
      assert {:ok, log} =
               Sales.log_call(%{
                 lead_id: lead.id,
                 user_id: user.id,
                 outcome: :meeting_booked,
                 notes: "Bra samtal"
               })

      assert log.outcome == :meeting_booked
      assert log.notes == "Bra samtal"
    end
  end

  describe "list_for_lead" do
    test "returns call logs for a lead", %{user: user, lead: lead} do
      Sales.log_call(%{lead_id: lead.id, user_id: user.id, outcome: :no_answer})
      Sales.log_call(%{lead_id: lead.id, user_id: user.id, outcome: :callback, notes: "Ring imorgon"})

      assert {:ok, logs} = Sales.list_calls_for_lead(lead.id)
      assert length(logs) == 2
    end
  end
end
```

- [ ] **Step 3: Write failing tests for Meeting**

Create `backend/test/saleflow/sales/meeting_test.exs`:

```elixir
defmodule Saleflow.Sales.MeetingTest do
  use Saleflow.DataCase, async: true

  alias Saleflow.Sales

  setup do
    {:ok, user} =
      Saleflow.Accounts.register(%{
        email: "agent@test.com",
        password: "password123",
        password_confirmation: "password123",
        name: "Agent",
        role: :agent
      })

    {:ok, lead} =
      Sales.create_lead(%{företag: "Test AB", telefon: "+46701234567", status: :new})

    %{user: user, lead: lead}
  end

  describe "create_meeting" do
    test "creates a meeting", %{user: user, lead: lead} do
      assert {:ok, meeting} =
               Sales.create_meeting(%{
                 lead_id: lead.id,
                 user_id: user.id,
                 title: "Demo-möte",
                 meeting_date: ~D[2026-04-10],
                 meeting_time: ~T[14:00:00],
                 notes: "Visa hemsida-demo"
               })

      assert meeting.title == "Demo-möte"
      assert meeting.status == :scheduled
    end
  end

  describe "cancel_meeting" do
    test "cancels a meeting", %{user: user, lead: lead} do
      {:ok, meeting} =
        Sales.create_meeting(%{
          lead_id: lead.id,
          user_id: user.id,
          title: "Demo",
          meeting_date: ~D[2026-04-10],
          meeting_time: ~T[14:00:00]
        })

      assert {:ok, cancelled} = Sales.cancel_meeting(meeting)
      assert cancelled.status == :cancelled
    end
  end

  describe "list_upcoming" do
    test "returns future meetings", %{user: user, lead: lead} do
      Sales.create_meeting(%{
        lead_id: lead.id,
        user_id: user.id,
        title: "Future",
        meeting_date: Date.add(Date.utc_today(), 5),
        meeting_time: ~T[10:00:00]
      })

      assert {:ok, meetings} = Sales.list_upcoming_meetings()
      assert length(meetings) == 1
    end
  end
end
```

- [ ] **Step 4: Run tests to verify they fail**

```bash
mix test test/saleflow/sales/
```

Expected: multiple compilation errors

- [ ] **Step 5: Create Assignment resource**

Create `backend/lib/saleflow/sales/assignment.ex`:

```elixir
defmodule Saleflow.Sales.Assignment do
  use Ash.Resource,
    domain: Saleflow.Sales,
    data_layer: AshPostgres.DataLayer

  postgres do
    table "assignments"
    repo Saleflow.Repo
  end

  attributes do
    uuid_primary_key :id

    attribute :lead_id, :uuid, allow_nil?: false, public?: true
    attribute :user_id, :uuid, allow_nil?: false, public?: true
    attribute :assigned_at, :utc_datetime_usec, allow_nil?: false, public?: true
    attribute :released_at, :utc_datetime_usec, public?: true

    attribute :release_reason, :atom do
      constraints one_of: [:outcome_logged, :timeout, :manual]
      public? true
    end
  end

  actions do
    defaults [:read]

    create :assign do
      accept [:lead_id, :user_id]
      change set_attribute(:assigned_at, &DateTime.utc_now/0)
      change {Saleflow.Audit.Changes.CreateAuditLog, action: "assignment.created"}
    end

    update :release do
      accept [:release_reason]
      change set_attribute(:released_at, &DateTime.utc_now/0)
      change {Saleflow.Audit.Changes.CreateAuditLog, action: "assignment.released"}
    end
  end
end
```

- [ ] **Step 6: Create CallLog resource**

Create `backend/lib/saleflow/sales/call_log.ex`:

```elixir
defmodule Saleflow.Sales.CallLog do
  use Ash.Resource,
    domain: Saleflow.Sales,
    data_layer: AshPostgres.DataLayer

  postgres do
    table "call_logs"
    repo Saleflow.Repo
  end

  attributes do
    uuid_primary_key :id

    attribute :lead_id, :uuid, allow_nil?: false, public?: true
    attribute :user_id, :uuid, allow_nil?: false, public?: true

    attribute :outcome, :atom do
      constraints one_of: [:meeting_booked, :callback, :not_interested, :no_answer, :bad_number, :customer, :other]
      allow_nil? false
      public? true
    end

    attribute :notes, :string, public?: true
    attribute :called_at, :utc_datetime_usec, allow_nil?: false, public?: true
  end

  actions do
    defaults [:read]

    create :create do
      accept [:lead_id, :user_id, :outcome, :notes]
      change set_attribute(:called_at, &DateTime.utc_now/0)
      change {Saleflow.Audit.Changes.CreateAuditLog, action: "call.logged"}
    end
  end
end
```

- [ ] **Step 7: Create Meeting resource**

Create `backend/lib/saleflow/sales/meeting.ex`:

```elixir
defmodule Saleflow.Sales.Meeting do
  use Ash.Resource,
    domain: Saleflow.Sales,
    data_layer: AshPostgres.DataLayer

  postgres do
    table "meetings"
    repo Saleflow.Repo
  end

  attributes do
    uuid_primary_key :id

    attribute :lead_id, :uuid, allow_nil?: false, public?: true
    attribute :user_id, :uuid, allow_nil?: false, public?: true
    attribute :title, :string, allow_nil?: false, public?: true
    attribute :meeting_date, :date, allow_nil?: false, public?: true
    attribute :meeting_time, :time, allow_nil?: false, public?: true
    attribute :notes, :string, public?: true
    attribute :google_calendar_id, :string, public?: true

    attribute :status, :atom do
      constraints one_of: [:scheduled, :completed, :cancelled]
      default :scheduled
      allow_nil? false
      public? true
    end

    create_timestamp :inserted_at
    update_timestamp :updated_at
  end

  actions do
    defaults [:read]

    create :create do
      accept [:lead_id, :user_id, :title, :meeting_date, :meeting_time, :notes]
      change {Saleflow.Audit.Changes.CreateAuditLog, action: "meeting.created"}
    end

    update :cancel do
      change set_attribute(:status, :cancelled)
      change {Saleflow.Audit.Changes.CreateAuditLog, action: "meeting.cancelled"}
    end

    update :complete do
      change set_attribute(:status, :completed)
      change {Saleflow.Audit.Changes.CreateAuditLog, action: "meeting.completed"}
    end
  end
end
```

- [ ] **Step 8: Create Quarantine resource**

Create `backend/lib/saleflow/sales/quarantine.ex`:

```elixir
defmodule Saleflow.Sales.Quarantine do
  use Ash.Resource,
    domain: Saleflow.Sales,
    data_layer: AshPostgres.DataLayer

  postgres do
    table "quarantines"
    repo Saleflow.Repo

  end

  attributes do
    uuid_primary_key :id

    attribute :lead_id, :uuid, allow_nil?: false, public?: true
    attribute :user_id, :uuid, allow_nil?: false, public?: true
    attribute :reason, :string, allow_nil?: false, public?: true
    attribute :quarantined_at, :utc_datetime_usec, allow_nil?: false, public?: true
    attribute :released_at, :utc_datetime_usec, allow_nil?: false, public?: true
  end

  actions do
    defaults [:read]

    create :create do
      accept [:lead_id, :user_id, :reason]

      change fn changeset, _context ->
        now = DateTime.utc_now()
        released = DateTime.add(now, 7 * 24 * 3600, :second)

        changeset
        |> Ash.Changeset.force_change_attribute(:quarantined_at, now)
        |> Ash.Changeset.force_change_attribute(:released_at, released)
      end

      change {Saleflow.Audit.Changes.CreateAuditLog, action: "quarantine.created"}
    end
  end
end
```

- [ ] **Step 9: Add helper functions to Sales domain**

Add to `backend/lib/saleflow/sales/sales.ex`:

```elixir
  def assign_lead(lead, user) do
    Saleflow.Sales.Assignment
    |> Ash.Changeset.for_create(:assign, %{lead_id: lead.id, user_id: user.id})
    |> Ash.create()
  end

  def release_assignment(assignment, reason) do
    assignment
    |> Ash.Changeset.for_update(:release, %{release_reason: reason})
    |> Ash.update()
  end

  def log_call(params) do
    Saleflow.Sales.CallLog
    |> Ash.Changeset.for_create(:create, params)
    |> Ash.create()
  end

  def list_calls_for_lead(lead_id) do
    Saleflow.Sales.CallLog
    |> Ash.Query.filter(lead_id == ^lead_id)
    |> Ash.Query.sort(called_at: :desc)
    |> Ash.read()
  end

  def create_meeting(params) do
    Saleflow.Sales.Meeting
    |> Ash.Changeset.for_create(:create, params)
    |> Ash.create()
  end

  def cancel_meeting(meeting) do
    meeting
    |> Ash.Changeset.for_update(:cancel, %{})
    |> Ash.update()
  end

  def list_upcoming_meetings do
    Saleflow.Sales.Meeting
    |> Ash.Query.filter(status == :scheduled and meeting_date >= ^Date.utc_today())
    |> Ash.Query.sort(meeting_date: :asc, meeting_time: :asc)
    |> Ash.read()
  end

  def create_quarantine(params) do
    Saleflow.Sales.Quarantine
    |> Ash.Changeset.for_create(:create, params)
    |> Ash.create()
  end
```

- [ ] **Step 10: Generate migrations and migrate**

```bash
mix ash_postgres.generate_migrations --name add_sales_resources
mix ecto.migrate
```

- [ ] **Step 11: Run all tests**

```bash
mix test test/saleflow/sales/
```

Expected: all tests pass

- [ ] **Step 12: Commit**

```bash
cd ~/dev/saleflow
git add backend/
git commit -m "feat: add Assignment, CallLog, Meeting, Quarantine resources"
```

---

### Task 6: Lead queue — get_next with locking

**Files:**
- Create: `backend/lib/saleflow/sales/actions/get_next_lead.ex`
- Create: `backend/test/saleflow/sales/queue_test.exs`

- [ ] **Step 1: Write failing queue tests**

Create `backend/test/saleflow/sales/queue_test.exs`:

```elixir
defmodule Saleflow.Sales.QueueTest do
  use Saleflow.DataCase, async: false

  alias Saleflow.Sales
  alias Saleflow.Accounts

  setup do
    {:ok, agent1} =
      Accounts.register(%{
        email: "agent1@test.com",
        password: "password123",
        password_confirmation: "password123",
        name: "Agent 1",
        role: :agent
      })

    {:ok, agent2} =
      Accounts.register(%{
        email: "agent2@test.com",
        password: "password123",
        password_confirmation: "password123",
        name: "Agent 2",
        role: :agent
      })

    {:ok, lead1} = Sales.create_lead(%{företag: "First AB", telefon: "+46701111111", status: :new})
    {:ok, lead2} = Sales.create_lead(%{företag: "Second AB", telefon: "+46702222222", status: :new})
    {:ok, lead3} = Sales.create_lead(%{företag: "Third AB", telefon: "+46703333333", status: :new})

    %{agent1: agent1, agent2: agent2, lead1: lead1, lead2: lead2, lead3: lead3}
  end

  describe "get_next_lead" do
    test "returns oldest new lead", %{agent1: agent} do
      assert {:ok, lead} = Sales.get_next_lead(agent)
      assert lead.företag == "First AB"
      assert lead.status == :assigned
    end

    test "two agents get different leads", %{agent1: agent1, agent2: agent2} do
      {:ok, lead_a} = Sales.get_next_lead(agent1)
      {:ok, lead_b} = Sales.get_next_lead(agent2)
      assert lead_a.id != lead_b.id
    end

    test "returns nil when no leads available", %{agent1: agent1, agent2: agent2} do
      {:ok, _} = Sales.get_next_lead(agent1)
      {:ok, _} = Sales.get_next_lead(agent2)

      # Third lead for agent1
      {:ok, _} = Sales.get_next_lead(agent1)

      # No more leads — agent2 should get nothing
      # (agent1 released lead1 by getting lead3, but let's get next for agent2)
      assert {:ok, nil} = Sales.get_next_lead(agent2)
    end

    test "skips quarantined leads", %{agent1: agent} do
      # Quarantine lead1
      {:ok, lead1} = Sales.get_lead(hd(Saleflow.Repo.all(Saleflow.Sales.Lead)).id)
      Sales.update_lead_status(lead1, %{status: :quarantine})

      {:ok, lead} = Sales.get_next_lead(agent)
      assert lead.företag != "First AB"
    end

    test "returns quarantined lead after expiry", %{agent1: agent} do
      {:ok, leads} = Sales.list_leads()
      first = hd(leads)

      # Quarantine with past date
      first
      |> Ash.Changeset.for_update(:update_status, %{
        status: :quarantine,
        quarantine_until: DateTime.add(DateTime.utc_now(), -1, :second)
      })
      |> Ash.update!()

      {:ok, lead} = Sales.get_next_lead(agent)
      # Should get the expired quarantine lead (it's the oldest)
      assert lead.företag == "First AB"
    end
  end
end
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
mix test test/saleflow/sales/queue_test.exs
```

Expected: `Sales.get_next_lead/1` undefined

- [ ] **Step 3: Implement get_next_lead with FOR UPDATE SKIP LOCKED**

Add to `backend/lib/saleflow/sales/sales.ex`:

```elixir
  def get_next_lead(agent) do
    Saleflow.Repo.transaction(fn ->
      # Find oldest available lead using raw SQL for FOR UPDATE SKIP LOCKED
      query = """
      SELECT l.id FROM leads l
      WHERE (l.status = 'new' OR (l.status = 'quarantine' AND l.quarantine_until < NOW()))
        AND NOT EXISTS (
          SELECT 1 FROM assignments a
          WHERE a.lead_id = l.id AND a.released_at IS NULL
        )
      ORDER BY l.inserted_at ASC
      LIMIT 1
      FOR UPDATE OF l SKIP LOCKED
      """

      case Saleflow.Repo.query(query) do
        {:ok, %{rows: [[lead_id]]}} ->
          {:ok, lead} = get_lead(lead_id)

          # Release any previous assignment for this agent
          release_active_assignment(agent)

          # Create new assignment
          {:ok, _assignment} = assign_lead(lead, agent)

          # Update lead status
          {:ok, updated_lead} = update_lead_status(lead, %{status: :assigned})
          updated_lead

        {:ok, %{rows: []}} ->
          nil
      end
    end)
  end

  defp release_active_assignment(agent) do
    case get_active_assignment(agent) do
      {:ok, nil} -> :ok
      {:ok, assignment} -> release_assignment(assignment, :manual)
    end
  end

  def get_active_assignment(agent) do
    Saleflow.Sales.Assignment
    |> Ash.Query.filter(user_id == ^agent.id and is_nil(released_at))
    |> Ash.Query.sort(assigned_at: :desc)
    |> Ash.Query.limit(1)
    |> Ash.read_one()
  end
```

- [ ] **Step 4: Run queue tests**

```bash
mix test test/saleflow/sales/queue_test.exs
```

Expected: all 5 tests pass

- [ ] **Step 5: Commit**

```bash
cd ~/dev/saleflow
git add backend/
git commit -m "feat: add lead queue with FOR UPDATE SKIP LOCKED"
```

---

### Task 7: Oban workers — auto-release + quarantine release

**Files:**
- Create: `backend/lib/saleflow/workers/auto_release_worker.ex`
- Create: `backend/lib/saleflow/workers/quarantine_release_worker.ex`
- Create: `backend/test/saleflow/workers/auto_release_worker_test.exs`
- Create: `backend/test/saleflow/workers/quarantine_release_worker_test.exs`

- [ ] **Step 1: Write failing test for auto-release**

Create `backend/test/saleflow/workers/auto_release_worker_test.exs`:

```elixir
defmodule Saleflow.Workers.AutoReleaseWorkerTest do
  use Saleflow.DataCase, async: false

  alias Saleflow.Workers.AutoReleaseWorker
  alias Saleflow.Sales
  alias Saleflow.Accounts

  setup do
    {:ok, agent} =
      Accounts.register(%{
        email: "agent@test.com",
        password: "password123",
        password_confirmation: "password123",
        name: "Agent",
        role: :agent
      })

    {:ok, lead} = Sales.create_lead(%{företag: "Test AB", telefon: "+46701234567", status: :new})

    %{agent: agent, lead: lead}
  end

  test "releases stale assignments older than 30 minutes", %{agent: agent, lead: lead} do
    {:ok, assignment} = Sales.assign_lead(lead, agent)

    # Backdate assignment to 31 minutes ago
    Saleflow.Repo.query!(
      "UPDATE assignments SET assigned_at = $1 WHERE id = $2",
      [DateTime.add(DateTime.utc_now(), -31 * 60, :second), assignment.id]
    )

    assert :ok = AutoReleaseWorker.perform(%Oban.Job{})

    {:ok, updated_lead} = Sales.get_lead(lead.id)
    assert updated_lead.status == :new
  end

  test "does not release fresh assignments", %{agent: agent, lead: lead} do
    {:ok, _} = Sales.assign_lead(lead, agent)

    assert :ok = AutoReleaseWorker.perform(%Oban.Job{})

    {:ok, updated_lead} = Sales.get_lead(lead.id)
    assert updated_lead.status == :new  # Still assigned via the assignment
  end
end
```

- [ ] **Step 2: Write failing test for quarantine release**

Create `backend/test/saleflow/workers/quarantine_release_worker_test.exs`:

```elixir
defmodule Saleflow.Workers.QuarantineReleaseWorkerTest do
  use Saleflow.DataCase, async: false

  alias Saleflow.Workers.QuarantineReleaseWorker
  alias Saleflow.Sales

  test "releases leads whose quarantine has expired" do
    {:ok, lead} = Sales.create_lead(%{företag: "Test AB", telefon: "+46701234567", status: :new})

    # Set quarantine with past expiry
    lead
    |> Ash.Changeset.for_update(:update_status, %{
      status: :quarantine,
      quarantine_until: DateTime.add(DateTime.utc_now(), -1, :second)
    })
    |> Ash.update!()

    assert :ok = QuarantineReleaseWorker.perform(%Oban.Job{})

    {:ok, updated} = Sales.get_lead(lead.id)
    assert updated.status == :new
    assert updated.quarantine_until == nil
  end

  test "does not release leads still in quarantine" do
    {:ok, lead} = Sales.create_lead(%{företag: "Test AB", telefon: "+46701234567", status: :new})

    Sales.update_lead_status(lead, %{status: :quarantine})

    assert :ok = QuarantineReleaseWorker.perform(%Oban.Job{})

    {:ok, updated} = Sales.get_lead(lead.id)
    assert updated.status == :quarantine
  end
end
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
mix test test/saleflow/workers/
```

- [ ] **Step 4: Create AutoReleaseWorker**

Create `backend/lib/saleflow/workers/auto_release_worker.ex`:

```elixir
defmodule Saleflow.Workers.AutoReleaseWorker do
  use Oban.Worker, queue: :scheduled, max_attempts: 3

  alias Saleflow.Sales

  @impl Oban.Worker
  def perform(%Oban.Job{}) do
    thirty_minutes_ago = DateTime.add(DateTime.utc_now(), -30 * 60, :second)

    {:ok, stale_assignments} =
      Saleflow.Sales.Assignment
      |> Ash.Query.filter(is_nil(released_at) and assigned_at < ^thirty_minutes_ago)
      |> Ash.read()

    for assignment <- stale_assignments do
      Sales.release_assignment(assignment, :timeout)

      {:ok, lead} = Sales.get_lead(assignment.lead_id)

      if lead.status == :assigned do
        Sales.update_lead_status(lead, %{status: :new})
      end
    end

    :ok
  end
end
```

- [ ] **Step 5: Create QuarantineReleaseWorker**

Create `backend/lib/saleflow/workers/quarantine_release_worker.ex`:

```elixir
defmodule Saleflow.Workers.QuarantineReleaseWorker do
  use Oban.Worker, queue: :scheduled, max_attempts: 3

  alias Saleflow.Sales

  @impl Oban.Worker
  def perform(%Oban.Job{}) do
    now = DateTime.utc_now()

    {:ok, expired_leads} =
      Saleflow.Sales.Lead
      |> Ash.Query.filter(status == :quarantine and quarantine_until < ^now)
      |> Ash.read()

    for lead <- expired_leads do
      Sales.update_lead_status(lead, %{status: :new, quarantine_until: nil})
    end

    :ok
  end
end
```

- [ ] **Step 6: Register Oban cron jobs**

Add to `backend/config/config.exs` under the Oban config:

```elixir
config :saleflow, Oban,
  repo: Saleflow.Repo,
  queues: [default: 10, scheduled: 5],
  plugins: [
    {Oban.Plugins.Cron, crontab: [
      {"*/5 * * * *", Saleflow.Workers.AutoReleaseWorker},
      {"0 * * * *", Saleflow.Workers.QuarantineReleaseWorker}
    ]}
  ]
```

- [ ] **Step 7: Run tests**

```bash
mix test test/saleflow/workers/
```

Expected: all 4 tests pass

- [ ] **Step 8: Commit**

```bash
cd ~/dev/saleflow
git add backend/
git commit -m "feat: add Oban workers for auto-release and quarantine release"
```

---

### Task 8: XLSX import

**Files:**
- Create: `backend/lib/saleflow/sales/import.ex`
- Create: `backend/test/saleflow/sales/import_test.exs`
- Create: `backend/test/fixtures/test-leads.xlsx`

- [ ] **Step 1: Create test fixture xlsx**

```bash
cd ~/dev/saleflow/backend
mkdir -p test/fixtures
```

Create `backend/test/fixtures/` — we'll generate the xlsx in the test setup.

- [ ] **Step 2: Write failing import test**

Create `backend/test/saleflow/sales/import_test.exs`:

```elixir
defmodule Saleflow.Sales.ImportTest do
  use Saleflow.DataCase, async: true

  alias Saleflow.Sales.Import
  alias Saleflow.Sales

  describe "import_xlsx" do
    test "imports leads from xlsx data" do
      rows = [
        %{
          "företag" => "Import AB",
          "telefon" => "+46701234567",
          "epost" => "info@import.se",
          "stad" => "Stockholm",
          "orgnr" => "5591234567"
        },
        %{
          "företag" => "Another AB",
          "telefon" => "+46709876543",
          "stad" => "Göteborg"
        }
      ]

      assert {:ok, result} = Import.import_rows(rows)
      assert result.created == 2
      assert result.skipped == 0

      {:ok, leads} = Sales.list_leads()
      assert length(leads) == 2
    end

    test "skips duplicates by telefon" do
      rows = [
        %{"företag" => "First AB", "telefon" => "+46701234567"},
        %{"företag" => "Dupe AB", "telefon" => "+46701234567"}
      ]

      assert {:ok, result} = Import.import_rows(rows)
      assert result.created == 1
      assert result.skipped == 1
    end

    test "skips rows without required fields" do
      rows = [
        %{"företag" => "No Phone AB"},
        %{"telefon" => "+46701234567"}
      ]

      assert {:ok, result} = Import.import_rows(rows)
      assert result.created == 0
      assert result.skipped == 2
    end
  end
end
```

- [ ] **Step 3: Run test to verify it fails**

```bash
mix test test/saleflow/sales/import_test.exs
```

- [ ] **Step 4: Implement Import module**

Create `backend/lib/saleflow/sales/import.ex`:

```elixir
defmodule Saleflow.Sales.Import do
  alias Saleflow.Sales

  @required_fields ["företag", "telefon"]

  def import_rows(rows) do
    seen_phones = MapSet.new()

    {created, skipped, _seen} =
      Enum.reduce(rows, {0, 0, seen_phones}, fn row, {created, skipped, seen} ->
        företag = Map.get(row, "företag", "")
        telefon = Map.get(row, "telefon", "")

        cond do
          företag == "" or telefon == "" ->
            {created, skipped + 1, seen}

          MapSet.member?(seen, telefon) ->
            {created, skipped + 1, seen}

          true ->
            params = %{
              företag: företag,
              telefon: telefon,
              epost: Map.get(row, "epost"),
              hemsida: Map.get(row, "hemsida"),
              adress: Map.get(row, "adress"),
              postnummer: Map.get(row, "postnummer"),
              stad: Map.get(row, "stad"),
              bransch: Map.get(row, "bransch"),
              orgnr: Map.get(row, "orgnr"),
              omsättning_tkr: Map.get(row, "omsättning_tkr"),
              vinst_tkr: Map.get(row, "vinst_tkr"),
              anställda: Map.get(row, "anställda"),
              vd_namn: Map.get(row, "vd_namn"),
              bolagsform: Map.get(row, "bolagsform"),
              status: :new,
              imported_at: DateTime.utc_now()
            }

            case Sales.create_lead(params) do
              {:ok, _} -> {created + 1, skipped, MapSet.put(seen, telefon)}
              {:error, _} -> {created, skipped + 1, MapSet.put(seen, telefon)}
            end
        end
      end)

    {:ok, %{created: created, skipped: skipped}}
  end

  def parse_xlsx(file_path) do
    {:ok, table_id} = Xlsxir.multi_extract(file_path, 0)
    rows = Xlsxir.get_list(table_id)
    Xlsxir.close(table_id)

    case rows do
      [headers | data_rows] ->
        headers = Enum.map(headers, &to_string/1)

        parsed =
          Enum.map(data_rows, fn row ->
            Enum.zip(headers, row)
            |> Enum.into(%{}, fn {k, v} -> {k, to_string(v)} end)
          end)

        {:ok, parsed}

      _ ->
        {:error, :empty_file}
    end
  end
end
```

- [ ] **Step 5: Run tests**

```bash
mix test test/saleflow/sales/import_test.exs
```

Expected: all 3 tests pass

- [ ] **Step 6: Commit**

```bash
cd ~/dev/saleflow
git add backend/
git commit -m "feat: add XLSX import with duplicate detection"
```

---

### Task 9: Phoenix JSON API controllers

**Files:**
- Create: `backend/lib/saleflow_web/controllers/auth_controller.ex`
- Create: `backend/lib/saleflow_web/controllers/lead_controller.ex`
- Create: `backend/lib/saleflow_web/controllers/meeting_controller.ex`
- Create: `backend/lib/saleflow_web/controllers/import_controller.ex`
- Create: `backend/lib/saleflow_web/controllers/admin_controller.ex`
- Create: `backend/lib/saleflow_web/controllers/audit_controller.ex`
- Create: `backend/lib/saleflow_web/plugs/require_auth.ex`
- Create: `backend/lib/saleflow_web/plugs/require_admin.ex`
- Modify: `backend/lib/saleflow_web/router.ex`
- Create: `backend/test/saleflow_web/controllers/auth_controller_test.exs`
- Create: `backend/test/saleflow_web/controllers/lead_controller_test.exs`
- Create: `backend/test/saleflow_web/controllers/meeting_controller_test.exs`

- [ ] **Step 1: Write failing auth controller test**

Create `backend/test/saleflow_web/controllers/auth_controller_test.exs`:

```elixir
defmodule SaleflowWeb.AuthControllerTest do
  use SaleflowWeb.ConnCase, async: true

  alias Saleflow.Accounts

  setup do
    {:ok, user} =
      Accounts.register(%{
        email: "agent@test.com",
        password: "password123",
        password_confirmation: "password123",
        name: "Agent",
        role: :agent
      })

    %{user: user}
  end

  describe "POST /api/auth/sign-in" do
    test "signs in with valid credentials", %{conn: conn} do
      conn =
        post(conn, "/api/auth/sign-in", %{
          email: "agent@test.com",
          password: "password123"
        })

      assert %{"user" => %{"email" => "agent@test.com"}} = json_response(conn, 200)
    end

    test "rejects invalid credentials", %{conn: conn} do
      conn =
        post(conn, "/api/auth/sign-in", %{
          email: "agent@test.com",
          password: "wrong"
        })

      assert json_response(conn, 401)
    end
  end

  describe "GET /api/auth/me" do
    test "returns current user when authenticated", %{conn: conn, user: user} do
      conn =
        conn
        |> put_session(:user_id, user.id)
        |> get("/api/auth/me")

      assert %{"user" => %{"email" => "agent@test.com"}} = json_response(conn, 200)
    end

    test "returns 401 when not authenticated", %{conn: conn} do
      conn = get(conn, "/api/auth/me")
      assert json_response(conn, 401)
    end
  end

  describe "POST /api/auth/sign-out" do
    test "signs out", %{conn: conn, user: user} do
      conn =
        conn
        |> put_session(:user_id, user.id)
        |> post("/api/auth/sign-out")

      assert json_response(conn, 200)
    end
  end
end
```

- [ ] **Step 2: Write failing lead controller test**

Create `backend/test/saleflow_web/controllers/lead_controller_test.exs`:

```elixir
defmodule SaleflowWeb.LeadControllerTest do
  use SaleflowWeb.ConnCase, async: false

  alias Saleflow.Accounts
  alias Saleflow.Sales

  setup do
    {:ok, agent} =
      Accounts.register(%{
        email: "agent@test.com",
        password: "password123",
        password_confirmation: "password123",
        name: "Agent",
        role: :agent
      })

    {:ok, lead} = Sales.create_lead(%{företag: "Test AB", telefon: "+46701234567", status: :new})

    conn = build_conn() |> put_session(:user_id, agent.id)

    %{agent: agent, lead: lead, conn: conn}
  end

  describe "POST /api/leads/next" do
    test "returns next available lead", %{conn: conn} do
      conn = post(conn, "/api/leads/next")

      assert %{"lead" => %{"företag" => "Test AB"}} = json_response(conn, 200)
    end
  end

  describe "POST /api/leads/:id/outcome" do
    test "logs outcome and moves to next", %{conn: conn, lead: lead} do
      # First assign
      post(conn, "/api/leads/next")

      conn =
        post(conn, "/api/leads/#{lead.id}/outcome", %{
          outcome: "no_answer",
          notes: ""
        })

      assert json_response(conn, 200)
    end
  end

  describe "GET /api/leads/:id" do
    test "returns lead detail with history", %{conn: conn, lead: lead} do
      conn = get(conn, "/api/leads/#{lead.id}")

      assert %{"lead" => %{"företag" => "Test AB"}} = json_response(conn, 200)
    end
  end

  describe "GET /api/leads" do
    test "returns all leads with search", %{conn: conn} do
      conn = get(conn, "/api/leads", %{q: "Test"})

      assert %{"leads" => leads} = json_response(conn, 200)
      assert length(leads) == 1
    end
  end
end
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
mix test test/saleflow_web/controllers/
```

- [ ] **Step 4: Create auth plugs**

Create `backend/lib/saleflow_web/plugs/require_auth.ex`:

```elixir
defmodule SaleflowWeb.Plugs.RequireAuth do
  import Plug.Conn
  import Phoenix.Controller

  def init(opts), do: opts

  def call(conn, _opts) do
    case get_session(conn, :user_id) do
      nil ->
        conn
        |> put_status(:unauthorized)
        |> json(%{error: "unauthorized"})
        |> halt()

      user_id ->
        case Saleflow.Accounts.User |> Ash.get(user_id) do
          {:ok, user} -> assign(conn, :current_user, user)
          _ ->
            conn
            |> put_status(:unauthorized)
            |> json(%{error: "unauthorized"})
            |> halt()
        end
    end
  end
end
```

Create `backend/lib/saleflow_web/plugs/require_admin.ex`:

```elixir
defmodule SaleflowWeb.Plugs.RequireAdmin do
  import Plug.Conn
  import Phoenix.Controller

  def init(opts), do: opts

  def call(conn, _opts) do
    case conn.assigns[:current_user] do
      %{role: :admin} -> conn
      _ ->
        conn
        |> put_status(:forbidden)
        |> json(%{error: "forbidden"})
        |> halt()
    end
  end
end
```

- [ ] **Step 5: Create AuthController**

Create `backend/lib/saleflow_web/controllers/auth_controller.ex`:

```elixir
defmodule SaleflowWeb.AuthController do
  use SaleflowWeb, :controller

  alias Saleflow.Accounts

  def sign_in(conn, %{"email" => email, "password" => password}) do
    case Accounts.sign_in(%{email: email, password: password}) do
      {:ok, user} ->
        conn
        |> put_session(:user_id, user.id)
        |> json(%{user: serialize_user(user)})

      {:error, _} ->
        conn
        |> put_status(:unauthorized)
        |> json(%{error: "invalid credentials"})
    end
  end

  def me(conn, _params) do
    json(conn, %{user: serialize_user(conn.assigns.current_user)})
  end

  def sign_out(conn, _params) do
    conn
    |> clear_session()
    |> json(%{ok: true})
  end

  defp serialize_user(user) do
    %{
      id: user.id,
      email: to_string(user.email),
      name: user.name,
      role: user.role
    }
  end
end
```

- [ ] **Step 6: Create LeadController**

Create `backend/lib/saleflow_web/controllers/lead_controller.ex`:

```elixir
defmodule SaleflowWeb.LeadController do
  use SaleflowWeb, :controller

  alias Saleflow.Sales
  alias Saleflow.Audit

  def index(conn, params) do
    leads =
      case Map.get(params, "q") do
        nil -> Sales.list_leads()
        "" -> Sales.list_leads()
        query -> Sales.search_leads(query)
      end

    case leads do
      {:ok, leads} -> json(conn, %{leads: Enum.map(leads, &serialize_lead/1)})
      {:error, _} -> json(conn, %{leads: []})
    end
  end

  def show(conn, %{"id" => id}) do
    with {:ok, lead} <- Sales.get_lead(id),
         {:ok, calls} <- Sales.list_calls_for_lead(id),
         {:ok, audit} <- Audit.list_for_resource("Lead", id) do
      json(conn, %{
        lead: serialize_lead(lead),
        calls: Enum.map(calls, &serialize_call/1),
        audit: Enum.map(audit, &serialize_audit/1)
      })
    end
  end

  def next(conn, _params) do
    agent = conn.assigns.current_user

    case Sales.get_next_lead(agent) do
      {:ok, nil} -> json(conn, %{lead: nil})
      {:ok, lead} -> json(conn, %{lead: serialize_lead(lead)})
    end
  end

  def outcome(conn, %{"id" => id, "outcome" => outcome} = params) do
    agent = conn.assigns.current_user

    with {:ok, lead} <- Sales.get_lead(id) do
      # Log the call
      Sales.log_call(%{
        lead_id: lead.id,
        user_id: agent.id,
        outcome: String.to_existing_atom(outcome),
        notes: Map.get(params, "notes", "")
      })

      # Release assignment
      case Sales.get_active_assignment(agent) do
        {:ok, assignment} when not is_nil(assignment) ->
          Sales.release_assignment(assignment, :outcome_logged)
        _ -> :ok
      end

      # Update lead status based on outcome
      new_status =
        case outcome do
          "meeting_booked" -> :meeting_booked
          "callback" -> :callback
          "not_interested" -> :quarantine
          "no_answer" -> :new
          "bad_number" -> :bad_number
          "customer" -> :customer
          _ -> :new
        end

      status_params = %{status: new_status}

      status_params =
        if outcome == "callback" do
          Map.put(status_params, :callback_at, Map.get(params, "callback_at"))
        else
          status_params
        end

      Sales.update_lead_status(lead, status_params)

      # Create quarantine record if needed
      if outcome == "not_interested" do
        Sales.create_quarantine(%{
          lead_id: lead.id,
          user_id: agent.id,
          reason: Map.get(params, "notes", "Ej intresserad")
        })
      end

      # Create meeting if needed
      if outcome == "meeting_booked" do
        Sales.create_meeting(%{
          lead_id: lead.id,
          user_id: agent.id,
          title: Map.get(params, "meeting_title", "Möte med #{lead.företag}"),
          meeting_date: Map.get(params, "meeting_date") |> Date.from_iso8601!(),
          meeting_time: Map.get(params, "meeting_time") |> Time.from_iso8601!(),
          notes: Map.get(params, "notes", "")
        })
      end

      json(conn, %{ok: true})
    end
  end

  defp serialize_lead(lead) do
    Map.take(lead, [
      :id, :företag, :telefon, :epost, :hemsida, :adress, :postnummer, :stad,
      :bransch, :orgnr, :omsättning_tkr, :vinst_tkr, :anställda, :vd_namn,
      :bolagsform, :status, :quarantine_until, :callback_at, :imported_at,
      :inserted_at, :updated_at
    ])
  end

  defp serialize_call(call) do
    Map.take(call, [:id, :lead_id, :user_id, :outcome, :notes, :called_at])
  end

  defp serialize_audit(log) do
    Map.take(log, [:id, :user_id, :action, :resource_type, :resource_id, :changes, :metadata, :inserted_at])
  end
end
```

- [ ] **Step 7: Create MeetingController**

Create `backend/lib/saleflow_web/controllers/meeting_controller.ex`:

```elixir
defmodule SaleflowWeb.MeetingController do
  use SaleflowWeb, :controller

  alias Saleflow.Sales

  def index(conn, _params) do
    {:ok, meetings} = Sales.list_upcoming_meetings()
    json(conn, %{meetings: Enum.map(meetings, &serialize_meeting/1)})
  end

  def create(conn, params) do
    agent = conn.assigns.current_user

    case Sales.create_meeting(%{
      lead_id: params["lead_id"],
      user_id: agent.id,
      title: params["title"],
      meeting_date: Date.from_iso8601!(params["meeting_date"]),
      meeting_time: Time.from_iso8601!(params["meeting_time"]),
      notes: Map.get(params, "notes")
    }) do
      {:ok, meeting} -> json(conn, %{meeting: serialize_meeting(meeting)})
      {:error, err} -> conn |> put_status(422) |> json(%{error: inspect(err)})
    end
  end

  def cancel(conn, %{"id" => id}) do
    {:ok, meeting} = Ash.get(Saleflow.Sales.Meeting, id)

    case Sales.cancel_meeting(meeting) do
      {:ok, meeting} -> json(conn, %{meeting: serialize_meeting(meeting)})
      {:error, err} -> conn |> put_status(422) |> json(%{error: inspect(err)})
    end
  end

  defp serialize_meeting(m) do
    Map.take(m, [:id, :lead_id, :user_id, :title, :meeting_date, :meeting_time, :notes, :status, :inserted_at])
  end
end
```

- [ ] **Step 8: Create ImportController**

Create `backend/lib/saleflow_web/controllers/import_controller.ex`:

```elixir
defmodule SaleflowWeb.ImportController do
  use SaleflowWeb, :controller

  alias Saleflow.Sales.Import

  def create(conn, %{"file" => %Plug.Upload{path: path}}) do
    with {:ok, rows} <- Import.parse_xlsx(path),
         {:ok, result} <- Import.import_rows(rows) do
      json(conn, %{created: result.created, skipped: result.skipped})
    else
      {:error, reason} ->
        conn |> put_status(422) |> json(%{error: inspect(reason)})
    end
  end
end
```

- [ ] **Step 9: Create AuditController**

Create `backend/lib/saleflow_web/controllers/audit_controller.ex`:

```elixir
defmodule SaleflowWeb.AuditController do
  use SaleflowWeb, :controller

  alias Saleflow.Audit

  def index(conn, params) do
    filters =
      params
      |> Map.take(["user_id", "action"])
      |> Enum.into(%{}, fn {k, v} -> {String.to_existing_atom(k), v} end)

    {:ok, logs} = Audit.list_logs(filters)

    json(conn, %{
      logs: Enum.map(logs, fn l ->
        Map.take(l, [:id, :user_id, :action, :resource_type, :resource_id, :changes, :metadata, :inserted_at])
      end)
    })
  end
end
```

- [ ] **Step 10: Create AdminController**

Create `backend/lib/saleflow_web/controllers/admin_controller.ex`:

```elixir
defmodule SaleflowWeb.AdminController do
  use SaleflowWeb, :controller

  alias Saleflow.Accounts
  alias Saleflow.Sales

  def users(conn, _params) do
    {:ok, users} = Accounts.list_users()

    json(conn, %{
      users: Enum.map(users, fn u ->
        %{id: u.id, email: to_string(u.email), name: u.name, role: u.role}
      end)
    })
  end

  def create_user(conn, params) do
    case Accounts.register(%{
      email: params["email"],
      password: params["password"],
      password_confirmation: params["password_confirmation"],
      name: params["name"],
      role: String.to_existing_atom(params["role"] || "agent")
    }) do
      {:ok, user} ->
        json(conn, %{user: %{id: user.id, email: to_string(user.email), name: user.name, role: user.role}})

      {:error, err} ->
        conn |> put_status(422) |> json(%{error: inspect(err)})
    end
  end

  def stats(conn, _params) do
    {:ok, leads} = Sales.list_leads()

    stats = %{
      total_leads: length(leads),
      new: Enum.count(leads, &(&1.status == :new)),
      assigned: Enum.count(leads, &(&1.status == :assigned)),
      meeting_booked: Enum.count(leads, &(&1.status == :meeting_booked)),
      quarantine: Enum.count(leads, &(&1.status == :quarantine)),
      customer: Enum.count(leads, &(&1.status == :customer)),
      bad_number: Enum.count(leads, &(&1.status == :bad_number))
    }

    json(conn, %{stats: stats})
  end
end
```

- [ ] **Step 11: Configure router**

Replace `backend/lib/saleflow_web/router.ex`:

```elixir
defmodule SaleflowWeb.Router do
  use SaleflowWeb, :router

  pipeline :api do
    plug :accepts, ["json"]
    plug :fetch_session
    plug CORSPlug, origin: ["http://localhost:5173"]
  end

  pipeline :require_auth do
    plug SaleflowWeb.Plugs.RequireAuth
  end

  pipeline :require_admin do
    plug SaleflowWeb.Plugs.RequireAdmin
  end

  scope "/api", SaleflowWeb do
    pipe_through :api

    post "/auth/sign-in", AuthController, :sign_in
  end

  scope "/api", SaleflowWeb do
    pipe_through [:api, :require_auth]

    get "/auth/me", AuthController, :me
    post "/auth/sign-out", AuthController, :sign_out

    # Leads
    get "/leads", LeadController, :index
    get "/leads/:id", LeadController, :show
    post "/leads/next", LeadController, :next
    post "/leads/:id/outcome", LeadController, :outcome

    # Meetings
    get "/meetings", MeetingController, :index
    post "/meetings", MeetingController, :create
    post "/meetings/:id/cancel", MeetingController, :cancel

    # Audit
    get "/audit", AuditController, :index
  end

  scope "/api/admin", SaleflowWeb do
    pipe_through [:api, :require_auth, :require_admin]

    get "/users", AdminController, :users
    post "/users", AdminController, :create_user
    get "/stats", AdminController, :stats
    post "/import", ImportController, :create
  end
end
```

- [ ] **Step 12: Run all tests**

```bash
mix test
```

Expected: all tests pass

- [ ] **Step 13: Commit**

```bash
cd ~/dev/saleflow
git add backend/
git commit -m "feat: add all JSON API controllers + router + auth plugs"
```

---

### Task 10: Seed data + full test run

**Files:**
- Create: `backend/priv/repo/seeds.exs`

- [ ] **Step 1: Create seed file**

Create `backend/priv/repo/seeds.exs`:

```elixir
alias Saleflow.Accounts
alias Saleflow.Sales

# Create admin user
{:ok, admin} =
  Accounts.register(%{
    email: "admin@saleflow.se",
    password: "admin123",
    password_confirmation: "admin123",
    name: "Admin",
    role: :admin
  })

# Create agent
{:ok, agent} =
  Accounts.register(%{
    email: "agent@saleflow.se",
    password: "agent123",
    password_confirmation: "agent123",
    name: "Test Agent",
    role: :agent
  })

# Create sample leads
leads = [
  %{företag: "Kroppex AB", telefon: "+46812345678", stad: "Stockholm", bransch: "Hälsa", orgnr: "5591485619"},
  %{företag: "Citymassage", telefon: "+460735305471", stad: "Malmö", bransch: "Massage", orgnr: "67120611293580"},
  %{företag: "Frisör Supreme AB", telefon: "+46701112233", stad: "Göteborg", bransch: "Frisör"},
  %{företag: "Byggmästarna i Norr AB", telefon: "+46702223344", stad: "Umeå", bransch: "Bygg", orgnr: "5595795245"},
  %{företag: "VVS Experten AB", telefon: "+46703334455", stad: "Uppsala", bransch: "VVS"},
]

for lead_params <- leads do
  Sales.create_lead(Map.put(lead_params, :status, :new))
end

IO.puts("Seeded: 1 admin, 1 agent, #{length(leads)} leads")
```

- [ ] **Step 2: Run seed**

```bash
cd ~/dev/saleflow/backend
mix run priv/repo/seeds.exs
```

- [ ] **Step 3: Run full test suite with coverage**

```bash
mix coveralls
```

Expected: all tests pass, coverage report generated

- [ ] **Step 4: Commit**

```bash
cd ~/dev/saleflow
git add backend/
git commit -m "feat: add seed data + verify full test coverage"
```

---

## Summary

| Task | What | Tests |
|------|------|-------|
| 1 | Phoenix scaffold + deps | - |
| 2 | Accounts domain (User + auth) | 5 tests |
| 3 | Audit domain (AuditLog) | 3 tests |
| 4 | Lead resource | 5 tests |
| 5 | Assignment, CallLog, Meeting, Quarantine | 7 tests |
| 6 | Lead queue (get_next + locking) | 5 tests |
| 7 | Oban workers | 4 tests |
| 8 | XLSX import | 3 tests |
| 9 | JSON API controllers | 8+ tests |
| 10 | Seeds + coverage | - |

**Total: 10 tasks, ~40+ backend tests, 100% coverage target**

Plans 2 (frontend) and 3 (E2E) will be written after Plan 1 is implemented.
