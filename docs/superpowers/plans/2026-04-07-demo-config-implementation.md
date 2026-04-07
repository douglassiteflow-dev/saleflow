# Demo-konfigurering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Deal pipeline with an automated Demo-konfigurering flow where booking a meeting with a URL auto-generates a demo website via Claude CLI.

**Architecture:** New `DemoConfig` Ash resource replaces `Deal`. An Oban worker spawns Claude CLI to generate single-file HTML websites from a URL. Progress streams to the frontend via SSE over Phoenix PubSub. The "Deals" tab becomes "Demo" with a status list + detail view.

**Tech Stack:** Elixir/Phoenix/Ash (backend), Oban (workers), Phoenix.PubSub (SSE), React/TypeScript/React Query (frontend), Claude CLI (generation)

**Spec:** `docs/superpowers/specs/2026-04-07-demo-config-design.md`

---

## File Structure

### Backend — New files
| File | Responsibility |
|------|---------------|
| `lib/saleflow/sales/demo_config.ex` | Ash resource: stages, actions, validations |
| `lib/saleflow_web/controllers/demo_config_controller.ex` | REST endpoints + SSE |
| `lib/saleflow/workers/demo_generation_worker.ex` | Oban worker: spawns Claude CLI |
| `priv/repo/migrations/*_create_demo_configs.exs` | Database migration |
| `priv/demo_generation/brief.md` | Claude CLI prompt template |
| `test/saleflow/sales/demo_config_test.exs` | Resource tests |
| `test/saleflow/workers/demo_generation_worker_test.exs` | Worker tests |
| `test/saleflow_web/controllers/demo_config_controller_test.exs` | Controller tests |

### Backend — Modified files
| File | Change |
|------|--------|
| `lib/saleflow/sales.ex` | Add DemoConfig domain functions |
| `lib/saleflow/sales/meeting.ex` | `deal_id` → `demo_config_id` |
| `lib/saleflow_web/controllers/meeting_controller.ex` | Auto-create DemoConfig on booking |
| `lib/saleflow_web/router.ex` | Add demo_config routes |
| `config/config.exs` | Add `:demo_generation` Oban queue |

### Frontend — New files
| File | Responsibility |
|------|---------------|
| `src/api/demo-configs.ts` | React Query hooks for DemoConfig |
| `src/components/dialer/demo-tab.tsx` | List of demo configs |
| `src/components/dialer/demo-detail-tab.tsx` | Detail view with SSE progress |
| `src/components/dialer/demo-stage-indicator.tsx` | Compact pill-row stage indicator |
| `src/__tests__/components/dialer/demo-tab.test.tsx` | DemoTab tests |
| `src/__tests__/components/dialer/demo-detail-tab.test.tsx` | DemoDetailTab tests |
| `src/__tests__/components/dialer/demo-stage-indicator.test.tsx` | Stage indicator tests |
| `src/__tests__/api/demo-configs.test.tsx` | API hook tests |

### Frontend — Modified files
| File | Change |
|------|--------|
| `src/api/types.ts` | Add DemoConfig + DemoStage types |
| `src/components/dialer/dialer-tabs.tsx` | "Deals" → "Demo" |
| `src/pages/dialer.tsx` | Replace deal state/tabs with demo config |
| `src/api/meetings.ts` | Add `source_url` to create mutation |

---

## Task 1: Database Migration

**Files:**
- Create: `backend/priv/repo/migrations/TIMESTAMP_create_demo_configs.exs`

- [ ] **Step 1: Generate migration file**

Run:
```bash
cd backend && mix ash.generate_migrations --name create_demo_configs
```

If the generator doesn't produce the right output, create manually:

```elixir
defmodule Saleflow.Repo.Migrations.CreateDemoConfigs do
  use Ecto.Migration

  def change do
    create table(:demo_configs, primary_key: false) do
      add :id, :uuid, primary_key: true, default: fragment("gen_random_uuid()")
      add :lead_id, references(:leads, type: :uuid, on_delete: :nothing), null: false
      add :user_id, references(:users, type: :uuid, on_delete: :nothing), null: false
      add :stage, :string, null: false, default: "meeting_booked"
      add :source_url, :string
      add :website_path, :string
      add :preview_url, :string
      add :notes, :text
      add :error, :text

      timestamps(type: :utc_datetime)
    end

    create index(:demo_configs, [:lead_id])
    create index(:demo_configs, [:user_id])
    create index(:demo_configs, [:stage])

    alter table(:meetings) do
      add :demo_config_id, references(:demo_configs, type: :uuid, on_delete: :nilify_all)
    end

    create index(:meetings, [:demo_config_id])
  end
end
```

- [ ] **Step 2: Run migration**

Run:
```bash
cd backend && mix ecto.migrate
```
Expected: Migration runs successfully, no errors.

- [ ] **Step 3: Commit**

```bash
cd backend && git add priv/repo/migrations/ && git commit -m "feat: add demo_configs table and meetings.demo_config_id"
```

---

## Task 2: DemoConfig Ash Resource

**Files:**
- Create: `backend/lib/saleflow/sales/demo_config.ex`
- Create: `backend/test/saleflow/sales/demo_config_test.exs`

- [ ] **Step 1: Write the test file**

```elixir
defmodule Saleflow.Sales.DemoConfigTest do
  use Saleflow.DataCase, async: true

  alias Saleflow.Sales

  defp create_lead! do
    {:ok, lead} =
      Saleflow.Sales.Lead
      |> Ash.Changeset.for_create(:create, %{
        company_name: "Test AB",
        phone: "0701234567"
      })
      |> Ash.create()

    lead
  end

  defp create_user! do
    {:ok, user} =
      Saleflow.Accounts.User
      |> Ash.Changeset.for_create(:create, %{
        email: "test-#{System.unique_integer([:positive])}@example.com",
        name: "Test User",
        role: :agent
      })
      |> Ash.create()

    user
  end

  describe "create" do
    test "creates a demo config with valid params" do
      lead = create_lead!()
      user = create_user!()

      assert {:ok, demo_config} =
               Sales.create_demo_config(%{
                 lead_id: lead.id,
                 user_id: user.id,
                 source_url: "https://www.bokadirekt.se/places/test-salong-12345"
               })

      assert demo_config.stage == :meeting_booked
      assert demo_config.source_url == "https://www.bokadirekt.se/places/test-salong-12345"
      assert demo_config.lead_id == lead.id
      assert demo_config.user_id == user.id
    end

    test "creates without source_url" do
      lead = create_lead!()
      user = create_user!()

      assert {:ok, demo_config} =
               Sales.create_demo_config(%{lead_id: lead.id, user_id: user.id})

      assert demo_config.stage == :meeting_booked
      assert is_nil(demo_config.source_url)
    end

    test "fails without lead_id" do
      user = create_user!()

      assert {:error, _} = Sales.create_demo_config(%{user_id: user.id})
    end
  end

  describe "start_generation" do
    test "transitions from meeting_booked to generating" do
      lead = create_lead!()
      user = create_user!()
      {:ok, dc} = Sales.create_demo_config(%{lead_id: lead.id, user_id: user.id, source_url: "https://example.com"})

      assert {:ok, updated} = Sales.start_generation(dc)
      assert updated.stage == :generating
    end
  end

  describe "generation_complete" do
    test "transitions from generating to demo_ready" do
      lead = create_lead!()
      user = create_user!()
      {:ok, dc} = Sales.create_demo_config(%{lead_id: lead.id, user_id: user.id, source_url: "https://example.com"})
      {:ok, dc} = Sales.start_generation(dc)

      assert {:ok, updated} =
               Sales.generation_complete(dc, %{
                 website_path: "/output/test-salong/site/index.html",
                 preview_url: "/api/demo-configs/#{dc.id}/preview"
               })

      assert updated.stage == :demo_ready
      assert updated.website_path == "/output/test-salong/site/index.html"
    end
  end

  describe "generation_failed" do
    test "sets error on generating demo config" do
      lead = create_lead!()
      user = create_user!()
      {:ok, dc} = Sales.create_demo_config(%{lead_id: lead.id, user_id: user.id, source_url: "https://example.com"})
      {:ok, dc} = Sales.start_generation(dc)

      assert {:ok, updated} = Sales.generation_failed(dc, %{error: "Claude CLI timeout"})
      assert updated.error == "Claude CLI timeout"
      assert updated.stage == :generating
    end
  end

  describe "advance_to_followup" do
    test "transitions from demo_ready to followup" do
      lead = create_lead!()
      user = create_user!()
      {:ok, dc} = Sales.create_demo_config(%{lead_id: lead.id, user_id: user.id, source_url: "https://example.com"})
      {:ok, dc} = Sales.start_generation(dc)
      {:ok, dc} = Sales.generation_complete(dc, %{website_path: "/path", preview_url: "/url"})

      assert {:ok, updated} = Sales.advance_to_followup(dc)
      assert updated.stage == :followup
    end
  end

  describe "cancel" do
    test "cancels a demo config" do
      lead = create_lead!()
      user = create_user!()
      {:ok, dc} = Sales.create_demo_config(%{lead_id: lead.id, user_id: user.id})

      assert {:ok, updated} = Sales.cancel_demo_config(dc)
      assert updated.stage == :cancelled
    end
  end
end
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
cd backend && mix test test/saleflow/sales/demo_config_test.exs
```
Expected: Compilation errors — `DemoConfig` module and `Sales` functions don't exist yet.

