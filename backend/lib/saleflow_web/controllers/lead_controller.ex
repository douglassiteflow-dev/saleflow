defmodule SaleflowWeb.LeadController do
  use SaleflowWeb, :controller

  alias Saleflow.Sales
  alias Saleflow.Audit
  alias Saleflow.Accounts

  @doc """
  List or search leads. Pass `?q=term` to search by company name.
  """
  def index(conn, params) do
    user = conn.assigns.current_user
    q = params["q"]

    {:ok, all_leads} =
      if is_binary(q) and byte_size(q) > 0,
        do: Sales.search_leads(q),
        else: Sales.list_leads()

    # Agents only see leads they have active assignments or callbacks for
    leads =
      case user.role do
        :admin -> all_leads
        _ ->
          my_lead_ids = get_agent_lead_ids(user.id)
          Enum.filter(all_leads, fn l ->
            l.id in my_lead_ids
          end)
      end

    json(conn, %{leads: Enum.map(leads, &serialize_lead/1)})
  end

  defp get_agent_lead_ids(user_id) do
    # Get leads from active + recent assignments
    {:ok, %{rows: rows}} = Saleflow.Repo.query(
      "SELECT DISTINCT lead_id FROM assignments WHERE user_id = $1",
      [Ecto.UUID.dump!(user_id)]
    )
    Enum.map(rows, fn [id] -> Saleflow.Sales.decode_uuid(id) end)
  end

  @doc """
  Show a single lead with its call logs and audit trail.
  Agents see only their own calls and audit entries; admins see all.
  """
  def show(conn, %{"id" => id}) do
    user = conn.assigns.current_user

    with {:ok, lead} <- Sales.get_lead(id),
         {:ok, all_calls} <- Sales.list_calls_for_lead(id),
         {:ok, all_audit} <- Audit.list_for_resource("Lead", id) do
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
        lead: serialize_lead(lead),
        calls: Enum.map(calls, &serialize_call(&1, user_names, user)),
        audit_logs: Enum.map(audit_logs, &serialize_audit_log(&1, user_names, user))
      })
    else
      {:error, _} ->
        conn |> put_status(:not_found) |> json(%{error: "Lead not found"})
    end
  end

  @doc """
  Get the next lead from the queue for the current agent.
  """
  def next(conn, _params) do
    user = conn.assigns.current_user

    case Sales.get_next_lead(user) do
      {:ok, nil} ->
        json(conn, %{lead: nil})

      {:ok, lead} ->
        json(conn, %{lead: serialize_lead(lead)})
    end
  end

  @doc """
  Update editable fields on a lead (e.g. telefon_2).
  """
  def update(conn, %{"id" => id} = params) do
    with {:ok, lead} <- Sales.get_lead(id),
         {:ok, updated} <- Sales.update_lead_fields(lead, %{telefon_2: params["telefon_2"]}) do
      json(conn, %{lead: serialize_lead(updated)})
    else
      {:error, _} ->
        conn |> put_status(:unprocessable_entity) |> json(%{error: "Failed to update lead"})
    end
  end

  @doc """
  Submit an outcome for a lead: logs the call, releases the assignment,
  updates lead status, and optionally creates a meeting or quarantine.
  """
  def outcome(conn, %{"id" => id, "outcome" => outcome} = params) do
    user = conn.assigns.current_user

    with {:ok, lead} <- Sales.get_lead(id),
         {:ok, _call} <- Sales.log_call(%{
           lead_id: lead.id,
           user_id: user.id,
           outcome: String.to_existing_atom(outcome),
           notes: params["notes"]
         }),
         :ok <- release_active(user),
         {:ok, _lead} <- apply_outcome(lead, outcome, user, params) do
      json(conn, %{ok: true})
    else
      {:error, message} when is_binary(message) ->
        conn |> put_status(:unprocessable_entity) |> json(%{error: message})

      {:error, _reason} ->
        conn |> put_status(:unprocessable_entity) |> json(%{error: "Failed to process outcome"})
    end
  end

  def outcome(conn, _params) do
    conn |> put_status(:bad_request) |> json(%{error: "id and outcome are required"})
  end

  # ---------------------------------------------------------------------------
  # Outcome logic
  # ---------------------------------------------------------------------------

  defp release_active(user) do
    case Sales.get_active_assignment(user) do
      {:ok, nil} ->
        :ok

      {:ok, assignment} ->
        {:ok, _} = Sales.release_assignment(assignment, :outcome_logged)
        :ok
    end
  end

  defp apply_outcome(lead, "meeting_booked", user, params) do
    meeting_date = parse_date(params["meeting_date"])
    meeting_time = parse_time(params["meeting_time"])

    # Double booking check
    case check_meeting_conflict(user.id, meeting_date, meeting_time) do
      {:error, :conflict, date_str, time_str} ->
        {:error, "Du har redan ett möte den #{date_str} kl #{time_str}"}

      :ok ->
        with {:ok, updated_lead} <- Sales.update_lead_status(lead, %{status: :meeting_booked}) do
          meeting_params = %{
            lead_id: lead.id,
            user_id: user.id,
            title: params["title"] || "Meeting",
            meeting_date: meeting_date,
            meeting_time: meeting_time
          }

          meeting_params =
            if params["meeting_notes"],
              do: Map.put(meeting_params, :notes, params["meeting_notes"]),
              else: meeting_params

          {:ok, meeting} = Sales.create_meeting(meeting_params)

          # Auto-create Teams meeting if user has Microsoft connected and opted in
          if params["create_teams_meeting"] != false do
            try_create_teams_meeting(meeting, user)
          end

          {:ok, updated_lead}
        end
    end
  end

  defp apply_outcome(lead, "callback", _user, params) do
    callback_at =
      case params["callback_at"] do
        nil -> DateTime.utc_now() |> DateTime.add(24, :hour)
        dt_string -> parse_datetime(dt_string)
      end

    Sales.update_lead_status(lead, %{status: :callback, callback_at: callback_at})
  end

  defp apply_outcome(lead, "not_interested", user, _params) do
    # Permanent quarantine — set a far-future date (year 2099) so it never auto-releases
    permanent_until = ~U[2099-12-31 23:59:59Z]

    with {:ok, updated_lead} <- Sales.update_lead_status(lead, %{status: :quarantine, quarantine_until: permanent_until}) do
      {:ok, _q} = Sales.create_quarantine(%{
        lead_id: lead.id,
        user_id: user.id,
        reason: "Not interested"
      })
      {:ok, updated_lead}
    end
  end

  defp apply_outcome(lead, "no_answer", user, _params) do
    # 24h quarantine instead of going back to queue immediately
    quarantine_until = DateTime.utc_now() |> DateTime.add(24, :hour)

    with {:ok, updated_lead} <- Sales.update_lead_status(lead, %{status: :quarantine, quarantine_until: quarantine_until}) do
      {:ok, _q} = Sales.create_quarantine(%{
        lead_id: lead.id,
        user_id: user.id,
        reason: "No answer"
      })
      {:ok, updated_lead}
    end
  end

  defp apply_outcome(lead, "call_later", user, _params) do
    # 24h quarantine — same as no_answer
    quarantine_until = DateTime.utc_now() |> DateTime.add(24, :hour)

    with {:ok, updated_lead} <- Sales.update_lead_status(lead, %{status: :quarantine, quarantine_until: quarantine_until}) do
      {:ok, _q} = Sales.create_quarantine(%{
        lead_id: lead.id,
        user_id: user.id,
        reason: "Call later"
      })
      {:ok, updated_lead}
    end
  end

  defp apply_outcome(lead, "bad_number", _user, _params) do
    Sales.update_lead_status(lead, %{status: :bad_number})
  end

  defp apply_outcome(lead, "customer", _user, _params) do
    Sales.update_lead_status(lead, %{status: :customer})
  end

  defp apply_outcome(_lead, _unknown, _user, _params) do
    {:error, :unknown_outcome}
  end

  # ---------------------------------------------------------------------------
  # Double booking check
  # ---------------------------------------------------------------------------

  defp check_meeting_conflict(user_id, date, time) do
    query = """
    SELECT id FROM meetings
    WHERE user_id = $1 AND meeting_date = $2 AND meeting_time = $3 AND status = 'scheduled'
    """

    case Saleflow.Repo.query(query, [Ecto.UUID.dump!(user_id), date, time]) do
      {:ok, %{rows: []}} ->
        :ok

      {:ok, %{rows: [_ | _]}} ->
        {:error, :conflict, Date.to_iso8601(date), Time.to_string(time) |> String.slice(0, 5)}

      {:error, _} ->
        :ok
    end
  end

  # ---------------------------------------------------------------------------
  # Serializers
  # ---------------------------------------------------------------------------

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

  # Build a user_id => name map for all relevant user_ids.
  # For agents, only their own id is needed (shown as "Du").
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

  defp serialize_call(call, user_names, _current_user) do
    %{
      id: call.id,
      lead_id: call.lead_id,
      user_id: call.user_id,
      user_name: Map.get(user_names, call.user_id),
      outcome: call.outcome,
      notes: call.notes,
      called_at: call.called_at
    }
  end

  defp serialize_audit_log(log, user_names, _current_user) do
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

  # ---------------------------------------------------------------------------
  # Date/time parsing helpers
  # ---------------------------------------------------------------------------

  defp parse_date(nil), do: Date.utc_today() |> Date.add(1)
  defp parse_date(date_string) when is_binary(date_string) do
    case Date.from_iso8601(date_string) do
      {:ok, date} -> date
      _ -> Date.utc_today() |> Date.add(1)
    end
  end

  defp parse_time(nil), do: ~T[10:00:00]
  defp parse_time(time_string) when is_binary(time_string) do
    # HTML time input sends "HH:MM", Time.from_iso8601 requires "HH:MM:SS"
    padded = if String.length(time_string) == 5, do: time_string <> ":00", else: time_string

    case Time.from_iso8601(padded) do
      {:ok, time} -> time
      _ -> ~T[10:00:00]
    end
  end

  # ---------------------------------------------------------------------------
  # Teams meeting auto-creation (best-effort, never blocks outcome)
  # ---------------------------------------------------------------------------

  defp try_create_teams_meeting(meeting, user) do
    require Ash.Query
    alias Saleflow.Microsoft.Graph

    with {:ok, [ms_conn | _]} <-
           Saleflow.Accounts.MicrosoftConnection
           |> Ash.Query.filter(user_id == ^user.id)
           |> Ash.read(),
         {:ok, ms_conn} <- Graph.ensure_fresh_token(ms_conn) do
      start_dt = NaiveDateTime.new!(meeting.meeting_date, meeting.meeting_time)
      end_dt = NaiveDateTime.add(start_dt, 3600)

      case Graph.create_calendar_event(ms_conn.access_token, %{
             subject: meeting.title,
             start_datetime: NaiveDateTime.to_iso8601(start_dt),
             end_datetime: NaiveDateTime.to_iso8601(end_dt)
           }) do
        {:ok, result} ->
          meeting
          |> Ash.Changeset.for_update(:update_teams, %{
            teams_join_url: result.join_url,
            teams_event_id: result.event_id
          })
          |> Ash.update()

        {:error, reason} ->
          require Logger
          Logger.warning("Auto Teams meeting creation failed: #{inspect(reason)}")
          :ok
      end
    else
      _ -> :ok
    end
  end

  defp parse_datetime(dt_string) when is_binary(dt_string) do
    case DateTime.from_iso8601(dt_string) do
      {:ok, dt, _} -> dt
      _ -> DateTime.utc_now() |> DateTime.add(1, :hour)
    end
  end
end
