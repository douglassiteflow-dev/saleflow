# Telavox Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Full Telavox PBX integration — click-to-call, live call status, call recordings, and real-time KPI updates.

**Architecture:** Hybrid auth model — one shared `TELAVOX_API_TOKEN` env var for read-only operations (polling extensions, fetching recordings), per-agent `telavox_token` stored encrypted on User for write operations (dial, hangup). Real-time via Phoenix PubSub channels. Recordings stored in Cloudflare R2.

**Tech Stack:** Elixir/Phoenix, Ash 3.7, Oban 2.20, Req (HTTP), ex_aws_s3 (R2), Phoenix Channels, React + React Query.

**Spec:** `docs/superpowers/specs/2026-04-03-telavox-integration-design.md`

---

## File Structure

### Backend — New Files

| File | Responsibility |
|------|---------------|
| `lib/saleflow/telavox/client.ex` | HTTP client for Telavox API — all requests go through here |
| `lib/saleflow/storage.ex` | Cloudflare R2 upload/download/presigned URLs |
| `lib/saleflow/workers/telavox_poll_worker.ex` | Polls `/extensions/` every 5s for live call status |
| `lib/saleflow/workers/recording_fetch_worker.ex` | Fetches recordings after hangup webhook |
| `lib/saleflow_web/controllers/telavox_controller.ex` | Connect/disconnect per-agent token |
| `lib/saleflow_web/controllers/call_controller.ex` | Dial/hangup + recording URL endpoints |
| `lib/saleflow_web/channels/user_socket.ex` | Phoenix Socket for authenticated channels |
| `lib/saleflow_web/channels/calls_channel.ex` | `"calls:live"` channel for live call data |
| `lib/saleflow_web/channels/dashboard_channel.ex` | `"dashboard:updates"` channel for KPI pushes |
| `test/saleflow/telavox/client_test.exs` | Client unit tests with Mox |
| `test/saleflow_web/controllers/telavox_controller_test.exs` | Connect/disconnect tests |
| `test/saleflow_web/controllers/call_controller_test.exs` | Dial/hangup/recording tests |
| `test/saleflow_web/channels/calls_channel_test.exs` | Channel subscription tests |
| `priv/repo/migrations/TIMESTAMP_add_telavox_fields.exs` | Migration for new DB columns |

### Backend — Modified Files

| File | Changes |
|------|---------|
| `lib/saleflow/accounts/user.ex` | Add `telavox_token` attribute |
| `lib/saleflow/sales/phone_call.ex` | Add `recording_key`, `recording_id`, `telavox_call_id`, `direction` |
| `lib/saleflow_web/router.ex` | Add routes for telavox, calls, socket |
| `lib/saleflow_web/endpoint.ex` | Enable WebSocket transport |
| `lib/saleflow_web/controllers/webhook_controller.ex` | Add PubSub broadcast + recording job after hangup |
| `config/config.exs` | Add Oban cron for poll worker, R2 config |
| `config/runtime.exs` | Add `TELAVOX_API_TOKEN`, R2 env vars |
| `config/test.exs` | Add test config for Telavox + R2 |
| `mix.exs` | Add `ex_aws`, `ex_aws_s3` deps |

### Frontend — New Files

| File | Responsibility |
|------|---------------|
| `src/api/telavox.ts` | API hooks for connect/disconnect, dial/hangup, recording |
| `src/components/telavox-connect.tsx` | Token input + status on profile page |
| `src/components/dial-button.tsx` | Ring/Lägg på button for lead cards |
| `src/components/live-calls.tsx` | Pågående samtal section on dashboard |
| `src/components/recording-player.tsx` | Inline audio player |
| `src/lib/socket.ts` | Phoenix channel connection |
| `src/__tests__/telavox-connect.test.tsx` | Tests |
| `src/__tests__/dial-button.test.tsx` | Tests |
| `src/__tests__/live-calls.test.tsx` | Tests |
| `src/__tests__/recording-player.test.tsx` | Tests |

### Frontend — Modified Files

| File | Changes |
|------|---------|
| `src/api/types.ts` | Add TelavoxStatus, LiveCall, PhoneCallWithRecording types |
| `src/pages/profile.tsx` | Add TelavoxConnect card |
| `src/pages/dashboard.tsx` | Add LiveCalls section |
| `src/components/lead-info.tsx` | Add DialButton |

---

## Task 1: Telavox HTTP Client

**Files:**
- Create: `backend/lib/saleflow/telavox/client.ex`
- Create: `backend/test/saleflow/telavox/client_test.exs`
- Modify: `backend/config/runtime.exs`
- Modify: `backend/config/config.exs`
- Modify: `backend/config/test.exs`

- [ ] **Step 1: Add TELAVOX_API_TOKEN to config**

```elixir
# config/runtime.exs — add after telavox_webhook_secret block (line ~22)
  config :saleflow, :telavox_api_token, System.get_env("TELAVOX_API_TOKEN") || ""
```

```elixir
# config/test.exs — add after telavox_webhook_secret (line ~45)
config :saleflow, :telavox_api_token, "test-telavox-token"
```

- [ ] **Step 2: Write the client module**

```elixir
# backend/lib/saleflow/telavox/client.ex
defmodule Saleflow.Telavox.Client do
  @moduledoc """
  HTTP client for the Telavox API.

  Two auth modes:
  - Shared token (env var) for read-only: polling extensions, fetching recordings
  - Per-agent token for write operations: dial, hangup
  """

  @base_url "https://api.telavox.se"

  @doc "GET request using shared org token."
  def get(path) do
    token = Application.get_env(:saleflow, :telavox_api_token, "")
    request(:get, path, token)
  end

  @doc "GET request using a specific agent token."
  def get_as(token, path) do
    request(:get, path, token)
  end

  @doc "POST request using a specific agent token."
  def post_as(token, path) do
    request(:post, path, token)
  end

  @doc "GET request that returns raw binary body (for MP3 downloads)."
  def get_binary(path) do
    token = Application.get_env(:saleflow, :telavox_api_token, "")
    url = @base_url <> path

    case Req.get(url, headers: [{"authorization", "Bearer #{token}"}], decode_body: false) do
      {:ok, %{status: 200, body: body}} -> {:ok, body}
      {:ok, %{status: 401}} -> {:error, :unauthorized}
      {:ok, %{status: status}} -> {:error, {:http, status}}
      {:error, reason} -> {:error, reason}
    end
  end

  defp request(method, path, token) do
    url = @base_url <> path
    opts = [headers: [{"authorization", "Bearer #{token}"}]]

    result =
      case method do
        :get -> Req.get(url, opts)
        :post -> Req.post(url, opts)
      end

    case result do
      {:ok, %{status: 200, body: body}} -> {:ok, body}
      {:ok, %{status: 401}} -> {:error, :unauthorized}
      {:ok, %{status: 400, body: body}} -> {:error, {:bad_request, body}}
      {:ok, %{status: status, body: body}} -> {:error, {:http, status, body}}
      {:error, reason} -> {:error, reason}
    end
  end
end
```