- [ ] **Step 3: Create DemoConfig resource**

Create `backend/lib/saleflow/sales/demo_config.ex`:

```elixir
defmodule Saleflow.Sales.DemoConfig do
  use Ash.Resource,
    otp_app: :saleflow,
    domain: Saleflow.Sales,
    data_layer: AshPostgres.DataLayer

  postgres do
    table "demo_configs"
    repo Saleflow.Repo
  end

  attributes do
    uuid_primary_key :id

    attribute :stage, :atom do
      constraints one_of: [:meeting_booked, :generating, :demo_ready, :followup, :cancelled]
      default :meeting_booked
      allow_nil? false
    end

    attribute :source_url, :string
    attribute :website_path, :string
    attribute :preview_url, :string
    attribute :notes, :string
    attribute :error, :string

    create_timestamp :inserted_at
    update_timestamp :updated_at
  end

  relationships do
    belongs_to :lead, Saleflow.Sales.Lead do
      allow_nil? false
    end

    belongs_to :user, Saleflow.Accounts.User do
      allow_nil? false
    end

    has_many :meetings, Saleflow.Sales.Meeting do
      destination_attribute :demo_config_id
    end
  end

  actions do
    defaults [:read]

    create :create do
      accept [:lead_id, :user_id, :source_url, :notes]

      change {Saleflow.Audit.Changes.CreateAuditLog, action: "demo_config.created"}
    end

    update :start_generation do
      change set_attribute(:stage, :generating)
      change {Saleflow.Audit.Changes.CreateAuditLog, action: "demo_config.generation_started"}

      validate attribute_equals(:stage, :meeting_booked),
        message: "kan bara starta generering från meeting_booked"
    end

    update :generation_complete do
      accept [:website_path, :preview_url]

      change set_attribute(:stage, :demo_ready)
      change {Saleflow.Audit.Changes.CreateAuditLog, action: "demo_config.generation_complete"}

      validate attribute_equals(:stage, :generating),
        message: "kan bara slutföra generering från generating"
    end

    update :generation_failed do
      accept [:error]

      change {Saleflow.Audit.Changes.CreateAuditLog, action: "demo_config.generation_failed"}

      validate attribute_equals(:stage, :generating),
        message: "kan bara rapportera fel från generating"
    end

    update :advance_to_followup do
      change set_attribute(:stage, :followup)
      change {Saleflow.Audit.Changes.CreateAuditLog, action: "demo_config.advanced_to_followup"}

      validate attribute_equals(:stage, :demo_ready),
        message: "kan bara gå till uppföljning från demo_ready"
    end

    update :cancel do
      change set_attribute(:stage, :cancelled)
      change {Saleflow.Audit.Changes.CreateAuditLog, action: "demo_config.cancelled"}
    end

    update :update_notes do
      accept [:notes]
    end
  end
end
```

- [ ] **Step 4: Register resource in Sales domain**

In `backend/lib/saleflow/sales.ex`, add to the `resources` block:

```elixir
resource Saleflow.Sales.DemoConfig
```

- [ ] **Step 5: Add domain functions to Sales.ex**

Add at the end of `backend/lib/saleflow/sales.ex`:

```elixir
# DemoConfig

def create_demo_config(params) do
  Saleflow.Sales.DemoConfig
  |> Ash.Changeset.for_create(:create, params)
  |> Ash.create()
end

def start_generation(demo_config) do
  demo_config
  |> Ash.Changeset.for_update(:start_generation, %{})
  |> Ash.update()
end

def generation_complete(demo_config, params) do
  demo_config
  |> Ash.Changeset.for_update(:generation_complete, params)
  |> Ash.update()
end

def generation_failed(demo_config, params) do
  demo_config
  |> Ash.Changeset.for_update(:generation_failed, params)
  |> Ash.update()
end

def advance_to_followup(demo_config) do
  demo_config
  |> Ash.Changeset.for_update(:advance_to_followup, %{})
  |> Ash.update()
end

def cancel_demo_config(demo_config) do
  demo_config
  |> Ash.Changeset.for_update(:cancel, %{})
  |> Ash.update()
end

def get_demo_config(id) do
  Saleflow.Sales.DemoConfig |> Ash.get(id)
end

def list_demo_configs() do
  Saleflow.Sales.DemoConfig |> Ash.read()
end

def list_demo_configs_for_user(user_id) do
  require Ash.Query

  Saleflow.Sales.DemoConfig
  |> Ash.Query.filter(user_id == ^user_id)
  |> Ash.Query.filter(stage != :cancelled)
  |> Ash.Query.sort(inserted_at: :desc)
  |> Ash.read()
end
```

- [ ] **Step 6: Run tests**

Run:
```bash
cd backend && mix test test/saleflow/sales/demo_config_test.exs
```
Expected: All tests pass.

- [ ] **Step 7: Commit**

```bash
cd backend && git add lib/saleflow/sales/demo_config.ex lib/saleflow/sales.ex test/saleflow/sales/demo_config_test.exs && git commit -m "feat: add DemoConfig Ash resource with stage transitions"
```

---

## Task 3: Update Meeting Resource

**Files:**
- Modify: `backend/lib/saleflow/sales/meeting.ex`
- Create: `backend/priv/repo/migrations/TIMESTAMP_add_demo_config_id_to_meetings.exs` (if not done in Task 1)

- [ ] **Step 1: Write test for meeting with demo_config_id**

Add to existing meeting tests or create new:

```elixir
test "creates meeting with demo_config_id" do
  lead = create_lead!()
  user = create_user!()
  {:ok, dc} = Sales.create_demo_config(%{lead_id: lead.id, user_id: user.id})

  {:ok, meeting} =
    Sales.create_meeting(%{
      lead_id: lead.id,
      user_id: user.id,
      title: "Demo-möte",
      meeting_date: Date.utc_today() |> Date.add(1) |> Date.to_iso8601(),
      meeting_time: "10:00:00",
      demo_config_id: dc.id
    })

  assert meeting.demo_config_id == dc.id
end
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
cd backend && mix test test/saleflow/sales/demo_config_test.exs
```
Expected: FAIL — `demo_config_id` not accepted.

- [ ] **Step 3: Add demo_config_id to Meeting resource**

In `backend/lib/saleflow/sales/meeting.ex`, add to `relationships`:

```elixir
belongs_to :demo_config, Saleflow.Sales.DemoConfig do
  allow_nil? true
end
```

Add `:demo_config_id` to the `:create` and `:update` action `accept` lists.

- [ ] **Step 4: Run tests**

Run:
```bash
cd backend && mix test test/saleflow/sales/demo_config_test.exs
```
Expected: All pass.

- [ ] **Step 5: Commit**

