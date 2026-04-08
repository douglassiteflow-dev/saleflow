# AI Sales Coach — Sub-projekt 3: Intelligence Features

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a searchable call library with full-text search, keyword/topic tracking for competitors and objections, and AI-driven deal health scores.

**Architecture:** PostgreSQL tsvector (already indexed in Sub-projekt 1) powers full-text search. A new `call_topics` table stores extracted keywords from transcriptions. `DealHealthWorker` runs daily at 16:15 (after coaching reports) and calculates health scores per DemoConfig based on call sentiment, scorecard trends, and activity. Frontend gets a new `/call-library` page and deal health indicators.

**Tech Stack:** PostgreSQL tsvector + GIN index, Elixir/Phoenix/Oban, React/TypeScript

**Spec:** `docs/superpowers/specs/2026-04-07-ai-sales-coach-design.md` (Sub-projekt 3)

---

## File Structure

### Backend — New files
| File | Responsibility |
|------|---------------|
| `lib/saleflow_web/controllers/call_search_controller.ex` | Search endpoint for call library |
| `lib/saleflow/workers/deal_health_worker.ex` | Oban cron: calculates deal health scores |
| `priv/repo/migrations/*_create_call_topics.exs` | call_topics table |
| `priv/repo/migrations/*_add_health_score_to_demo_configs.exs` | health_score column |
| `test/saleflow_web/controllers/call_search_controller_test.exs` | Search endpoint tests |
| `test/saleflow/workers/deal_health_worker_test.exs` | Health worker tests |

### Backend — Modified files
| File | Change |
|------|--------|
| `lib/saleflow_web/router.ex` | Add search + health routes |
| `lib/saleflow/workers/transcription_worker.ex` | Extract call_topics after transcription |
| `config/config.exs` | Add DealHealthWorker to Oban cron |

### Frontend — New files
| File | Responsibility |
|------|---------------|
| `src/pages/call-library.tsx` | Searchable call library page |
| `src/api/call-search.ts` | React Query hooks for search |
| `src/pages/__tests__/call-library.test.tsx` | Call library tests |

### Frontend — Modified files
| File | Change |
|------|--------|
| `src/components/dialer/demo-tab.tsx` | Show health score indicator |
| `src/api/types.ts` | Add CallTopic, CallSearchResult types |

---

## Task 1: Migration — call_topics + health_score

**Files:**
- Create: `backend/priv/repo/migrations/*_create_call_topics.exs`
- Create: `backend/priv/repo/migrations/*_add_health_score.exs`

- [ ] **Step 1: Create call_topics migration**

```elixir
defmodule Saleflow.Repo.Migrations.CreateCallTopics do
  use Ecto.Migration

  def change do
    create table(:call_topics, primary_key: false) do
      add :id, :uuid, primary_key: true, default: fragment("gen_random_uuid()")
      add :phone_call_id, references(:phone_calls, type: :uuid, on_delete: :delete_all), null: false
      add :topic_type, :string, null: false
      add :keyword, :string, null: false
      add :context, :text
      add :timestamp_seconds, :integer
      add :sentiment, :string
      timestamps(type: :utc_datetime)
    end

    create index(:call_topics, [:phone_call_id])
    create index(:call_topics, [:topic_type])
    create index(:call_topics, [:keyword])
  end
end
```

- [ ] **Step 2: Create health_score migration**

```elixir
defmodule Saleflow.Repo.Migrations.AddHealthScore do
  use Ecto.Migration

  def change do
    alter table(:demo_configs) do
      add :health_score, :integer
    end
  end
end
```

- [ ] **Step 3: Run migrations and commit**

```bash
cd backend && mix ecto.migrate
git add priv/repo/migrations/ && git commit -m "feat: add call_topics table and health_score column"
```

---

## Task 2: Call Search Endpoint

**Files:**
- Create: `backend/lib/saleflow_web/controllers/call_search_controller.ex`
- Create: `backend/test/saleflow_web/controllers/call_search_controller_test.exs`
- Modify: `backend/lib/saleflow_web/router.ex`