- [ ] **Step 3: Write client tests**

```elixir
# backend/test/saleflow/telavox/client_test.exs
defmodule Saleflow.Telavox.ClientTest do
  use ExUnit.Case, async: true

  alias Saleflow.Telavox.Client

  describe "get/1" do
    test "returns {:ok, body} on 200" do
      # Integration test — requires TELAVOX_API_TOKEN in env
      # Skip in CI, run manually with: mix test test/saleflow/telavox/client_test.exs --include integration
      :ok
    end
  end

  describe "request error handling" do
    test "module is defined and exported" do
      assert function_exported?(Client, :get, 1)
      assert function_exported?(Client, :get_as, 2)
      assert function_exported?(Client, :post_as, 2)
      assert function_exported?(Client, :get_binary, 1)
    end
  end
end
```

- [ ] **Step 4: Run tests**

Run: `cd backend && mix test test/saleflow/telavox/client_test.exs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/lib/saleflow/telavox/client.ex backend/test/saleflow/telavox/client_test.exs backend/config/runtime.exs backend/config/test.exs
git commit -m "feat: add Telavox API client with hybrid auth"
```

---

## Task 2: Database Migration — New Fields

**Files:**
- Create: `backend/priv/repo/migrations/TIMESTAMP_add_telavox_integration_fields.exs`
- Modify: `backend/lib/saleflow/accounts/user.ex`
- Modify: `backend/lib/saleflow/sales/phone_call.ex`

- [ ] **Step 1: Generate migration**

Run: `cd backend && mix ecto.gen.migration add_telavox_integration_fields`

- [ ] **Step 2: Write migration**

```elixir
defmodule Saleflow.Repo.Migrations.AddTelavoxIntegrationFields do
  use Ecto.Migration

  def change do
    # Per-agent token for click-to-call
    alter table(:users) do
      add :telavox_token, :text
    end

    # Phone call enrichment
    alter table(:phone_calls) do
      add :recording_key, :text
      add :recording_id, :text
      add :telavox_call_id, :text
      add :direction, :text
    end

    create index(:phone_calls, [:recording_id])
    create index(:phone_calls, [:telavox_call_id])
  end
end
```

- [ ] **Step 3: Run migration**

Run: `cd backend && mix ecto.migrate`
Expected: Migration runs successfully

- [ ] **Step 4: Update User resource — add telavox_token attribute**

Add after `extension_number` attribute (line 53 in `user.ex`):

```elixir
    attribute :telavox_token, :string do
      allow_nil? true
      sensitive? true
    end
```

Update `update_user` action (line 117) to accept the new field:

```elixir
    update :update_user do
      description "Update user name, role, or phone number"
      accept [:name, :role, :phone_number, :extension_number, :telavox_token]
    end
```

- [ ] **Step 5: Update PhoneCall resource — add new attributes**

Add after `received_at` attribute (line 56 in `phone_call.ex`):

```elixir
    attribute :recording_key, :string do
      allow_nil? true
      public? true
    end

    attribute :recording_id, :string do
      allow_nil? true
      public? true
    end

    attribute :telavox_call_id, :string do
      allow_nil? true
      public? true
    end

    attribute :direction, :atom do
      constraints one_of: [:incoming, :outgoing, :missed]
      allow_nil? true
      public? true
    end
```

Update `:create` action accept list (line 66):

```elixir
      accept [:lead_id, :user_id, :caller, :callee, :duration, :call_log_id, :recording_id, :telavox_call_id, :direction]
```

Add an update action for recording enrichment:

```elixir
    update :attach_recording do
      description "Attach recording metadata to a phone call"
      accept [:recording_key, :recording_id]
    end
```

- [ ] **Step 6: Run tests to verify nothing broken**

Run: `cd backend && mix test`
Expected: All existing tests pass

- [ ] **Step 7: Commit**

```bash
git add backend/priv/repo/migrations/ backend/lib/saleflow/accounts/user.ex backend/lib/saleflow/sales/phone_call.ex
git commit -m "feat: add telavox_token to User, recording/direction fields to PhoneCall"
```

---

## Task 3: Telavox Connect/Disconnect Endpoints

**Files:**
- Create: `backend/lib/saleflow_web/controllers/telavox_controller.ex`
- Create: `backend/test/saleflow_web/controllers/telavox_controller_test.exs`
- Modify: `backend/lib/saleflow_web/router.ex`

- [ ] **Step 1: Write the controller**

```elixir
# backend/lib/saleflow_web/controllers/telavox_controller.ex
defmodule SaleflowWeb.TelavoxController do
  use SaleflowWeb, :controller

  alias Saleflow.Telavox.Client

  @doc "Connect agent's Telavox token. Verifies via /extensions/me."
  def connect(conn, %{"token" => token}) do
    case Client.get_as(token, "/extensions/me") do
      {:ok, %{"extension" => ext, "name" => name}} ->
        user = conn.assigns.current_user

        case Ash.update(user, %{telavox_token: token}, action: :update_user) do
          {:ok, _user} ->
            json(conn, %{ok: true, extension: ext, name: name})

          {:error, _} ->
            conn |> put_status(500) |> json(%{error: "Kunde inte spara token"})
        end

      {:error, :unauthorized} ->
        conn |> put_status(401) |> json(%{error: "Ogiltig Telavox-token"})

      {:error, _reason} ->
        conn |> put_status(502) |> json(%{error: "Kunde inte nå Telavox API"})
    end
  end

  def connect(conn, _params) do
    conn |> put_status(422) |> json(%{error: "Token krävs"})
  end

  @doc "Disconnect agent's Telavox token."
  def disconnect(conn, _params) do
    user = conn.assigns.current_user

    case Ash.update(user, %{telavox_token: nil}, action: :update_user) do
      {:ok, _user} -> json(conn, %{ok: true})
      {:error, _} -> conn |> put_status(500) |> json(%{error: "Kunde inte koppla bort"})
    end
  end

  @doc "Get current Telavox connection status."
  def status(conn, _params) do
    user = conn.assigns.current_user
    connected = user.telavox_token != nil && user.telavox_token != ""

    if connected do
      case Client.get_as(user.telavox_token, "/extensions/me") do
        {:ok, %{"extension" => ext, "name" => name}} ->
          json(conn, %{connected: true, extension: ext, name: name})

        {:error, :unauthorized} ->
          # Token expired — auto-disconnect
          Ash.update(user, %{telavox_token: nil}, action: :update_user)
          json(conn, %{connected: false, expired: true})

        {:error, _} ->
          json(conn, %{connected: true, extension: user.extension_number, name: user.name})
      end
    else
      json(conn, %{connected: false})
    end
  end
end
```

- [ ] **Step 2: Add routes**

In `backend/lib/saleflow_web/router.ex`, inside the authenticated scope (after line 88):

