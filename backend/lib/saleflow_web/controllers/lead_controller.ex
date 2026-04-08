defmodule SaleflowWeb.LeadController do
  use SaleflowWeb, :controller

  alias Saleflow.Sales
  alias Saleflow.Audit
  alias Saleflow.Accounts

  import SaleflowWeb.ControllerHelpers
  import SaleflowWeb.Serializers

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
  List leads with callback status, sorted by callback_at ascending.
  Admins see all; agents see only their assigned callbacks.
  """
  def callbacks(conn, _params) do
    user = conn.assigns.current_user
    require Ash.Query

    {:ok, leads} =
      Saleflow.Sales.Lead
      |> Ash.Query.filter(status == :callback)
      |> Ash.Query.sort(callback_at: :asc)
      |> Ash.read()

    filtered =
      case user.role do
        :admin -> leads
        _ ->
          my_lead_ids = get_agent_lead_ids(user.id)
          Enum.filter(leads, fn l -> l.id in my_lead_ids end)
      end

    json(conn, %{callbacks: Enum.map(filtered, &serialize_lead/1)})
  end

  @doc """
  Show a single lead with its call logs and audit trail.
  Agents see only their own calls and audit entries; admins see all.
  """
  def show(conn, %{"id" => id}) do
    user = conn.assigns.current_user

    with {:ok, lead} <- Sales.get_lead(id),
         {:ok, all_calls} <- Sales.list_calls_for_lead(id),
         {:ok, all_audit} <- Audit.list_for_resource("Lead", id),
         {:ok, contacts} <- Sales.list_contacts_for_lead(id) do
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
        audit_logs: Enum.map(audit_logs, &serialize_audit_log(&1, user_names, user)),
        contacts: Enum.map(contacts, &serialize_contact/1)
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
    fields =
      %{}
      |> maybe_put(:telefon_2, params["telefon_2"])
      |> maybe_put(:epost, params["epost"])
      |> maybe_put(:hemsida, params["hemsida"])

    with {:ok, lead} <- Sales.get_lead(id),
         {:ok, updated} <- Sales.update_lead_fields(lead, fields) do
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
  @valid_outcomes ~w(meeting_booked callback not_interested no_answer call_later bad_number customer skipped other)

  def outcome(conn, %{"id" => id, "outcome" => outcome} = params) do
    if outcome not in @valid_outcomes do
      conn |> put_status(422) |> json(%{error: "Ogiltigt outcome: #{outcome}"})
    else
      user = conn.assigns.current_user
      outcome_atom = String.to_existing_atom(outcome)

      with {:ok, lead} <- Sales.get_lead(id),
           {:ok, call_log} <- Sales.log_call(%{
             lead_id: lead.id,
             user_id: user.id,
             outcome: outcome_atom,
             notes: params["notes"]
           }),
         :ok <- Sales.link_phone_call_to_log(user.id, call_log.id),
         {:ok, phone_call} <- create_outcome_phone_call(user, lead, call_log, params),
         :ok <- release_active(user),
         {:ok, _lead} <- apply_outcome(lead, outcome, user, params) do

      # Broadcast dashboard update so stats refresh in real-time
      broadcast_dashboard_update("call_completed")

      # Schedule recording fetch + transcription in background
      if phone_call do
        require Logger

        try do
          %{phone_call_id: phone_call.id, user_id: user.id}
          |> Saleflow.Workers.RecordingFetchWorker.new(schedule_in: 15)
          |> Oban.insert()

          # Transcribe meeting_booked calls (after recording is fetched)
          if outcome == "meeting_booked" do
            %{phone_call_id: phone_call.id}
            |> Saleflow.Workers.TranscriptionWorker.new(schedule_in: 45)
            |> Oban.insert()
          end
        rescue
          e ->
            Logger.warning("LeadController.outcome: failed to enqueue background job: #{inspect(e)}")
        catch
          kind, e ->
            Logger.warning("LeadController.outcome: caught #{kind} in background job enqueue: #{inspect(e)}")
        end
      end

      json(conn, %{ok: true})
    else
      {:error, message} when is_binary(message) ->
        conn |> put_status(:unprocessable_entity) |> json(%{error: message})

      {:error, _reason} ->
        conn |> put_status(:unprocessable_entity) |> json(%{error: "Failed to process outcome"})
    end
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

  defp create_outcome_phone_call(user, lead, call_log, params) do
    duration = parse_call_duration(params["duration"])
    caller = if is_binary(user.extension_number) and user.extension_number != "", do: user.extension_number, else: "unknown"
    callee = if is_binary(lead.telefon) and lead.telefon != "", do: lead.telefon, else: "unknown"

    case Sales.create_phone_call(%{
      caller: caller,
      callee: callee,
      duration: duration,
      user_id: user.id,
      direction: :outgoing,
      lead_id: lead.id,
      call_log_id: call_log.id
    }) do
      {:ok, phone_call} -> {:ok, phone_call}
      {:error, reason} ->
        require Logger
        Logger.warning("LeadController.outcome: failed to create phone_call: #{inspect(reason)}")
        {:ok, nil}
    end
  end

  defp parse_call_duration(nil), do: 0
  defp parse_call_duration(val) when is_integer(val), do: val
  defp parse_call_duration(val) when is_float(val), do: round(val)
  defp parse_call_duration(val) when is_binary(val) do
    case Integer.parse(val) do
      {n, _} -> n
      :error -> 0
    end
  end
  defp parse_call_duration(_), do: 0

  defp apply_outcome(lead, "meeting_booked", user, params) do
    meeting_date = parse_date_with_default(params["meeting_date"])
    meeting_time = parse_time_with_default(params["meeting_time"])

    # Double booking check
    case check_meeting_conflict(user.id, meeting_date, meeting_time) do
      {:error, :conflict, date_str, time_str} ->
        {:error, "Du har redan ett möte den #{date_str} kl #{time_str}"}

      :ok ->
        with {:ok, updated_lead} <- Sales.update_lead_status(lead, %{status: :meeting_booked}) do
          default_title = "Möte med #{lead.företag}"
          duration = parse_duration(params["meeting_duration"])

          meeting_params = %{
            lead_id: lead.id,
            user_id: user.id,
            title: params["title"] || default_title,
            meeting_date: meeting_date,
            meeting_time: meeting_time,
            duration_minutes: duration
          }

          meeting_params =
            if params["meeting_notes"],
              do: Map.put(meeting_params, :notes, params["meeting_notes"]),
              else: meeting_params

          meeting_params =
            if params["customer_email"],
              do: Map.put(meeting_params, :attendee_email, params["customer_email"]),
              else: meeting_params

          meeting_params =
            if params["customer_name"],
              do: Map.put(meeting_params, :attendee_name, params["customer_name"]),
              else: meeting_params

          {:ok, meeting} = Sales.create_meeting(meeting_params)

          # Auto-create or reuse deal for this lead
          deal =
            case Sales.get_active_deal_for_lead(lead.id) do
              {:ok, nil} ->
                {:ok, new_deal} = Sales.create_deal(%{lead_id: lead.id, user_id: user.id})
                new_deal

              {:ok, existing_deal} ->
                existing_deal
            end

          # Link meeting to deal
          {:ok, meeting} = Sales.update_meeting(meeting, %{deal_id: deal.id})

          # Auto-create Teams meeting if user has Microsoft connected and opted in
          if params["create_teams_meeting"] != false do
            attendee_overrides = %{
              email: params["customer_email"],
              name: params["customer_name"]
            }
            try_create_teams_meeting(meeting, lead, user, attendee_overrides)
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
    apply_quarantine_outcome(lead, user, ~U[2099-12-31 23:59:59Z], "Not interested")
  end

  defp apply_outcome(lead, "no_answer", user, _params) do
    # 24h quarantine instead of going back to queue immediately
    apply_quarantine_outcome(lead, user, DateTime.utc_now() |> DateTime.add(24, :hour), "No answer")
  end

  defp apply_outcome(lead, "call_later", user, _params) do
    # 24h quarantine — same as no_answer
    apply_quarantine_outcome(lead, user, DateTime.utc_now() |> DateTime.add(24, :hour), "Call later")
  end

  defp apply_outcome(lead, "skipped", user, _params) do
    # Short quarantine — lead goes back into queue after 1 hour
    apply_quarantine_outcome(lead, user, DateTime.utc_now() |> DateTime.add(1, :hour), "Skipped")
  end

  defp apply_quarantine_outcome(lead, user, quarantine_until, reason) do
    with {:ok, updated_lead} <- Sales.update_lead_status(lead, %{status: :quarantine, quarantine_until: quarantine_until}) do
      {:ok, _q} = Sales.create_quarantine(%{
        lead_id: lead.id,
        user_id: user.id,
        reason: reason
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
  # Serializers (local, controller-specific)
  # ---------------------------------------------------------------------------

  defp serialize_call(call, user_names, _current_user) do
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
  # Date/time parsing with defaults (specific to outcome/meeting booking)
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

  defp try_create_teams_meeting(meeting, lead, user, attendee_overrides) do
    require Ash.Query
    alias Saleflow.Microsoft.Graph

    # Skip if meeting already has a Teams link
    if meeting.teams_join_url do
      :ok
    else
      try_create_teams_meeting_inner(meeting, lead, user, attendee_overrides)
    end
  end

  defp try_create_teams_meeting_inner(meeting, lead, user, attendee_overrides) do
    require Ash.Query
    require Logger
    alias Saleflow.Microsoft.Graph

    Logger.info("Teams: attempting to create meeting for user #{user.id}")

    with {:ok, [ms_conn | _]} <-
           (Logger.info("Teams: looking up MS connection for user #{user.id}")
           Saleflow.Accounts.MicrosoftConnection
           |> Ash.Query.filter(user_id == ^user.id)
           |> Ash.read()),
         {:ok, ms_conn} <- Graph.ensure_fresh_token(ms_conn) do
      Logger.info("Teams: MS connection found, token fresh. Creating event...")
      duration_secs = (meeting.duration_minutes || 30) * 60
      start_dt = NaiveDateTime.new!(meeting.meeting_date, meeting.meeting_time)
      end_dt = NaiveDateTime.add(start_dt, duration_secs)

      description_parts = [
        "Möte med #{lead.företag}",
        if(lead.telefon, do: "Telefon: #{lead.telefon}", else: nil),
        if(lead.vd_namn, do: "VD: #{lead.vd_namn}", else: nil),
        if(lead.bransch, do: "Bransch: #{lead.bransch}", else: nil),
        if(lead.stad, do: "Stad: #{lead.stad}", else: nil)
      ]
      description = description_parts |> Enum.reject(&is_nil/1) |> Enum.join("\n")

      event_params = %{
        subject: meeting.title,
        start_datetime: NaiveDateTime.to_iso8601(start_dt),
        end_datetime: NaiveDateTime.to_iso8601(end_dt),
        description: description,
        attendee_email: attendee_overrides[:email] || lead.epost,
        attendee_name: attendee_overrides[:name] || lead.vd_namn || lead.företag
      }

      try do
        Logger.info("Teams: calling Graph API with attendee=#{event_params.attendee_email}")

        case Graph.create_meeting_with_invite(ms_conn.access_token, event_params) do
          {:ok, result} ->
            Logger.info("Teams: meeting created! join_url=#{result.join_url}")

            meeting
            |> Ash.Changeset.for_update(:update_teams, %{
              teams_join_url: result.join_url,
              teams_event_id: result.event_id
            })
            |> Ash.update()

            Saleflow.Audit.create_log(%{
              user_id: user.id,
              action: "teams.meeting_created",
              resource_type: "Meeting",
              resource_id: meeting.id
            })

          {:error, reason} ->
            Logger.warning("Teams: Graph API returned error: #{inspect(reason)}")
            :ok
        end
      rescue
        e ->
          Logger.error("Teams: CRASHED during Graph API call: #{inspect(e)}")
          :ok
      end
    else
      {:ok, []} ->
        Logger.info("Teams: no Microsoft connection found for user #{user.id} — skipping")
        :ok
      {:error, reason} ->
        Logger.warning("Teams: failed to get MS connection or refresh token: #{inspect(reason)}")
        :ok
      other ->
        Logger.warning("Teams: unexpected result: #{inspect(other)}")
        :ok
    end
  end

  defp parse_duration(nil), do: 30
  defp parse_duration(val) when is_integer(val) and val > 0, do: val
  defp parse_duration(val) when is_binary(val) do
    case Integer.parse(val) do
      {n, _} when n > 0 -> n
      _ -> 30
    end
  end
  defp parse_duration(_), do: 30

  defp parse_datetime(dt_string) when is_binary(dt_string) do
    case DateTime.from_iso8601(dt_string) do
      {:ok, dt, _} -> dt
      _ -> DateTime.utc_now() |> DateTime.add(1, :hour)
    end
  end

  # ---------------------------------------------------------------------------
  # Lead comments
  # ---------------------------------------------------------------------------

  def comments(conn, %{"id" => lead_id}) do
    {:ok, comments} =
      Saleflow.Sales.LeadComment
      |> Ash.Query.for_read(:for_lead, %{lead_id: lead_id})
      |> Ash.read()

    {:ok, users} = Accounts.list_users()
    user_names = Map.new(users, fn u -> {u.id, u.name} end)

    json(conn, %{
      comments:
        Enum.map(comments, fn c ->
          %{
            id: c.id,
            lead_id: c.lead_id,
            user_id: c.user_id,
            user_name: Map.get(user_names, c.user_id, "Okänd"),
            text: c.text,
            inserted_at: c.inserted_at
          }
        end)
    })
  end

  def create_comment(conn, %{"id" => lead_id, "text" => text}) do
    user = conn.assigns.current_user

    case Saleflow.Sales.LeadComment
         |> Ash.Changeset.for_create(:create, %{lead_id: lead_id, user_id: user.id, text: text})
         |> Ash.create() do
      {:ok, comment} ->
        conn |> put_status(201) |> json(%{ok: true, id: comment.id})

      {:error, _} ->
        conn |> put_status(422) |> json(%{error: "Kunde inte spara kommentar"})
    end
  end

  # ---------------------------------------------------------------------------
  # Lead contacts
  # ---------------------------------------------------------------------------

  @doc """
  List all contacts for a lead.
  """
  def list_contacts(conn, %{"lead_id" => lead_id}) do
    case Sales.list_contacts_for_lead(lead_id) do
      {:ok, contacts} ->
        json(conn, %{contacts: Enum.map(contacts, &serialize_contact/1)})

      {:error, _} ->
        conn |> put_status(:not_found) |> json(%{error: "Lead not found"})
    end
  end

  @doc """
  Create a new contact for a lead.
  """
  def create_contact(conn, %{"lead_id" => lead_id} = params) do
    contact_params = %{
      lead_id: lead_id,
      name: params["name"],
      role: params["role"],
      phone: params["phone"],
      email: params["email"]
    }

    case Sales.create_contact(contact_params) do
      {:ok, contact} ->
        conn |> put_status(201) |> json(%{contact: serialize_contact(contact)})

      {:error, _} ->
        conn |> put_status(422) |> json(%{error: "Kunde inte skapa kontakt"})
    end
  end

  defp serialize_contact(contact) do
    %{
      id: contact.id,
      lead_id: contact.lead_id,
      name: contact.name,
      role: contact.role,
      phone: contact.phone,
      email: contact.email,
      inserted_at: contact.inserted_at,
      updated_at: contact.updated_at
    }
  end
end
