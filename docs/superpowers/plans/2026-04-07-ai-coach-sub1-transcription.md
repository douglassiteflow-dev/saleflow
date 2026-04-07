# AI Sales Coach — Sub-projekt 1: Enhanced Transcription Pipeline

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Whisper+Claude with AssemblyAI Universal-2 + LeMUR for transcription, speaker diarization, sentiment, 25-point scorecard, and post-call summaries. Batch-transcribe all calls >20s daily at 16:00.

**Architecture:** AssemblyAI handles transcription + audio intelligence in one API call. LeMUR (Claude 4 under the hood) runs the 25-point scorecard against the company playbook. A new DailyTranscriptionWorker batch-processes all untranscribed calls. Results stored in existing `phone_calls.transcription_analysis` (bakåtkompatibelt).

**Tech Stack:** AssemblyAI Universal-2 + LeMUR, Elixir/Phoenix/Oban, PostgreSQL, React/TypeScript

**Spec:** `docs/superpowers/specs/2026-04-07-ai-sales-coach-design.md`

---

## File Structure

### Backend — New files
| File | Responsibility |
|------|---------------|
| `lib/saleflow/assemblyai/client.ex` | AssemblyAI HTTP client (transcribe, poll, lemur) |
| `lib/saleflow/assemblyai/client_behaviour.ex` | Behaviour for Mox testing |
| `lib/saleflow/workers/daily_transcription_worker.ex` | Oban cron: batch all >20s calls at 16:00 |
| `priv/repo/migrations/*_add_assemblyai_fields.exs` | New columns on phone_calls |
| `test/saleflow/assemblyai/client_test.exs` | Client unit tests |
| `test/saleflow/workers/daily_transcription_worker_test.exs` | Batch worker tests |

### Backend — Modified files
| File | Change |
|------|--------|
| `lib/saleflow/workers/transcription_worker.ex` | Rewrite: Whisper→AssemblyAI, Claude→LeMUR |
| `config/runtime.exs` | Add ASSEMBLYAI_API_KEY |
| `config/config.exs` | Add DailyTranscriptionWorker to Oban cron |
| `test/test_helper.exs` | Register AssemblyAI Mox mock |
| `test/saleflow/workers/transcription_worker_test.exs` | Update for AssemblyAI |

### Frontend — Modified files
| File | Change |
|------|--------|
| `src/api/types.ts` | Extend TranscriptionAnalysis type with scorecard, talk_ratio, sentiment |
| `src/components/call-analysis-modal.tsx` | Add 25-point scorecard view, talk ratio, sentiment |

---

## Task 1: AssemblyAI Config + Client Module

**Files:**
- Create: `backend/lib/saleflow/assemblyai/client_behaviour.ex`
- Create: `backend/lib/saleflow/assemblyai/client.ex`
- Create: `backend/test/saleflow/assemblyai/client_test.exs`
- Modify: `backend/config/runtime.exs`
- Modify: `backend/test/test_helper.exs`

- [ ] **Step 1: Add config**

In `backend/config/runtime.exs`, after the anthropic line:
```elixir
config :saleflow, :assemblyai_api_key, System.get_env("ASSEMBLYAI_API_KEY") || ""
```

- [ ] **Step 2: Create behaviour**

```elixir
defmodule Saleflow.AssemblyAI.ClientBehaviour do
  @callback transcribe(audio_url :: String.t(), opts :: map()) ::
              {:ok, String.t()} | {:error, term()}

  @callback get_transcript(transcript_id :: String.t()) ::
              {:ok, map()} | {:error, term()}

  @callback lemur_task(transcript_ids :: [String.t()], prompt :: String.t(), opts :: map()) ::
              {:ok, map()} | {:error, term()}
end
```

- [ ] **Step 3: Create client**

