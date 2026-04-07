defmodule SaleflowWeb.MeetingController do
  use SaleflowWeb, :controller

  alias Saleflow.Sales
  alias Saleflow.Accounts
  alias Saleflow.Audit

  @doc """
  List meetings.
  Agents see only their own meetings; admins see all.
  Returns meetings enriched with lead data and user_name.
  """
  def index(conn, _params) do
    user = conn.assigns.current_user

    {:ok, meetings} =
      case user.role do
        :admin -> Sales.list_all_meetings()
        _ -> Sales.list_all_meetings_for_user(user.id)
      end

    enriched = enrich_meetings(meetings)
    json(conn, %{meetings: enriched})
  end

  @doc """
  Show a single meeting with lead data, calls, and audit trail.
  Agents can only see their own meetings.
  """
  def show(conn, %{"id" => id}) do
    user = conn.assigns.current_user

    with {:ok, meeting} <- get_meeting(id),
         :ok <- check_ownership(meeting, user),
         {:ok, lead} <- Sales.get_lead(meeting.lead_id),
         {:ok, all_calls} <- Sales.list_calls_for_lead(meeting.lead_id),
         {:ok, all_audit} <- Audit.list_for_resource("Lead", meeting.lead_id) do
      {calls, audit_logs} =
        case user.role do
          :admin ->
            {all_calls, all_audit}

          _ ->
            filtered_calls = Enum.filter(all_calls, fn c -> c.user_id == user.id end)
            filtered_audit = Enum.filter(all_audit, fn a -> a.user_id == user.id end)
            {filtered_calls, filtered_audit}
        end

      user_names = build_user_name_map(calls, audit_logs, user)

      json(conn, %{
        meeting: serialize_meeting_with_lead(meeting, lead, user_names),
        lead: serialize_lead(lead),
        calls: Enum.map(calls, &serialize_call(&1, user_names)),
        audit_logs: Enum.map(audit_logs, &serialize_audit_log(&1, user_names))
      })
    else
      {:error, :not_found} ->
        conn |> put_status(:not_found) |> json(%{error: "Meeting not found"})

      {:error, :forbidden} ->
        conn |> put_status(:forbidden) |> json(%{error: "Access denied"})

      {:error, _} ->
        conn |> put_status(:not_found) |> json(%{error: "Meeting not found"})
    end
  end

  @doc """
  Create a new meeting.
  """
  def create(conn, params) do
    user = conn.assigns.current_user

    meeting_params = %{
      lead_id: params["lead_id"],
      user_id: user.id,
      title: params["title"],
      meeting_date: parse_date(params["meeting_date"]),
      meeting_time: parse_time(params["meeting_time"]),
      notes: params["notes"]
    }

    case Sales.create_meeting(meeting_params) do
      {:ok, meeting} ->
        meeting = maybe_link_demo_config(meeting, params, user)
        broadcast_dashboard_update("meeting_created")

        conn
        |> put_status(:created)
        |> json(%{meeting: serialize_meeting(meeting)})

      {:error, _} ->
        conn
        |> put_status(:unprocessable_entity)
        |> json(%{error: "Failed to create meeting"})
    end
  end

  @doc """
  Update a meeting (date, time, notes, status).
  Agents can only update their own meetings.
  """
  def update(conn, %{"id" => id} = params) do
    user = conn.assigns.current_user

    with {:ok, meeting} <- get_meeting(id),
         :ok <- check_ownership(meeting, user) do
      update_params =
        %{}
        |> maybe_put(:meeting_date, parse_date_optional(params["meeting_date"]))
        |> maybe_put(:meeting_time, parse_time_optional(params["meeting_time"]))
        |> maybe_put(:notes, params["notes"])
        |> maybe_put(:status, parse_status(params["status"]))

      case Sales.update_meeting(meeting, update_params) do
        {:ok, updated} ->
          broadcast_dashboard_update("meeting_updated")
          json(conn, %{meeting: serialize_meeting(updated)})

        {:error, _} ->
          conn
          |> put_status(:unprocessable_entity)
          |> json(%{error: "Failed to update meeting"})
      end
    else
      {:error, :not_found} ->
        conn |> put_status(:not_found) |> json(%{error: "Meeting not found"})

      {:error, :forbidden} ->
        conn |> put_status(:forbidden) |> json(%{error: "Access denied"})
    end
  end

  @doc """
  Cancel a meeting by ID.
  """
  def cancel(conn, %{"id" => id}) do
    user = conn.assigns.current_user

    with {:ok, meeting} <- get_meeting(id),
         :ok <- check_ownership(meeting, user),
         {:ok, cancelled} <- Sales.cancel_meeting(meeting) do
      # If all meetings for this deal are cancelled, cancel the deal too
      if cancelled.deal_id, do: maybe_cancel_deal(cancelled.deal_id)

      broadcast_dashboard_update("meeting_cancelled")
      json(conn, %{meeting: serialize_meeting(cancelled)})
    else
      {:error, :not_found} ->
        conn |> put_status(:not_found) |> json(%{error: "Meeting not found"})

      {:error, :forbidden} ->
        conn |> put_status(:forbidden) |> json(%{error: "Access denied"})
    end
  end

  defp maybe_cancel_deal(deal_id) do
    with {:ok, deal} <- Sales.get_deal(deal_id),
         {:ok, meetings} <- Sales.list_meetings_for_deal(deal_id) do
      all_cancelled = Enum.all?(meetings, fn m -> m.status == :cancelled end)

      if all_cancelled and deal.stage not in [:won, :cancelled] do
        Sales.cancel_deal(deal)
      end
    end
  end

  # ---------------------------------------------------------------------------
  # DemoConfig auto-linking
  # ---------------------------------------------------------------------------

  defp maybe_link_demo_config(meeting, %{"source_url" => source_url}, user)
       when is_binary(source_url) and source_url != "" do
    case find_active_demo_config(meeting.lead_id) do
      nil ->
        # Create new DemoConfig, enqueue generation, link to meeting
        case Sales.create_demo_config(%{
               lead_id: meeting.lead_id,
               user_id: user.id,
               source_url: source_url
             }) do
          {:ok, demo_config} ->
            %{"demo_config_id" => demo_config.id}
            |> Saleflow.Workers.DemoGenerationWorker.new()
            |> Oban.insert()

            link_meeting_to_demo_config(meeting, demo_config.id)

          {:error, _} ->
            meeting
        end

      existing ->
        link_meeting_to_demo_config(meeting, existing.id)
    end
  end

  defp maybe_link_demo_config(meeting, _params, _user) do
    case find_active_demo_config(meeting.lead_id) do
      nil -> meeting
      existing -> link_meeting_to_demo_config(meeting, existing.id)
    end
  end

  defp find_active_demo_config(lead_id) do
    require Ash.Query

    Saleflow.Sales.DemoConfig
    |> Ash.Query.filter(lead_id == ^lead_id and stage != :cancelled)
    |> Ash.Query.sort(inserted_at: :desc)
    |> Ash.Query.limit(1)
    |> Ash.read!()
    |> List.first()
  end

  defp link_meeting_to_demo_config(meeting, demo_config_id) do
    case Sales.update_meeting(meeting, %{demo_config_id: demo_config_id}) do
      {:ok, updated} -> updated
      {:error, _} -> meeting
    end
  end

  # ---------------------------------------------------------------------------
  # Helpers
  # ---------------------------------------------------------------------------

  defp get_meeting(id) do
    case Ash.get(Saleflow.Sales.Meeting, id) do
      {:ok, meeting} -> {:ok, meeting}
      {:error, _} -> {:error, :not_found}
    end
  end

  defp check_ownership(_meeting, %{role: :admin}), do: :ok

  defp check_ownership(meeting, user) do
    if meeting.user_id == user.id do
      :ok
    else
      {:error, :forbidden}
    end
  end

  defp enrich_meetings(meetings) do
    # Build lead_id -> lead map
    lead_ids = meetings |> Enum.map(& &1.lead_id) |> Enum.uniq()

    lead_map =
      Enum.reduce(lead_ids, %{}, fn lid, acc ->
        case Sales.get_lead(lid) do
          {:ok, lead} -> Map.put(acc, lid, lead)
          _ -> acc
        end
      end)

    # Build user_id -> name map
    user_names = build_global_user_name_map()

    Enum.map(meetings, fn m ->
      lead = Map.get(lead_map, m.lead_id)
      serialize_meeting_with_lead(m, lead, user_names)
    end)
  end

  defp build_global_user_name_map do
    case Accounts.list_users() do
      {:ok, users} -> Enum.into(users, %{}, fn u -> {u.id, u.name} end)
      _ -> %{}
    end
  end

  defp build_user_name_map(_calls, _audit_logs, %{role: :agent} = user) do
    %{user.id => "Du"}
  end

  defp build_user_name_map(calls, audit_logs, _admin_user) do
    call_ids = Enum.map(calls, & &1.user_id)
    audit_ids = Enum.map(audit_logs, & &1.user_id)

    user_ids =
      (call_ids ++ audit_ids)
      |> Enum.reject(&is_nil/1)
      |> Enum.uniq()

    case user_ids do
      [] ->
        %{}

      _ ->
        {:ok, users} = Accounts.list_users()
        Enum.into(users, %{}, fn u -> {u.id, u.name} end)
    end
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
      duration_minutes: meeting.duration_minutes,
      status: meeting.status,
      reminded_at: meeting.reminded_at,
      teams_join_url: meeting.teams_join_url,
      teams_event_id: meeting.teams_event_id,
      attendee_email: meeting.attendee_email,
      attendee_name: meeting.attendee_name,
      demo_config_id: meeting.demo_config_id,
      updated_at: meeting.updated_at,
      inserted_at: meeting.inserted_at
    }
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
      epost: lead.epost,
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

  defp serialize_lead(lead) do
    %{
      id: lead.id,
      företag: lead.företag,
      telefon: lead.telefon,
      telefon_2: lead.telefon_2,
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

  defp serialize_call(call, user_names) do
    {duration, has_recording, phone_call_id, transcription, transcription_analysis} = get_call_phone_data(call.id)

    %{
      id: call.id,
      lead_id: call.lead_id,
      user_id: call.user_id,
      user_name: Map.get(user_names, call.user_id),
      outcome: call.outcome,
      notes: call.notes,
      called_at: call.called_at,
      duration: duration,
      has_recording: has_recording,
      phone_call_id: phone_call_id,
      transcription: transcription,
      transcription_analysis: transcription_analysis
    }
  end

  defp get_call_phone_data(call_log_id) do
    case Saleflow.Repo.query(
           "SELECT COALESCE(SUM(duration), 0), bool_or(recording_key IS NOT NULL), (SELECT id FROM phone_calls WHERE call_log_id = $1 AND recording_key IS NOT NULL LIMIT 1), (SELECT transcription FROM phone_calls WHERE call_log_id = $1 AND transcription IS NOT NULL LIMIT 1), (SELECT transcription_analysis FROM phone_calls WHERE call_log_id = $1 AND transcription_analysis IS NOT NULL LIMIT 1) FROM phone_calls WHERE call_log_id = $1",
           [Ecto.UUID.dump!(call_log_id)]
         ) do
      {:ok, %{rows: [[dur, has_rec, pc_id, transcription, analysis]]}} ->
        {to_int(dur), has_rec || false, pc_id && Saleflow.Sales.decode_uuid(pc_id), transcription, analysis}
      _ -> {0, false, nil, nil}
    end
  end

  defp to_int(nil), do: 0
  defp to_int(%Decimal{} = d), do: Decimal.to_integer(d)
  defp to_int(n) when is_integer(n), do: n
  defp to_int(_), do: 0

  defp serialize_audit_log(log, user_names) do
    %{
      id: log.id,
      user_id: log.user_id,
      user_name: Map.get(user_names, log.user_id),
      action: log.action,
      resource_type: log.resource_type,
      resource_id: log.resource_id,
      changes: log.changes,
      metadata: log.metadata,
      inserted_at: log.inserted_at
    }
  end

  defp broadcast_dashboard_update(event) do
    Phoenix.PubSub.broadcast(
      Saleflow.PubSub,
      "dashboard:updates",
      {:dashboard_update, %{event: event}}
    )
  end

  defp maybe_put(map, _key, nil), do: map
  defp maybe_put(map, key, value), do: Map.put(map, key, value)

  defp parse_date(nil), do: Date.utc_today() |> Date.add(1)

  defp parse_date(date_string) when is_binary(date_string) do
    case Date.from_iso8601(date_string) do
      {:ok, date} -> date
      _ -> Date.utc_today() |> Date.add(1)
    end
  end

  defp parse_date_optional(nil), do: nil

  defp parse_date_optional(date_string) when is_binary(date_string) do
    case Date.from_iso8601(date_string) do
      {:ok, date} -> date
      _ -> nil
    end
  end

  defp parse_time(nil), do: ~T[10:00:00]

  defp parse_time(time_string) when is_binary(time_string) do
    case Time.from_iso8601(time_string) do
      {:ok, time} -> time
      _ -> ~T[10:00:00]
    end
  end

  defp parse_time_optional(nil), do: nil

  defp parse_time_optional(time_string) when is_binary(time_string) do
    case Time.from_iso8601(time_string) do
      {:ok, time} -> time
      _ -> nil
    end
  end

  defp parse_status(nil), do: nil
  defp parse_status("scheduled"), do: :scheduled
  defp parse_status("completed"), do: :completed
  defp parse_status("cancelled"), do: :cancelled
  defp parse_status(_), do: nil
end
