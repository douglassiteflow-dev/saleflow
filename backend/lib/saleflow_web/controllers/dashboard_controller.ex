defmodule SaleflowWeb.DashboardController do
  use SaleflowWeb, :controller

  alias Saleflow.Sales
  alias Saleflow.Stats
  alias Saleflow.Repo

  import SaleflowWeb.ControllerHelpers, only: [build_global_user_name_map: 0]
  import SaleflowWeb.Serializers

  @doc """
  Combined dashboard endpoint. Returns stats, today's meetings, callbacks, and my_stats
  in a single response. Role-aware: agents see own data, admins see all.
  """
  def leaderboard(conn, _params) do
    json(conn, %{leaderboard: Stats.leaderboard()})
  end

  def index(conn, _params) do
    user = conn.assigns.current_user
    today = Date.utc_today()

    # 1. Lead stats (same as admin/stats but available to all)
    stats = compute_lead_stats()

    # 2. Today's meetings (with lead data)
    {:ok, meetings} =
      case user.role do
        :admin -> Sales.list_all_meetings()
        _ -> Sales.list_all_meetings_for_user(user.id)
      end

    todays_meetings =
      meetings
      |> Enum.filter(fn m -> m.meeting_date == today and m.status == :scheduled end)
      |> enrich_meetings()

    # 3. Callbacks
    callbacks = compute_callbacks(user)

    # 4. My stats (phone_calls-based)
    my_stats = compute_my_stats(user)

    # 5. Conversion KPI (reuses calls/meetings from my_stats)
    conversion = compute_conversion(my_stats)

    # 6. Goal progress
    goal_progress = compute_goal_progress(user)

    json(conn, %{
      stats: stats,
      todays_meetings: todays_meetings,
      callbacks: callbacks,
      my_stats: my_stats,
      conversion: conversion,
      goal_progress: goal_progress
    })
  end

  # ---------------------------------------------------------------------------
  # Private helpers
  # ---------------------------------------------------------------------------

  defp compute_my_stats(user) do
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

  defp compute_conversion(%{calls_today: calls_today, meetings_today: meetings_today}) do
    %{
      calls_today: calls_today,
      meetings_today: meetings_today,
      rate: Stats.conversion_rate(calls_today, meetings_today)
    }
  end

  defp compute_goal_progress(user) do
    case Sales.list_active_goals(user.id) do
      {:ok, goals} ->
        Enum.map(goals, fn goal ->
          current_value = compute_goal_current_value(goal, user)

          %{
            id: goal.id,
            metric: goal.metric,
            period: goal.period,
            target_value: goal.target_value,
            current_value: current_value,
            scope: goal.scope
          }
        end)

      _ ->
        []
    end
  end

  defp compute_goal_current_value(%{metric: :calls_per_day, period: :daily}, user) do
    Stats.calls_today(user.id)
  end

  defp compute_goal_current_value(%{metric: :meetings_per_week, period: :weekly}, user) do
    uid = Ecto.UUID.dump!(user.id)
    today = Date.utc_today()
    start_of_week = Date.add(today, -(Date.day_of_week(today) - 1))

    {:ok, %{rows: [[count]]}} =
      Repo.query(
        "SELECT COUNT(*) FROM meetings WHERE user_id = $1 AND inserted_at::date >= $2 AND inserted_at::date <= $3 AND status != 'cancelled'",
        [uid, start_of_week, today]
      )

    count
  end

  defp compute_goal_current_value(_goal, _user), do: 0

  defp compute_lead_stats, do: Stats.lead_stats()

  defp compute_callbacks(user) do
    require Ash.Query

    {:ok, all_leads} =
      Saleflow.Sales.Lead
      |> Ash.Query.filter(status == :callback)
      |> Ash.Query.sort(callback_at: :asc)
      |> Ash.read()

    leads =
      case user.role do
        :admin ->
          all_leads

        _ ->
          # Agent: only leads they have assignments for
          {:ok, %{rows: rows}} =
            Repo.query(
              "SELECT DISTINCT lead_id FROM assignments WHERE user_id = $1",
              [Ecto.UUID.dump!(user.id)]
            )

          my_lead_ids =
            Enum.map(rows, fn [id] -> Saleflow.Sales.decode_uuid(id) end)

          Enum.filter(all_leads, fn l -> l.id in my_lead_ids end)
      end

    Enum.map(leads, &serialize_lead/1)
  end

  defp enrich_meetings(meetings) do
    lead_ids = meetings |> Enum.map(& &1.lead_id) |> Enum.uniq()

    lead_map =
      Enum.reduce(lead_ids, %{}, fn lid, acc ->
        case Sales.get_lead(lid) do
          {:ok, lead} -> Map.put(acc, lid, lead)
          _ -> acc
        end
      end)

    user_names = build_global_user_name_map()

    Enum.map(meetings, fn m ->
      lead = Map.get(lead_map, m.lead_id)
      serialize_meeting_with_lead(m, lead, user_names)
    end)
  end
end