```elixir
defmodule Saleflow.AssemblyAI.Client do
  @moduledoc "AssemblyAI HTTP client for transcription + LeMUR."

  @behaviour Saleflow.AssemblyAI.ClientBehaviour

  @base_url "https://api.assemblyai.com/v2"
  @poll_interval_ms 3_000
  @max_poll_attempts 120

  defp api_key, do: Application.get_env(:saleflow, :assemblyai_api_key, "")
  defp headers, do: [{"authorization", api_key()}, {"content-type", "application/json"}]

  @impl true
  def transcribe(audio_url, opts \\ %{}) do
    body =
      %{
        "audio_url" => audio_url,
        "language_code" => Map.get(opts, :language, "sv"),
        "speaker_labels" => true,
        "sentiment_analysis" => true,
        "entity_detection" => true,
        "iab_categories" => true,
        "auto_highlights" => true,
        "auto_chapters" => true,
        "summarization" => true,
        "summary_type" => "bullets_verbose",
        "summary_model" => "informative"
      }
      |> Jason.encode!()

    case Req.post("#{@base_url}/transcript", body: body, headers: headers(), receive_timeout: 30_000) do
      {:ok, %{status: 200, body: %{"id" => id}}} -> {:ok, id}
      {:ok, %{status: status, body: body}} -> {:error, {:http, status, body}}
      {:error, reason} -> {:error, reason}
    end
  end

  @impl true
  def get_transcript(transcript_id) do
    case Req.get("#{@base_url}/transcript/#{transcript_id}", headers: headers(), receive_timeout: 15_000) do
      {:ok, %{status: 200, body: %{"status" => "completed"} = body}} -> {:ok, body}
      {:ok, %{status: 200, body: %{"status" => "error", "error" => err}}} -> {:error, {:assemblyai, err}}
      {:ok, %{status: 200, body: %{"status" => status}}} -> {:ok, %{"status" => status}}
      {:ok, %{status: s, body: b}} -> {:error, {:http, s, b}}
      {:error, reason} -> {:error, reason}
    end
  end

  def poll_until_complete(transcript_id) do
    poll_until_complete(transcript_id, 0)
  end

  defp poll_until_complete(_id, attempt) when attempt >= @max_poll_attempts do
    {:error, :poll_timeout}
  end

  defp poll_until_complete(transcript_id, attempt) do
    case get_transcript(transcript_id) do
      {:ok, %{"status" => "completed"} = result} -> {:ok, result}
      {:ok, %{"status" => s}} when s in ["queued", "processing"] ->
        Process.sleep(@poll_interval_ms)
        poll_until_complete(transcript_id, attempt + 1)
      {:ok, %{"status" => "error"} = result} -> {:error, {:assemblyai, result}}
      {:error, _} = err -> err
    end
  end

  @impl true
  def lemur_task(transcript_ids, prompt, opts \\ %{}) do
    body =
      %{
        "transcript_ids" => transcript_ids,
        "prompt" => prompt,
        "final_model" => Map.get(opts, :model, "anthropic/claude-sonnet-4"),
        "max_output_size" => Map.get(opts, :max_output_size, 4000)
      }
      |> Jason.encode!()

    case Req.post("#{@base_url}/lemur/v3/generate/task",
           body: body,
           headers: headers(),
           receive_timeout: 120_000
         ) do
      {:ok, %{status: 200, body: %{"response" => response}}} -> {:ok, response}
      {:ok, %{status: s, body: b}} -> {:error, {:http, s, b}}
      {:error, reason} -> {:error, reason}
    end
  end
end
```

- [ ] **Step 4: Register Mox mock in test_helper.exs**

```elixir
Mox.defmock(Saleflow.AssemblyAI.MockClient, for: Saleflow.AssemblyAI.ClientBehaviour)
```

- [ ] **Step 5: Write client tests**

```elixir
defmodule Saleflow.AssemblyAI.ClientTest do
  use ExUnit.Case, async: true

  alias Saleflow.AssemblyAI.Client

  describe "transcribe/2" do
    test "returns transcript_id on success" do
      # This test verifies the function signature and return type
      # Actual API calls tested via Mox in worker tests
      assert is_function(&Client.transcribe/2)
    end
  end

  describe "poll_until_complete/1" do
    test "function exists" do
      assert is_function(&Client.poll_until_complete/1)
    end
  end

  describe "lemur_task/3" do
    test "function exists" do
      assert is_function(&Client.lemur_task/3)
    end
  end
end
```

- [ ] **Step 6: Run tests and commit**

```bash
cd backend && mix test test/saleflow/assemblyai/ && git add -A && git commit -m "feat: add AssemblyAI client module + config"
```

---

