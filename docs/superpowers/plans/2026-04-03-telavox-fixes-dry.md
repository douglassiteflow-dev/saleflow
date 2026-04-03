# Telavox Integration Fixes & DRY Cleanup

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all Telavox API integration bugs, eliminate DRY violations in stats/user-lookup, and add missing test coverage.

**Architecture:** Extract shared logic into `Stats` (all metrics) and `Telavox.UserLookup` (user-by-extension matching). Make all controllers use these modules. Fix webhook_controller to set direction. Fix RecordingFetchWorker's duplicated code and blind call matching. Fix leaderboard net_meetings formula. Remove broken unique constraint on nullable phone_number.

**Tech Stack:** Elixir/Phoenix, Ash Framework, AshPostgres, Oban, React/TanStack Query

---

### Task 1: Extract `Telavox.UserLookup` — single source of truth for user matching

**Files:**
- Create: `backend/lib/saleflow/telavox/user_lookup.ex`
- Create: `backend/test/saleflow/telavox/user_lookup_test.exs`
- Modify: `backend/lib/saleflow/workers/telavox_poll_worker.ex:149-190`
- Modify: `backend/lib/saleflow_web/controllers/webhook_controller.ex:57-77`

- [ ] **Step 1: Write failing tests for UserLookup**

```elixir
# backend/test/saleflow/telavox/user_lookup_test.exs
defmodule Saleflow.Telavox.UserLookupTest do
  use Saleflow.DataCase

  alias Saleflow.Telavox.UserLookup
  alias Saleflow.Accounts

  @user_params %{
    email: "lookup@example.com",
    name: "Lookup Agent",
    password: "password123",
    password_confirmation: "password123"
  }

  describe "build_user_map/0" do
    test "returns empty map when no users have extension or phone" do
      assert UserLookup.build_user_map() == %{}
    end

    test "maps extension_number to user_id" do
      {:ok, user} = Accounts.register(@user_params)
      {:ok, _} = user |> Ash.Changeset.for_update(:update_user, %{extension_number: "0101892392"}) |> Ash.update()

      map = UserLookup.build_user_map()
      assert Map.get(map, "0101892392") == user.id
    end

    test "maps phone_number to user_id" do
      {:ok, user} = Accounts.register(@user_params)
      {:ok, _} = user |> Ash.Changeset.for_update(:update_user, %{phone_number: "+46701234567"}) |> Ash.update()

      map = UserLookup.build_user_map()
      assert Map.get(map, "+46701234567") == user.id
    end

    test "maps both extension and phone for same user" do
      {:ok, user} = Accounts.register(@user_params)
      {:ok, _} = user |> Ash.Changeset.for_update(:update_user, %{extension_number: "0101", phone_number: "+467"}) |> Ash.update()

      map = UserLookup.build_user_map()
      assert Map.get(map, "0101") == user.id
      assert Map.get(map, "+467") == user.id
    end
  end

  describe "find_user_id/1" do
    test "returns nil for empty string" do
      assert UserLookup.find_user_id("") == nil
    end

    test "returns nil for nil" do
      assert UserLookup.find_user_id(nil) == nil
    end

    test "finds user by extension_number" do
      {:ok, user} = Accounts.register(@user_params)
      {:ok, _} = user |> Ash.Changeset.for_update(:update_user, %{extension_number: "0101892392"}) |> Ash.update()

      assert UserLookup.find_user_id("0101892392") == user.id
    end

    test "finds user by phone_number" do
      {:ok, user} = Accounts.register(@user_params)
      {:ok, _} = user |> Ash.Changeset.for_update(:update_user, %{phone_number: "+46701234567"}) |> Ash.update()

      assert UserLookup.find_user_id("+46701234567") == user.id
    end

    test "returns nil when no match" do
      assert UserLookup.find_user_id("+46709999999") == nil
    end
  end
end
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && mix test test/saleflow/telavox/user_lookup_test.exs`
Expected: compilation error — module `Saleflow.Telavox.UserLookup` not found

- [ ] **Step 3: Implement UserLookup module**

