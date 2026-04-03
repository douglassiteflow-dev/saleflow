defmodule Saleflow.Stats do
  @moduledoc """
  Single source of truth for daily stats.

  All dashboard components, leaderboard, and goal progress
  use these functions. DRY — one definition per metric.

  Definitions:
  - **Samtal idag**: phone_calls med received_at::date = today
  - **Möten bokade idag**: meetings med inserted_at::date = today AND status != 'cancelled'
    (om man cancellar samma dag försvinner den, men att cancella ett gammalt möte påverkar inte idag)
  - **Konvertering**: möten bokade idag / samtal idag × 100
  """

  alias Saleflow.Repo

  # ---------------------------------------------------------------------------
  # Per-user stats
  # ---------------------------------------------------------------------------

  @doc "Antal utgående samtal idag för en specifik agent."
  def calls_today(user_id) do
    uid = Ecto.UUID.dump!(user_id)
    today = Date.utc_today()

    {:ok, %{rows: [[count]]}} =
      Repo.query(
        "SELECT COUNT(*) FROM phone_calls WHERE user_id = $1 AND received_at::date = $2 AND direction = 'outgoing'",
        [uid, today]
      )

    count
  end

  @doc "Totalt antal utgående samtal för en specifik agent."
  def total_calls(user_id) do
    uid = Ecto.UUID.dump!(user_id)

    {:ok, %{rows: [[count]]}} =
      Repo.query("SELECT COUNT(*) FROM phone_calls WHERE user_id = $1 AND direction = 'outgoing'", [uid])

    count
  end

  @doc "Antal möten bokade idag för en specifik agent."
  def meetings_booked_today(user_id) do
    uid = Ecto.UUID.dump!(user_id)
    today = Date.utc_today()

    {:ok, %{rows: [[count]]}} =
      Repo.query(
        "SELECT COUNT(*) FROM meetings WHERE user_id = $1 AND inserted_at::date = $2 AND status != 'cancelled'",
        [uid, today]
      )

    count
  end

  @doc "Totalt antal möten för en specifik agent."
  def total_meetings(user_id) do
    uid = Ecto.UUID.dump!(user_id)

    {:ok, %{rows: [[count]]}} =
      Repo.query("SELECT COUNT(*) FROM meetings WHERE user_id = $1 AND status != 'cancelled'", [uid])

    count
  end

  # ---------------------------------------------------------------------------
  # Global stats (admin)
  # ---------------------------------------------------------------------------

  @doc "Totalt antal utgående samtal idag (alla agenter)."
  def all_calls_today do
    today = Date.utc_today()

    {:ok, %{rows: [[count]]}} =
      Repo.query("SELECT COUNT(*) FROM phone_calls WHERE received_at::date = $1 AND direction = 'outgoing'", [today])

    count
  end

  @doc "Totalt antal utgående samtal (alla agenter, all tid)."
  def all_total_calls do
    {:ok, %{rows: [[count]]}} = Repo.query("SELECT COUNT(*) FROM phone_calls WHERE direction = 'outgoing'")
    count
  end

  @doc "Totalt antal möten bokade idag (alla agenter)."
  def all_meetings_booked_today do
    today = Date.utc_today()

    {:ok, %{rows: [[count]]}} =
      Repo.query(
        "SELECT COUNT(*) FROM meetings WHERE inserted_at::date = $1 AND status != 'cancelled'",
        [today]
      )

    count
  end

  @doc "Totalt antal möten (alla agenter, all tid)."
  def all_total_meetings do
    {:ok, %{rows: [[count]]}} =
      Repo.query("SELECT COUNT(*) FROM meetings WHERE status != 'cancelled'")

    count
  end

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

  # ---------------------------------------------------------------------------
  # Computed metrics
  # ---------------------------------------------------------------------------

  @doc "Konverteringsgrad: möten bokade idag / samtal idag × 100."
  def conversion_rate(calls, meetings) do
    if calls == 0,
      do: 0.0,
      else: Float.round(meetings / calls * 100, 1)
  end

  # ---------------------------------------------------------------------------
  # Leaderboard
  # ---------------------------------------------------------------------------

  @doc "Leaderboard-data för alla agenter."
  def leaderboard do
    query = """
    SELECT u.id, u.name,
      COALESCE(c.cnt, 0) as calls_today,
      COALESCE(m.booked, 0) as meetings_booked_today,
      COALESCE(m.cancelled, 0) as meetings_cancelled_today,
      COALESCE(m.booked, 0) as net_meetings_today
    FROM users u
    LEFT JOIN (
      SELECT user_id, COUNT(*) as cnt
      FROM phone_calls
      WHERE received_at::date = CURRENT_DATE AND direction = 'outgoing'
      GROUP BY user_id
    ) c ON c.user_id = u.id
    LEFT JOIN (
      SELECT user_id,
        COUNT(*) FILTER (WHERE status != 'cancelled') as booked,
        COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled
      FROM meetings
      WHERE inserted_at::date = CURRENT_DATE
      GROUP BY user_id
    ) m ON m.user_id = u.id
    WHERE u.role = 'agent' OR (c.cnt > 0 OR m.booked > 0)
    ORDER BY COALESCE(m.booked, 0) DESC,
             COALESCE(c.cnt, 0) DESC
    """

    {:ok, %{rows: rows}} = Repo.query(query)

    Enum.map(rows, fn [id, name, calls, booked, cancelled, net] ->
      %{
        user_id: Ecto.UUID.cast!(id),
        name: name,
        calls_today: calls,
        meetings_booked_today: booked,
        meetings_cancelled_today: cancelled,
        net_meetings_today: net
      }
    end)
  end
end