```bash
cd backend && git add lib/saleflow/sales/meeting.ex test/ && git commit -m "feat: add demo_config_id to Meeting resource"
```

---

## Task 4: Brief Template for Claude CLI

**Files:**
- Create: `backend/priv/demo_generation/brief.md`

- [ ] **Step 1: Create brief template**

```markdown
# Demo-hemsida Brief

## Uppdrag

Du ska skapa en professionell demo-hemsida för ett svenskt företag. All information ska hämtas från företagets befintliga hemsida.

## Steg 1: Läs företagets hemsida

Besök denna URL och extrahera all relevant information:

**URL:** $SOURCE_URL

Extrahera:
- Företagsnamn
- Bransch/verksamhet
- Alla tjänster med priser (om tillgängliga)
- Kontaktinformation (telefon, e-post, adress)
- Öppettider (om tillgängliga)
- Recensioner/betyg (om tillgängliga)
- Beskrivning av verksamheten

## Steg 2: Bestäm design

Baserat på branschen, välj:
- **Färgpalett** — 5 färger (primary, secondary, accent, background, text) som passar branschen
- **Typsnitt** — Google Fonts som passar stilen
- **Stockbilder** — Välj passande Unsplash-bilder. Format: `https://images.unsplash.com/photo-XXXXX?w=1200&q=80`

## Steg 3: Generera hemsidan

Skapa filen `$OUTPUT_DIR/site/index.html` — en komplett, single-file HTML-sida med ALL CSS och JS inline.

### Krav

**Logo:**
- Generera en text-logo i HTML/CSS med företagsnamnet
- Använd passande typsnitt och färg från paletten
- ALDRIG använda kundens logotyp-bild

**Bilder:**
- Använd ENBART Unsplash-stockbilder
- ALDRIG använda bilder från kundens hemsida
- Välj bilder som passar branschen och verksamheten
- Hero-bild ska vara stämningsfull och relaterad till branschen

**Tjänster:**
- Inkludera ALLA tjänster från kundens sida
- Om fler än 15 tjänster: använd "Visa fler"-toggle
- Visa priser om tillgängliga

**Recensioner/betyg:**
- Om recensioner finns: visa som horisontellt scrollande kort (CSS animation, infinite loop)
- Om aggregerat betyg finns: visa badge i hero-sektionen

**Layout:**
- Responsive design (mobil + desktop)
- Sektioner: Hero → Om oss → Tjänster → Recensioner (om finns) → Kontakt → Footer
- Modern, professionell design
- INGEN "Team"-sektion

**Tekniskt:**
- Single HTML file — all CSS och JS inline
- Inga externa beroenden förutom Google Fonts och Unsplash-bilder
- Smooth scroll-navigation
- Semantisk HTML5
```

- [ ] **Step 2: Commit**

```bash
cd backend && git add priv/demo_generation/brief.md && git commit -m "feat: add Claude CLI brief template for demo generation"
```

---

## Task 5: DemoGenerationWorker

**Files:**
- Create: `backend/lib/saleflow/workers/demo_generation_worker.ex`
- Create: `backend/test/saleflow/workers/demo_generation_worker_test.exs`

- [ ] **Step 1: Write the test file**

```elixir
defmodule Saleflow.Workers.DemoGenerationWorkerTest do
  use Saleflow.DataCase, async: true

  alias Saleflow.Workers.DemoGenerationWorker
  alias Saleflow.Sales

  defp create_demo_config! do
    {:ok, lead} =
      Saleflow.Sales.Lead
      |> Ash.Changeset.for_create(:create, %{company_name: "Test AB", phone: "070123"})
      |> Ash.create()

    {:ok, user} =
      Saleflow.Accounts.User
      |> Ash.Changeset.for_create(:create, %{
        email: "test-#{System.unique_integer([:positive])}@example.com",
        name: "Agent",
        role: :agent
      })
      |> Ash.create()

    {:ok, dc} =
      Sales.create_demo_config(%{
        lead_id: lead.id,
        user_id: user.id,
        source_url: "https://www.bokadirekt.se/places/test-12345"
      })

    {:ok, dc} = Sales.start_generation(dc)
    dc
  end

  describe "build_brief/2" do
    test "replaces placeholders in template" do
      dc = create_demo_config!()
      brief = DemoGenerationWorker.build_brief(dc, "/tmp/test-output")

      assert brief =~ "https://www.bokadirekt.se/places/test-12345"
      assert brief =~ "/tmp/test-output"
      refute brief =~ "$SOURCE_URL"
      refute brief =~ "$OUTPUT_DIR"
    end
  end

  describe "output_dir/1" do
    test "returns path based on demo config id" do
      dc = create_demo_config!()
      dir = DemoGenerationWorker.output_dir(dc)

      assert dir =~ dc.id
      assert dir =~ "demo_generation"
    end
  end
end
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
cd backend && mix test test/saleflow/workers/demo_generation_worker_test.exs
```
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement DemoGenerationWorker**

```elixir
defmodule Saleflow.Workers.DemoGenerationWorker do
  use Oban.Worker, queue: :demo_generation, max_attempts: 2

  alias Saleflow.Sales

  @brief_template_path "priv/demo_generation/brief.md"

  @impl true
  def perform(%Oban.Job{args: %{"demo_config_id" => id}}) do
    with {:ok, dc} <- Sales.get_demo_config(id),
         output_dir <- output_dir(dc),
         :ok <- File.mkdir_p(output_dir),
         brief <- build_brief(dc, output_dir),
         brief_path <- Path.join(output_dir, "brief.md"),
         :ok <- File.write(brief_path, brief) do
      run_claude_cli(dc, brief_path, output_dir)
    else
      {:error, reason} ->
        handle_error(id, reason)
    end
  end

  def build_brief(demo_config, output_dir) do
    Application.app_dir(:saleflow, @brief_template_path)
    |> File.read!()
    |> String.replace("$SOURCE_URL", demo_config.source_url || "")
    |> String.replace("$OUTPUT_DIR", output_dir)
  end

  def output_dir(demo_config) do
    base = Application.get_env(:saleflow, :demo_generation_dir, "priv/static/demos")
    Path.join(base, demo_config.id)
  end

  defp run_claude_cli(demo_config, brief_path, output_dir) do
    topic = "demo_generation:#{demo_config.id}"
    broadcast(topic, %{type: "log", text: "Startar generering..."})

    port =
      Port.open(
        {:spawn_executable, System.find_executable("claude")},
        [
          :binary,
          :exit_status,
          :stderr_to_stdout,
          args: [
            "--dangerously-skip-permissions",
            "-p",
            "Read and follow the brief at #{brief_path}. Execute each step.",
            "--output-format",
            "stream-json"
          ],
          cd: String.to_charlist(output_dir)
        ]
      )

    collect_output(port, demo_config, output_dir, "")
  end

  defp collect_output(port, demo_config, output_dir, acc) do
    topic = "demo_generation:#{demo_config.id}"

    receive do
      {^port, {:data, data}} ->
        broadcast(topic, %{type: "log", text: data})
        collect_output(port, demo_config, output_dir, acc <> data)

      {^port, {:exit_status, 0}} ->
        website_path = Path.join(output_dir, "site/index.html")

        if File.exists?(website_path) do
          {:ok, _} =
            Sales.generation_complete(demo_config, %{
              website_path: website_path,
              preview_url: "/api/demo-configs/#{demo_config.id}/preview"
            })

          broadcast(topic, %{type: "status", status: "demo_ready"})
          :ok
        else
          handle_error(demo_config.id, "Ingen hemsida genererades")
        end

      {^port, {:exit_status, code}} ->
        handle_error(demo_config.id, "Claude CLI avslutades med kod #{code}")
    after
      900_000 ->
        Port.close(port)
        handle_error(demo_config.id, "Timeout efter 15 minuter")
    end
  end

  defp handle_error(id, reason) do
    with {:ok, dc} <- Sales.get_demo_config(id) do
      Sales.generation_failed(dc, %{error: to_string(reason)})
      topic = "demo_generation:#{id}"
      broadcast(topic, %{type: "status", status: "error", error: to_string(reason)})
    end

    {:error, reason}
  end

  defp broadcast(topic, payload) do
    Phoenix.PubSub.broadcast(Saleflow.PubSub, topic, {:demo_generation, payload})
  end