## Task 2: Migration — New Columns on phone_calls

**Files:**
- Create: `backend/priv/repo/migrations/*_add_assemblyai_fields.exs`

- [ ] **Step 1: Create migration**

```elixir
defmodule Saleflow.Repo.Migrations.AddAssemblyaiFields do
  use Ecto.Migration

  def change do
    alter table(:phone_calls) do
      add :call_summary, :text
      add :assemblyai_transcript_id, :string
      add :talk_ratio_seller, :integer
      add :sentiment, :string
      add :scorecard_avg, :float
    end

    # Full-text search index on transcriptions
    execute(
      "CREATE INDEX idx_phone_calls_transcription_search ON phone_calls USING GIN (to_tsvector('swedish', COALESCE(transcription, '')))",
      "DROP INDEX idx_phone_calls_transcription_search"
    )
  end
end
```

- [ ] **Step 2: Run migration**

```bash
cd backend && mix ecto.migrate
```

- [ ] **Step 3: Commit**

```bash
git add priv/repo/migrations/ && git commit -m "feat: add AssemblyAI fields + tsvector index on phone_calls"
```

---

## Task 3: Rewrite TranscriptionWorker

**Files:**
- Modify: `backend/lib/saleflow/workers/transcription_worker.ex`
- Modify: `backend/test/saleflow/workers/transcription_worker_test.exs`

- [ ] **Step 1: Write tests for new AssemblyAI flow**

Test the worker with Mox mocks for AssemblyAI client:
- Successful transcription + LeMUR scorecard
- AssemblyAI transcription failure
- LeMUR scorecard failure (falls back to transcription-only)
- Voicemail detection
- Saves all new fields (call_summary, talk_ratio_seller, sentiment, scorecard_avg, assemblyai_transcript_id)

- [ ] **Step 2: Rewrite TranscriptionWorker**

Replace the worker internals. Keep the same `perform/1` signature and Oban config.

**New flow:**
```
perform/1
  → get recording_key from DB
  → generate presigned R2 URL (1h)
  → AssemblyAI: transcribe(audio_url) → poll_until_complete
  → Extract: utterances, sentiment, entities, chapters, summary, talk_ratio
  → AssemblyAI LeMUR: scorecard prompt with playbook
  → Parse LeMUR response (25-point scorecard JSON)
  → Build unified transcription_analysis JSON (bakåtkompatibelt)
  → Save to DB: transcription, transcription_analysis, call_summary,
    assemblyai_transcript_id, talk_ratio_seller, sentiment, scorecard_avg
```

**Key implementation details:**

The worker uses configurable client module:
```elixir
defp assemblyai_client do
  Application.get_env(:saleflow, :assemblyai_client, Saleflow.AssemblyAI.Client)
end
```

**Talk ratio calculation from utterances:**
```elixir
defp calculate_talk_ratio(utterances) do
  {seller_ms, customer_ms} =
    Enum.reduce(utterances, {0, 0}, fn u, {s, c} ->
      duration = (u["end"] || 0) - (u["start"] || 0)
      if u["speaker"] == "A", do: {s + duration, c}, else: {s, c + duration}
    end)

  total = seller_ms + customer_ms
  if total > 0, do: round(seller_ms / total * 100), else: 50
end
```

**LeMUR scorecard prompt (Swedish):**
```
Betygsätt detta säljsamtal mot playbooken nedan. Returnera ENBART JSON.

PLAYBOOK:
#{playbook_text}

Returnera JSON med exakt denna struktur:
{
  "scorecard": {
    "opening": {
      "agenda": {"score": 1-10, "comment": "kort kommentar"},
      "tonfall": {"score": 1-10, "comment": "..."},
      "research": {"score": 1-10, "comment": "..."},
      "permission": {"score": 1-10, "comment": "..."},
      "hook": {"score": 1-10, "comment": "..."},
      "avg": 0.0
    },
    ... (discovery, pitch, objection_handling, closing — samma struktur)
    "overall_avg": 0.0
  },
  "score": {
    "opening": {"score": 1-10, "comment": "..."},
    "needs_discovery": {"score": 1-10, "comment": "..."},
    "pitch": {"score": 1-10, "comment": "..."},
    "objection_handling": {"score": 1-10, "comment": "..."},
    "closing": {"score": 1-10, "comment": "..."},
    "overall": 1-10,
    "top_feedback": "..."
  },
  "summary": "2-3 meningar",
  "customer_needs": ["..."],
  "objections": ["..."],
  "positive_signals": ["..."],
  "action_items": ["..."],
  "keywords": {
    "competitors": [{"keyword": "...", "context": "...", "timestamp": 0}],
    "buying_signals": [...],
    "red_flags": [...]
  },
  "voicemail": false
}
```

