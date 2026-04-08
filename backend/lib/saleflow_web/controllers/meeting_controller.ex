defmodule SaleflowWeb.MeetingController do
  use SaleflowWeb, :controller

  alias Saleflow.Sales
  alias Saleflow.Audit

  import SaleflowWeb.ControllerHelpers
  import SaleflowWeb.Serializers

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
      meeting_date: parse_date_with_default(params["meeting_date"]),
      meeting_time: parse_time_with_default(params["meeting_time"]),
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
        |> maybe_put(:meeting_date, parse_date(params["meeting_date"]))
        |> maybe_put(:meeting_time, parse_time(params["meeting_time"]))
        |> maybe_put(:notes, params["notes"])
        |> maybe_put(:status, parse_status(params["status"]))

      case Sales.update_meeting(meeting, update_params) do
        {:ok, updated} ->
          # Auto-advance DemoConfig when meeting completed
          if updated.status == :completed and meeting.status != :completed do
            maybe_advance_demo_config(updated)
          end

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

  defp enrich_meetings(meetings) do
    lead_ids = meetings |> Enum.map(& &1.lead_id) |> Enum.uniq()
    lead_map = build_lead_map(lead_ids)
    user_names = build_global_user_name_map()

    Enum.map(meetings, fn m ->
      lead = Map.get(lead_map, m.lead_id)
      serialize_meeting_with_lead(m, lead, user_names)
    end)
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

  # ---------------------------------------------------------------------------
  # Date/time parsing with defaults (specific to meeting creation)
  # ---------------------------------------------------------------------------

  defp parse_date_with_default(nil), do: Date.utc_today() |> Date.add(1)

  defp parse_date_with_default(date_string) when is_binary(date_string) do
    case Date.from_iso8601(date_string) do
      {:ok, date} -> date
      _ -> Date.utc_today() |> Date.add(1)
    end
  end

  defp parse_time_with_default(nil), do: ~T[10:00:00]

  defp parse_time_with_default(time_string) when is_binary(time_string) do
    padded = if String.length(time_string) == 5, do: time_string <> ":00", else: time_string

    case Time.from_iso8601(padded) do
      {:ok, time} -> time
      _ -> ~T[10:00:00]
    end
  end

  defp parse_status(nil), do: nil
  defp parse_status("scheduled"), do: :scheduled
  defp parse_status("completed"), do: :completed
  defp parse_status("cancelled"), do: :cancelled
  defp parse_status(_), do: nil

  # ---------------------------------------------------------------------------
  # Auto-advance DemoConfig when meeting completed
  # ---------------------------------------------------------------------------

  defp maybe_advance_demo_config(meeting) do
    dc = case find_active_demo_config(meeting.lead_id) do
      nil ->
        # Skapa DemoConfig i followup-stage (mötet genomfört = redo för uppföljning)
        case Sales.create_demo_config(%{
          lead_id: meeting.lead_id,
          user_id: meeting.user_id
        }) do
          {:ok, new_dc} ->
            # Avancera direkt till followup
            case Sales.start_generation(new_dc) do
              {:ok, gen_dc} ->
                case Sales.generation_complete(gen_dc, %{website_path: nil, preview_url: nil}) do
                  {:ok, ready_dc} -> Sales.advance_to_followup(ready_dc) |> elem(1)
                  _ -> new_dc
                end
              _ -> new_dc
            end
          _ -> nil
        end

      dc ->
        # Advance demo_ready → followup
        if dc.stage == :demo_ready do
          case Sales.advance_to_followup(dc) do
            {:ok, updated} -> updated
            _ -> dc
          end
        else
          dc
        end
    end

    if dc do
      # Koppla mötet till demo-configen
      Sales.update_meeting(meeting, %{demo_config_id: dc.id})
      # Skapa notifikation
      create_meeting_completed_notification(meeting, dc)
    end
  end

  defp create_meeting_completed_notification(meeting, demo_config) do
    require Ash.Query

    # Get lead name
    lead_name =
      case Saleflow.Repo.query("SELECT företag FROM leads WHERE id = $1", [Ecto.UUID.dump!(meeting.lead_id)]) do
        {:ok, %{rows: [[name]]}} -> name
        _ -> "Kund"
      end

    message =
      case demo_config.stage do
        s when s in [:demo_ready, "demo_ready"] ->
          "Demo klar för #{lead_name} — dags för uppföljning"
        s when s in [:followup, "followup"] ->
          "Möte genomfört med #{lead_name} — fortsätt uppföljning"
        _ ->
          "Möte genomfört med #{lead_name}"
      end

    Saleflow.Repo.query("""
      INSERT INTO notifications (id, user_id, title, message, type, resource_type, resource_id, inserted_at, updated_at)
      VALUES (gen_random_uuid(), $1, $2, $3, 'meeting_completed', 'DemoConfig', $4, NOW(), NOW())
    """, [
      Ecto.UUID.dump!(meeting.user_id),
      "Möte genomfört",
      message,
      Ecto.UUID.dump!(demo_config.id)
    ])
  end
end
