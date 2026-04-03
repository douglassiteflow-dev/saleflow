defmodule SaleflowWeb.DashboardController do
  use SaleflowWeb, :controller

  alias Saleflow.Sales
  alias Saleflow.Accounts
  alias Saleflow.Repo

  @doc """
  Combined dashboard endpoint. Returns stats, today's meetings, callbacks, and my_stats
  in a single response. Role-aware: agents see own data, admins see all.
  """
  def leaderboard(conn, _params) do
    query = """
    SELECT u.id, u.name,
      COALESCE(c.calls_today, 0) as calls_today,
      COALESCE(m.booked_today, 0) as meetings_booked_today,
      COALESCE(m.cancelled_today, 0) as meetings_cancelled_today,
      COALESCE(m.booked_today, 0) - COALESCE(m.cancelled_today, 0) as net_meetings_today
    FROM users u
    LEFT JOIN (
      SELECT user_id, COUNT(*) as calls_today
      FROM phone_calls
      WHERE received_at::date = CURRENT_DATE
      GROUP BY user_id
    ) c ON c.user_id = u.id
    LEFT JOIN (
      SELECT user_id,
        COUNT(*) as booked_today,
        COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled_today
      FROM meetings
      WHERE inserted_at::date = CURRENT_DATE
      GROUP BY user_id
    ) m ON m.user_id = u.id
    WHERE u.role = 'agent' OR (c.calls_today > 0 OR m.booked_today > 0)
    ORDER BY COALESCE(m.booked_today, 0) - COALESCE(m.cancelled_today, 0) DESC,
             COALESCE(c.calls_today, 0) DESC
    """

    {:ok, %{rows: rows, columns: _cols}} = Repo.query(query)

    entries =
      Enum.map(rows, fn [id, name, calls_today, meetings_booked_today, meetings_cancelled_today, net_meetings_today] ->
        %{
          user_id: Ecto.UUID.cast!(id),
          name: name,
          calls_today: calls_today,
          meetings_booked_today: meetings_booked_today,
          meetings_cancelled_today: meetings_cancelled_today,
          net_meetings_today: net_meetings_today
        }
      end)

    json(conn, %{leaderboard: entries})
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
    today = Date.utc_today()

    {calls_today, total_calls, meetings_today, total_meetings} =
      case user.role do
        :admin ->
          {:ok, %{rows: [[ct]]}} =
            Repo.query("SELECT COUNT(*) FROM phone_calls WHERE received_at::date = $1", [today])

          {:ok, %{rows: [[tc]]}} =
            Repo.query("SELECT COUNT(*) FROM phone_calls", [])

          {:ok, %{rows: [[mt]]}} =
            Repo.query(
              "SELECT COUNT(*) FROM meetings WHERE inserted_at::date = $1",
              [today]
            )

          {:ok, %{rows: [[tm]]}} =
            Repo.query("SELECT COUNT(*) FROM meetings", [])

          {ct, tc, mt, tm}

        _ ->
          uid = Ecto.UUID.dump!(user.id)

          {:ok, %{rows: [[ct]]}} =
            Repo.query(
              "SELECT COUNT(*) FROM phone_calls WHERE user_id = $1 AND received_at::date = $2",
              [uid, today]
            )

          {:ok, %{rows: [[tc]]}} =
            Repo.query("SELECT COUNT(*) FROM phone_calls WHERE user_id = $1", [uid])

          {:ok, %{rows: [[mt]]}} =
            Repo.query(
              "SELECT COUNT(*) FROM meetings WHERE user_id = $1 AND inserted_at::date = $2",
              [uid, today]
            )

          {:ok, %{rows: [[tm]]}} =
            Repo.query(
              "SELECT COUNT(*) FROM meetings WHERE user_id = $1",
              [uid]
            )

          {ct, tc, mt, tm}
      end

    %{
      calls_today: calls_today,
      total_calls: total_calls,
      meetings_today: meetings_today,
      total_meetings: total_meetings
    }
  end

  defp compute_conversion(%{calls_today: calls_today, meetings_today: meetings_today}) do
    rate =
      if calls_today == 0,
        do: 0.0,
        else: Float.round(meetings_today / calls_today * 100, 1)

    %{
      calls_today: calls_today,
      meetings_today: meetings_today,
      rate: rate
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
    today = Date.utc_today()
    uid = Ecto.UUID.dump!(user.id)

    {:ok, %{rows: [[count]]}} =
      Repo.query(
        "SELECT COUNT(*) FROM phone_calls WHERE user_id = $1 AND received_at::date = $2",
        [uid, today]
      )

    count
  end

  defp compute_goal_current_value(%{metric: :meetings_per_week, period: :weekly}, user) do
    uid = Ecto.UUID.dump!(user.id)
    today = Date.utc_today()
    start_of_week = Date.add(today, -(Date.day_of_week(today) - 1))

    {:ok, %{rows: [[count]]}} =
      Repo.query(
        "SELECT COUNT(*) FROM meetings WHERE user_id = $1 AND meeting_date >= $2 AND meeting_date <= $3 AND status != 'cancelled'",
        [uid, start_of_week, today]
      )

    count
  end

  defp compute_goal_current_value(_goal, _user), do: 0

  defp compute_lead_stats do
    query = """
    SELECT status, COUNT(*) as count
    FROM leads
    GROUP BY status
    ORDER BY status
    """

    {:ok, %{rows: rows}} = Repo.query(query)

    by_status =
      Enum.into(rows, %{}, fn [status, count] ->
        {status, count}
      end)

    total = Enum.reduce(rows, 0, fn [_status, count], acc -> acc + count end)

    %{
      "total_leads" => total,
      "new" => 0,
      "assigned" => 0,
      "callback" => 0,
      "meeting_booked" => 0,
      "quarantine" => 0,
      "bad_number" => 0,
      "customer" => 0
    }
    |> Map.merge(by_status)
  end

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

    user_names =
      case Accounts.list_users() do
        {:ok, users} -> Enum.into(users, %{}, fn u -> {u.id, u.name} end)
        _ -> %{}
      end

    Enum.map(meetings, fn m ->
      lead = Map.get(lead_map, m.lead_id)
      serialize_meeting_with_lead(m, lead, user_names)
    end)
  end

  defp serialize_meeting_with_lead(meeting, nil, user_names) do
    serialize_meeting(meeting)
    |> Map.put(:user_name, Map.get(user_names, meeting.user_id))
    |> Map.put(:lead, nil)
  end

  defp serialize_meeting_with_lead(meeting, lead, user_names) do
    serialize_meeting(meeting)
    |> Map.put(:user_name, Map.get(user_names, meeting.user_id))
    |> Map.put(:lead, %{
      id: lead.id,
      företag: lead.företag,
      telefon: lead.telefon,
      adress: lead.adress,
      postnummer: lead.postnummer,
      stad: lead.stad,
      bransch: lead.bransch,
      omsättning_tkr: lead.omsättning_tkr,
      vd_namn: lead.vd_namn,
      källa: lead.källa,
      status: lead.status
    })
  end

  defp serialize_meeting(meeting) do
    %{
      id: meeting.id,
      lead_id: meeting.lead_id,
      user_id: meeting.user_id,
      title: meeting.title,
      meeting_date: meeting.meeting_date,
      meeting_time: meeting.meeting_time,
      notes: meeting.notes,
      status: meeting.status,
      reminded_at: meeting.reminded_at,
      attendee_email: meeting.attendee_email,
      attendee_name: meeting.attendee_name,
      updated_at: meeting.updated_at,
      inserted_at: meeting.inserted_at
    }
  end

  defp serialize_lead(lead) do
    %{
      id: lead.id,
      företag: lead.företag,
      telefon: lead.telefon,
      epost: lead.epost,
      hemsida: lead.hemsida,
      adress: lead.adress,
      postnummer: lead.postnummer,
      stad: lead.stad,
      bransch: lead.bransch,
      orgnr: lead.orgnr,
      omsättning_tkr: lead.omsättning_tkr,
      vinst_tkr: lead.vinst_tkr,
      anställda: lead.anställda,
      vd_namn: lead.vd_namn,
      bolagsform: lead.bolagsform,
      status: lead.status,
      quarantine_until: lead.quarantine_until,
      callback_at: lead.callback_at,
      källa: lead.källa,
      lead_list_id: lead.lead_list_id,
      imported_at: lead.imported_at,
      inserted_at: lead.inserted_at,
      updated_at: lead.updated_at
    }
  end
end