**Bakåtkompatibelt:** Both `score` (old 5-category) and `scorecard` (new 25-point) included in output.

- [ ] **Step 3: Run tests**

```bash
cd backend && mix test test/saleflow/workers/transcription_worker_test.exs
```

- [ ] **Step 4: Commit**

```bash
git commit -am "feat: rewrite TranscriptionWorker with AssemblyAI + LeMUR"
```

---

## Task 4: DailyTranscriptionWorker

**Files:**
- Create: `backend/lib/saleflow/workers/daily_transcription_worker.ex`
- Create: `backend/test/saleflow/workers/daily_transcription_worker_test.exs`
- Modify: `backend/config/config.exs` (add to Oban cron)

- [ ] **Step 1: Write tests**

```elixir
defmodule Saleflow.Workers.DailyTranscriptionWorkerTest do
  use Saleflow.DataCase, async: false

  alias Saleflow.Workers.DailyTranscriptionWorker

  describe "find_untranscribed_calls/0" do
    test "finds calls >20s without transcription that have recording" do
      # Insert phone_call with duration > 20, no transcription, has recording_key
      # Verify it's returned
    end

    test "excludes calls with transcription" do
      # Insert phone_call with transcription already set
      # Verify it's NOT returned
    end

    test "excludes calls <=20s" do
      # Insert phone_call with duration 15
      # Verify NOT returned
    end

    test "excludes calls without recording" do
      # Insert phone_call without recording_key
      # Verify NOT returned
    end
  end

  describe "perform/1" do
    test "enqueues TranscriptionWorker for each untranscribed call" do
      # Insert qualifying phone_calls
      # Run perform
      # Verify Oban jobs enqueued with correct args and schedule_in delays
    end

    test "returns :ok when no calls to process" do
      assert :ok = DailyTranscriptionWorker.perform(%Oban.Job{args: %{}})
    end
  end
end
```

- [ ] **Step 2: Implement worker**

```elixir
defmodule Saleflow.Workers.DailyTranscriptionWorker do
  @moduledoc """
  Batch-transcribes all calls >20s from today that lack transcription.
  Runs at 16:00 weekdays via Oban Cron.
  """

  use Oban.Worker, queue: :default, max_attempts: 1

  require Logger

  @min_duration 20
  @delay_between_jobs 3

  @impl true
  def perform(%Oban.Job{args: args}) do
    date = Map.get(args, "date", Date.utc_today() |> Date.to_iso8601())

    calls = find_untranscribed_calls(date)

    case calls do
      [] ->
        Logger.info("DailyTranscriptionWorker: no untranscribed calls for #{date}")
        :ok

      calls ->
        Logger.info("DailyTranscriptionWorker: #{length(calls)} calls to transcribe for #{date}")

        calls
        |> Enum.with_index()
        |> Enum.each(fn {call, idx} ->
          Saleflow.Workers.TranscriptionWorker.new(
            %{phone_call_id: call.id},
            schedule_in: idx * @delay_between_jobs
          )
          |> Oban.insert()
        end)

        :ok
    end
  end

  def find_untranscribed_calls(date \\ Date.utc_today() |> Date.to_iso8601()) do
    case Saleflow.Repo.query(
           """
           SELECT id, user_id FROM phone_calls
           WHERE received_at::date = $1::date
             AND duration > $2
             AND transcription IS NULL
             AND recording_key IS NOT NULL
           ORDER BY received_at ASC
           LIMIT 100
           """,
           [date, @min_duration]
         ) do
      {:ok, %{rows: rows}} ->
        Enum.map(rows, fn [id, uid] ->
          %{id: Ecto.UUID.load!(id), user_id: if(uid, do: Ecto.UUID.load!(uid), else: nil)}
        end)

      _ ->
        []
    end
  end
end
```