- [ ] **Step 1: Write tests**

```elixir
defmodule SaleflowWeb.CallSearchControllerTest do
  use SaleflowWeb.ConnCase, async: false

  setup %{conn: conn} do
    # Create user, lead, phone_call with transcription
    # ...
    {:ok, conn: conn, user: user, phone_call: phone_call}
  end

  describe "GET /api/calls/search" do
    test "searches transcriptions by keyword", %{conn: conn} do
      conn = get(conn, "/api/calls/search?q=pris")
      assert %{"results" => results} = json_response(conn, 200)
      assert is_list(results)
    end

    test "returns highlighted snippets", %{conn: conn} do
      conn = get(conn, "/api/calls/search?q=pris")
      %{"results" => [result | _]} = json_response(conn, 200)
      assert Map.has_key?(result, "snippet")
    end

    test "filters by agent", %{conn: conn, user: user} do
      conn = get(conn, "/api/calls/search?q=pris&agent=#{user.id}")
      assert %{"results" => _} = json_response(conn, 200)
    end

    test "filters by date range", %{conn: conn} do
      conn = get(conn, "/api/calls/search?q=pris&from=2026-04-01&to=2026-04-08")
      assert %{"results" => _} = json_response(conn, 200)
    end

    test "filters by outcome", %{conn: conn} do
      conn = get(conn, "/api/calls/search?q=pris&outcome=meeting_booked")
      assert %{"results" => _} = json_response(conn, 200)
    end

    test "filters by minimum score", %{conn: conn} do
      conn = get(conn, "/api/calls/search?q=pris&min_score=7")
      assert %{"results" => _} = json_response(conn, 200)
    end

    test "returns empty for no matches", %{conn: conn} do
      conn = get(conn, "/api/calls/search?q=xyznonexistent")
      assert %{"results" => []} = json_response(conn, 200)
    end

    test "returns 400 without query param", %{conn: conn} do
      conn = get(conn, "/api/calls/search")
      assert json_response(conn, 400)
    end
  end
end
```

- [ ] **Step 2: Implement controller**

```elixir
defmodule SaleflowWeb.CallSearchController do
  use SaleflowWeb, :controller

  def search(conn, %{"q" => query} = params) when byte_size(query) > 0 do
    user = conn.assigns.current_user
    {filters, query_params} = build_filters(params, user)

    sql = """
      SELECT pc.id, pc.received_at, pc.duration, pc.scorecard_avg, pc.sentiment,
             pc.call_summary, cl.outcome::text, u.name as agent_name,
             ts_headline('swedish', COALESCE(pc.transcription, ''), plainto_tsquery('swedish', $1),
               'StartSel=<mark>, StopSel=</mark>, MaxFragments=2, MaxWords=30') as snippet
      FROM phone_calls pc
      LEFT JOIN call_logs cl ON cl.id = pc.call_log_id
      LEFT JOIN users u ON u.id = pc.user_id
      WHERE pc.transcription IS NOT NULL
        AND to_tsvector('swedish', pc.transcription) @@ plainto_tsquery('swedish', $1)
        #{filters}
      ORDER BY ts_rank(to_tsvector('swedish', pc.transcription), plainto_tsquery('swedish', $1)) DESC
      LIMIT 50
    """

    case Saleflow.Repo.query(sql, [query | query_params]) do
      {:ok, %{rows: rows}} ->
        results = Enum.map(rows, fn [id, at, dur, score, sent, summary, outcome, agent, snippet] ->
          %{
            id: Ecto.UUID.load!(id),
            received_at: at,
            duration: dur,
            scorecard_avg: score,
            sentiment: sent,
            summary: summary,
            outcome: outcome,
            agent_name: agent,
            snippet: snippet
          }
        end)
        json(conn, %{results: results})

      {:error, _} ->
        json(conn, %{results: []})
    end
  end

  def search(conn, _params) do
    conn |> put_status(400) |> json(%{error: "Sökord krävs (q-parameter)"})
  end

  defp build_filters(params, user) do
    {filters, values, idx} = {"", [], 2}

    {filters, values, idx} =
      if user.role != :admin do
        {filters <> " AND pc.user_id = $#{idx}", values ++ [Ecto.UUID.dump!(user.id)], idx + 1}
      else
        case params["agent"] do
          nil -> {filters, values, idx}
          agent_id -> {filters <> " AND pc.user_id = $#{idx}", values ++ [Ecto.UUID.dump!(agent_id)], idx + 1}
        end
      end

    {filters, values, idx} =
      case params["from"] do
        nil -> {filters, values, idx}
        from -> {filters <> " AND pc.received_at::date >= $#{idx}::date", values ++ [from], idx + 1}
      end

    {filters, values, idx} =
      case params["to"] do
        nil -> {filters, values, idx}
        to -> {filters <> " AND pc.received_at::date <= $#{idx}::date", values ++ [to], idx + 1}
      end

    {filters, values, idx} =
      case params["outcome"] do
        nil -> {filters, values, idx}
        outcome -> {filters <> " AND cl.outcome::text = $#{idx}", values ++ [outcome], idx + 1}
      end

    {filters, values, _idx} =
      case params["min_score"] do
        nil -> {filters, values, idx}
        score ->
          {score_f, _} = Float.parse(score)
          {filters <> " AND pc.scorecard_avg >= $#{idx}", values ++ [score_f], idx + 1}
      end

    {filters, values}
  end
end
```

