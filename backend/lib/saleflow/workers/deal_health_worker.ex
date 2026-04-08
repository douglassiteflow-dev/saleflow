defmodule Saleflow.Workers.DealHealthWorker do
  @moduledoc """
  Calculates health scores (1-100) for active DemoConfigs.
  Runs at 16:15 weekdays, after coaching reports.

  Health score is an average of up to 4 signals:
  1. stage_freshness — days in current stage (stagnation = bad)
  2. call_activity — recent calls for the lead
  3. latest_sentiment — from phone_calls.sentiment
  4. scorecard_trend — improving scores = good

  If no signals produce data, defaults to 50.
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

  @doc """
  Calculates health score (1-100) for a DemoConfig.
  Averages all non-nil signal scores. Returns 50 if no data.
  """
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

  @doc """
  Stage freshness: how long in current stage (stagnation = bad).
  Returns a score 20-90 based on stage and days since last update.
  """
  def stage_freshness(%{stage: stage, updated_at: updated_at}) do
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

      _ ->
        50
    end
  end

  @doc """
  Call activity: recent calls (last 14 days) for the lead.
  More calls = healthier deal. Returns 20 (no calls) to 90 (many calls).
  """
  def call_activity(%{lead_id: lead_id}) do
    case Saleflow.Repo.query(
           """
           SELECT COUNT(*), MAX(received_at) FROM phone_calls
           WHERE lead_id = $1 AND received_at > NOW() - INTERVAL '14 days'
           """,
           [Ecto.UUID.dump!(lead_id)]
         ) do
      {:ok, %{rows: [[count, _latest]]}} when count > 0 ->
        min(90, 40 + count * 10)

      _ ->
        20
    end
  end

  @doc """
  Latest call sentiment for the lead.
  positive=90, neutral=60, negative=25, missing=nil (excluded from average).
  """
  def latest_sentiment(%{lead_id: lead_id}) do
    case Saleflow.Repo.query(
           """
           SELECT sentiment FROM phone_calls
           WHERE lead_id = $1 AND sentiment IS NOT NULL
           ORDER BY received_at DESC LIMIT 1
           """,
           [Ecto.UUID.dump!(lead_id)]
         ) do
      {:ok, %{rows: [["positive"]]}} -> 90
      {:ok, %{rows: [["neutral"]]}} -> 60
      {:ok, %{rows: [["negative"]]}} -> 25
      _ -> nil
    end
  end

  @doc """
  Scorecard trend: compares recent vs older scorecard_avg values.
  Improving = 85, slightly up = 70, flat = 55, declining = 35.
  Returns nil if fewer than 2 scores available.
  """
  def scorecard_trend(%{lead_id: lead_id}) do
    case Saleflow.Repo.query(
           """
           SELECT scorecard_avg FROM phone_calls
           WHERE lead_id = $1 AND scorecard_avg IS NOT NULL
           ORDER BY received_at DESC LIMIT 3
           """,
           [Ecto.UUID.dump!(lead_id)]
         ) do
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

      _ ->
        nil
    end
  end

  @doc false
  def list_active_configs do
    case Saleflow.Repo.query("""
         SELECT id, lead_id, stage, updated_at FROM demo_configs
         WHERE stage NOT IN ('cancelled')
         """) do
      {:ok, %{rows: rows}} ->
        Enum.map(rows, fn [id, lid, stage, updated] ->
          %{
            id: Ecto.UUID.load!(id),
            lead_id: Ecto.UUID.load!(lid),
            stage: stage,
            updated_at: updated
          }
        end)

      _ ->
        []
    end
  end

  @doc false
  def save_score(config_id, score) do
    Saleflow.Repo.query(
      "UPDATE demo_configs SET health_score = $1 WHERE id = $2",
      [score, Ecto.UUID.dump!(config_id)]
    )
  end
end