```elixir
# backend/lib/saleflow/telavox/user_lookup.ex
defmodule Saleflow.Telavox.UserLookup do
  @moduledoc """
  Single source of truth for mapping Telavox extensions/phone numbers to user IDs.

  Used by TelavoxPollWorker (batch lookup) and WebhookController (single lookup).
  """

  alias Saleflow.Repo
  alias Saleflow.Sales

  @doc "Returns a map of extension/phone → user_id for all users with extension or phone set."
  def build_user_map do
    case Repo.query(
           "SELECT id, extension_number, phone_number FROM users WHERE extension_number IS NOT NULL OR phone_number IS NOT NULL"
         ) do
      {:ok, %{rows: rows}} ->
        Enum.reduce(rows, %{}, fn [id, ext, phone], acc ->
          user_id = Sales.decode_uuid(id)
          acc
          |> then(fn a -> if ext, do: Map.put(a, ext, user_id), else: a end)
          |> then(fn a -> if phone, do: Map.put(a, phone, user_id), else: a end)
        end)

      _ ->
        %{}
    end
  end

  @doc "Finds a user_id by extension_number or phone_number. Single-query version."
  def find_user_id(number) when is_binary(number) and number != "" do
    query = "SELECT id FROM users WHERE extension_number = $1 OR phone_number = $1 LIMIT 1"

    case Repo.query(query, [number]) do
      {:ok, %{rows: [[id]]}} -> Sales.decode_uuid(id)
      _ -> nil
    end
  end

  def find_user_id(_), do: nil
end
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && mix test test/saleflow/telavox/user_lookup_test.exs`
Expected: all pass

- [ ] **Step 5: Wire up TelavoxPollWorker to use UserLookup**

In `backend/lib/saleflow/workers/telavox_poll_worker.ex`, replace `build_user_map/0` (lines 174-190) and update `extract_live_calls/1` (line 150):

Replace the `build_user_map` function definition with a delegation:

```elixir
  @doc false
  def build_user_map, do: Saleflow.Telavox.UserLookup.build_user_map()
```

Delete the old implementation (lines 175-190).

- [ ] **Step 6: Wire up WebhookController to use UserLookup**

In `backend/lib/saleflow_web/controllers/webhook_controller.ex`, replace `find_user_id/1` (lines 68-77):

```elixir
  defp find_user_id(caller), do: Saleflow.Telavox.UserLookup.find_user_id(caller)
```

Delete the old implementation.

- [ ] **Step 7: Run full test suite**

Run: `cd backend && mix test`
Expected: all 648+ tests pass

- [ ] **Step 8: Commit**

```bash
git add backend/lib/saleflow/telavox/user_lookup.ex backend/test/saleflow/telavox/user_lookup_test.exs backend/lib/saleflow/workers/telavox_poll_worker.ex backend/lib/saleflow_web/controllers/webhook_controller.ex
git commit -m "refactor: extract Telavox.UserLookup — DRY user matching"
```

---

### Task 2: Fix webhook_controller — missing `direction` field

**Files:**
- Modify: `backend/lib/saleflow_web/controllers/webhook_controller.ex:13-30`
- Modify: `backend/test/saleflow_web/controllers/webhook_controller_test.exs`

- [ ] **Step 1: Write failing test**

Add to `backend/test/saleflow_web/controllers/webhook_controller_test.exs` inside the `"POST /api/webhooks/telavox/hangup"` describe block:

```elixir
    test "creates phone call with direction field set", %{conn: conn} do
      conn =
        conn
        |> with_secret()
        |> post("/api/webhooks/telavox/hangup", Map.put(@valid_hangup, "direction", "out"))

      assert json_response(conn, 200) == %{"ok" => true}

      {:ok, %{rows: [[direction]]}} =
        Saleflow.Repo.query("SELECT direction::text FROM phone_calls LIMIT 1")

      assert direction == "outgoing"
    end

    test "defaults direction to outgoing when not provided", %{conn: conn} do
      conn =
        conn
        |> with_secret()
        |> post("/api/webhooks/telavox/hangup", @valid_hangup)

      assert json_response(conn, 200) == %{"ok" => true}

      {:ok, %{rows: [[direction]]}} =
        Saleflow.Repo.query("SELECT direction::text FROM phone_calls LIMIT 1")

      assert direction == "outgoing"
    end
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && mix test test/saleflow_web/controllers/webhook_controller_test.exs`
Expected: FAIL — direction is nil

