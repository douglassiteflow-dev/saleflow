# genflow-local-server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a job-queue-based generation system where Saleflow backend creates generation jobs and a local Electron app on Douglas's Mac picks them up, runs Flowing AI, and posts results back.

**Architecture:** New GenerationJob Ash resource in Saleflow backend with API-key-authenticated endpoints. DemoGenerationWorker changed to create jobs instead of running Claude CLI. Electron + React + Vite app polls for pending jobs and processes them via local Flowing AI (localhost:1337).

**Tech Stack:** Elixir/Ash/Phoenix (backend), Electron + React + Vite + TypeScript + Tailwind (desktop app)

---

## File Structure

### Backend (Saleflow)
| Action | File | Responsibility |
|--------|------|----------------|
| Create | `backend/priv/repo/migrations/20260408180000_create_generation_jobs.exs` | Migration |
| Create | `backend/lib/saleflow/generation/generation_job.ex` | GenerationJob Ash resource |
| Create | `backend/lib/saleflow/generation/generation.ex` | Generation Ash domain |
| Create | `backend/lib/saleflow_web/controllers/gen_job_controller.ex` | API-key authenticated endpoints |
| Create | `backend/lib/saleflow_web/plugs/require_gen_key.ex` | API key auth plug |
| Modify | `backend/lib/saleflow_web/router.ex` | Add gen-job routes |
| Modify | `backend/lib/saleflow/workers/demo_generation_worker.ex` | Create job instead of CLI |
| Modify | `backend/config/config.exs` | Add genflow_api_key config |

### Electron App
| Action | File | Responsibility |
|--------|------|----------------|
| Create | `apps/genflow-local-server/package.json` | Dependencies |
| Create | `apps/genflow-local-server/electron/main.ts` | Electron main process |
| Create | `apps/genflow-local-server/electron/preload.ts` | Preload bridge |
| Create | `apps/genflow-local-server/src/main.tsx` | React entry |
| Create | `apps/genflow-local-server/src/App.tsx` | Main UI component |
| Create | `apps/genflow-local-server/src/worker.ts` | Job polling + Flowing AI logic |
| Create | `apps/genflow-local-server/src/config.ts` | Config management |
| Create | `apps/genflow-local-server/src/logger.ts` | Log management |
| Create | `apps/genflow-local-server/index.html` | HTML entry |
| Create | `apps/genflow-local-server/vite.config.ts` | Vite config |
| Create | `apps/genflow-local-server/tsconfig.json` | TypeScript config |
| Create | `apps/genflow-local-server/tailwind.config.js` | Tailwind config |

---

### Task 1: Backend — Migration + GenerationJob resource + domain

**Files:**
- Create: `backend/priv/repo/migrations/20260408180000_create_generation_jobs.exs`
- Create: `backend/lib/saleflow/generation/generation_job.ex`
- Create: `backend/lib/saleflow/generation/generation.ex`
- Modify: `backend/config/config.exs`

- [ ] **Step 1: Create migration**

```elixir
defmodule Saleflow.Repo.Migrations.CreateGenerationJobs do
  use Ecto.Migration

  def change do
    create table(:generation_jobs, primary_key: false) do
      add :id, :uuid, primary_key: true
      add :deal_id, references(:deals, type: :uuid, on_delete: :nilify_all)
      add :demo_config_id, references(:demo_configs, type: :uuid, on_delete: :nilify_all)
      add :source_url, :string, null: false
      add :slug, :string, null: false
      add :status, :string, default: "pending", null: false
      add :result_url, :string
      add :error, :text
      add :picked_up_at, :utc_datetime_usec
      add :completed_at, :utc_datetime_usec

      timestamps()
    end

    create index(:generation_jobs, [:status])
    create index(:generation_jobs, [:deal_id])
  end
end
```

- [ ] **Step 2: Create GenerationJob Ash resource**

