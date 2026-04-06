defmodule Saleflow.Workers.DailyReportWorker do
  @moduledoc """
  Runs daily at 16:00. Collects all AI call analyses from today,
  sends them to Claude for a team-wide daily summary report.
  Stores the report in a daily_reports table.
  """

  use Oban.Worker, queue: :default, max_attempts: 2

  require Logger

  @impl Oban.Worker
  def perform(_job) do
    today = Date.utc_today()

    {:ok, %{rows: rows}} =
      Saleflow.Repo.query(
        "SELECT pc.transcription_analysis, pc.duration, cl.outcome::text, u.name
         FROM phone_calls pc
         LEFT JOIN call_logs cl ON cl.id = pc.call_log_id
         LEFT JOIN users u ON u.id = pc.user_id
         WHERE pc.received_at::date = $1 AND pc.transcription_analysis IS NOT NULL",
        [today]
      )

    if length(rows) == 0 do
      Logger.info("DailyReportWorker: no analyzed calls for #{today}")
      :ok
    else
      summaries = Enum.map(rows, fn [analysis_raw, duration, outcome, agent] ->
        parsed = parse_analysis(analysis_raw)
        "Agent: #{agent || "Okänd"}, Utfall: #{outcome || "?"}, Längd: #{duration || 0}s, " <>
        "Betyg: #{dig(parsed, ["score", "overall"]) || "?"}/10, " <>
        "Sammanfattning: #{parsed["summary"] || "?"}, " <>
        "Feedback: #{dig(parsed, ["score", "top_feedback"]) || "?"}"
      end)

      case generate_report(today, summaries) do
        {:ok, report} ->
          save_report(today, report)
          Logger.info("DailyReportWorker: report generated for #{today}")
          :ok

        {:error, reason} ->
          Logger.warning("DailyReportWorker: failed for #{today}: #{inspect(reason)}")
          {:error, reason}
      end
    end
  end

  defp generate_report(date, summaries) do
    api_key = Application.get_env(:saleflow, :anthropic_api_key, "")
    if api_key == "", do: throw({:error, "ANTHROPIC_API_KEY not set"})

    playbook = get_playbook()
    previous_reports = get_previous_reports(date, 5)

    prompt = """
    Du är en säljchef som skriver en daglig rapport för ditt säljteam.
    Datum: #{Date.to_iso8601(date)}

    #{if playbook, do: "Teamets playbook/manus:\n#{playbook}\n", else: ""}

    #{if length(previous_reports) > 0, do: "TIDIGARE RAPPORTER (använd för att se trender och progress):\n#{Enum.join(previous_reports, "\n---\n")}\n", else: ""}

    Här är alla AI-analyserade samtal idag:
    #{Enum.join(summaries, "\n\n")}

    Skriv en daglig rapport i JSON-format:
    {
      "headline": "En kort rubrik som sammanfattar dagen (max 10 ord)",
      "summary": "2-3 meningar om hur dagen gick",
      "wins": ["bra saker som hände idag"],
      "improvements": ["saker att förbättra imorgon"],
      "focus_tomorrow": "En specifik sak teamet ska fokusera på imorgon, baserat på dagens svagaste område",
      "agent_shoutouts": [{"agent": "Namn", "reason": "Varför de förtjänar beröm"}],
      "trend_note": "Notera om det finns mönster — t.ex. alla missar samma del av pitchen, eller en agent sticker ut"
    }

    Var specifik och referera till faktiska samtal. Svara BARA med JSON.
    """

    body = Jason.encode!(%{
      model: "claude-sonnet-4-20250514",
      max_tokens: 16000,
      thinking: %{
        type: "enabled",
        budget_tokens: 10000
      },
      messages: [%{role: "user", content: prompt}]
    })

    case Req.post("https://api.anthropic.com/v1/messages",
           body: body,
           headers: [
             {"x-api-key", api_key},
             {"anthropic-version", "2023-06-01"},
             {"content-type", "application/json"}
           ],
           receive_timeout: 60_000
         ) do
      {:ok, %{status: 200, body: %{"content" => content}}} ->
        # With extended thinking, content has thinking blocks + text blocks
        text = content
          |> Enum.filter(fn block -> block["type"] == "text" end)
          |> Enum.map(fn block -> block["text"] end)
          |> Enum.join("")

        cleaned = String.replace(text, ~r/```json\n?|\n?```/, "")
        case Jason.decode(cleaned) do
          {:ok, report} -> {:ok, report}
          _ -> {:ok, %{"raw" => text}}
        end

      {:ok, %{status: s, body: b}} -> {:error, "Claude #{s}: #{inspect(b)}"}
      {:error, reason} -> {:error, reason}
    end
  end

  defp save_report(date, report) do
    json = Jason.encode!(report)
    Saleflow.Repo.query(
      "INSERT INTO daily_reports (id, date, report, inserted_at) VALUES (gen_random_uuid(), $1, $2, NOW()) ON CONFLICT (date) DO UPDATE SET report = $2",
      [date, json]
    )
  end

  defp get_previous_reports(today, limit) do
    case Saleflow.Repo.query(
           "SELECT date, report FROM daily_reports WHERE date < $1 ORDER BY date DESC LIMIT $2",
           [today, limit]
         ) do
      {:ok, %{rows: rows}} ->
        Enum.map(rows, fn [date, report] -> "#{date}: #{String.slice(report || "", 0..500)}" end)
      _ -> []
    end
  end

  defp get_playbook do
    case Saleflow.Repo.query("SELECT opening, pitch, objections, closing, guidelines FROM playbooks WHERE active = true LIMIT 1") do
      {:ok, %{rows: [[o, p, obj, c, g]]}} -> "Öppning: #{o}\nPitch: #{p}\nInvändningar: #{obj}\nAvslut: #{c}\nRiktlinjer: #{g}"
      _ -> nil
    end
  end

  defp parse_analysis(raw) do
    case Jason.decode(raw || "") do
      {:ok, %{"raw_analysis" => inner}} ->
        case Jason.decode(String.replace(inner, ~r/```json\n?|\n?```/, "")) do
          {:ok, data} -> data
          _ -> %{}
        end
      {:ok, data} -> data
      _ -> %{}
    end
  end

  defp dig(map, []), do: map
  defp dig(map, [key | rest]) when is_map(map), do: dig(Map.get(map, key), rest)
  defp dig(_, _), do: nil
end