- [ ] **Step 3: Add route**

In router.ex, authenticated scope:
```elixir
get "/calls/search", CallSearchController, :search
```

- [ ] **Step 4: Run tests and commit**

```bash
cd backend && mix test test/saleflow_web/controllers/call_search_controller_test.exs
git commit -am "feat: add call search endpoint with tsvector full-text search"
```

---

## Task 3: Extract call_topics from Transcriptions

**Files:**
- Modify: `backend/lib/saleflow/workers/transcription_worker.ex`
- Create: `backend/test/saleflow/workers/call_topics_test.exs`

- [ ] **Step 1: Add topic extraction after transcription**

In `transcription_worker.ex`, after saving transcription_analysis, extract keywords and save to call_topics:

```elixir
defp save_call_topics(phone_call_id, analysis) do
  keywords = analysis["keywords"] || %{}

  topics =
    (extract_topic_list(keywords["competitors"], :competitor) ++
     extract_topic_list(keywords["buying_signals"], :buying_signal) ++
     extract_topic_list(keywords["red_flags"], :red_flag))
    |> Enum.concat(extract_objections(analysis["objections"]))

  Enum.each(topics, fn topic ->
    Saleflow.Repo.query("""
      INSERT INTO call_topics (id, phone_call_id, topic_type, keyword, context, timestamp_seconds, sentiment, inserted_at, updated_at)
      VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, NOW(), NOW())
    """, [
      Ecto.UUID.dump!(phone_call_id),
      Atom.to_string(topic.type),
      topic.keyword,
      topic.context,
      topic.timestamp,
      topic.sentiment
    ])
  end)
end

defp extract_topic_list(nil, _type), do: []
defp extract_topic_list(items, type) when is_list(items) do
  Enum.map(items, fn item ->
    %{
      type: type,
      keyword: item["keyword"] || item["name"] || item["signal"] || item["flag"] || "",
      context: item["context"] || "",
      timestamp: parse_timestamp(item["timestamp"]),
      sentiment: nil
    }
  end)
end

defp extract_objections(nil), do: []
defp extract_objections(objections) when is_list(objections) do
  Enum.map(objections, fn obj ->
    %{type: :objection, keyword: obj, context: nil, timestamp: nil, sentiment: "negative"}
  end)
end

defp parse_timestamp(nil), do: nil
defp parse_timestamp(ts) when is_integer(ts), do: ts
defp parse_timestamp(ts) when is_binary(ts) do
  case Integer.parse(ts) do
    {n, _} -> n
    :error -> nil
  end
end
```