```elixir
defmodule Saleflow.Generation.GenerationJob do
  use Ash.Resource,
    data_layer: AshPostgres.DataLayer,
    domain: Saleflow.Generation

  postgres do
    table "generation_jobs"
    repo Saleflow.Repo
  end

  attributes do
    uuid_primary_key :id

    attribute :deal_id, :uuid, allow_nil?: true, public?: true
    attribute :demo_config_id, :uuid, allow_nil?: true, public?: true
    attribute :source_url, :string, allow_nil?: false, public?: true
    attribute :slug, :string, allow_nil?: false, public?: true

    attribute :status, :atom do
      constraints one_of: [:pending, :processing, :completed, :failed]
      default :pending
      allow_nil? false
      public? true
    end

    attribute :result_url, :string, allow_nil?: true, public?: true
    attribute :error, :string, allow_nil?: true, public?: true
    attribute :picked_up_at, :utc_datetime_usec, allow_nil?: true, public?: true
    attribute :completed_at, :utc_datetime_usec, allow_nil?: true, public?: true

    create_timestamp :inserted_at, public?: true
    update_timestamp :updated_at, public?: true
  end

  actions do
    defaults [:read]

    create :create do
      accept [:deal_id, :demo_config_id, :source_url, :slug]
    end

    update :pick do
      require_atomic? false
      change fn changeset, _context ->
        changeset
        |> Ash.Changeset.force_change_attribute(:status, :processing)
        |> Ash.Changeset.force_change_attribute(:picked_up_at, DateTime.utc_now())
      end
    end

    update :complete do
      require_atomic? false
      accept [:result_url]
      change fn changeset, _context ->
        changeset
        |> Ash.Changeset.force_change_attribute(:status, :completed)
        |> Ash.Changeset.force_change_attribute(:completed_at, DateTime.utc_now())
      end
    end

    update :fail do
      require_atomic? false
      accept [:error]
      change fn changeset, _context ->
        changeset
        |> Ash.Changeset.force_change_attribute(:status, :failed)
        |> Ash.Changeset.force_change_attribute(:completed_at, DateTime.utc_now())
      end
    end
  end
end
```

- [ ] **Step 3: Create Generation domain**

```elixir
defmodule Saleflow.Generation do
  use Ash.Domain

  resources do
    resource Saleflow.Generation.GenerationJob
  end

  def create_job(params) do
    Saleflow.Generation.GenerationJob
    |> Ash.Changeset.for_create(:create, params)
    |> Ash.create()
  end

  def get_next_pending_job do
    require Ash.Query

    Saleflow.Generation.GenerationJob
    |> Ash.Query.filter(status == :pending)
    |> Ash.Query.sort(inserted_at: :asc)
    |> Ash.Query.limit(1)
    |> Ash.read()
    |> case do
      {:ok, [job | _]} -> {:ok, job}
      {:ok, []} -> {:ok, nil}
      error -> error
    end
  end

  def pick_job(job) do
    job |> Ash.Changeset.for_update(:pick, %{}) |> Ash.update()
  end

  def complete_job(job, result_url) do
    job |> Ash.Changeset.for_update(:complete, %{result_url: result_url}) |> Ash.update()
  end

  def fail_job(job, error) do
    job |> Ash.Changeset.for_update(:fail, %{error: error}) |> Ash.update()
  end

  def get_job(id) do
    Saleflow.Generation.GenerationJob |> Ash.get(id)
  end
end
```

- [ ] **Step 4: Register domain + add config**

Add `Saleflow.Generation` to ash_domains in `config/config.exs`.
Add `config :saleflow, :genflow_api_key, System.get_env("GENFLOW_API_KEY") || "dev-genflow-key"` to `config/runtime.exs`.

- [ ] **Step 5: Run migration and verify**

```bash
cd /Users/douglassiteflow/dev/saleflow/backend && mix ecto.migrate && mix compile
```

- [ ] **Step 6: Commit**

```bash
git add backend/priv/repo/migrations/20260408180000_create_generation_jobs.exs backend/lib/saleflow/generation/ backend/config/
git commit -m "feat(genflow): add GenerationJob resource and Generation domain"
```

---

### Task 2: Backend — API-key auth plug + controller + routes

**Files:**
- Create: `backend/lib/saleflow_web/plugs/require_gen_key.ex`
- Create: `backend/lib/saleflow_web/controllers/gen_job_controller.ex`
- Modify: `backend/lib/saleflow_web/router.ex`

- [ ] **Step 1: Create API key auth plug**

```elixir
defmodule SaleflowWeb.Plugs.RequireGenKey do
  import Plug.Conn

  def init(opts), do: opts

  def call(conn, _opts) do
    expected = Application.get_env(:saleflow, :genflow_api_key)
    provided = get_req_header(conn, "x-genflow-key") |> List.first()

    if provided && Plug.Crypto.secure_compare(provided, expected) do
      conn
    else
      conn
      |> put_status(:unauthorized)
      |> Phoenix.Controller.json(%{error: "Invalid API key"})
      |> halt()
    end
  end
end
```

- [ ] **Step 2: Create controller**