```elixir
    # Telavox integration
    post "/telavox/connect", TelavoxController, :connect
    post "/telavox/disconnect", TelavoxController, :disconnect
    get "/telavox/status", TelavoxController, :status
```

- [ ] **Step 3: Write controller tests**

```elixir
# backend/test/saleflow_web/controllers/telavox_controller_test.exs
defmodule SaleflowWeb.TelavoxControllerTest do
  use SaleflowWeb.ConnCase, async: true

  describe "POST /api/telavox/connect" do
    test "returns 422 when no token provided", %{conn: conn} do
      conn = conn |> post("/api/telavox/connect", %{})
      assert json_response(conn, 422)["error"] =~ "Token"
    end
  end

  describe "POST /api/telavox/disconnect" do
    test "returns ok", %{conn: conn} do
      conn = conn |> post("/api/telavox/disconnect")
      assert json_response(conn, 200)["ok"] == true
    end
  end

  describe "GET /api/telavox/status" do
    test "returns connected false when no token", %{conn: conn} do
      conn = conn |> get("/api/telavox/status")
      assert json_response(conn, 200)["connected"] == false
    end
  end
end
```

- [ ] **Step 4: Run tests**

Run: `cd backend && mix test test/saleflow_web/controllers/telavox_controller_test.exs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/lib/saleflow_web/controllers/telavox_controller.ex backend/test/saleflow_web/controllers/telavox_controller_test.exs backend/lib/saleflow_web/router.ex
git commit -m "feat: add Telavox connect/disconnect/status endpoints"
```

---

## Task 4: Click-to-Call & Hangup Endpoints

**Files:**
- Create: `backend/lib/saleflow_web/controllers/call_controller.ex`
- Create: `backend/test/saleflow_web/controllers/call_controller_test.exs`
- Modify: `backend/lib/saleflow_web/router.ex`

- [ ] **Step 1: Write the controller**

```elixir
# backend/lib/saleflow_web/controllers/call_controller.ex
defmodule SaleflowWeb.CallController do
  use SaleflowWeb, :controller

  alias Saleflow.Telavox.Client
  alias Saleflow.Sales

  @doc "Initiate a call to a lead via Telavox."
  def dial(conn, %{"lead_id" => lead_id}) do
    user = conn.assigns.current_user
    token = user.telavox_token

    cond do
      is_nil(token) || token == "" ->
        conn |> put_status(422) |> json(%{error: "Koppla Telavox i din profil för att ringa"})

      true ->
        case get_lead_phone(lead_id) do
          nil ->
            conn |> put_status(404) |> json(%{error: "Lead saknar telefonnummer"})

          phone ->
            case Client.get_as(token, "/dial/#{phone}?autoanswer=false") do
              {:ok, _body} ->
                json(conn, %{ok: true, number: phone})

              {:error, :unauthorized} ->
                Ash.update(user, %{telavox_token: nil}, action: :update_user)
                conn |> put_status(401) |> json(%{error: "Telavox-token har gått ut"})

              {:error, reason} ->
                conn |> put_status(502) |> json(%{error: "Telavox fel: #{inspect(reason)}"})
            end
        end
    end
  end

  def dial(conn, _params) do
    conn |> put_status(422) |> json(%{error: "lead_id krävs"})
  end

  @doc "Hang up the agent's current call."
  def hangup(conn, _params) do
    user = conn.assigns.current_user
    token = user.telavox_token

    if is_nil(token) || token == "" do
      conn |> put_status(422) |> json(%{error: "Inte kopplad till Telavox"})
    else
      case Client.post_as(token, "/hangup") do
        {:ok, _body} -> json(conn, %{ok: true})
        {:error, {:bad_request, _}} -> json(conn, %{ok: true, message: "Inget samtal att lägga på"})
        {:error, :unauthorized} ->
          Ash.update(user, %{telavox_token: nil}, action: :update_user)
          conn |> put_status(401) |> json(%{error: "Telavox-token har gått ut"})
        {:error, reason} ->
          conn |> put_status(502) |> json(%{error: "Telavox fel: #{inspect(reason)}"})
      end
    end
  end

  defp get_lead_phone(lead_id) do
    query = "SELECT telefon FROM leads WHERE id = $1 LIMIT 1"
    case Saleflow.Repo.query(query, [Ecto.UUID.dump!(lead_id)]) do
      {:ok, %{rows: [[phone]]}} when is_binary(phone) and phone != "" -> phone
      _ -> nil
    end
  end
end
```

- [ ] **Step 2: Add routes**

In `router.ex` authenticated scope, add after telavox routes:

```elixir
    # Calls
    post "/calls/dial", CallController, :dial
    post "/calls/hangup", CallController, :hangup
```

- [ ] **Step 3: Write tests**

```elixir
# backend/test/saleflow_web/controllers/call_controller_test.exs
defmodule SaleflowWeb.CallControllerTest do
  use SaleflowWeb.ConnCase, async: true

  describe "POST /api/calls/dial" do
    test "returns 422 when no lead_id", %{conn: conn} do
      conn = conn |> post("/api/calls/dial", %{})
      assert json_response(conn, 422)["error"] =~ "lead_id"
    end

    test "returns 422 when agent has no telavox token", %{conn: conn} do
      conn = conn |> post("/api/calls/dial", %{lead_id: Ecto.UUID.generate()})
      assert json_response(conn, 422)["error"] =~ "Koppla Telavox"
    end
  end

  describe "POST /api/calls/hangup" do
    test "returns 422 when agent has no telavox token", %{conn: conn} do
      conn = conn |> post("/api/calls/hangup")
      assert json_response(conn, 422)["error"] =~ "Inte kopplad"
    end
  end
end
```

- [ ] **Step 4: Run tests**

Run: `cd backend && mix test test/saleflow_web/controllers/call_controller_test.exs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/lib/saleflow_web/controllers/call_controller.ex backend/test/saleflow_web/controllers/call_controller_test.exs backend/lib/saleflow_web/router.ex
git commit -m "feat: add click-to-call dial and hangup endpoints"
```

---

## Task 5: Phoenix Channels — WebSocket Setup

**Files:**
- Create: `backend/lib/saleflow_web/channels/user_socket.ex`
- Create: `backend/lib/saleflow_web/channels/calls_channel.ex`
- Create: `backend/lib/saleflow_web/channels/dashboard_channel.ex`
- Modify: `backend/lib/saleflow_web/endpoint.ex`

- [ ] **Step 1: Create UserSocket**

```elixir
# backend/lib/saleflow_web/channels/user_socket.ex
defmodule SaleflowWeb.UserSocket do
  use Phoenix.Socket

  channel "calls:live", SaleflowWeb.CallsChannel
  channel "dashboard:updates", SaleflowWeb.DashboardChannel

  @impl true
  def connect(%{"token" => token}, socket, _connect_info) do
    case Saleflow.Repo.query(
      "SELECT u.id, u.name FROM users u JOIN login_sessions ls ON ls.user_id = u.id WHERE ls.session_token = $1 AND ls.logged_out_at IS NULL LIMIT 1",
      [token]
    ) do
      {:ok, %{rows: [[user_id, name]]}} ->
        {:ok, assign(socket, :user_id, Saleflow.Sales.decode_uuid(user_id)) |> assign(:user_name, name)}
      _ ->
        :error
    end
  end

  def connect(_params, _socket, _connect_info), do: :error

  @impl true
  def id(socket), do: "user_socket:#{socket.assigns.user_id}"
end
```