- [ ] **Step 3: Fix webhook_controller to include direction**

In `backend/lib/saleflow_web/controllers/webhook_controller.ex`, update `telavox_hangup/2`:

Replace lines 17-30:

```elixir
    caller = to_string(Map.get(params, "caller", ""))
    callee = to_string(Map.get(params, "callee", ""))
    duration = parse_duration(Map.get(params, "duration", 0))

    direction =
      case params["direction"] do
        "in" -> :incoming
        "out" -> :outgoing
        _ -> :outgoing
      end

    lead_id = find_lead_id(callee)
    user_id = find_user_id(caller)

    attrs = %{
      caller: caller,
      callee: callee,
      duration: duration,
      lead_id: lead_id,
      user_id: user_id,
      direction: direction
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && mix test test/saleflow_web/controllers/webhook_controller_test.exs`
Expected: all pass

- [ ] **Step 5: Commit**

```bash
git add backend/lib/saleflow_web/controllers/webhook_controller.ex backend/test/saleflow_web/controllers/webhook_controller_test.exs
git commit -m "fix: set direction field on webhook-created phone calls"
```

---

### Task 3: Fix leaderboard net_meetings formula

**Files:**
- Modify: `backend/lib/saleflow/stats.ex:132`
- Create: `backend/test/saleflow/stats_test.exs`

- [ ] **Step 1: Write failing test for leaderboard net_meetings**

```elixir
# backend/test/saleflow/stats_test.exs
defmodule Saleflow.StatsTest do
  use Saleflow.DataCase

  alias Saleflow.Stats
  alias Saleflow.Accounts
  alias Saleflow.Sales

  @agent_params %{
    email: "stats-agent@example.com",
    name: "Stats Agent",
    password: "password123",
    password_confirmation: "password123"
  }

  describe "leaderboard/0" do
    test "net_meetings_today subtracts cancelled from booked" do
      {:ok, agent} = Accounts.register(@agent_params)
      {:ok, lead} = Sales.create_lead(%{företag: "LB AB", telefon: "+46700000050"})

      # Create 2 meetings today (booked)
      {:ok, m1} = Sales.create_meeting(%{
        lead_id: lead.id, user_id: agent.id,
        title: "M1", meeting_date: Date.utc_today(), meeting_time: ~T[10:00:00]
      })
      {:ok, _m2} = Sales.create_meeting(%{
        lead_id: lead.id, user_id: agent.id,
        title: "M2", meeting_date: Date.utc_today(), meeting_time: ~T[11:00:00]
      })

      # Cancel one
      Sales.update_meeting(m1, %{status: :cancelled})

      leaderboard = Stats.leaderboard()
      entry = Enum.find(leaderboard, fn e -> e.user_id == agent.id end)

      assert entry.meetings_booked_today == 1
      assert entry.meetings_cancelled_today == 1
      assert entry.net_meetings_today == 0
    end
  end

  describe "calls_today/1" do
    test "counts only outgoing calls for today" do
      {:ok, agent} = Accounts.register(@agent_params)

      {:ok, _} = Sales.create_phone_call(%{caller: "111", callee: "222", user_id: agent.id, direction: :outgoing})
      {:ok, _} = Sales.create_phone_call(%{caller: "333", callee: "111", user_id: agent.id, direction: :incoming})

      assert Stats.calls_today(agent.id) == 1
    end
  end

  describe "all_calls_today/0" do
    test "counts only outgoing calls for today across all users" do
      {:ok, agent} = Accounts.register(@agent_params)

      {:ok, _} = Sales.create_phone_call(%{caller: "111", callee: "222", user_id: agent.id, direction: :outgoing})
      {:ok, _} = Sales.create_phone_call(%{caller: "333", callee: "111", user_id: agent.id, direction: :incoming})
      {:ok, _} = Sales.create_phone_call(%{caller: "444", callee: "555", direction: :outgoing})

      assert Stats.all_calls_today() == 2
    end
  end

  describe "conversion_rate/2" do
    test "returns 0.0 when no calls" do
      assert Stats.conversion_rate(0, 5) == 0.0
    end

    test "calculates percentage correctly" do
      assert Stats.conversion_rate(10, 3) == 30.0
    end
  end
end
```

- [ ] **Step 2: Run test to verify net_meetings test fails**

