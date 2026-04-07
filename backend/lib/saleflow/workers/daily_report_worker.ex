defmodule Saleflow.Workers.DailyReportWorker do
  @moduledoc """
  Runs daily at 16:10 on weekdays. Generates a PERSONAL AI coaching report
  for each agent based on their individual call history and scores.
  Each agent gets their own report saved in agent_daily_reports.
  """

  use Oban.Worker, queue: :default, max_attempts: 2

  require Logger

  @impl Oban.Worker
  def perform(%Oban.Job{args: args}) do
    today = case args["date"] do
      nil -> Date.utc_today()
      date_str -> Date.from_iso8601!(date_str)
    end

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
    Du är #{first_name}s personliga säljcoach. Generera en komplett HTML-rapport.

    #{if playbook, do: "SÄLJMANUS:\n#{playbook}\n", else: ""}

    SAMTALSDATA IDAG (#{Date.to_iso8601(date)}):
    #{calls_text}

    #{previous_text}

    GENERERA EN KOMPLETT HTML-RAPPORT. Följ dessa regler EXAKT:

    DESIGN:
    - Börja med <!DOCTYPE html><html lang="sv"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head><body>
    - Body: background #FAFAFA, font-family -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif, margin 0, padding 24px
    - Kort: background white, border-radius 16px, box-shadow 0 1px 3px rgba(0,0,0,0.06), padding 20px 24px, margin-bottom 16px
    - Max-width: 600px, margin 0 auto
    - Accent: #0071E3, Success: #10B981, Warning: #F59E0B, Danger: #EF4444
    - Text: #1D1D1F (primary), #86868B (secondary)
    - ALL CSS INLINE på varje element. Inga <style> block. Inga klasser.
    - Inga JavaScript. Inga externa resurser.

    INNEHÅLL (i denna ordning):
    1. HEADER — Namn, datum, stort snittbetyg (cirkel med siffra)
    2. COACHING — Varje highlight i eget kort med ikon (✅ bra, ⚡ förbättra, 👁 observation). Citera specifika saker från samtalen. Ange källa: "(Playbook: X)" eller "(Egen observation)".
    3. BÄSTA CITAT — Ett citat från dagens bästa samtal i ett kort med vänsterrand
    4. CHECKLISTA — Blått kort med checkboxar (☐ unicode) för imorgons uppgifter med källa
    5. SVG CHARTS — Två charts bredvid varandra i ett kort:
       a) Donut chart (inline SVG) för utfall (möte/callback/ej intresserad etc) med färger
       b) Horisontella bars för betyg per kategori (Öppning, Behov, Pitch, Invändning, Avslut) med siffror
    6. PROGRESS — Kort om agentens utveckling, referera till tidigare coaching om den finns
    7. AVSLUT — Kort motiverande mening i italic

    SVG CHARTS:
    - Donut: <svg viewBox="0 0 100 100" width="120" height="120"> med <circle> och stroke-dasharray
    - Bars: <div> med inline background-color och width i procent
    - Använd VERKLIG DATA från samtalen ovan

    REGLER FÖR TEXTEN:
    - Kort och rakt på sak. Max 2 meningar per punkt.
    - Citera specifika saker agenten sa i samtalen.
    - Om du coachade igår — kolla om #{first_name} lyssnade.
    - Resonera fritt utanför manuset om du ser mönster.

    Returnera BARA HTML. Ingen markdown. Inget ```html. Börja direkt med <!DOCTYPE html>.
    """

    body = Jason.encode!(%{
      model: "claude-sonnet-4-20250514",
      max_tokens: 16000,
      messages: [%{role: "user", content: prompt}]
    })

    case Req.post("https://api.anthropic.com/v1/messages",
           body: body,
           headers: [
             {"x-api-key", api_key},
             {"anthropic-version", "2023-06-01"},
             {"content-type", "application/json"}
           ],
           receive_timeout: 180_000
         ) do
      {:ok, %{status: 200, body: %{"content" => content}}} ->
        html = content
          |> Enum.filter(fn block -> block["type"] == "text" end)
          |> Enum.map(fn block -> block["text"] end)
          |> Enum.join("")
          |> String.trim()

        # Strip markdown code fences if Claude wrapped it
        html = html
          |> String.replace(~r/^```html\n?/, "")
          |> String.replace(~r/\n?```$/, "")
          |> String.trim()

        if String.starts_with?(html, "<!DOCTYPE") || String.starts_with?(html, "<html") do
          {:ok, html}
        else
          {:error, "Claude did not return HTML"}
        end

      {:ok, %{status: s, body: b}} -> {:error, "Claude #{s}: #{inspect(b)}"}
      {:error, reason} -> {:error, reason}
    end
  end

  defp save_agent_report(user_id, date, html, score_avg, call_count) do
    Saleflow.Repo.query(
      "INSERT INTO agent_daily_reports (id, user_id, date, report, score_avg, call_count, inserted_at) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, NOW()) ON CONFLICT (user_id, date) DO UPDATE SET report = $3, score_avg = $4, call_count = $5",
      [Ecto.UUID.dump!(user_id), date, html, score_avg, call_count]
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