end
```

- [ ] **Step 4: Add Oban queue config**

In `backend/config/config.exs`, find the Oban config and add the queue:

```elixir
config :saleflow, Oban,
  queues: [
    # ... existing queues ...
    demo_generation: 1
  ]
```

- [ ] **Step 5: Run tests**

Run:
```bash
cd backend && mix test test/saleflow/workers/demo_generation_worker_test.exs
```
Expected: `build_brief/2` and `output_dir/1` tests pass.

- [ ] **Step 6: Commit**

```bash
cd backend && git add lib/saleflow/workers/demo_generation_worker.ex test/saleflow/workers/demo_generation_worker_test.exs config/config.exs && git commit -m "feat: add DemoGenerationWorker with Claude CLI integration"
```

---

## Task 6: DemoConfigController + Routes

**Files:**
- Create: `backend/lib/saleflow_web/controllers/demo_config_controller.ex`
- Create: `backend/test/saleflow_web/controllers/demo_config_controller_test.exs`
- Modify: `backend/lib/saleflow_web/router.ex`

- [ ] **Step 1: Write controller tests**

```elixir
defmodule SaleflowWeb.DemoConfigControllerTest do
  use SaleflowWeb.ConnCase, async: true

  alias Saleflow.Sales

  setup %{conn: conn} do
    {:ok, user} =
      Saleflow.Accounts.User
      |> Ash.Changeset.for_create(:create, %{
        email: "agent-#{System.unique_integer([:positive])}@test.com",
        name: "Agent",
        role: :agent
      })
      |> Ash.create()

    {:ok, lead} =
      Saleflow.Sales.Lead
      |> Ash.Changeset.for_create(:create, %{company_name: "Test AB", phone: "070123"})
      |> Ash.create()

    conn = assign(conn, :current_user, user)
    {:ok, conn: conn, user: user, lead: lead}
  end

  describe "GET /api/demo-configs" do
    test "lists demo configs for current user", %{conn: conn, user: user, lead: lead} do
      {:ok, _dc} =
        Sales.create_demo_config(%{lead_id: lead.id, user_id: user.id, source_url: "https://example.com"})

      conn = get(conn, "/api/demo-configs")
      assert %{"demo_configs" => [dc]} = json_response(conn, 200)
      assert dc["source_url"] == "https://example.com"
      assert dc["stage"] == "meeting_booked"
    end
  end

  describe "GET /api/demo-configs/:id" do
    test "shows demo config with lead and meetings", %{conn: conn, user: user, lead: lead} do
      {:ok, dc} =
        Sales.create_demo_config(%{lead_id: lead.id, user_id: user.id, source_url: "https://example.com"})

      conn = get(conn, "/api/demo-configs/#{dc.id}")
      assert %{"demo_config" => data} = json_response(conn, 200)
      assert data["id"] == dc.id
      assert data["lead"]["company_name"] == "Test AB"
    end
  end

  describe "POST /api/demo-configs/:id/advance" do
    test "advances from demo_ready to followup", %{conn: conn, user: user, lead: lead} do
      {:ok, dc} = Sales.create_demo_config(%{lead_id: lead.id, user_id: user.id, source_url: "https://example.com"})
      {:ok, dc} = Sales.start_generation(dc)
      {:ok, dc} = Sales.generation_complete(dc, %{website_path: "/p", preview_url: "/u"})

      conn = post(conn, "/api/demo-configs/#{dc.id}/advance")
      assert %{"demo_config" => data} = json_response(conn, 200)
      assert data["stage"] == "followup"
    end
  end

  describe "POST /api/demo-configs/:id/retry" do
    test "retries failed generation", %{conn: conn, user: user, lead: lead} do
      {:ok, dc} = Sales.create_demo_config(%{lead_id: lead.id, user_id: user.id, source_url: "https://example.com"})
      {:ok, dc} = Sales.start_generation(dc)
      {:ok, dc} = Sales.generation_failed(dc, %{error: "timeout"})

      conn = post(conn, "/api/demo-configs/#{dc.id}/retry")
      assert %{"demo_config" => data} = json_response(conn, 200)
      assert data["stage"] == "generating"
    end
  end
end
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
cd backend && mix test test/saleflow_web/controllers/demo_config_controller_test.exs
```
Expected: FAIL — controller doesn't exist.

- [ ] **Step 3: Create controller**

```elixir
defmodule SaleflowWeb.DemoConfigController do
  use SaleflowWeb, :controller

  alias Saleflow.Sales
  alias Saleflow.Workers.DemoGenerationWorker

  def index(conn, _params) do
    user = conn.assigns.current_user

    {:ok, demo_configs} =
      if user.role == :admin do
        Sales.list_demo_configs()
      else
        Sales.list_demo_configs_for_user(user.id)
      end

    demo_configs = Ash.load!(demo_configs, [:lead])
    json(conn, %{demo_configs: Enum.map(demo_configs, &serialize_simple/1)})
  end

  def show(conn, %{"id" => id}) do
    with {:ok, dc} <- Sales.get_demo_config(id),
         :ok <- check_access(dc, conn.assigns.current_user) do
      dc = Ash.load!(dc, [:lead, :meetings])
      json(conn, %{demo_config: serialize_detail(dc)})
    else
      {:error, _} -> conn |> put_status(404) |> json(%{error: "Hittades inte"})
    end
  end

  def advance(conn, %{"id" => id}) do
    with {:ok, dc} <- Sales.get_demo_config(id),
         :ok <- check_access(dc, conn.assigns.current_user),
         {:ok, updated} <- Sales.advance_to_followup(dc) do
      json(conn, %{demo_config: serialize_simple(updated)})
    else
      {:error, reason} -> conn |> put_status(422) |> json(%{error: to_string(reason)})
    end
  end

  def retry(conn, %{"id" => id}) do
    with {:ok, dc} <- Sales.get_demo_config(id),
         :ok <- check_access(dc, conn.assigns.current_user),
         {:ok, dc} <- restart_generation(dc) do
      json(conn, %{demo_config: serialize_simple(dc)})
    else
      {:error, reason} -> conn |> put_status(422) |> json(%{error: to_string(reason)})
    end
  end

  def preview(conn, %{"id" => id}) do
    with {:ok, dc} <- Sales.get_demo_config(id),
         true <- dc.website_path != nil,
         true <- File.exists?(dc.website_path) do
      html = File.read!(dc.website_path)
      conn |> put_resp_content_type("text/html") |> send_resp(200, html)
    else
      _ -> conn |> put_status(404) |> json(%{error: "Förhandsgranskning ej tillgänglig"})
    end
  end

  def logs(conn, %{"id" => id}) do
    with {:ok, dc} <- Sales.get_demo_config(id),
         :ok <- check_access(dc, conn.assigns.current_user) do
      conn =
        conn
        |> put_resp_header("content-type", "text/event-stream")
        |> put_resp_header("cache-control", "no-cache")
        |> put_resp_header("connection", "keep-alive")
        |> send_chunked(200)

      topic = "demo_generation:#{dc.id}"
      Phoenix.PubSub.subscribe(Saleflow.PubSub, topic)

      stream_logs(conn, dc)
    else
      {:error, _} -> conn |> put_status(404) |> json(%{error: "Hittades inte"})
    end
  end

  defp stream_logs(conn, demo_config) do
    receive do
      {:demo_generation, %{type: "status", status: "demo_ready"} = payload} ->
        chunk(conn, "data: #{Jason.encode!(payload)}\n\n")
        conn

      {:demo_generation, %{type: "status", status: "error"} = payload} ->
        chunk(conn, "data: #{Jason.encode!(payload)}\n\n")
        conn

      {:demo_generation, payload} ->
        chunk(conn, "data: #{Jason.encode!(payload)}\n\n")
        stream_logs(conn, demo_config)
    after
      900_000 ->
        conn
    end
  end

  defp restart_generation(dc) do
    with {:ok, dc} <- reset_for_retry(dc),
         {:ok, dc} <- Sales.start_generation(dc) do
      Oban.insert(DemoGenerationWorker.new(%{demo_config_id: dc.id}))
      {:ok, dc}
    end
  end

  defp reset_for_retry(dc) do
    dc
    |> Ash.Changeset.for_update(:cancel, %{})
    |> Ash.update()
    |> case do
      {:ok, dc} ->
        dc
        |> Ash.Changeset.for_update(:create, %{
          lead_id: dc.lead_id,
          user_id: dc.user_id,
          source_url: dc.source_url
        })
        |> Ash.update()

      err ->
        err
    end
  end

  defp check_access(dc, user) do
    if user.role == :admin || dc.user_id == user.id, do: :ok, else: {:error, :forbidden}
  end

  defp serialize_simple(dc) do
    %{
      id: dc.id,
      lead_id: dc.lead_id,
      user_id: dc.user_id,
      lead_name: if(Ash.loaded?(dc, :lead) && dc.lead, do: dc.lead.company_name, else: nil),
      stage: dc.stage,
      source_url: dc.source_url,
      preview_url: dc.preview_url,
      notes: dc.notes,
      error: dc.error,
      inserted_at: dc.inserted_at,
      updated_at: dc.updated_at
    }
  end

  defp serialize_detail(dc) do
    serialize_simple(dc)
    |> Map.merge(%{
      lead: %{
        id: dc.lead.id,
        company_name: dc.lead.company_name,
        phone: dc.lead.phone,
        email: Map.get(dc.lead, :email, nil)
      },
      meetings:
        Enum.map(dc.meetings, fn m ->
          %{
            id: m.id,
            title: m.title,
            meeting_date: m.meeting_date,
            meeting_time: m.meeting_time,
            status: m.status
          }
        end)
    })
  end