Call `save_call_topics(phone_call_id, analysis)` after saving transcription in the success branch.

- [ ] **Step 2: Write tests and commit**

---

## Task 4: DealHealthWorker

**Files:**
- Create: `backend/lib/saleflow/workers/deal_health_worker.ex`
- Create: `backend/test/saleflow/workers/deal_health_worker_test.exs`
- Modify: `backend/config/config.exs`

- [ ] **Step 1: Implement worker**

```elixir
defmodule Saleflow.Workers.DealHealthWorker do
  @moduledoc """
  Calculates health scores (1-100) for active DemoConfigs.
  Runs at 16:15 weekdays, after coaching reports.
  """

  use Oban.Worker, queue: :default, max_attempts: 1

  require Logger

  @impl true
  def perform(%Oban.Job{}) do
    configs = list_active_configs()
    Logger.info("DealHealthWorker: scoring #{length(configs)} active configs")

    Enum.each(configs, fn config ->
      score = calculate_health(config)
      save_score(config.id, score)
    end)

    :ok
  end

  def calculate_health(config) do
    signals = [
      stage_freshness(config),
      call_activity(config),
      latest_sentiment(config),
      scorecard_trend(config)
    ]

    scores = Enum.filter(signals, &is_number/1)
    if scores == [], do: 50, else: round(Enum.sum(scores) / length(scores))
  end

  # Stage freshness: how long in current stage (stagnation = bad)
  defp stage_freshness(%{stage: stage, updated_at: updated_at}) do
    days = NaiveDateTime.diff(NaiveDateTime.utc_now(), updated_at, :second) / 86400

    case stage do
      s when s in ["meeting_booked", :meeting_booked] ->
        cond do
          days < 2 -> 90
          days < 5 -> 70
          days < 10 -> 40
          true -> 20
        end
      s when s in ["generating", :generating] ->
        if days < 1, do: 80, else: 30
      s when s in ["demo_ready", :demo_ready] ->
        cond do
          days < 3 -> 85
          days < 7 -> 60
          true -> 30
        end
      s when s in ["followup", :followup] ->
        cond do
          days < 7 -> 80
          days < 14 -> 50
          true -> 20
        end
      _ -> 50
    end
  end

  # Call activity: recent calls = healthy
  defp call_activity(%{id: id, lead_id: lead_id}) do
    case Saleflow.Repo.query("""
      SELECT COUNT(*), MAX(received_at) FROM phone_calls
      WHERE lead_id = $1 AND received_at > NOW() - INTERVAL '14 days'
    """, [Ecto.UUID.dump!(lead_id)]) do
      {:ok, %{rows: [[count, _latest]]}} when count > 0 ->
        min(90, 40 + count * 10)
      _ -> 20
    end
  end

  # Latest call sentiment
  defp latest_sentiment(%{lead_id: lead_id}) do
    case Saleflow.Repo.query("""
      SELECT sentiment FROM phone_calls
      WHERE lead_id = $1 AND sentiment IS NOT NULL
      ORDER BY received_at DESC LIMIT 1
    """, [Ecto.UUID.dump!(lead_id)]) do
      {:ok, %{rows: [["positive"]]}} -> 90
      {:ok, %{rows: [["neutral"]]}} -> 60
      {:ok, %{rows: [["negative"]]}} -> 25
      _ -> 50
    end
  end

  # Scorecard trend: improving = good
  defp scorecard_trend(%{lead_id: lead_id}) do
    case Saleflow.Repo.query("""
      SELECT scorecard_avg FROM phone_calls
      WHERE lead_id = $1 AND scorecard_avg IS NOT NULL
      ORDER BY received_at DESC LIMIT 3
    """, [Ecto.UUID.dump!(lead_id)]) do
      {:ok, %{rows: rows}} when length(rows) >= 2 ->
        scores = Enum.map(rows, fn [s] -> s end)
        recent = hd(scores)
        older = List.last(scores)
        cond do
          recent > older + 1 -> 85
          recent > older -> 70
          recent == older -> 55
          true -> 35
        end
      _ -> 50
    end
  end

  defp list_active_configs do
    case Saleflow.Repo.query("""
      SELECT id, lead_id, stage, updated_at FROM demo_configs
      WHERE stage NOT IN ('cancelled', 'won')
    """) do
      {:ok, %{rows: rows}} ->
        Enum.map(rows, fn [id, lid, stage, updated] ->
          %{id: Ecto.UUID.load!(id), lead_id: Ecto.UUID.load!(lid), stage: stage, updated_at: updated}
        end)
      _ -> []
    end
  end

  defp save_score(config_id, score) do
    Saleflow.Repo.query(
      "UPDATE demo_configs SET health_score = $1 WHERE id = $2",
      [score, Ecto.UUID.dump!(config_id)]
    )
  end
end
```