Run: `cd backend && mix test test/saleflow/stats_test.exs`
Expected: net_meetings_today assertion fails (shows 1 instead of 0)

- [ ] **Step 3: Fix leaderboard query in stats.ex**

In `backend/lib/saleflow/stats.ex`, change line 132:

Old:
```sql
COALESCE(m.booked, 0) as net_meetings_today
```

New:
```sql
(COALESCE(m.booked, 0) - COALESCE(m.cancelled, 0)) as net_meetings_today
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && mix test test/saleflow/stats_test.exs`
Expected: all pass

- [ ] **Step 5: Commit**

```bash
git add backend/lib/saleflow/stats.ex backend/test/saleflow/stats_test.exs
git commit -m "fix: leaderboard net_meetings now subtracts cancelled meetings"
```

---

### Task 4: Make AdminController use Stats module (kill DRY violation)

**Files:**
- Modify: `backend/lib/saleflow_web/controllers/admin_controller.ex:146-215`
- Modify: `backend/test/saleflow_web/controllers/admin_controller_test.exs`

- [ ] **Step 1: Write test that exposes the wrong table**

Add to `backend/test/saleflow_web/controllers/admin_controller_test.exs`:

```elixir
  describe "GET /api/admin/my-stats" do
    test "counts phone_calls (not call_logs) for agent stats", %{conn: conn} do
      {conn, agent} = register_and_log_in_user(conn)

      # Create a real phone call (phone_calls table)
      {:ok, _} = Saleflow.Sales.create_phone_call(%{
        caller: "+46701111111", callee: "+46801111111",
        user_id: agent.id, duration: 30, direction: :outgoing
      })

      conn = get(conn, "/api/admin/my-stats")
      stats = json_response(conn, 200)["stats"]

      assert stats["calls_today"] == 1
      assert stats["total_calls"] == 1
    end
  end
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && mix test test/saleflow_web/controllers/admin_controller_test.exs --only describe:"GET /api/admin/my-stats"`
Expected: FAIL — returns 0 because AdminController queries call_logs, not phone_calls

- [ ] **Step 3: Replace compute_my_stats with Stats module calls**

In `backend/lib/saleflow_web/controllers/admin_controller.ex`, replace `compute_my_stats/1` (lines 155-215) with:

```elixir
  def compute_my_stats(user) do
    alias Saleflow.Stats

    {ct, tc, mt, tm} =
      case user.role do
        :admin ->
          {Stats.all_calls_today(), Stats.all_total_calls(),
           Stats.all_meetings_booked_today(), Stats.all_total_meetings()}

        _ ->
          {Stats.calls_today(user.id), Stats.total_calls(user.id),
           Stats.meetings_booked_today(user.id), Stats.total_meetings(user.id)}
      end

    %{calls_today: ct, total_calls: tc, meetings_today: mt, total_meetings: tm}
  end
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && mix test test/saleflow_web/controllers/admin_controller_test.exs`
Expected: all pass

- [ ] **Step 5: Run full suite**

Run: `cd backend && mix test`
Expected: all pass

- [ ] **Step 6: Commit**

```bash
git add backend/lib/saleflow_web/controllers/admin_controller.ex backend/test/saleflow_web/controllers/admin_controller_test.exs
git commit -m "fix: AdminController uses Stats module instead of querying call_logs"
```

---

### Task 5: Deduplicate lead stats (DashboardController + AdminController)

**Files:**
- Modify: `backend/lib/saleflow/stats.ex`
- Modify: `backend/lib/saleflow_web/controllers/dashboard_controller.ex:126-154`
- Modify: `backend/lib/saleflow_web/controllers/admin_controller.ex:106-137`

- [ ] **Step 1: Add test for Stats.lead_stats/0**

Add to `backend/test/saleflow/stats_test.exs`:

```elixir
  describe "lead_stats/0" do
    test "returns lead counts grouped by status" do
      {:ok, _} = Sales.create_lead(%{företag: "A", telefon: "+46700000060"})
      {:ok, _} = Sales.create_lead(%{företag: "B", telefon: "+46700000061"})

      stats = Stats.lead_stats()
      assert stats["total_leads"] == 2
      assert stats["new"] == 2
    end
  end
```