end
```

- [ ] **Step 4: Add routes**

In `backend/lib/saleflow_web/router.ex`, inside the authenticated API scope:

```elixir
get "/demo-configs", DemoConfigController, :index
get "/demo-configs/:id", DemoConfigController, :show
get "/demo-configs/:id/logs", DemoConfigController, :logs
get "/demo-configs/:id/preview", DemoConfigController, :preview
post "/demo-configs/:id/advance", DemoConfigController, :advance
post "/demo-configs/:id/retry", DemoConfigController, :retry
```

- [ ] **Step 5: Run tests**

Run:
```bash
cd backend && mix test test/saleflow_web/controllers/demo_config_controller_test.exs
```
Expected: All pass.

- [ ] **Step 6: Commit**

```bash
cd backend && git add lib/saleflow_web/controllers/demo_config_controller.ex lib/saleflow_web/router.ex test/saleflow_web/controllers/demo_config_controller_test.exs && git commit -m "feat: add DemoConfigController with REST + SSE endpoints"
```

---

## Task 7: Auto-Create DemoConfig on Meeting Booking

**Files:**
- Modify: `backend/lib/saleflow_web/controllers/meeting_controller.ex`
- Modify: `backend/test/saleflow_web/controllers/meeting_controller_test.exs`

- [ ] **Step 1: Write test for auto-creation**

Add to meeting controller tests:

```elixir
describe "POST /api/leads/:lead_id/meetings with source_url" do
  test "creates meeting and auto-creates demo config", %{conn: conn, user: user, lead: lead} do
    params = %{
      title: "Demo-möte",
      meeting_date: Date.utc_today() |> Date.add(1) |> Date.to_iso8601(),
      meeting_time: "10:00",
      source_url: "https://www.bokadirekt.se/places/test-12345"
    }

    conn = post(conn, "/api/leads/#{lead.id}/meetings", params)
    assert %{"meeting" => meeting} = json_response(conn, 201)
    assert meeting["demo_config_id"] != nil

    # Verify demo config was created
    {:ok, dc} = Saleflow.Sales.get_demo_config(meeting["demo_config_id"])
    assert dc.source_url == "https://www.bokadirekt.se/places/test-12345"
    assert dc.stage == :generating
  end

  test "links meeting to existing demo config", %{conn: conn, user: user, lead: lead} do
    {:ok, dc} =
      Saleflow.Sales.create_demo_config(%{
        lead_id: lead.id,
        user_id: user.id,
        source_url: "https://example.com"
      })

    params = %{
      title: "Uppföljningsmöte",
      meeting_date: Date.utc_today() |> Date.add(7) |> Date.to_iso8601(),
      meeting_time: "14:00"
    }

    conn = post(conn, "/api/leads/#{lead.id}/meetings", params)
    assert %{"meeting" => meeting} = json_response(conn, 201)
    assert meeting["demo_config_id"] == dc.id
  end
end
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
cd backend && mix test test/saleflow_web/controllers/meeting_controller_test.exs --only "source_url"
```
Expected: FAIL — `source_url` not handled.

- [ ] **Step 3: Modify MeetingController.create**

In `backend/lib/saleflow_web/controllers/meeting_controller.ex`, modify the `create` action (around line 72-97):

After the meeting is created successfully, add:

```elixir
# After successful meeting creation, inside the {:ok, meeting} branch:

meeting =
  if source_url = params["source_url"] do
    # Check for existing active demo config for this lead
    case find_active_demo_config(lead_id, user.id) do
      nil ->
        # Create new demo config and start generation
        {:ok, dc} =
          Sales.create_demo_config(%{
            lead_id: lead_id,
            user_id: user.id,
            source_url: source_url
          })

        {:ok, dc} = Sales.start_generation(dc)
        Oban.insert(Saleflow.Workers.DemoGenerationWorker.new(%{demo_config_id: dc.id}))

        {:ok, meeting} = Sales.update_meeting(meeting, %{demo_config_id: dc.id})
        meeting

      dc ->
        {:ok, meeting} = Sales.update_meeting(meeting, %{demo_config_id: dc.id})
        meeting
    end
  else
    # No URL — check for existing demo config
    case find_active_demo_config(lead_id, user.id) do
      nil -> meeting
      dc ->
        {:ok, meeting} = Sales.update_meeting(meeting, %{demo_config_id: dc.id})
        meeting
    end
  end
```

Add helper:

```elixir
defp find_active_demo_config(lead_id, _user_id) do
  require Ash.Query

  Saleflow.Sales.DemoConfig
  |> Ash.Query.filter(lead_id == ^lead_id and stage != :cancelled)
  |> Ash.Query.sort(inserted_at: :desc)
  |> Ash.Query.limit(1)
  |> Ash.read!()
  |> List.first()
end
```

- [ ] **Step 4: Run tests**

Run:
```bash
cd backend && mix test test/saleflow_web/controllers/meeting_controller_test.exs
```
Expected: All pass.

- [ ] **Step 5: Commit**

```bash
cd backend && git add lib/saleflow_web/controllers/meeting_controller.ex test/ && git commit -m "feat: auto-create DemoConfig when booking meeting with source_url"
```

---

## Task 8: Frontend Types

**Files:**
- Modify: `frontend/src/api/types.ts`

- [ ] **Step 1: Add DemoConfig types**

In `frontend/src/api/types.ts`:

```typescript
export type DemoStage =
  | "meeting_booked"
  | "generating"
  | "demo_ready"
  | "followup"
  | "cancelled";

export interface DemoConfig {
  id: string;
  lead_id: string;
  user_id: string;
  lead_name: string | null;
  stage: DemoStage;
  source_url: string | null;
  preview_url: string | null;
  notes: string | null;
  error: string | null;
  inserted_at: string;
  updated_at: string;
}

export interface DemoConfigDetail extends DemoConfig {
  lead: {
    id: string;
    company_name: string;
    phone: string | null;
    email: string | null;
  };
  meetings: {
    id: string;
    title: string;
    meeting_date: string;
    meeting_time: string;
    status: string;
  }[];
}
```

- [ ] **Step 2: Commit**

```bash
cd frontend && git add src/api/types.ts && git commit -m "feat: add DemoConfig and DemoStage TypeScript types"
```

---

## Task 9: Frontend API Hooks

**Files:**
- Create: `frontend/src/api/demo-configs.ts`
- Create: `frontend/src/__tests__/api/demo-configs.test.tsx`

- [ ] **Step 1: Write test file**

```typescript
import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useDemoConfigs, useDemoConfigDetail } from "@/api/demo-configs";
import type { DemoConfig, DemoConfigDetail } from "@/api/types";