```elixir
defmodule SaleflowWeb.GenJobController do
  use SaleflowWeb, :controller

  alias Saleflow.Generation

  def pending(conn, _params) do
    case Generation.get_next_pending_job() do
      {:ok, nil} ->
        json(conn, %{job: nil})

      {:ok, job} ->
        json(conn, %{job: serialize(job)})
    end
  end

  def pick(conn, %{"id" => id}) do
    with {:ok, job} <- Generation.get_job(id),
         {:ok, picked} <- Generation.pick_job(job) do
      json(conn, %{job: serialize(picked)})
    else
      _ -> conn |> put_status(422) |> json(%{error: "Could not pick job"})
    end
  end

  def complete(conn, %{"id" => id, "result_url" => result_url}) do
    with {:ok, job} <- Generation.get_job(id),
         {:ok, completed} <- Generation.complete_job(job, result_url) do
      maybe_update_deal(completed)
      json(conn, %{job: serialize(completed)})
    else
      _ -> conn |> put_status(422) |> json(%{error: "Could not complete job"})
    end
  end

  def fail(conn, %{"id" => id, "error" => error_msg}) do
    with {:ok, job} <- Generation.get_job(id),
         {:ok, failed} <- Generation.fail_job(job, error_msg) do
      json(conn, %{job: serialize(failed)})
    else
      _ -> conn |> put_status(422) |> json(%{error: "Could not fail job"})
    end
  end

  defp serialize(job) do
    %{
      id: job.id,
      deal_id: job.deal_id,
      demo_config_id: job.demo_config_id,
      source_url: job.source_url,
      slug: job.slug,
      status: job.status,
      result_url: job.result_url,
      error: job.error,
      picked_up_at: job.picked_up_at,
      completed_at: job.completed_at,
      inserted_at: job.inserted_at
    }
  end

  defp maybe_update_deal(job) do
    if job.deal_id do
      case Saleflow.Sales.get_deal(job.deal_id) do
        {:ok, deal} when deal.stage == :booking_wizard ->
          {:ok, deal} = Saleflow.Sales.update_deal(deal, %{website_url: job.result_url})
          Saleflow.Sales.advance_deal(deal)
        _ -> :ok
      end
    end
  end
end
```

- [ ] **Step 3: Add routes**

```elixir
  # GenFlow API (API-key authenticated)
  scope "/api/gen-jobs", SaleflowWeb do
    pipe_through [:api, :require_gen_key]

    get "/pending", GenJobController, :pending
    post "/:id/pick", GenJobController, :pick
    post "/:id/complete", GenJobController, :complete
    post "/:id/fail", GenJobController, :fail
  end
```

Add pipeline to router:
```elixir
  pipeline :require_gen_key do
    plug SaleflowWeb.Plugs.RequireGenKey
  end
```

- [ ] **Step 4: Verify and commit**

```bash
cd /Users/douglassiteflow/dev/saleflow/backend && mix compile && mix test
git add backend/lib/saleflow_web/plugs/require_gen_key.ex backend/lib/saleflow_web/controllers/gen_job_controller.ex backend/lib/saleflow_web/router.ex
git commit -m "feat(genflow): add gen-job API endpoints with API-key auth"
```

---

### Task 3: Backend — Modify DemoGenerationWorker to create jobs

**Files:**
- Modify: `backend/lib/saleflow/workers/demo_generation_worker.ex`

- [ ] **Step 1: Read current worker**

- [ ] **Step 2: Add job creation mode**

The worker should check config to decide whether to run locally (Claude CLI) or create a generation job:

```elixir
defp run_generation(demo_config) do
  if Application.get_env(:saleflow, :use_genflow_jobs, false) do
    create_genflow_job(demo_config)
  else
    run_local_generation(demo_config)
  end
end

defp create_genflow_job(demo_config) do
  slug = demo_config.source_url
    |> URI.parse()
    |> Map.get(:host, "site")
    |> String.replace(~r/[^a-z0-9-]/, "-")

  case Saleflow.Generation.create_job(%{
    deal_id: find_deal_id(demo_config),
    demo_config_id: demo_config.id,
    source_url: demo_config.source_url,
    slug: slug
  }) do
    {:ok, job} ->
      # Poll for completion (max 15 min)
      poll_job_completion(job.id, demo_config, 0)
    {:error, reason} ->
      {:error, reason}
  end
end

defp poll_job_completion(job_id, demo_config, elapsed) when elapsed > 900_000 do
  Saleflow.Generation.fail_job(job_id, "Timeout after 15 minutes")
  {:error, "Generation job timed out"}
end

defp poll_job_completion(job_id, demo_config, elapsed) do
  Process.sleep(5_000)
  case Saleflow.Generation.get_job(job_id) do
    {:ok, %{status: :completed, result_url: url}} ->
      # Update demo config
      Sales.generation_complete(demo_config, %{
        website_path: url,
        preview_url: url
      })
      maybe_advance_deal(demo_config)
      :ok

    {:ok, %{status: :failed, error: error}} ->
      Sales.generation_failed(demo_config, %{error: error})
      {:error, error}

    {:ok, %{status: status}} when status in [:pending, :processing] ->
      poll_job_completion(job_id, demo_config, elapsed + 5_000)

    _ ->
      {:error, "Job not found"}
  end
end
```