- [ ] **Step 2: Add to Oban cron**

```elixir
{"15 16 * * 1-5", Saleflow.Workers.DealHealthWorker}
```

- [ ] **Step 3: Write tests and commit**

---

## Task 5: Frontend — Call Library Page

**Files:**
- Create: `frontend/src/pages/call-library.tsx`
- Create: `frontend/src/api/call-search.ts`
- Create: `frontend/src/pages/__tests__/call-library.test.tsx`
- Modify: `frontend/src/api/types.ts`

- [ ] **Step 1: Add types**

```typescript
export interface CallSearchResult {
  id: string;
  received_at: string;
  duration: number;
  scorecard_avg: number | null;
  sentiment: string | null;
  summary: string | null;
  outcome: string | null;
  agent_name: string | null;
  snippet: string;
}
```

- [ ] **Step 2: Create search hook**

```typescript
export function useCallSearch(query: string, filters: Record<string, string>) {
  const params = new URLSearchParams({ q: query, ...filters });
  return useQuery<CallSearchResult[]>({
    queryKey: ["call-search", query, filters],
    queryFn: async () => {
      const data = await api<{ results: CallSearchResult[] }>(`/api/calls/search?${params}`);
      return data.results;
    },
    enabled: query.length >= 2,
    staleTime: 30_000,
  });
}
```

- [ ] **Step 3: Create call library page**

Search input with filters (agent, date range, outcome, min score). Results show: snippet with highlight, metadata (agent, duration, outcome, score), play button linking to recording.

Follow existing page patterns (dashboard.tsx, history.tsx) for layout and styling.

- [ ] **Step 4: Add route in app router**

- [ ] **Step 5: Write tests and commit**

---

## Task 6: Frontend — Deal Health Indicator in Demo Tab

**Files:**
- Modify: `frontend/src/components/dialer/demo-tab.tsx`
- Modify: `frontend/src/api/types.ts`

- [ ] **Step 1: Add health_score to DemoConfig type**

```typescript
// In DemoConfig interface, add:
health_score: number | null;
```

- [ ] **Step 2: Show health indicator in demo-tab**

Add a colored dot next to each demo config in the list:
- Green (>70): `bg-emerald-500`
- Yellow (40-70): `bg-amber-500`  
- Red (<40): `bg-red-500`
- Gray (null): `bg-gray-300`

- [ ] **Step 3: Write tests and commit**

---

## Task 7: Full Test Suite + Coverage

- [ ] **Step 1: Run backend tests with coverage**

```bash
cd backend && mix test --cover --seed 42424 && mix test --seed 77777
```
Verify 100% on new files, 0 failures across seeds.

- [ ] **Step 2: Run frontend tests**

```bash
cd frontend && npx vitest run
```

- [ ] **Step 3: Fix gaps, commit**
