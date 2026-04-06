defmodule Saleflow.Workers.DailyReportWorker do
  @moduledoc """
  Runs daily at 16:10 on weekdays. Generates a PERSONAL AI coaching report
  for each agent based on their individual call history and scores.
  Each agent gets their own report saved in agent_daily_reports.
  """

  use Oban.Worker, queue: :default, max_attempts: 2

  require Logger

  @impl Oban.Worker
  def perform(_job) do
    today = Date.utc_today()

    agents = get_agents()

    if length(agents) == 0 do
      Logger.info("DailyReportWorker: no agents found")
      :ok
    else
      Logger.info("DailyReportWorker: generating reports for #{length(agents)} agents")

      Enum.each(agents, fn {user_id, user_name} ->
        generate_agent_report(user_id, user_name, today)
      end)

      :ok
    end
  end

  defp generate_agent_report(user_id, user_name, today) do
    calls = get_agent_calls_today(user_id, today)
    previous_reports = get_previous_agent_reports(user_id, today, 5)
    playbook = get_playbook()

    if length(calls) == 0 do
      Logger.info("DailyReportWorker: no calls for agent #{user_name} on #{today}")
      :ok
    else
      scores = calls
        |> Enum.map(fn {_summary, _score_details, _feedback, overall} -> overall end)
        |> Enum.filter(fn s -> s != nil and s > 0 end)

      score_avg = if length(scores) > 0, do: Enum.sum(scores) / length(scores), else: nil
      call_count = length(calls)

      case send_to_claude(user_name, today, calls, previous_reports, playbook) do
        {:ok, report_text} ->
          save_agent_report(user_id, today, report_text, score_avg, call_count)
          Logger.info("DailyReportWorker: report saved for #{user_name} on #{today}")

        {:error, reason} ->
          Logger.warning("DailyReportWorker: failed for #{user_name}: #{inspect(reason)}")
      end
    end
  end

  defp get_agents do
    case Saleflow.Repo.query("SELECT id, name FROM users WHERE role = 'agent' ORDER BY name") do
      {:ok, %{rows: rows}} ->
        Enum.map(rows, fn [id, name] -> {Ecto.UUID.load!(id), name} end)
      _ -> []
    end
  end

  defp get_agent_calls_today(user_id, today) do
    case Saleflow.Repo.query(
           """
           SELECT pc.transcription_analysis, pc.duration, cl.outcome::text
           FROM phone_calls pc
           LEFT JOIN call_logs cl ON cl.id = pc.call_log_id
           WHERE pc.user_id = $1
             AND pc.received_at::date = $2
             AND pc.transcription_analysis IS NOT NULL
           ORDER BY pc.received_at ASC
           """,
           [Ecto.UUID.dump!(user_id), today]
         ) do
      {:ok, %{rows: rows}} ->
        Enum.map(rows, fn [analysis_raw, _duration, _outcome] ->
          parsed = parse_analysis(analysis_raw)
          summary = parsed["summary"] || "Inget sammanfattning"
          score = parsed["score"] || %{}
          top_feedback = dig(score, ["top_feedback"])
          overall = dig(score, ["overall"])

          score_details = %{
            opening: dig(score, ["opening", "score"]),
            needs_discovery: dig(score, ["needs_discovery", "score"]),
            pitch: dig(score, ["pitch", "score"]),
            objection_handling: dig(score, ["objection_handling", "score"]),
            closing: dig(score, ["closing", "score"]),
            overall: overall
          }

          {summary, score_details, top_feedback, overall}
        end)
      _ -> []
    end
  end

  defp get_previous_agent_reports(user_id, today, limit) do
    case Saleflow.Repo.query(
           "SELECT date, report FROM agent_daily_reports WHERE user_id = $1 AND date < $2 ORDER BY date DESC LIMIT $3",
           [Ecto.UUID.dump!(user_id), today, limit]
         ) do
      {:ok, %{rows: rows}} ->
        Enum.map(rows, fn [date, report] ->
          "#{Date.to_iso8601(date)}:\n#{String.slice(report || "", 0..800)}"
        end)
      _ -> []
    end
  end

  defp get_playbook do
    case Saleflow.Repo.query("SELECT opening, pitch, objections, closing, guidelines FROM playbooks WHERE active = true LIMIT 1") do
      {:ok, %{rows: [[o, p, obj, c, g]]}} ->
        "Öppning: #{o}\nPitch: #{p}\nInvändningar: #{obj}\nAvslut: #{c}\nRiktlinjer: #{g}"
      _ -> nil
    end
  end

  defp send_to_claude(agent_name, date, calls, previous_reports, playbook) do
    api_key = Application.get_env(:saleflow, :anthropic_api_key, "")
    if api_key == "", do: throw({:error, "ANTHROPIC_API_KEY not set"})

    calls_text = calls
      |> Enum.with_index(1)
      |> Enum.map(fn {{summary, scores, feedback, _overall}, i} ->
        """
        Samtal #{i}:
        Sammanfattning: #{summary}
        Betyg: Öppning #{scores.opening || "?"}, Behov #{scores.needs_discovery || "?"}, Pitch #{scores.pitch || "?"}, Invändning #{scores.objection_handling || "?"}, Avslut #{scores.closing || "?"}, Totalt #{scores.overall || "?"}/10
        Feedback: #{feedback || "Ingen feedback"}
        """
      end)
      |> Enum.join("\n")

    previous_text = if length(previous_reports) > 0 do
      "DINA TIDIGARE COACHINGRAPPORTER TILL DENNA AGENT:\n#{Enum.join(previous_reports, "\n---\n")}"
    else
      "Du har inte coachat denna agent tidigare. Detta är din första rapport."
    end

    first_name = agent_name |> String.split(" ") |> List.first()

    prompt = """
    Du är #{first_name}s personliga säljcoach. Tänk på dig själv som en mentor som verkligen bryr sig om denna persons utveckling — inte en AI som spottar ut generiska tips.

    #{if playbook, do: "FÖRETAGETS SÄLJMANUS:\n#{playbook}\n\nDu ska bedöma mot detta manus MEN du får också resonera fritt. Om du ser att agenten gör något smart som INTE står i manuset — lyft det. Om manuset missar något — säg det.", else: ""}

    IDAG (#{Date.to_iso8601(date)}) — #{first_name}s samtal:
    #{calls_text}

    #{previous_text}

    REGLER FÖR DIN RAPPORT:
    - Skriv kort och rakt på sak. Ingen fluff.
    - Citera specifika saker som sades i samtalen.
    - Om du coachade igår — kolla om #{first_name} lyssnade. Var ärlig.
    - Du FÅR resonera utanför manuset om du ser mönster eller möjligheter.
    - Max 2 meningar per fält. Varje ord ska ha ett syfte.

    JSON (inget annat):
    {
      "greeting": "Kort, personlig, baserad på dagens resultat",
      "score_summary": "Snittbetyg med jämförelse mot igår, en mening",
      "wins": ["Max 2-3 korta, specifika saker som gick bra"],
      "focus_area": "EN sak att fokusera på imorgon, baserad på svagaste punkten",
      "progress_note": "Har #{first_name} utvecklats? Referera till dina tidigare tips om de finns",
      "tip_of_the_day": "Ett konkret trick att testa imorgon",
      "motivation": "En kort avslutning, max en mening"
    }
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
           receive_timeout: 90_000
         ) do
      {:ok, %{status: 200, body: %{"content" => content}}} ->
        text = content
          |> Enum.filter(fn block -> block["type"] == "text" end)
          |> Enum.map(fn block -> block["text"] end)
          |> Enum.join("")

        cleaned = String.replace(text, ~r/```json\n?|\n?```/, "")
        # Validate it's valid JSON before saving
        case Jason.decode(cleaned) do
          {:ok, _} -> {:ok, cleaned}
          _ -> {:ok, text}
        end

      {:ok, %{status: s, body: b}} -> {:error, "Claude #{s}: #{inspect(b)}"}
      {:error, reason} -> {:error, reason}
    end
  end

  defp save_agent_report(user_id, date, report, score_avg, call_count) do
    Saleflow.Repo.query(
      """
      INSERT INTO agent_daily_reports (id, user_id, date, report, score_avg, call_count, inserted_at)
      VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, NOW())
      ON CONFLICT (user_id, date) DO UPDATE SET report = $3, score_avg = $4, call_count = $5
      """,
      [Ecto.UUID.dump!(user_id), date, report, score_avg, call_count]
    )
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