- [ ] **Step 2: Create CallsChannel**

```elixir
# backend/lib/saleflow_web/channels/calls_channel.ex
defmodule SaleflowWeb.CallsChannel do
  use Phoenix.Channel

  @impl true
  def join("calls:live", _payload, socket) do
    {:ok, socket}
  end

  @impl true
  def handle_info({:live_calls, calls}, socket) do
    push(socket, "live_calls", %{calls: calls})
    {:noreply, socket}
  end
end
```

- [ ] **Step 3: Create DashboardChannel**

```elixir
# backend/lib/saleflow_web/channels/dashboard_channel.ex
defmodule SaleflowWeb.DashboardChannel do
  use Phoenix.Channel

  @impl true
  def join("dashboard:updates", _payload, socket) do
    {:ok, socket}
  end

  @impl true
  def handle_info({:dashboard_update, payload}, socket) do
    push(socket, "stats_updated", payload)
    {:noreply, socket}
  end
end
```

- [ ] **Step 4: Enable socket in endpoint**

In `backend/lib/saleflow_web/endpoint.ex`, add before `plug Plug.RequestId` (around line 23):

```elixir
  socket "/socket", SaleflowWeb.UserSocket,
    websocket: [check_origin: ["http://localhost:5173", "https://sale.siteflow.se"]],
    longpoll: false
```

- [ ] **Step 5: Run tests**

Run: `cd backend && mix test`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add backend/lib/saleflow_web/channels/ backend/lib/saleflow_web/endpoint.ex
git commit -m "feat: add Phoenix channels for live calls and dashboard updates"
```

---

## Task 6: TelavoxPollWorker — Live Call Status

**Files:**
- Create: `backend/lib/saleflow/workers/telavox_poll_worker.ex`
- Modify: `backend/config/config.exs`

- [ ] **Step 1: Write the poll worker**

```elixir
# backend/lib/saleflow/workers/telavox_poll_worker.ex
defmodule Saleflow.Workers.TelavoxPollWorker do
  @moduledoc """
  Polls Telavox GET /extensions/ every 5 seconds using the shared token.
  Broadcasts live call status via PubSub to the calls:live channel.
  """

  use Oban.Worker, queue: :default, max_attempts: 1

  require Logger

  alias Saleflow.Telavox.Client

  @impl Oban.Worker
  def perform(%Oban.Job{}) do
    token = Application.get_env(:saleflow, :telavox_api_token, "")

    if token == "" do
      Logger.debug("TelavoxPollWorker: no TELAVOX_API_TOKEN configured, skipping")
      :ok
    else
      case Client.get("/extensions/") do
        {:ok, extensions} when is_list(extensions) ->
          calls = extract_live_calls(extensions)
          broadcast_calls(calls)
          :ok

        {:error, :unauthorized} ->
          Logger.warning("TelavoxPollWorker: shared token expired (401)")
          :ok

        {:error, reason} ->
          Logger.warning("TelavoxPollWorker: API error: #{inspect(reason)}")
          :ok
      end
    end
  end

  defp extract_live_calls(extensions) do
    # Match extensions to Saleflow users via extension_number
    user_map = build_user_map()

    extensions
    |> Enum.flat_map(fn ext ->
      extension = ext["extension"] || ""
      agent_name = ext["name"] || "Okänd"
      user_id = Map.get(user_map, extension)

      (ext["calls"] || [])
      |> Enum.map(fn call ->
        %{
          user_id: user_id,
          agent_name: agent_name,
          extension: extension,
          callerid: call["callerid"] || "",
          direction: call["direction"] || "unknown",
          linestatus: call["linestatus"] || "unknown"
        }
      end)
    end)
  end

  defp build_user_map do
    case Saleflow.Repo.query("SELECT id, extension_number FROM users WHERE extension_number IS NOT NULL") do
      {:ok, %{rows: rows}} ->
        Map.new(rows, fn [id, ext] -> {ext, Saleflow.Sales.decode_uuid(id)} end)
      _ ->
        %{}
    end
  end

  defp broadcast_calls(calls) do
    Phoenix.PubSub.broadcast(
      Saleflow.PubSub,
      "calls:live",
      {:live_calls, calls}
    )
  end
end
```

- [ ] **Step 2: Add cron schedule**

In `backend/config/config.exs`, add to the Oban crontab list (inside the `Oban.Plugins.Cron` config, after the CallbackReminderWorker line):

```elixir
      {"*/1 * * * *", Saleflow.Workers.TelavoxPollWorker}
```

Note: Oban cron minimum is 1 minute. For 5-second polling, the worker will self-schedule via `Oban.insert`. Update the worker's `perform` to re-enqueue itself:

Replace the worker with this version that self-schedules:

```elixir
# Replace perform function:
  @impl Oban.Worker
  def perform(%Oban.Job{}) do
    token = Application.get_env(:saleflow, :telavox_api_token, "")

    if token != "" do
      case Client.get("/extensions/") do
        {:ok, extensions} when is_list(extensions) ->
          calls = extract_live_calls(extensions)
          broadcast_calls(calls)

        {:error, :unauthorized} ->
          Logger.warning("TelavoxPollWorker: shared token expired (401)")

        {:error, reason} ->
          Logger.warning("TelavoxPollWorker: API error: #{inspect(reason)}")
      end
    end

    # Re-schedule in 5 seconds
    %{}
    |> Saleflow.Workers.TelavoxPollWorker.new(schedule_in: 5)
    |> Oban.insert()

    :ok
  end
```

Remove the cron entry and instead add a startup trigger. In `backend/lib/saleflow/application.ex`, add after `Oban` child in the supervision tree:

```elixir
      # Start Telavox polling (will self-reschedule every 5s)
      {Task, fn -> Saleflow.Workers.TelavoxPollWorker.new(%{}) |> Oban.insert() end}
```

- [ ] **Step 3: Run tests**

Run: `cd backend && mix test`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add backend/lib/saleflow/workers/telavox_poll_worker.ex backend/lib/saleflow/application.ex
git commit -m "feat: add TelavoxPollWorker — polls live call status every 5s"
```

---

## Task 7: Webhook Enhancement — PubSub Broadcast + Recording Job

**Files:**
- Modify: `backend/lib/saleflow_web/controllers/webhook_controller.ex`
- Create: `backend/lib/saleflow/workers/recording_fetch_worker.ex`

- [ ] **Step 1: Update webhook controller to broadcast + enqueue recording job**

Replace the success branch in `telavox_hangup` (lines 32-34 of webhook_controller.ex):