- [ ] **Step 2: Run test — fails because lead_stats/0 doesn't exist**

Run: `cd backend && mix test test/saleflow/stats_test.exs --only describe:"lead_stats/0"`
Expected: compilation error

- [ ] **Step 3: Extract lead_stats into Stats module**

Add to `backend/lib/saleflow/stats.ex` before the `# Computed metrics` section:

```elixir
  # ---------------------------------------------------------------------------
  # Lead stats
  # ---------------------------------------------------------------------------

  @doc "Lead counts grouped by status."
  def lead_stats do
    {:ok, %{rows: rows}} =
      Repo.query("SELECT status, COUNT(*) as count FROM leads GROUP BY status ORDER BY status")

    by_status = Enum.into(rows, %{}, fn [status, count] -> {status, count} end)
    total = Enum.reduce(rows, 0, fn [_status, count], acc -> acc + count end)

    %{
      "total_leads" => total,
      "new" => 0, "assigned" => 0, "callback" => 0,
      "meeting_booked" => 0, "quarantine" => 0,
      "bad_number" => 0, "customer" => 0
    }
    |> Map.merge(by_status)
  end
```

- [ ] **Step 4: Update DashboardController to use Stats.lead_stats/0**

In `backend/lib/saleflow_web/controllers/dashboard_controller.ex`, replace `compute_lead_stats/0` (lines 126-154):

```elixir
  defp compute_lead_stats, do: Stats.lead_stats()
```

- [ ] **Step 5: Update AdminController to use Stats.lead_stats/0**

In `backend/lib/saleflow_web/controllers/admin_controller.ex`, replace the `stats/2` function (lines 106-137):

```elixir
  def stats(conn, _params) do
    json(conn, %{stats: Saleflow.Stats.lead_stats()})
  end
```

- [ ] **Step 6: Run full suite**

Run: `cd backend && mix test`
Expected: all pass

- [ ] **Step 7: Commit**

```bash
git add backend/lib/saleflow/stats.ex backend/lib/saleflow_web/controllers/dashboard_controller.ex backend/lib/saleflow_web/controllers/admin_controller.ex backend/test/saleflow/stats_test.exs
git commit -m "refactor: extract Stats.lead_stats — remove duplicate lead count queries"
```

---

### Task 6: Deduplicate find_lead_id (TelavoxPollWorker + RecordingFetchWorker + WebhookController)

**Files:**
- Modify: `backend/lib/saleflow/telavox/user_lookup.ex` (add find_lead_id here)
- Modify: `backend/lib/saleflow/workers/telavox_poll_worker.ex:125-134`
- Modify: `backend/lib/saleflow/workers/recording_fetch_worker.ex:102-112`
- Modify: `backend/lib/saleflow_web/controllers/webhook_controller.ex:57-66`

- [ ] **Step 1: Add tests for find_lead_id to UserLookup test**

Add to `backend/test/saleflow/telavox/user_lookup_test.exs`:

```elixir
  describe "find_lead_id/1" do
    test "returns nil for empty string" do
      assert UserLookup.find_lead_id("") == nil
    end

    test "returns nil for nil" do
      assert UserLookup.find_lead_id(nil) == nil
    end

    test "finds lead by exact phone match" do
      {:ok, lead} = Sales.create_lead(%{företag: "Match AB", telefon: "+46812345678"})
      assert UserLookup.find_lead_id("+46812345678") == lead.id
    end

    test "finds lead by suffix match" do
      {:ok, lead} = Sales.create_lead(%{företag: "Suffix AB", telefon: "+46812345678"})
      assert UserLookup.find_lead_id("812345678") == lead.id
    end

    test "returns nil when no match" do
      assert UserLookup.find_lead_id("+46709999999") == nil
    end
  end
```

Add `alias Saleflow.Sales` to the test module if not already present.

- [ ] **Step 2: Run tests — fails**

Run: `cd backend && mix test test/saleflow/telavox/user_lookup_test.exs`
Expected: FAIL — find_lead_id/1 doesn't exist on UserLookup

- [ ] **Step 3: Add find_lead_id to UserLookup**

Add to `backend/lib/saleflow/telavox/user_lookup.ex`:

```elixir
  @doc "Finds a lead_id by phone number (exact or suffix match)."
  def find_lead_id(number) when is_binary(number) and number != "" do
    query = "SELECT id FROM leads WHERE telefon = $1 OR telefon LIKE $2 LIMIT 1"
    like = "%" <> number

    case Repo.query(query, [number, like]) do
      {:ok, %{rows: [[id]]}} -> Sales.decode_uuid(id)
      _ -> nil
    end
  end

  def find_lead_id(_), do: nil
```

- [ ] **Step 4: Run tests — pass**

Run: `cd backend && mix test test/saleflow/telavox/user_lookup_test.exs`
Expected: all pass

- [ ] **Step 5: Replace all find_lead_id duplicates**

In `backend/lib/saleflow/workers/telavox_poll_worker.ex`, delete the `find_lead_id/1` functions (lines 125-134) — they're already unused (compiler warning confirmed this).

In `backend/lib/saleflow/workers/recording_fetch_worker.ex`, replace lines 102-112:

```elixir
  defp find_lead_id(number), do: Saleflow.Telavox.UserLookup.find_lead_id(number)
```

In `backend/lib/saleflow_web/controllers/webhook_controller.ex`, replace `find_lead_id/1`:

```elixir
  defp find_lead_id(callee), do: Saleflow.Telavox.UserLookup.find_lead_id(callee)
```

- [ ] **Step 6: Run full suite**

Run: `cd backend && mix test`
Expected: all pass, and the compiler warning about unused find_lead_id in poll_worker is gone

- [ ] **Step 7: Commit**

```bash
git add backend/lib/saleflow/telavox/user_lookup.ex backend/test/saleflow/telavox/user_lookup_test.exs backend/lib/saleflow/workers/telavox_poll_worker.ex backend/lib/saleflow/workers/recording_fetch_worker.ex backend/lib/saleflow_web/controllers/webhook_controller.ex
git commit -m "refactor: extract find_lead_id into Telavox.UserLookup — DRY"
```

---

### Task 7: Fix RecordingFetchWorker — deduplicate code branches

**Files:**
- Modify: `backend/lib/saleflow/workers/recording_fetch_worker.ex:26-99`
- Modify: `backend/test/saleflow/workers/recording_fetch_worker_test.exs`

- [ ] **Step 1: Write test for the "missed" key variant**

Add to `backend/test/saleflow/workers/recording_fetch_worker_test.exs`:

```elixir
  describe "perform/1 with all three call types" do
    test "handles response with outgoing, incoming, and missed keys" do
      phone_call = create_phone_call()
      user_id = Ecto.UUID.generate()

      MockClient
      |> expect(:get_as, fn _token, "/calls?withRecordings=true" ->
        {:ok,
         %{
           "outgoing" => [%{"number" => "+46899999999", "duration" => 15}],
           "incoming" => [],
           "missed" => []
         }}
      end)

      job = build_job(phone_call.id, user_id)
      assert :ok = RecordingFetchWorker.perform(job)

      {:ok, %{rows: [[callee, duration]]}} =
        Saleflow.Repo.query(
          "SELECT callee, duration FROM phone_calls WHERE id = $1",
          [Ecto.UUID.dump!(phone_call.id)]
        )

      assert callee == "+46899999999"
      assert duration == 15
    end
  end
```

- [ ] **Step 2: Run test — passes (confirming existing behavior works)**

Run: `cd backend && mix test test/saleflow/workers/recording_fetch_worker_test.exs`
Expected: all pass

- [ ] **Step 3: Refactor enrich_phone_call to remove duplicated branches**

Replace the entire `enrich_phone_call/3` function in `backend/lib/saleflow/workers/recording_fetch_worker.ex` (lines 26-99):