const wrapper = ({ children }: { children: React.ReactNode }) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
};

const mockDemoConfig: DemoConfig = {
  id: "dc-1",
  lead_id: "lead-1",
  user_id: "user-1",
  stage: "generating",
  source_url: "https://example.com",
  preview_url: null,
  notes: null,
  error: null,
  inserted_at: "2026-04-07T10:00:00Z",
  updated_at: "2026-04-07T10:00:00Z",
};

describe("useDemoConfigs", () => {
  it("fetches demo configs", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ demo_configs: [mockDemoConfig] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const { result } = renderHook(() => useDemoConfigs(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
    expect(result.current.data![0].stage).toBe("generating");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
cd frontend && npx vitest run src/__tests__/api/demo-configs.test.tsx
```
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Create API hooks**

Create `frontend/src/api/demo-configs.ts`:

```typescript
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import type { DemoConfig, DemoConfigDetail } from "./types";

export function useDemoConfigs() {
  return useQuery<DemoConfig[]>({
    queryKey: ["demo-configs"],
    queryFn: async () => {
      const data = await api<{ demo_configs: DemoConfig[] }>("/api/demo-configs");
      return data.demo_configs;
    },
    staleTime: 10_000,
  });
}

export function useDemoConfigDetail(id: string | null) {
  return useQuery<DemoConfigDetail>({
    queryKey: ["demo-configs", id],
    queryFn: async () => {
      const data = await api<{ demo_config: DemoConfigDetail }>(`/api/demo-configs/${id}`);
      return data.demo_config;
    },
    enabled: !!id,
  });
}

export function useAdvanceDemoConfig() {
  const queryClient = useQueryClient();

  return useMutation<DemoConfig, Error, string>({
    mutationFn: (id) =>
      api<{ demo_config: DemoConfig }>(`/api/demo-configs/${id}/advance`, {
        method: "POST",
      }).then((r) => r.demo_config),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["demo-configs"] });
    },
  });
}

export function useRetryDemoConfig() {
  const queryClient = useQueryClient();

  return useMutation<DemoConfig, Error, string>({
    mutationFn: (id) =>
      api<{ demo_config: DemoConfig }>(`/api/demo-configs/${id}/retry`, {
        method: "POST",
      }).then((r) => r.demo_config),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["demo-configs"] });
    },
  });
}
```

- [ ] **Step 4: Run tests**

Run:
```bash
cd frontend && npx vitest run src/__tests__/api/demo-configs.test.tsx
```
Expected: All pass.

- [ ] **Step 5: Commit**

```bash
cd frontend && git add src/api/demo-configs.ts src/__tests__/api/demo-configs.test.tsx && git commit -m "feat: add React Query hooks for DemoConfig API"
```

---

## Task 10: DemoStageIndicator Component

**Files:**
- Create: `frontend/src/components/dialer/demo-stage-indicator.tsx`
- Create: `frontend/src/__tests__/components/dialer/demo-stage-indicator.test.tsx`

- [ ] **Step 1: Write test**

```typescript
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DemoStageIndicator } from "@/components/dialer/demo-stage-indicator";

