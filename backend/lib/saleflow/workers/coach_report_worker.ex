defmodule Saleflow.Workers.CoachReportWorker do
  @moduledoc """
  Generates unified AI coaching reports per agent.
  Runs at 16:10 weekdays, after DailyTranscriptionWorker (16:00).
  Uses Claude Messages API with prompt caching (playbook as cached system message).
  """

  use Oban.Worker, queue: :default, max_attempts: 2

  require Logger

  @impl true
  def perform(%Oban.Job{args: args}) do
    date = parse_date(Map.get(args || %{}, "date", Date.utc_today() |> Date.to_iso8601()))

    agents = list_agents()
    Logger.info("CoachReportWorker: generating reports for #{length(agents)} agents on #{date}")

    Enum.each(agents, fn agent ->
      generate_report(agent, date)
    end)

    :ok
  end

  def generate_report(agent, date) do
    calls = collect_data(agent.id, date)

    if calls == [] do
      Logger.info("CoachReportWorker: no calls for #{agent.name} on #{date}, skipping")
    else
      history = collect_history(agent.id, date)
      playbook = get_active_playbook()
      goals = get_agent_goals(agent.id)

      playbook_text = format_playbook(playbook)
      prompt = build_prompt(calls, history, goals, agent.name)

      case call_claude(prompt, playbook_text) do
        {:ok, html_report} ->
          structured = extract_structured_data(calls, history)
          save_report(agent.id, date, html_report, structured)
          Logger.info("CoachReportWorker: report saved for #{agent.name}")

        {:error, reason} ->
          Logger.warning("CoachReportWorker: failed for #{agent.name}: #{inspect(reason)}")
      end
    end
  end

  # --- Data collection ---

  def collect_data(user_id, date) do
    {:ok, %{rows: rows}} =
      Saleflow.Repo.query("""
        SELECT pc.id, pc.transcription_analysis, pc.duration, pc.call_summary,
               pc.talk_ratio_seller, pc.sentiment, pc.scorecard_avg,
               cl.outcome::text, pc.received_at
        FROM phone_calls pc
        LEFT JOIN call_logs cl ON cl.id = pc.call_log_id
        WHERE pc.user_id = $1
          AND pc.received_at::date = $2
          AND pc.transcription_analysis IS NOT NULL
        ORDER BY pc.received_at ASC
      """, [Ecto.UUID.dump!(user_id), date])

    Enum.map(rows, fn [id, analysis_json, duration, summary, talk_ratio, sentiment, score_avg, outcome, received_at] ->
      analysis = case Jason.decode(analysis_json || "{}") do
        {:ok, parsed} -> parsed
        _ -> %{}
      end

      %{
        id: Ecto.UUID.load!(id),
        analysis: analysis,
        duration: duration,
        summary: summary,
        talk_ratio_seller: talk_ratio,
        sentiment: sentiment,
        scorecard_avg: score_avg,
        outcome: outcome,
        received_at: received_at
      }
    end)
  end

  def collect_history(user_id, date) do
    start_date = Date.add(date, -14)

    {:ok, %{rows: rows}} =
      Saleflow.Repo.query("""
        SELECT date, score_avg, call_count, score_breakdown, talk_ratio_avg,
               focus_area, focus_area_score_today, meeting_count, conversion_rate
        FROM agent_daily_reports
        WHERE user_id = $1 AND date >= $2 AND date < $3
        ORDER BY date ASC
      """, [Ecto.UUID.dump!(user_id), start_date, date])

    Enum.map(rows, fn [d, avg, count, breakdown, talk_ratio, focus, focus_score, meetings, conv] ->
      %{
        date: d,
        score_avg: avg,
        call_count: count,
        score_breakdown: breakdown,
        talk_ratio_avg: talk_ratio,
        focus_area: focus,
        focus_area_score_today: focus_score,
        meeting_count: meetings,
        conversion_rate: conv
      }
    end)
  end

  # --- Claude prompt ---

  def build_prompt(calls, history, goals, agent_name) do
    calls_json = Jason.encode!(Enum.map(calls, fn c ->
      %{
        id: c.id,
        scorecard: c.analysis["scorecard"],
        score: c.analysis["score"],
        summary: c.summary || c.analysis["summary"],
        talk_ratio_seller: c.talk_ratio_seller,
        sentiment: c.sentiment,
        scorecard_avg: c.scorecard_avg,
        outcome: c.outcome,
        keywords: c.analysis["keywords"],
        customer_needs: c.analysis["customer_needs"],
        objections: c.analysis["objections"],
        positive_signals: c.analysis["positive_signals"],
        duration: c.duration,
        received_at: c.received_at
      }
    end))

    history_json = Jason.encode!(history)
    goals_text = format_goals(goals)
    yesterday_focus = get_yesterday_focus(history)

    """
    Generera en personaliserad daglig coaching-rapport för #{agent_name}.

    DAGENS SAMTAL (JSON):
    #{calls_json}

    HISTORIK (senaste 14 dagar, JSON):
    #{history_json}

    #{goals_text}

    #{if yesterday_focus, do: "IGÅRS FOKUSOMRADE: #{yesterday_focus}", else: ""}

    GENERERA EN KOMPLETT HTML-RAPPORT med dessa sektioner:

    1. DAGSSAMMANFATTNING — KPIs (samtal, möten, konvertering, snittbetyg, talk ratio). Jämför med igår och veckogenomsnitt.

    2. SCORECARD-ÖVERSIKT — 5 kategorier med snittbetyg. Visa SVG sparkline-trend (5 dagar) om historik finns. Markera bästa och sämsta kategori.

    3. UPPFÖLJNING FRAN IGAR — Om igårs fokusområde finns: "Igår sa jag X. Idag ser jag Y." Var specifik med siffror.

    4. DAGENS BÄSTA SAMTAL (top 3) — Scorecard-betyg, sammanfattning, vad som var bra med citat. Inkludera referenslänk: /api/calls/{call_id}/recording

    5. DAGENS SVAGASTE SAMTAL (bottom 3) — Betyg, vad som gick fel, konkret förslag med playbook-referens. Inkludera referenslänk.

    6. KEYWORD INTELLIGENCE — Konkurrenter som nämndes, vanligaste invändningar, köpsignaler.

    7. FOKUS IMORGON — EN specifik scorecard-fråga att förbättra. Koppling till playbook med exakt fras. "Imorgon: Fokusera på X. Testa: 'Y'."

    8. VECKOTREND — SVG bar chart (inline) med 5 kategorier x 5 dagars data. Markera trender.

    KRAV:
    - All CSS inline (inga <style> block)
    - SVG charts inline (inga externa resurser)
    - Max-width: 600px, font-family: -apple-system, sans-serif
    - Färger: #4F46E5 (accent), #059669 (bra), #DC2626 (dåligt), #F59E0B (varning)
    - Referenslänkar till inspelningar: /api/calls/{call_id}/recording
    - Svara BARA med HTML, inget annat. Ingen ```html``` markdown.
    """
  end

  # --- Claude API ---

  defp call_claude(prompt, playbook_text) do
    api_key = Application.get_env(:saleflow, :anthropic_api_key, "")

    body = Jason.encode!(%{
      model: "claude-sonnet-4-20250514",
      max_tokens: 16000,
      system: [%{
        type: "text",
        text: "Du är en erfaren AI-säljcoach. #{playbook_text}",
        cache_control: %{type: "ephemeral"}
      }],
      messages: [%{role: "user", content: prompt}]
    })

    case http_client().post("https://api.anthropic.com/v1/messages",
           body: body,
           headers: [
             {"x-api-key", api_key},
             {"anthropic-version", "2023-06-01"},
             {"anthropic-beta", "prompt-caching-2024-07-31"},
             {"content-type", "application/json"}
           ],
           receive_timeout: 180_000
         ) do
      {:ok, %{status: 200, body: %{"content" => [%{"text" => html} | _]}}} ->
        {:ok, html}
      {:ok, %{status: s, body: b}} ->
        {:error, "Claude #{s}: #{inspect(b)}"}
      {:error, reason} ->
        {:error, reason}
    end
  end

  defp http_client do
    Application.get_env(:saleflow, :coach_http_client, Req)
  end

  # --- Save ---

  def save_report(user_id, date, html_report, structured) do
    score_breakdown_json = if structured.score_breakdown, do: Jason.encode!(structured.score_breakdown), else: nil
    competitors_json = if structured.top_competitors, do: Jason.encode!(structured.top_competitors), else: nil
    objections_json = if structured.top_objections, do: Jason.encode!(structured.top_objections), else: nil

    Saleflow.Repo.query("""
      INSERT INTO agent_daily_reports
        (id, user_id, date, report, score_avg, call_count,
         score_breakdown, talk_ratio_avg, sentiment_positive_pct,
         meeting_count, conversion_rate, focus_area, focus_area_score_today,
         previous_focus_followed_up, top_competitors, top_objections, inserted_at)
      VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11, $12, $13, $14::jsonb, $15::jsonb, NOW())
      ON CONFLICT (user_id, date)
      DO UPDATE SET report = $3, score_avg = $4, call_count = $5,
        score_breakdown = $6::jsonb, talk_ratio_avg = $7, sentiment_positive_pct = $8,
        meeting_count = $9, conversion_rate = $10, focus_area = $11,
        focus_area_score_today = $12, previous_focus_followed_up = $13,
        top_competitors = $14::jsonb, top_objections = $15::jsonb
    """, [
      Ecto.UUID.dump!(user_id), date, html_report,
      structured.score_avg, structured.call_count,
      score_breakdown_json, structured.talk_ratio_avg,
      structured.sentiment_positive_pct, structured.meeting_count,
      structured.conversion_rate, structured.focus_area,
      structured.focus_area_score_today, structured.previous_focus_followed_up,
      competitors_json, objections_json
    ])
  end

  # --- Helpers ---

  def extract_structured_data(calls, history) do
    scores = calls |> Enum.map(& &1.scorecard_avg) |> Enum.filter(&is_number/1)
    talk_ratios = calls |> Enum.map(& &1.talk_ratio_seller) |> Enum.filter(&is_number/1)
    sentiments = calls |> Enum.map(& &1.sentiment) |> Enum.filter(& &1 == "positive")
    meetings = calls |> Enum.count(& &1.outcome == "meeting_booked")
    total = length(calls)

    focus = find_weakest_category(calls)
    yesterday = List.last(history)
    prev_focus = if yesterday, do: yesterday.focus_area, else: nil
    followed_up = prev_focus != nil

    {competitors, objections} = extract_keywords(calls)

    %{
      score_avg: if(scores != [], do: Float.round(Enum.sum(scores) / length(scores), 1), else: nil),
      call_count: total,
      score_breakdown: calculate_category_averages(calls),
      talk_ratio_avg: if(talk_ratios != [], do: Float.round(Enum.sum(talk_ratios) / length(talk_ratios), 1), else: nil),
      sentiment_positive_pct: if(total > 0, do: Float.round(length(sentiments) / total * 100, 1), else: nil),
      meeting_count: meetings,
      conversion_rate: if(total > 0, do: Float.round(meetings / total * 100, 1), else: 0.0),
      focus_area: focus,
      focus_area_score_today: nil,
      previous_focus_followed_up: followed_up,
      top_competitors: competitors,
      top_objections: objections
    }
  end

  def find_weakest_category(calls) do
    calls
    |> Enum.flat_map(fn c ->
      case c.analysis["scorecard"] do
        %{} = sc -> Map.keys(sc) |> Enum.map(fn k -> {k, get_category_avg(sc[k])} end)
        _ -> []
      end
    end)
    |> Enum.group_by(fn {k, _} -> k end, fn {_, v} -> v end)
    |> Enum.map(fn {k, scores} ->
      valid = Enum.filter(scores, &is_number/1)
      {k, if(valid != [], do: Enum.sum(valid) / length(valid), else: 10)}
    end)
    |> Enum.min_by(fn {_, avg} -> avg end, fn -> {"opening", 0} end)
    |> elem(0)
  end

  def get_category_avg(%{"avg" => avg}) when is_number(avg), do: avg
  def get_category_avg(_), do: nil

  def calculate_category_averages(calls) do
    categories = ["opening", "discovery", "pitch", "objection_handling", "closing"]

    Enum.into(categories, %{}, fn cat ->
      scores =
        calls
        |> Enum.map(fn c -> get_in(c.analysis, ["scorecard", cat, "avg"]) end)
        |> Enum.filter(&is_number/1)

      avg = if scores != [], do: Float.round(Enum.sum(scores) / length(scores), 1), else: nil
      {cat, avg}
    end)
  end

  def extract_keywords(calls) do
    competitors =
      calls
      |> Enum.flat_map(fn c -> get_in(c.analysis, ["keywords", "competitors"]) || [] end)
      |> Enum.frequencies_by(fn k -> k["keyword"] || k["name"] end)

    objections =
      calls
      |> Enum.flat_map(fn c -> c.analysis["objections"] || [] end)
      |> Enum.frequencies()

    {competitors, objections}
  end

  def get_yesterday_focus([]), do: nil
  def get_yesterday_focus(history) do
    case List.last(history) do
      %{focus_area: f} when is_binary(f) -> f
      _ -> nil
    end
  end

  defp format_playbook(nil), do: ""
  defp format_playbook(pb) do
    """
    PLAYBOOK:
    Oppning: #{pb.opening}
    Pitch: #{pb.pitch}
    Invandningar: #{pb.objections}
    Avslut: #{pb.closing}
    Riktlinjer: #{pb.guidelines}
    """
  end

  defp format_goals([]), do: ""
  defp format_goals(goals) do
    text = Enum.map(goals, fn g -> "- #{g.metric}: #{g.target_value} per #{g.period}" end) |> Enum.join("\n")
    "AGENTENS MAL:\n#{text}"
  end

  defp get_active_playbook do
    case Saleflow.Repo.query("SELECT opening, pitch, objections, closing, guidelines FROM playbooks WHERE active = true LIMIT 1") do
      {:ok, %{rows: [[o, p, ob, c, g]]}} -> %{opening: o, pitch: p, objections: ob, closing: c, guidelines: g}
      _ -> nil
    end
  end

  defp get_agent_goals(user_id) do
    case Saleflow.Repo.query("SELECT metric, target_value, period FROM goals WHERE user_id = $1 AND active = true", [Ecto.UUID.dump!(user_id)]) do
      {:ok, %{rows: rows}} -> Enum.map(rows, fn [m, t, p] -> %{metric: m, target_value: t, period: p} end)
      _ -> []
    end
  end

  defp list_agents do
    case Saleflow.Repo.query("SELECT id, name FROM users WHERE role = 'agent'") do
      {:ok, %{rows: rows}} -> Enum.map(rows, fn [id, name] -> %{id: Ecto.UUID.load!(id), name: name} end)
      _ -> []
    end
  end

  def parse_date(date) when is_binary(date), do: Date.from_iso8601!(date)
  def parse_date(%Date{} = d), do: d
end