```elixir
      {:ok, phone_call} ->
        # Broadcast dashboard update
        Phoenix.PubSub.broadcast(
          Saleflow.PubSub,
          "dashboard:updates",
          {:dashboard_update, %{event: "call_completed", user_id: user_id}}
        )

        # Enqueue recording fetch (30s delay for Telavox to process MP3)
        if user_id do
          %{phone_call_id: phone_call.id, user_id: user_id}
          |> Saleflow.Workers.RecordingFetchWorker.new(schedule_in: 30)
          |> Oban.insert()
        end

        json(conn, %{ok: true})
```

- [ ] **Step 2: Write RecordingFetchWorker**

```elixir
# backend/lib/saleflow/workers/recording_fetch_worker.ex
defmodule Saleflow.Workers.RecordingFetchWorker do
  @moduledoc """
  Fetches call recording from Telavox after a hangup webhook.

  Waits 30s (scheduled_in), then:
  1. Calls GET /calls?withRecordings=true with shared token
  2. Matches the phone_call by time/number to find recordingId
  3. Downloads MP3 via GET /recordings/{id}
  4. Uploads to Cloudflare R2
  5. Updates PhoneCall record with recording_key and recording_id
  """

  use Oban.Worker, queue: :default, max_attempts: 3

  require Logger

  alias Saleflow.Telavox.Client
  alias Saleflow.Sales

  @impl Oban.Worker
  def perform(%Oban.Job{args: %{"phone_call_id" => phone_call_id, "user_id" => _user_id}, attempt: attempt}) do
    # Load the phone call
    case Saleflow.Repo.query("SELECT callee, received_at FROM phone_calls WHERE id = $1", [Ecto.UUID.dump!(phone_call_id)]) do
      {:ok, %{rows: [[callee, received_at]]}} ->
        fetch_and_store_recording(phone_call_id, callee, received_at, attempt)

      _ ->
        Logger.warning("RecordingFetchWorker: phone_call #{phone_call_id} not found")
        :ok
    end
  end

  defp fetch_and_store_recording(phone_call_id, callee, _received_at, attempt) do
    case Client.get("/calls?withRecordings=true") do
      {:ok, %{"outgoing" => outgoing, "incoming" => incoming}} ->
        all_calls = outgoing ++ incoming

        case find_recording_id(all_calls, callee) do
          nil ->
            if attempt < 3 do
              Logger.info("RecordingFetchWorker: no recordingId yet for #{phone_call_id}, will retry")
              {:error, "Recording not ready"}
            else
              Logger.info("RecordingFetchWorker: no recording found for #{phone_call_id} after #{attempt} attempts")
              :ok
            end

          recording_id ->
            download_and_store(phone_call_id, recording_id)
        end

      {:error, reason} ->
        Logger.warning("RecordingFetchWorker: API error: #{inspect(reason)}")
        {:error, "API error"}
    end
  end

  defp find_recording_id(calls, callee) do
    Enum.find_value(calls, fn call ->
      number = call["number"] || call["numberE164"] || ""
      if String.contains?(number, callee) || String.contains?(callee, number) do
        call["recordingId"]
      end
    end)
  end

  defp download_and_store(phone_call_id, recording_id) do
    case Client.get_binary("/recordings/#{recording_id}") do
      {:ok, mp3_data} ->
        now = DateTime.utc_now()
        key = "recordings/#{now.year}/#{String.pad_leading("#{now.month}", 2, "0")}/#{phone_call_id}.mp3"

        case Saleflow.Storage.upload(key, mp3_data, "audio/mpeg") do
          {:ok, _} ->
            Saleflow.Repo.query(
              "UPDATE phone_calls SET recording_key = $1, recording_id = $2 WHERE id = $3",
              [key, recording_id, Ecto.UUID.dump!(phone_call_id)]
            )
            Logger.info("RecordingFetchWorker: stored recording #{recording_id} for #{phone_call_id}")
            :ok

          {:error, reason} ->
            Logger.warning("RecordingFetchWorker: R2 upload failed: #{inspect(reason)}")
            {:error, "Upload failed"}
        end

      {:error, reason} ->
        Logger.warning("RecordingFetchWorker: recording download failed: #{inspect(reason)}")
        {:error, "Download failed"}
    end
  end
end
```

- [ ] **Step 3: Run tests**

Run: `cd backend && mix test`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add backend/lib/saleflow_web/controllers/webhook_controller.ex backend/lib/saleflow/workers/recording_fetch_worker.ex
git commit -m "feat: add PubSub broadcast on hangup + RecordingFetchWorker"
```

---

## Task 8: Cloudflare R2 Storage Module

**Files:**
- Create: `backend/lib/saleflow/storage.ex`
- Modify: `backend/mix.exs`
- Modify: `backend/config/runtime.exs`
- Modify: `backend/config/test.exs`
- Modify: `backend/lib/saleflow_web/router.ex` (recording endpoint)

- [ ] **Step 1: Add ex_aws deps to mix.exs**

In `backend/mix.exs` deps list, add:

```elixir
      {:ex_aws, "~> 2.5"},
      {:ex_aws_s3, "~> 2.5"},
```

- [ ] **Step 2: Run mix deps.get**

Run: `cd backend && mix deps.get`

- [ ] **Step 3: Add R2 config**

In `backend/config/runtime.exs`, add after telavox_api_token line:

```elixir
  # Cloudflare R2 (S3-compatible)
  r2_account_id = System.get_env("R2_ACCOUNT_ID") || ""
  config :ex_aws,
    access_key_id: System.get_env("R2_ACCESS_KEY") || "",
    secret_access_key: System.get_env("R2_SECRET_KEY") || "",
    region: "auto"

  config :ex_aws, :s3,
    scheme: "https://",
    host: "#{r2_account_id}.r2.cloudflarestorage.com",
    region: "auto"

  config :saleflow, :r2_bucket, System.get_env("R2_BUCKET") || "saleflow-recordings"
```

In `backend/config/test.exs`, add:

```elixir
# R2 storage — disabled in test
config :saleflow, :r2_bucket, "test-bucket"
config :saleflow, :storage_enabled, false
```

- [ ] **Step 4: Write Storage module**

```elixir
# backend/lib/saleflow/storage.ex
defmodule Saleflow.Storage do
  @moduledoc """
  Cloudflare R2 storage for call recordings.
  S3-compatible API via ex_aws.
  """

  @doc "Upload binary data to R2."
  def upload(key, data, content_type) do
    if enabled?() do
      bucket()
      |> ExAws.S3.put_object(key, data, content_type: content_type)
      |> ExAws.request()
    else
      {:ok, :noop}
    end
  end

  @doc "Generate a presigned URL for downloading (1 hour expiry)."
  def presigned_url(key) do
    if enabled?() do
      {:ok, url} =
        ExAws.S3.presigned_url(ExAws.Config.new(:s3), :get, bucket(), key, expires_in: 3600)
      {:ok, url}
    else
      {:ok, "http://localhost/fake/#{key}"}
    end
  end

  defp bucket, do: Application.get_env(:saleflow, :r2_bucket, "saleflow-recordings")
  defp enabled?, do: Application.get_env(:saleflow, :storage_enabled, true)