Add config: `config :saleflow, :use_genflow_jobs, false` in config.exs (default off).

- [ ] **Step 3: Verify and commit**

```bash
mix compile && mix test
git add backend/lib/saleflow/workers/demo_generation_worker.ex backend/config/config.exs
git commit -m "feat(genflow): DemoGenerationWorker supports job queue mode"
```

---

### Task 4: Backend tests

**Files:**
- Create: `backend/test/saleflow/generation/generation_job_test.exs`
- Create: `backend/test/saleflow_web/controllers/gen_job_controller_test.exs`

- [ ] **Step 1: Resource tests**

Test cases:
- create_job with valid params
- get_next_pending_job returns oldest pending
- get_next_pending_job returns nil when empty
- pick_job sets processing + picked_up_at
- complete_job sets completed + result_url + completed_at
- fail_job sets failed + error + completed_at

- [ ] **Step 2: Controller tests**

Test cases:
- GET /pending returns job when available
- GET /pending returns null when empty
- POST /:id/pick marks as processing
- POST /:id/complete saves result and updates deal
- POST /:id/fail saves error
- All endpoints reject without API key (401)
- All endpoints reject with wrong API key (401)

- [ ] **Step 3: Run and commit**

```bash
mix test --trace
git add backend/test/saleflow/generation/ backend/test/saleflow_web/controllers/gen_job_controller_test.exs
git commit -m "test(genflow): add generation job resource and controller tests"
```

---

### Task 5: Electron app — scaffold + config + worker

**Files:**
- Create entire `apps/genflow-local-server/` structure

- [ ] **Step 1: Initialize project**

```bash
mkdir -p apps/genflow-local-server/{electron,src}
cd apps/genflow-local-server
npm init -y
npm install electron electron-builder react react-dom
npm install -D vite @vitejs/plugin-react typescript @types/react @types/react-dom tailwindcss
```

- [ ] **Step 2: Create package.json**

```json
{
  "name": "genflow-local-server",
  "version": "1.0.0",
  "main": "electron/main.js",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "electron": "electron .",
    "start": "vite build && electron ."
  }
}
```

- [ ] **Step 3: Create Electron main process**

`electron/main.ts` — creates BrowserWindow, loads Vite dev server (dev) or built files (prod).

- [ ] **Step 4: Create worker module**

`src/worker.ts` — the job polling engine:
- `startPolling(config)` — starts 5s interval
- `stopPolling()` — stops interval
- `pollOnce(config)` — GET /pending, if job → pick → process → complete/fail
- `processJob(job, config)` — scrape → generate → deploy via Flowing AI

- [ ] **Step 5: Create config module**

`src/config.ts` — reads/writes `~/.genflow/config.json`

- [ ] **Step 6: Create logger module**

`src/logger.ts` — in-memory log buffer with timestamps, exposed to React

- [ ] **Step 7: Commit scaffold**

```bash
git add apps/genflow-local-server/
git commit -m "feat(genflow): scaffold Electron app with worker, config, logger"
```

---

### Task 6: Electron app — React UI

**Files:**
- Create: `apps/genflow-local-server/src/App.tsx`
- Create: `apps/genflow-local-server/index.html`

- [ ] **Step 1: Create main UI**

Simple single-page layout:
- Header: "Siteflow Generator" + status dot
- Settings section: backend URL + API key inputs (saved to config)
- Start/Stop button
- Stats: jobs today, failed
- Job list: latest 20 jobs with status badges
- Log panel: scrollable, auto-scroll, monospace

All text in Swedish.

- [ ] **Step 2: Wire up to worker**

Connect Start/Stop to worker.startPolling/stopPolling.
Subscribe to logger for log updates.
Poll job stats from local state.

- [ ] **Step 3: Commit**

```bash
git add apps/genflow-local-server/
git commit -m "feat(genflow): add React UI for genflow-local-server"
```

---

### Task 7: Final validation

- [ ] **Step 1: Backend tests**

```bash
cd /Users/douglassiteflow/dev/saleflow/backend && mix test
```

- [ ] **Step 2: Electron app builds**

```bash
cd /Users/douglassiteflow/dev/saleflow/apps/genflow-local-server && npm run build
```

- [ ] **Step 3: TypeScript check**

```bash
cd /Users/douglassiteflow/dev/saleflow/frontend && npx tsc --noEmit
```