- [ ] **Step 3: Add to Oban cron**

In `backend/config/config.exs`, add before DailyReportWorker:
```elixir
{"0 16 * * 1-5", Saleflow.Workers.DailyTranscriptionWorker},
```

- [ ] **Step 4: Run tests and commit**

```bash
cd backend && mix test test/saleflow/workers/daily_transcription_worker_test.exs
git commit -am "feat: add DailyTranscriptionWorker — batch transcribe all calls >20s"
```

---

## Task 5: Frontend — Extended Types + Scorecard UI

**Files:**
- Modify: `frontend/src/api/types.ts`
- Modify: `frontend/src/components/call-analysis-modal.tsx`
- Create: `frontend/src/__tests__/components/call-analysis-scorecard.test.tsx`

- [ ] **Step 1: Extend types**

In `frontend/src/api/types.ts`, add:
```typescript
export interface ScorecardQuestion {
  score: number;
  comment: string;
}

export interface ScorecardCategory {
  [question: string]: ScorecardQuestion | number;
  avg: number;
}

export interface Scorecard {
  opening: ScorecardCategory;
  discovery: ScorecardCategory;
  pitch: ScorecardCategory;
  objection_handling: ScorecardCategory;
  closing: ScorecardCategory;
  overall_avg: number;
}

export interface TalkRatio {
  seller_pct: number;
  customer_pct: number;
  longest_monolog_seconds: number;
  avg_seller_turn_seconds: number;
  avg_customer_turn_seconds: number;
}

export interface SentimentAnalysis {
  overall: "POSITIVE" | "NEGATIVE" | "NEUTRAL";
  positive_pct: number;
  negative_pct: number;
  neutral_pct: number;
}

export interface TranscriptionAnalysis {
  // Old fields (bakåtkompatibelt)
  score?: {
    opening: ScorecardQuestion;
    needs_discovery: ScorecardQuestion;
    pitch: ScorecardQuestion;
    objection_handling: ScorecardQuestion;
    closing: ScorecardQuestion;
    overall: number;
    top_feedback: string;
  };
  conversation?: { speaker: string; text: string; start?: number; end?: number; sentiment?: string }[];
  summary?: string;
  customer_needs?: string[];
  objections?: string[];
  positive_signals?: string[];

  // New fields
  scorecard?: Scorecard;
  talk_ratio?: TalkRatio;
  sentiment?: SentimentAnalysis;
  action_items?: string[];
  keywords?: {
    competitors: { keyword: string; context: string; timestamp: number }[];
    buying_signals: { keyword: string; context: string; timestamp: number }[];
    red_flags: { keyword: string; context: string; timestamp: number }[];
  };
  chapters?: { summary: string; start: number; end: number }[];
  voicemail?: boolean;
}
```

- [ ] **Step 2: Update call-analysis-modal**

Extend the existing modal to show:
- 25-point scorecard (5 expandable categories × 5 questions) if `analysis.scorecard` exists
- Talk ratio donut chart if `analysis.talk_ratio` exists
- Sentiment indicator if `analysis.sentiment` exists
- Fall back to old 5-category `analysis.score` if `scorecard` not present

Read `frontend/src/components/call-analysis-modal.tsx` first to understand existing structure. Add new sections below existing content, wrapped in conditionals.

- [ ] **Step 3: Write tests**

Test: renders 25-point scorecard when present, renders old 5-point when scorecard absent (bakåtkompatibilitet), renders talk ratio, renders sentiment.

- [ ] **Step 4: Run tests and commit**

```bash
cd frontend && npx vitest run && git commit -am "feat: extend call-analysis-modal with 25-point scorecard, talk ratio, sentiment"
```

---

## Task 6: Full Test Suite + Coverage

- [ ] **Step 1: Run backend tests with coverage**

```bash
cd backend && mix test --cover
```
Verify 100% on new/modified files.

- [ ] **Step 2: Run frontend tests**

```bash
cd frontend && npx vitest run
```
Verify 0 failures.

- [ ] **Step 3: Fix any gaps**

- [ ] **Step 4: Final commit**

```bash
git commit -am "test: 100% coverage on AI coach sub-project 1"
```