end
```

- [ ] **Step 5: Add recording URL endpoint to CallController**

In `backend/lib/saleflow_web/controllers/call_controller.ex`, add:

```elixir
  @doc "Get presigned URL for a call recording."
  def recording(conn, %{"id" => phone_call_id}) do
    case Saleflow.Repo.query(
      "SELECT recording_key FROM phone_calls WHERE id = $1",
      [Ecto.UUID.dump!(phone_call_id)]
    ) do
      {:ok, %{rows: [[key]]}} when is_binary(key) ->
        {:ok, url} = Saleflow.Storage.presigned_url(key)
        json(conn, %{url: url})

      _ ->
        conn |> put_status(404) |> json(%{error: "Ingen inspelning"})
    end
  end
```

Add route in `router.ex` authenticated scope:

```elixir
    get "/calls/:id/recording", CallController, :recording
```

- [ ] **Step 6: Run tests**

Run: `cd backend && mix test`
Expected: All tests pass

- [ ] **Step 7: Commit**

```bash
git add backend/lib/saleflow/storage.ex backend/mix.exs backend/mix.lock backend/config/runtime.exs backend/config/test.exs backend/lib/saleflow_web/controllers/call_controller.ex backend/lib/saleflow_web/router.ex
git commit -m "feat: add R2 storage module + recording URL endpoint"
```

---

## Task 9: Frontend — Types + API Hooks

**Files:**
- Modify: `frontend/src/api/types.ts`
- Create: `frontend/src/api/telavox.ts`

- [ ] **Step 1: Add types**

In `frontend/src/api/types.ts`, add at the end:

```typescript
export interface TelavoxStatus {
  connected: boolean;
  expired?: boolean;
  extension?: string;
  name?: string;
}

export interface LiveCall {
  user_id: string | null;
  agent_name: string;
  extension: string;
  callerid: string;
  direction: "in" | "out" | "unknown";
  linestatus: "up" | "down" | "ringing";
}

export interface DialResponse {
  ok: boolean;
  number?: string;
}

export interface RecordingResponse {
  url: string;
}
```

- [ ] **Step 2: Write API hooks**

```typescript
// frontend/src/api/telavox.ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import type { TelavoxStatus, DialResponse, RecordingResponse } from "./types";

export function useTelavoxStatus() {
  return useQuery<TelavoxStatus>({
    queryKey: ["telavox", "status"],
    queryFn: () => api<TelavoxStatus>("/api/telavox/status"),
    staleTime: 60_000,
  });
}

export function useTelavoxConnect() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (token: string) =>
      api<TelavoxStatus>("/api/telavox/connect", {
        method: "POST",
        body: JSON.stringify({ token }),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["telavox", "status"] }),
  });
}

export function useTelavoxDisconnect() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api("/api/telavox/disconnect", { method: "POST" }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["telavox", "status"] }),
  });
}

export function useDial() {
  return useMutation({
    mutationFn: (leadId: string) =>
      api<DialResponse>("/api/calls/dial", {
        method: "POST",
        body: JSON.stringify({ lead_id: leadId }),
      }),
  });
}

export function useHangup() {
  return useMutation({
    mutationFn: () => api("/api/calls/hangup", { method: "POST" }),
  });
}