```elixir
  defp enrich_phone_call(phone_call_id, token, attempt) do
    case client().get_as(token, "/calls?withRecordings=true") do
      {:ok, response} when is_map(response) ->
        outgoing = response["outgoing"] || []
        most_recent = List.first(outgoing)

        if most_recent do
          enrich_from_call(phone_call_id, most_recent)
        else
          if attempt < 3 do
            Logger.info("RecordingFetchWorker: no calls yet for #{phone_call_id}, will retry")
            {:error, "No calls yet"}
          else
            Logger.info("RecordingFetchWorker: no calls for #{phone_call_id} after #{attempt} attempts")
            :ok
          end
        end

      {:error, reason} ->
        Logger.warning("RecordingFetchWorker: API error: #{inspect(reason)}")
        {:error, "API error"}
    end
  end

  defp enrich_from_call(phone_call_id, call_data) do
    number = call_data["number"] || ""
    duration = call_data["duration"] || 0
    recording_id = call_data["recordingId"]

    Logger.info("RecordingFetchWorker: #{phone_call_id} → number=#{number}, duration=#{duration}s, recording=#{recording_id || "none"}")

    lead_id = find_lead_id(number)

    Saleflow.Repo.query(
      "UPDATE phone_calls SET callee = $1, duration = $2, lead_id = $3 WHERE id = $4",
      [number, duration, lead_id && Ecto.UUID.dump!(lead_id), Ecto.UUID.dump!(phone_call_id)]
    )

    Phoenix.PubSub.broadcast(
      Saleflow.PubSub,
      "dashboard:updates",
      {:dashboard_update, %{event: "call_enriched", phone_call_id: phone_call_id}}
    )

    case recording_id do
      nil -> :ok
      id -> download_and_store(phone_call_id, id)
    end
  end
```

- [ ] **Step 4: Run all RecordingFetchWorker tests**

Run: `cd backend && mix test test/saleflow/workers/recording_fetch_worker_test.exs`
Expected: all pass

- [ ] **Step 5: Commit**

```bash
git add backend/lib/saleflow/workers/recording_fetch_worker.ex backend/test/saleflow/workers/recording_fetch_worker_test.exs
git commit -m "refactor: deduplicate RecordingFetchWorker enrich_phone_call branches"
```

---

### Task 8: Fix TelavoxController status — repair missing extension_number

**Files:**
- Modify: `backend/lib/saleflow_web/controllers/telavox_controller.ex:44-64`
- Modify: `backend/test/saleflow_web/controllers/telavox_controller_test.exs`

- [ ] **Step 1: Write failing test**

Add to `backend/test/saleflow_web/controllers/telavox_controller_test.exs` in the status describe block:

```elixir
    test "repairs missing extension_number when API responds", %{conn: conn} do
      {conn, user} = authenticated_conn(conn)
      _user = set_telavox_token(user, "valid-token")

      MockClient
      |> expect(:get_as, fn "valid-token", "/extensions/me" ->
        {:ok, %{"extension" => "9999", "name" => "Agent Name"}}
      end)

      get(conn, "/api/telavox/status")

      # Verify extension_number was saved
      {:ok, %{rows: [[ext]]}} =
        Saleflow.Repo.query("SELECT extension_number FROM users WHERE id = $1", [Ecto.UUID.dump!(user.id)])

      assert ext == "9999"
    end
```

- [ ] **Step 2: Run test — fails**

Run: `cd backend && mix test test/saleflow_web/controllers/telavox_controller_test.exs`
Expected: FAIL — extension_number is nil

- [ ] **Step 3: Fix status endpoint to repair extension_number**

In `backend/lib/saleflow_web/controllers/telavox_controller.ex`, update the success branch in the `status/2` function:

```elixir
      {:ok, %{"extension" => ext, "name" => name}} ->
        if user.extension_number != ext do
          Ash.update(user, %{extension_number: ext}, action: :update_user)
        end

        json(conn, %{connected: true, extension: ext, name: name})
```

- [ ] **Step 4: Run tests**

Run: `cd backend && mix test test/saleflow_web/controllers/telavox_controller_test.exs`
Expected: all pass

- [ ] **Step 5: Commit**

```bash
git add backend/lib/saleflow_web/controllers/telavox_controller.ex backend/test/saleflow_web/controllers/telavox_controller_test.exs
git commit -m "fix: status endpoint repairs missing extension_number from Telavox"
```

---

### Task 9: Fix broken unique constraint on nullable phone_number

**Files:**
- Create: `backend/priv/repo/migrations/<timestamp>_fix_nullable_unique_constraints.exs`
- Modify: `backend/lib/saleflow/accounts/user.ex:65`

- [ ] **Step 1: Write test that exposes the bug**

Add to `backend/test/saleflow/accounts/user_test.exs`:

```elixir
  describe "nullable unique constraints" do
    test "multiple users can have nil phone_number" do
      {:ok, _} = Accounts.register(%{email: "a@test.com", name: "A", password: "password123", password_confirmation: "password123"})
      {:ok, _} = Accounts.register(%{email: "b@test.com", name: "B", password: "password123", password_confirmation: "password123"})

      # Both have nil phone_number — this should not violate uniqueness
      {:ok, users} = Accounts.list_users()
      nil_phone_users = Enum.filter(users, fn u -> u.phone_number == nil end)
      assert length(nil_phone_users) >= 2
    end
  end
```

- [ ] **Step 2: Run test — may or may not fail depending on Ash/PG handling**

Run: `cd backend && mix test test/saleflow/accounts/user_test.exs --only describe:"nullable unique constraints"`

Note: PostgreSQL actually allows multiple NULLs in unique indexes by default. The Ash identity might handle this at the application level. If the test passes, the constraint isn't broken in PG — but we should still use a partial unique index to be explicit.

- [ ] **Step 3: Create migration with partial unique indexes**

```bash
cd backend && mix ecto.gen.migration fix_nullable_unique_constraints
```

```elixir
defmodule Saleflow.Repo.Migrations.FixNullableUniqueConstraints do
  use Ecto.Migration

  def change do
    # Drop existing indexes that don't handle NULLs correctly
    drop_if_exists unique_index(:users, [:phone_number])
    drop_if_exists unique_index(:users, [:extension_number])

    # Create partial unique indexes (only enforce uniqueness for non-NULL values)
    create unique_index(:users, [:phone_number], where: "phone_number IS NOT NULL", name: :users_phone_number_unique)
    create unique_index(:users, [:extension_number], where: "extension_number IS NOT NULL", name: :users_extension_number_unique)
  end
end
```

- [ ] **Step 4: Run migration**

Run: `cd backend && mix ecto.migrate`

- [ ] **Step 5: Run full suite**

Run: `cd backend && mix test`
Expected: all pass

- [ ] **Step 6: Commit**

```bash
git add backend/priv/repo/migrations/*fix_nullable_unique_constraints* backend/test/saleflow/accounts/user_test.exs
git commit -m "fix: use partial unique indexes for nullable phone/extension fields"
```

---

### Task 10: Remove unused `count_phone_calls_today` from Sales module

**Files:**
- Modify: `backend/lib/saleflow/sales/sales.ex:767-780`

- [ ] **Step 1: Verify it's unused**

Run: `cd backend && grep -r "count_phone_calls_today" --include="*.ex" --include="*.exs" lib/`
Expected: only the definition in sales.ex

- [ ] **Step 2: Remove the function**

Delete lines 764-780 from `backend/lib/saleflow/sales/sales.ex` (the `count_phone_calls_today/1` function and its doc).

- [ ] **Step 3: Remove any test referencing it**

Check `backend/test/saleflow/sales/phone_call_test.exs` for tests calling `count_phone_calls_today` and remove them.

- [ ] **Step 4: Run full suite**

Run: `cd backend && mix test`
Expected: all pass

- [ ] **Step 5: Commit**

```bash
git add backend/lib/saleflow/sales/sales.ex backend/test/saleflow/sales/phone_call_test.exs
git commit -m "chore: remove unused count_phone_calls_today from Sales"
```

---

### Task 11: Deploy and verify

- [ ] **Step 1: Run full test suite one last time**

Run: `cd backend && mix test`
Expected: all pass

- [ ] **Step 2: Deploy to staging**

Run: `fly deploy --app saleflow-staging`
Expected: healthy deployment

- [ ] **Step 3: Verify stats on staging**

```bash
fly ssh console --app saleflow-staging -C "/app/bin/saleflow rpc 'IO.inspect(Saleflow.Stats.all_calls_today())'"
```

- [ ] **Step 4: Deploy to production**

Run: `fly deploy --app saleflow-app`
Expected: healthy deployment

- [ ] **Step 5: Verify stats on production**

```bash
fly ssh console --app saleflow-app -C "/app/bin/saleflow rpc 'IO.inspect(Saleflow.Stats.leaderboard())'"
```

Verify net_meetings_today shows correct values.

- [ ] **Step 6: Final commit tag**

```bash
git tag v0.9.0-telavox-fixes
```