describe("DemoStageIndicator", () => {
  it("shows meeting_booked as first active stage", () => {
    render(<DemoStageIndicator stage="meeting_booked" />);
    expect(screen.getByText("Möte bokat")).toBeInTheDocument();
  });

  it("shows generating with active styling", () => {
    render(<DemoStageIndicator stage="generating" />);
    const el = screen.getByText("Genererar");
    expect(el.className).toContain("bg-");
  });

  it("shows demo_ready with completed prior stages", () => {
    render(<DemoStageIndicator stage="demo_ready" />);
    expect(screen.getByText("✓ Möte bokat")).toBeInTheDocument();
    expect(screen.getByText("✓ Genererar")).toBeInTheDocument();
    expect(screen.getByText("Demo klar")).toBeInTheDocument();
  });

  it("shows followup as current", () => {
    render(<DemoStageIndicator stage="followup" />);
    expect(screen.getByText("Uppföljning")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
cd frontend && npx vitest run src/__tests__/components/dialer/demo-stage-indicator.test.tsx
```

- [ ] **Step 3: Implement component**

```typescript
import { cn } from "@/lib/cn";
import type { DemoStage } from "@/api/types";

const STAGES: { key: DemoStage; label: string }[] = [
  { key: "meeting_booked", label: "Möte bokat" },
  { key: "generating", label: "Genererar" },
  { key: "demo_ready", label: "Demo klar" },
  { key: "followup", label: "Uppföljning" },
];

const ORDER: Record<DemoStage, number> = {
  meeting_booked: 0,
  generating: 1,
  demo_ready: 2,
  followup: 3,
  cancelled: -1,
};

interface DemoStageIndicatorProps {
  stage: DemoStage;
}

export function DemoStageIndicator({ stage }: DemoStageIndicatorProps) {
  const currentIdx = ORDER[stage] ?? -1;

  return (
    <div className="flex items-center gap-1.5 text-[11px]">
      {STAGES.map((s, i) => {
        const isCompleted = i < currentIdx;
        const isCurrent = i === currentIdx;

        return (
          <div key={s.key} className="flex items-center gap-1.5">
            {i > 0 && <span className="text-[var(--color-border)]">—</span>}
            <span
              className={cn(
                "px-2 py-0.5 rounded-full whitespace-nowrap",
                isCompleted && "bg-[#d1fae5] text-[#065f46]",
                isCurrent && "bg-[var(--color-accent)] text-white font-semibold",
                !isCompleted && !isCurrent && "text-[var(--color-text-secondary)]",
              )}
            >
              {isCompleted ? `✓ ${s.label}` : isCurrent ? `${i + 1}. ${s.label}` : s.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Run tests**

Run:
```bash
cd frontend && npx vitest run src/__tests__/components/dialer/demo-stage-indicator.test.tsx
```
Expected: All pass.

- [ ] **Step 5: Commit**

```bash
cd frontend && git add src/components/dialer/demo-stage-indicator.tsx src/__tests__/components/dialer/demo-stage-indicator.test.tsx && git commit -m "feat: add DemoStageIndicator pill-row component"
```

---

## Task 11: DemoTab Component

**Files:**
- Create: `frontend/src/components/dialer/demo-tab.tsx`
- Create: `frontend/src/__tests__/components/dialer/demo-tab.test.tsx`

- [ ] **Step 1: Write test**

```typescript
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DemoTab } from "@/components/dialer/demo-tab";
import type { DemoConfig } from "@/api/types";

vi.mock("@/api/demo-configs", () => ({
  useDemoConfigs: vi.fn(() => ({
    data: [
      {
        id: "dc-1",
        stage: "generating",
        source_url: "https://example.com",
        inserted_at: "2026-04-07T10:00:00Z",
      },
      {
        id: "dc-2",
        stage: "demo_ready",
        source_url: "https://test.com",
        inserted_at: "2026-04-06T10:00:00Z",
      },
    ] as DemoConfig[],
    isLoading: false,
  })),
}));

const wrapper = ({ children }: { children: React.ReactNode }) => {
  const client = new QueryClient();
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
};

describe("DemoTab", () => {
  it("renders list of demo configs", () => {
    const onSelect = vi.fn();
    render(<DemoTab onSelectDemoConfig={onSelect} />, { wrapper });
    expect(screen.getByText("Genererar")).toBeInTheDocument();
    expect(screen.getByText("Demo klar")).toBeInTheDocument();
  });

  it("calls onSelectDemoConfig when row clicked", () => {
    const onSelect = vi.fn();
    render(<DemoTab onSelectDemoConfig={onSelect} />, { wrapper });
    fireEvent.click(screen.getByText("Genererar").closest("tr")!);
    expect(onSelect).toHaveBeenCalledWith("dc-1");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
cd frontend && npx vitest run src/__tests__/components/dialer/demo-tab.test.tsx
```

- [ ] **Step 3: Implement DemoTab**

```typescript
import { useDemoConfigs } from "@/api/demo-configs";
import type { DemoStage } from "@/api/types";

const STAGE_LABELS: Record<DemoStage, { label: string; bg: string; text: string }> = {
  meeting_booked: { label: "Möte bokat", bg: "#ede9fe", text: "#5b21b6" },
  generating: { label: "Genererar...", bg: "#fef3c7", text: "#92400e" },
  demo_ready: { label: "Demo klar", bg: "#d1fae5", text: "#065f46" },
  followup: { label: "Uppföljning", bg: "#dbeafe", text: "#1e40af" },
  cancelled: { label: "Avbruten", bg: "#f3f4f6", text: "#6b7280" },
};

interface DemoTabProps {
  onSelectDemoConfig: (id: string) => void;
}

export function DemoTab({ onSelectDemoConfig }: DemoTabProps) {
  const { data: configs, isLoading } = useDemoConfigs();

  if (isLoading) {
    return <div className="p-5 text-[13px] text-[var(--color-text-secondary)]">Laddar...</div>;
  }

  if (!configs?.length) {
    return (
      <div className="p-5 text-[13px] text-[var(--color-text-secondary)]">
        Inga demo-konfigurationer ännu. Boka ett möte med en länk för att starta.
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-[var(--color-border)]">
            <th className="text-left px-5 py-2.5 text-[10px] font-medium uppercase tracking-wider text-[var(--color-text-secondary)]">
              Företag
            </th>
            <th className="text-left px-5 py-2.5 text-[10px] font-medium uppercase tracking-wider text-[var(--color-text-secondary)]">
              Status
            </th>
          </tr>
        </thead>
        <tbody>
          {configs.map((dc) => {
            const stage = STAGE_LABELS[dc.stage];
            return (
              <tr
                key={dc.id}
                onClick={() => onSelectDemoConfig(dc.id)}
                className="border-b border-[var(--color-border-light)] cursor-pointer hover:bg-[var(--color-bg-hover)]"
              >
                <td className="px-5 py-3 font-medium">{dc.lead_name || dc.source_url || "—"}</td>
                <td className="px-5 py-3">
                  <span
                    className="px-2 py-0.5 rounded text-[12px]"
                    style={{ backgroundColor: stage.bg, color: stage.text }}
                  >
                    {stage.label}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 4: Run tests**

Run:
```bash
cd frontend && npx vitest run src/__tests__/components/dialer/demo-tab.test.tsx
```
Expected: All pass.

- [ ] **Step 5: Commit**

```bash
cd frontend && git add src/components/dialer/demo-tab.tsx src/__tests__/components/dialer/demo-tab.test.tsx && git commit -m "feat: add DemoTab list component"
```

---

## Task 12: DemoDetailTab Component

**Files:**
- Create: `frontend/src/components/dialer/demo-detail-tab.tsx`
- Create: `frontend/src/__tests__/components/dialer/demo-detail-tab.test.tsx`

- [ ] **Step 1: Write test**

```typescript
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DemoDetailTab } from "@/components/dialer/demo-detail-tab";

vi.mock("@/api/demo-configs", () => ({
  useDemoConfigDetail: vi.fn(() => ({
    data: {
      id: "dc-1",
      stage: "demo_ready",
      source_url: "https://example.com",
      preview_url: "/api/demo-configs/dc-1/preview",
      notes: null,
      error: null,
      lead: { id: "l1", company_name: "Test AB", phone: "070123", email: null },
      meetings: [
        { id: "m1", title: "Demo", meeting_date: "2026-04-08", meeting_time: "10:00:00", status: "scheduled" },
      ],
    },
    isLoading: false,
  })),
  useAdvanceDemoConfig: vi.fn(() => ({ mutate: vi.fn() })),
  useRetryDemoConfig: vi.fn(() => ({ mutate: vi.fn() })),
}));

const wrapper = ({ children }: { children: React.ReactNode }) => {
  const client = new QueryClient();
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
};

describe("DemoDetailTab", () => {
  it("renders company name and stage", () => {
    render(<DemoDetailTab demoConfigId="dc-1" onBack={vi.fn()} />, { wrapper });
    expect(screen.getByText("Test AB")).toBeInTheDocument();
    expect(screen.getByText("Demo klar")).toBeInTheDocument();
  });

  it("shows preview button when demo_ready", () => {
    render(<DemoDetailTab demoConfigId="dc-1" onBack={vi.fn()} />, { wrapper });
    expect(screen.getByText("Öppna i ny flik")).toBeInTheDocument();
  });

  it("shows back button", () => {
    const onBack = vi.fn();
    render(<DemoDetailTab demoConfigId="dc-1" onBack={onBack} />, { wrapper });
    expect(screen.getByText("← Tillbaka")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
cd frontend && npx vitest run src/__tests__/components/dialer/demo-detail-tab.test.tsx
```

- [ ] **Step 3: Implement DemoDetailTab**

```typescript
import { useState, useEffect, useRef } from "react";
import { useDemoConfigDetail, useAdvanceDemoConfig, useRetryDemoConfig } from "@/api/demo-configs";
import { DemoStageIndicator } from "./demo-stage-indicator";

interface DemoDetailTabProps {
  demoConfigId: string;
  onBack: () => void;
}

export function DemoDetailTab({ demoConfigId, onBack }: DemoDetailTabProps) {
  const { data, isLoading } = useDemoConfigDetail(demoConfigId);
  const advance = useAdvanceDemoConfig();
  const retry = useRetryDemoConfig();

  if (isLoading || !data) {
    return <div className="p-5 text-[13px] text-[var(--color-text-secondary)]">Laddar...</div>;
  }

  return (
    <div className="flex-1 overflow-auto">
      {/* Header */}
      <div className="px-5 py-3 border-b border-[var(--color-border)] flex items-center gap-3">
        <button onClick={onBack} className="text-[var(--color-accent)] text-[13px] cursor-pointer">
          ← Tillbaka
        </button>
        <span className="font-semibold text-[14px]">{data.lead.company_name}</span>
        <DemoStageIndicator stage={data.stage} />
      </div>

      {/* Stage content */}
      <div className="p-5">
        {data.stage === "meeting_booked" && <MeetingBookedView data={data} />}
        {data.stage === "generating" && <GeneratingView demoConfigId={demoConfigId} />}
        {data.stage === "demo_ready" && (
          <DemoReadyView data={data} onAdvance={() => advance.mutate(demoConfigId)} onRetry={() => retry.mutate(demoConfigId)} />
        )}
        {data.stage === "followup" && <FollowupView data={data} />}
      </div>
    </div>
  );
}

function MeetingBookedView({ data }: { data: any }) {
  return (
    <div className="text-[13px] text-[var(--color-text-secondary)]">
      {data.source_url
        ? <p>Väntar på att genereringen ska starta...</p>
        : <p>Ingen länk angiven — demo genereras inte. Lägg till en URL vid nästa mötesbokning.</p>}
    </div>
  );
}

function GeneratingView({ demoConfigId }: { demoConfigId: string }) {
  const [logs, setLogs] = useState<string[]>([]);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const es = new EventSource(`/api/demo-configs/${demoConfigId}/logs`);

    es.onmessage = (event) => {
      const payload = JSON.parse(event.data);
      if (payload.type === "log") {
        setLogs((prev) => [...prev, payload.text]);
      }
    };

    return () => es.close();
  }, [demoConfigId]);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div>
      <p className="text-[13px] text-[var(--color-text-secondary)] mb-3">
        Genererar hemsida... Uppskattad tid: ~6–10 min
      </p>
      <div
        ref={logRef}
        className="bg-[var(--color-bg-secondary)] rounded-lg p-3 h-48 overflow-auto font-mono text-[11px] text-[var(--color-text-secondary)]"
      >
        {logs.map((line, i) => (
          <div key={i}>{line}</div>
        ))}
        {logs.length === 0 && <div>Ansluter...</div>}
      </div>
    </div>
  );
}

function DemoReadyView({
  data,
  onAdvance,
  onRetry,
}: {
  data: any;
  onAdvance: () => void;
  onRetry: () => void;
}) {
  return (
    <div>
      {data.preview_url && (
        <div className="mb-4">
          <iframe
            src={data.preview_url}
            className="w-full h-64 border border-[var(--color-border)] rounded-lg"
            title="Demo-förhandsgranskning"
          />
        </div>
      )}
      <div className="flex gap-2">
        {data.preview_url && (
          <a
            href={data.preview_url}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 text-[12px] bg-[var(--color-accent)] text-white rounded-lg font-medium"
          >
            Öppna i ny flik
          </a>
        )}
        <button
          onClick={onAdvance}
          className="px-4 py-2 text-[12px] bg-[var(--color-bg-secondary)] rounded-lg font-medium cursor-pointer"
        >
          Gå till uppföljning →
        </button>
        <button
          onClick={onRetry}
          className="px-4 py-2 text-[12px] text-[var(--color-text-secondary)] rounded-lg cursor-pointer"
        >
          Generera om
        </button>
      </div>
    </div>
  );
}

function FollowupView({ data }: { data: any }) {
  return (
    <div className="space-y-4">
      {data.preview_url && (
        <a
          href={data.preview_url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[13px] text-[var(--color-accent)] underline"
        >
          Visa demo-hemsida
        </a>
      )}
      <div>
        <h3 className="text-[12px] font-semibold mb-2">Möten</h3>
        {data.meetings.map((m: any) => (
          <div key={m.id} className="text-[13px] py-1">
            {m.title} — {m.meeting_date} {m.meeting_time}
          </div>
        ))}
      </div>
      <div>
        <h3 className="text-[12px] font-semibold mb-2">Kontakt</h3>
        <div className="text-[13px]">
          <div>{data.lead.company_name}</div>
          {data.lead.phone && <div>{data.lead.phone}</div>}
          {data.lead.email && <div>{data.lead.email}</div>}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests**

Run:
```bash
cd frontend && npx vitest run src/__tests__/components/dialer/demo-detail-tab.test.tsx
```
Expected: All pass.

- [ ] **Step 5: Commit**

```bash
cd frontend && git add src/components/dialer/demo-detail-tab.tsx src/__tests__/components/dialer/demo-detail-tab.test.tsx && git commit -m "feat: add DemoDetailTab with SSE progress and preview"
```

---

## Task 13: Update Meeting Booking with URL Field

**Files:**
- Modify: `frontend/src/api/meetings.ts`
- Modify meeting booking form component (inline in dialer or separate component)

- [ ] **Step 1: Add source_url to meeting creation mutation**

In `frontend/src/api/meetings.ts`, find the `useCreateMeeting` (or equivalent) mutation and add `source_url` to the params type and request body:

```typescript
interface CreateMeetingParams {
  lead_id: string;
  title: string;
  meeting_date: string;
  meeting_time: string;
  notes?: string;
  source_url?: string;  // NEW
}
```

Ensure the mutation sends `source_url` in the POST body.

- [ ] **Step 2: Add URL input to meeting booking form**

In the meeting booking form component (find the form that calls `useCreateMeeting`), add an input field:

```typescript
<div className="space-y-1">
  <label className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-text-secondary)]">
    Hemsida/Bokadirekt-länk
  </label>
  <input
    type="url"
    value={sourceUrl}
    onChange={(e) => setSourceUrl(e.target.value)}
    placeholder="https://www.bokadirekt.se/places/..."
    className="w-full px-3 py-2 text-[13px] rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] focus:outline-none focus:border-[var(--color-accent)]"
  />
</div>
```

Add state: `const [sourceUrl, setSourceUrl] = useState("");`

Include in mutation call: `source_url: sourceUrl || undefined`

- [ ] **Step 3: Run existing meeting tests to verify nothing breaks**

Run:
```bash
cd frontend && npx vitest run
```
Expected: All existing tests pass.

- [ ] **Step 4: Commit**

```bash
cd frontend && git add src/api/meetings.ts src/ && git commit -m "feat: add source_url field to meeting booking"
```

---

## Task 14: Dialer Integration — Tabs + Page

**Files:**
- Modify: `frontend/src/components/dialer/dialer-tabs.tsx`
- Modify: `frontend/src/pages/dialer.tsx`

- [ ] **Step 1: Rename "Deals" to "Demo" in tabs**

In `frontend/src/components/dialer/dialer-tabs.tsx`, find the TABS array and change:

```typescript
// FROM:
{ key: "deals", label: "Deals" },

// TO:
{ key: "demo", label: "Demo" },
```

Update the `DialerTab` type:

```typescript
// FROM:
export type DialerTab = "dialer" | "callbacks" | "history" | "meetings" | "deals" | "customers" | "report";

// TO:
export type DialerTab = "dialer" | "callbacks" | "history" | "meetings" | "demo" | "customers" | "report";
```

- [ ] **Step 2: Update dialer.tsx state and rendering**

In `frontend/src/pages/dialer.tsx`:

Replace deal-related imports:
```typescript
// REMOVE:
import { DealsTab } from "@/components/dialer/deals-tab";
import { DealDetailTab } from "@/components/dialer/deal-detail-tab";

// ADD:
import { DemoTab } from "@/components/dialer/demo-tab";
import { DemoDetailTab } from "@/components/dialer/demo-detail-tab";
```

Replace state:
```typescript
// REMOVE:
const [selectedDealId, setSelectedDealId] = useState<string | null>(null);
const [dealReturnTab, setDealReturnTab] = useState<DialerTab>("deals");

// ADD:
const [selectedDemoConfigId, setSelectedDemoConfigId] = useState<string | null>(null);
const [demoReturnTab, setDemoReturnTab] = useState<DialerTab>("demo");
```

Replace tab rendering:
```typescript
// REMOVE deals tab rendering:
{activeTab === "deals" && (
  <DealsTab onSelectDeal={(id) => { setSelectedDealId(id); setDealReturnTab(activeTab); setActiveTab("deal-detail"); }} />
)}
{activeTab === "deal-detail" && selectedDealId && (
  <DealDetailTab dealId={selectedDealId} onBack={() => { setSelectedDealId(null); setActiveTab(dealReturnTab); }} />
)}

// ADD demo tab rendering:
{activeTab === "demo" && (
  <DemoTab onSelectDemoConfig={(id) => { setSelectedDemoConfigId(id); setDemoReturnTab("demo"); setActiveTab("demo-detail" as any); }} />
)}
{activeTab === ("demo-detail" as any) && selectedDemoConfigId && (
  <DemoDetailTab demoConfigId={selectedDemoConfigId} onBack={() => { setSelectedDemoConfigId(null); setActiveTab(demoReturnTab); }} />
)}
```

Update the Tab type to include `"demo-detail"`:
```typescript
type Tab = DialerTab | "profile" | "meeting-detail" | "lead-detail" | "demo-detail";
```

- [ ] **Step 3: Run all frontend tests**

Run:
```bash
cd frontend && npx vitest run
```
Expected: All pass.

- [ ] **Step 4: Commit**

```bash
cd frontend && git add src/components/dialer/dialer-tabs.tsx src/pages/dialer.tsx && git commit -m "feat: replace Deals tab with Demo tab in dialer"
```

---

## Task 15: Run Full Test Suite

- [ ] **Step 1: Run backend tests**

Run:
```bash
cd backend && mix test
```
Expected: All pass, no regressions.

- [ ] **Step 2: Run frontend tests**

Run:
```bash
cd frontend && npx vitest run
```
Expected: All pass, no regressions.

- [ ] **Step 3: Run coverage check**

Run:
```bash
cd backend && mix test --cover
cd frontend && npx vitest run --coverage
```
Expected: 100% coverage on new code.

- [ ] **Step 4: Final commit**

```bash
git add -A && git commit -m "chore: verify full test suite passes for demo-config feature"
```