export function useRecordingUrl(phoneCallId: string | null) {
  return useQuery<RecordingResponse>({
    queryKey: ["recording", phoneCallId],
    queryFn: () => api<RecordingResponse>(`/api/calls/${phoneCallId}/recording`),
    enabled: !!phoneCallId,
    staleTime: 3600_000,
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/api/types.ts frontend/src/api/telavox.ts
git commit -m "feat: add Telavox frontend types and API hooks"
```

---

## Task 10: Frontend — Phoenix Socket Connection

**Files:**
- Create: `frontend/src/lib/socket.ts`

- [ ] **Step 1: Install phoenix npm package**

Run: `cd frontend && npm install phoenix`

- [ ] **Step 2: Write socket module**

```typescript
// frontend/src/lib/socket.ts
import { Socket, Channel } from "phoenix";

let socket: Socket | null = null;
let callsChannel: Channel | null = null;
let dashboardChannel: Channel | null = null;

export function connectSocket(sessionToken: string) {
  if (socket?.isConnected()) return;

  socket = new Socket("/socket", {
    params: { token: sessionToken },
  });
  socket.connect();
}

export function joinCallsChannel(onLiveCalls: (calls: unknown[]) => void): Channel | null {
  if (!socket) return null;

  callsChannel = socket.channel("calls:live", {});
  callsChannel.join();
  callsChannel.on("live_calls", (payload: { calls: unknown[] }) => {
    onLiveCalls(payload.calls);
  });
  return callsChannel;
}

export function joinDashboardChannel(onUpdate: (payload: unknown) => void): Channel | null {
  if (!socket) return null;

  dashboardChannel = socket.channel("dashboard:updates", {});
  dashboardChannel.join();
  dashboardChannel.on("stats_updated", onUpdate);
  return dashboardChannel;
}

export function disconnectSocket() {
  callsChannel?.leave();
  dashboardChannel?.leave();
  socket?.disconnect();
  socket = null;
  callsChannel = null;
  dashboardChannel = null;
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/socket.ts frontend/package.json frontend/package-lock.json
git commit -m "feat: add Phoenix socket connection for live updates"
```

---

## Task 11: Frontend — TelavoxConnect Component (Profile)

**Files:**
- Create: `frontend/src/components/telavox-connect.tsx`
- Modify: `frontend/src/pages/profile.tsx`

- [ ] **Step 1: Write TelavoxConnect component**

```tsx
// frontend/src/components/telavox-connect.tsx
import { useState } from "react";
import { useTelavoxStatus, useTelavoxConnect, useTelavoxDisconnect } from "@/api/telavox";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Loader from "@/components/kokonutui/loader";

export function TelavoxConnect() {
  const { data: status, isLoading } = useTelavoxStatus();
  const connect = useTelavoxConnect();
  const disconnect = useTelavoxDisconnect();
  const [token, setToken] = useState("");

  function handleConnect() {
    if (!token.trim()) return;
    connect.mutate(token.trim(), { onSuccess: () => setToken("") });
  }

  return (
    <Card>
      <div className="space-y-4">
        <CardTitle>Telavox</CardTitle>

        {isLoading ? (
          <Loader size="sm" title="Laddar..." />
        ) : status?.connected ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-green-50 text-green-700 border border-green-200">
                Kopplad
              </span>
              <span className="text-sm text-[var(--color-text-secondary)]">
                {status.name} — {status.extension}
              </span>
            </div>
            <Button
              variant="danger"
              size="default"
              onClick={() => disconnect.mutate()}
              disabled={disconnect.isPending}
            >
              {disconnect.isPending ? "Kopplar bort..." : "Koppla bort"}
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {status?.expired && (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
                <p className="text-sm text-amber-800">
                  Din Telavox-token har gått ut. Klistra in en ny token nedan.
                </p>
              </div>
            )}
            <p className="text-sm text-[var(--color-text-secondary)]">
              Klistra in din Telavox JWT-token för att aktivera click-to-call.
              Hittas i Telavox Flow under Inställningar.
            </p>
            <div className="flex gap-2">
              <Input
                type="password"
                placeholder="eyJ0eXAi..."
                value={token}
                onChange={(e) => setToken(e.target.value)}
              />
              <Button
                variant="primary"
                size="default"
                onClick={handleConnect}
                disabled={connect.isPending || !token.trim()}
              >
                {connect.isPending ? "Ansluter..." : "Anslut"}
              </Button>
            </div>
            {connect.isError && (
              <p className="text-sm text-[var(--color-danger)]">
                {(connect.error as Error).message}
              </p>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
```

- [ ] **Step 2: Add to profile page**

In `frontend/src/pages/profile.tsx`, add import:

```typescript
import { TelavoxConnect } from "@/components/telavox-connect";
```

Add `<TelavoxConnect />` between the Microsoft Teams card and Sessions card (after line 98):

```tsx
      {/* Telavox integration card */}
      <TelavoxConnect />
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/telavox-connect.tsx frontend/src/pages/profile.tsx
git commit -m "feat: add TelavoxConnect component on profile page"
```

---

## Task 12: Frontend — DialButton Component

**Files:**
- Create: `frontend/src/components/dial-button.tsx`
- Modify: `frontend/src/components/lead-info.tsx`

- [ ] **Step 1: Write DialButton component**

```tsx
// frontend/src/components/dial-button.tsx
import { useState } from "react";
import { useDial, useHangup, useTelavoxStatus } from "@/api/telavox";
import { Button } from "@/components/ui/button";

interface DialButtonProps {
  leadId: string;
  phone: string;
}

export function DialButton({ leadId, phone }: DialButtonProps) {
  const { data: status } = useTelavoxStatus();
  const dial = useDial();
  const hangup = useHangup();
  const [calling, setCalling] = useState(false);

  if (!status?.connected) return null;
  if (!phone) return null;

  function handleDial() {
    dial.mutate(leadId, {
      onSuccess: () => setCalling(true),
    });
  }

  function handleHangup() {
    hangup.mutate(undefined, {
      onSuccess: () => setCalling(false),
    });
  }

  if (calling) {
    return (
      <Button
        variant="danger"
        size="default"
        onClick={handleHangup}
        disabled={hangup.isPending}
      >
        {hangup.isPending ? "..." : "Lägg på"}
      </Button>
    );
  }

  return (
    <Button
      variant="primary"
      size="default"
      onClick={handleDial}
      disabled={dial.isPending}
    >
      {dial.isPending ? "Ringer..." : "Ring"}
    </Button>
  );
}
```

- [ ] **Step 2: Add DialButton to lead-info.tsx**

In `frontend/src/components/lead-info.tsx`, add import:

```typescript
import { DialButton } from "@/components/dial-button";
```

After the CardTitle in the lead info header (around line 64), add the DialButton:

Replace the header section:
```tsx
      <div className="flex items-start justify-between mb-4">
        <CardTitle>{lead.företag}</CardTitle>
        <Badge status={lead.status} />
      </div>
```

With:
```tsx
      <div className="flex items-start justify-between mb-4">
        <CardTitle>{lead.företag}</CardTitle>
        <div className="flex items-center gap-2">
          <DialButton leadId={lead.id} phone={lead.telefon} />
          <Badge status={lead.status} />
        </div>
      </div>
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/dial-button.tsx frontend/src/components/lead-info.tsx
git commit -m "feat: add DialButton (click-to-call) on lead cards"
```

---

## Task 13: Frontend — LiveCalls Component (Dashboard)

**Files:**
- Create: `frontend/src/components/live-calls.tsx`
- Modify: `frontend/src/pages/dashboard.tsx`

- [ ] **Step 1: Write LiveCalls component**

```tsx
// frontend/src/components/live-calls.tsx
import { useState, useEffect, useRef } from "react";
import { joinCallsChannel } from "@/lib/socket";
import { Card, CardTitle } from "@/components/ui/card";
import type { LiveCall } from "@/api/types";

function CallTimer() {
  const [seconds, setSeconds] = useState(0);
  const ref = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    ref.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(ref.current);
  }, []);

  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return (
    <span className="font-mono text-sm text-[var(--color-accent)]">
      {String(m).padStart(2, "0")}:{String(s).padStart(2, "0")}
    </span>
  );
}

export function LiveCalls() {
  const [calls, setCalls] = useState<LiveCall[]>([]);

  useEffect(() => {
    const channel = joinCallsChannel((newCalls) => {
      setCalls(newCalls as LiveCall[]);
    });
    return () => { channel?.leave(); };
  }, []);

  if (calls.length === 0) return null;

  return (
    <Card>
      <CardTitle>Pågående samtal</CardTitle>
      <div className="mt-3 space-y-2">
        {calls.map((call, i) => (
          <div
            key={`${call.extension}-${i}`}
            className="flex items-center justify-between py-2 border-b border-[var(--color-border)] last:border-0"
          >
            <div className="flex items-center gap-3">
              <span
                className={`inline-block w-2 h-2 rounded-full ${
                  call.linestatus === "up"
                    ? "bg-[var(--color-success)]"
                    : "bg-[var(--color-warning)] animate-pulse"
                }`}
              />
              <div>
                <p className="text-sm font-medium text-[var(--color-text-primary)]">
                  {call.agent_name}
                </p>
                <p className="text-sm text-[var(--color-text-secondary)]">
                  {call.direction === "out" ? "→" : "←"} {call.callerid}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <CallTimer />
              <a
                href="https://home.telavox.se/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-[var(--color-accent)] hover:underline"
              >
                Medlyssna
              </a>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
```

- [ ] **Step 2: Add to dashboard**

In `frontend/src/pages/dashboard.tsx`, add import:

```typescript
import { LiveCalls } from "@/components/live-calls";
```

Add `<LiveCalls />` after the stat cards grid and before GoalProgress (between lines 59 and 62):

```tsx
      {/* Pågående samtal */}
      <LiveCalls />
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/live-calls.tsx frontend/src/pages/dashboard.tsx
git commit -m "feat: add LiveCalls component — real-time call status on dashboard"
```

---

## Task 14: Frontend — RecordingPlayer Component

**Files:**
- Create: `frontend/src/components/recording-player.tsx`

- [ ] **Step 1: Write RecordingPlayer component**

```tsx
// frontend/src/components/recording-player.tsx
import { useState } from "react";
import { useRecordingUrl } from "@/api/telavox";

interface RecordingPlayerProps {
  phoneCallId: string;
}

export function RecordingPlayer({ phoneCallId }: RecordingPlayerProps) {
  const [expanded, setExpanded] = useState(false);
  const { data, isLoading } = useRecordingUrl(expanded ? phoneCallId : null);

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="text-xs text-[var(--color-accent)] hover:underline"
      >
        {expanded ? "Dölj inspelning" : "Spela upp inspelning"}
      </button>

      {expanded && (
        <div className="mt-2">
          {isLoading ? (
            <span className="text-xs text-[var(--color-text-secondary)]">Laddar...</span>
          ) : data?.url ? (
            <audio
              controls
              src={data.url}
              className="w-full h-8 rounded-[6px]"
              style={{ background: "var(--color-bg-panel)" }}
            />
          ) : (
            <span className="text-xs text-[var(--color-text-secondary)]">Ingen inspelning</span>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/recording-player.tsx
git commit -m "feat: add RecordingPlayer component for inline audio playback"
```

---

## Task 15: Frontend Tests

**Files:**
- Create: `frontend/src/__tests__/telavox-connect.test.tsx`
- Create: `frontend/src/__tests__/dial-button.test.tsx`
- Create: `frontend/src/__tests__/live-calls.test.tsx`
- Create: `frontend/src/__tests__/recording-player.test.tsx`

- [ ] **Step 1: Write TelavoxConnect test**

```tsx
// frontend/src/__tests__/telavox-connect.test.tsx
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TelavoxConnect } from "@/components/telavox-connect";
import { vi } from "vitest";

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

vi.mock("@/api/telavox", () => ({
  useTelavoxStatus: () => ({ data: { connected: false }, isLoading: false }),
  useTelavoxConnect: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
  useTelavoxDisconnect: () => ({ mutate: vi.fn(), isPending: false }),
}));

function Wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("TelavoxConnect", () => {
  it("renders disconnected state with token input", () => {
    render(<TelavoxConnect />, { wrapper: Wrapper });
    expect(screen.getByText("Telavox")).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/eyJ0eXAi/)).toBeInTheDocument();
    expect(screen.getByText("Anslut")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Write DialButton test**

```tsx
// frontend/src/__tests__/dial-button.test.tsx
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DialButton } from "@/components/dial-button";
import { vi } from "vitest";

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

vi.mock("@/api/telavox", () => ({
  useTelavoxStatus: () => ({ data: { connected: true } }),
  useDial: () => ({ mutate: vi.fn(), isPending: false }),
  useHangup: () => ({ mutate: vi.fn(), isPending: false }),
}));

function Wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("DialButton", () => {
  it("renders Ring button when connected", () => {
    render(<DialButton leadId="123" phone="0701234567" />, { wrapper: Wrapper });
    expect(screen.getByText("Ring")).toBeInTheDocument();
  });

  it("renders nothing when no phone", () => {
    const { container } = render(<DialButton leadId="123" phone="" />, { wrapper: Wrapper });
    expect(container.firstChild).toBeNull();
  });
});
```

- [ ] **Step 3: Write LiveCalls test**

```tsx
// frontend/src/__tests__/live-calls.test.tsx
import { render } from "@testing-library/react";
import { LiveCalls } from "@/components/live-calls";
import { vi } from "vitest";

vi.mock("@/lib/socket", () => ({
  joinCallsChannel: vi.fn(() => ({ leave: vi.fn() })),
}));

describe("LiveCalls", () => {
  it("renders nothing when no active calls", () => {
    const { container } = render(<LiveCalls />);
    expect(container.firstChild).toBeNull();
  });
});
```

- [ ] **Step 4: Write RecordingPlayer test**

```tsx
// frontend/src/__tests__/recording-player.test.tsx
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RecordingPlayer } from "@/components/recording-player";

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

function Wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("RecordingPlayer", () => {
  it("renders play button", () => {
    render(<RecordingPlayer phoneCallId="abc" />, { wrapper: Wrapper });
    expect(screen.getByText("Spela upp inspelning")).toBeInTheDocument();
  });
});
```

- [ ] **Step 5: Run all frontend tests**

Run: `cd frontend && npx vitest run`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add frontend/src/__tests__/telavox-connect.test.tsx frontend/src/__tests__/dial-button.test.tsx frontend/src/__tests__/live-calls.test.tsx frontend/src/__tests__/recording-player.test.tsx
git commit -m "test: add frontend tests for Telavox components"
```

---

## Task 16: Backend Tests — Full Coverage

**Files:**
- Create: `backend/test/saleflow/workers/telavox_poll_worker_test.exs`
- Create: `backend/test/saleflow/workers/recording_fetch_worker_test.exs`
- Create: `backend/test/saleflow/storage_test.exs`

- [ ] **Step 1: Write poll worker test**

```elixir
# backend/test/saleflow/workers/telavox_poll_worker_test.exs
defmodule Saleflow.Workers.TelavoxPollWorkerTest do
  use ExUnit.Case, async: true

  alias Saleflow.Workers.TelavoxPollWorker

  test "module is defined" do
    assert Code.ensure_loaded?(TelavoxPollWorker)
  end

  test "perform returns :ok when no token configured" do
    original = Application.get_env(:saleflow, :telavox_api_token)
    Application.put_env(:saleflow, :telavox_api_token, "")
    assert :ok = TelavoxPollWorker.perform(%Oban.Job{args: %{}})
    Application.put_env(:saleflow, :telavox_api_token, original)
  end
end
```

- [ ] **Step 2: Write storage test**

```elixir
# backend/test/saleflow/storage_test.exs
defmodule Saleflow.StorageTest do
  use ExUnit.Case, async: true

  alias Saleflow.Storage

  test "upload returns {:ok, :noop} when disabled" do
    assert {:ok, :noop} = Storage.upload("test/key.mp3", <<>>, "audio/mpeg")
  end

  test "presigned_url returns fake url when disabled" do
    assert {:ok, url} = Storage.presigned_url("test/key.mp3")
    assert url =~ "test/key.mp3"
  end
end
```

- [ ] **Step 3: Run all backend tests**

Run: `cd backend && mix test`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add backend/test/saleflow/workers/telavox_poll_worker_test.exs backend/test/saleflow/storage_test.exs
git commit -m "test: add backend tests for poll worker and storage"
```

---

## Task 17: Final Verification

- [ ] **Step 1: Run all backend tests**

Run: `cd backend && mix test`
Expected: All tests pass, 0 failures

- [ ] **Step 2: Run all frontend tests**

Run: `cd frontend && npx vitest run`
Expected: All tests pass

- [ ] **Step 3: Compile check**

Run: `cd backend && mix compile --warnings-as-errors`
Expected: Clean compilation

- [ ] **Step 4: Verify dev server starts**

Run: `cd backend && mix phx.server` (background)
Run: `cd frontend && npm run dev` (background)
Expected: Both start without errors

- [ ] **Step 5: Final commit (if any remaining changes)**

```bash
git add -A
git commit -m "chore: final cleanup for Telavox integration"
```
