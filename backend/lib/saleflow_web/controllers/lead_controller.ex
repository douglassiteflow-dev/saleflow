defmodule SaleflowWeb.LeadController do
  use SaleflowWeb, :controller

  alias Saleflow.Sales
  alias Saleflow.Audit

  @doc """
  List or search leads. Pass `?q=term` to search by company name.
  """
  def index(conn, %{"q" => q}) when is_binary(q) and byte_size(q) > 0 do
    case Sales.search_leads(q) do
      {:ok, leads} ->
        json(conn, %{leads: Enum.map(leads, &serialize_lead/1)})

      # coveralls-ignore-start
      {:error, _} ->
        conn |> put_status(:internal_server_error) |> json(%{error: "Failed to search leads"})
      # coveralls-ignore-stop
    end
  end

  def index(conn, _params) do
    case Sales.list_leads() do
      {:ok, leads} ->
        json(conn, %{leads: Enum.map(leads, &serialize_lead/1)})

      # coveralls-ignore-start
      {:error, _} ->
        conn |> put_status(:internal_server_error) |> json(%{error: "Failed to list leads"})
      # coveralls-ignore-stop
    end
  end

  @doc """
  Show a single lead with its call logs and audit trail.
  """
  def show(conn, %{"id" => id}) do
    with {:ok, lead} <- Sales.get_lead(id),
         {:ok, calls} <- Sales.list_calls_for_lead(id),
         {:ok, audit_logs} <- Audit.list_for_resource("Lead", id) do
      json(conn, %{
        lead: serialize_lead(lead),
        calls: Enum.map(calls, &serialize_call/1),
        audit_logs: Enum.map(audit_logs, &serialize_audit_log/1)
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

      # coveralls-ignore-start
      {:error, _} ->
        conn |> put_status(:internal_server_error) |> json(%{error: "Failed to get next lead"})
      # coveralls-ignore-stop
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
      {:ok, nil} -> :ok
      {:ok, assignment} ->
        case Sales.release_assignment(assignment, :outcome_logged) do
          {:ok, _} -> :ok
          # coveralls-ignore-next-line
          error -> error
        end
      # coveralls-ignore-next-line
      error -> error
    end
  end

  defp apply_outcome(lead, "meeting_booked", user, params) do
    with {:ok, updated_lead} <- Sales.update_lead_status(lead, %{status: :meeting_booked}) do
      # Also create the meeting
      meeting_params = %{
        lead_id: lead.id,
        user_id: user.id,
        title: params["title"] || "Meeting",
        meeting_date: parse_date(params["meeting_date"]),
        meeting_time: parse_time(params["meeting_time"])
      }

      meeting_params =
        if params["meeting_notes"],
          do: Map.put(meeting_params, :notes, params["meeting_notes"]),
          else: meeting_params

      case Sales.create_meeting(meeting_params) do
        {:ok, _meeting} -> {:ok, updated_lead}
        # coveralls-ignore-next-line
        error -> error
      end
    end
  end

  defp apply_outcome(lead, "callback", _user, params) do
    callback_at =
      case params["callback_at"] do
        nil -> DateTime.utc_now() |> DateTime.add(1, :hour)
        dt_string -> parse_datetime(dt_string)
      end

    Sales.update_lead_status(lead, %{status: :callback, callback_at: callback_at})
  end

  defp apply_outcome(lead, "not_interested", user, _params) do
    with {:ok, updated_lead} <- Sales.update_lead_status(lead, %{status: :quarantine}) do
      case Sales.create_quarantine(%{
        lead_id: lead.id,
        user_id: user.id,
        reason: "Not interested"
      }) do
        {:ok, _q} -> {:ok, updated_lead}
        # coveralls-ignore-next-line
        error -> error
      end
    end
  end

  defp apply_outcome(lead, "no_answer", _user, _params) do
    Sales.update_lead_status(lead, %{status: :new})
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
  # Serializers
  # ---------------------------------------------------------------------------

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
      imported_at: lead.imported_at,
      inserted_at: lead.inserted_at,
      updated_at: lead.updated_at
    }
  end

  defp serialize_call(call) do
    %{
      id: call.id,
      lead_id: call.lead_id,
      user_id: call.user_id,
      outcome: call.outcome,
      notes: call.notes,
      called_at: call.called_at
    }
  end

  defp serialize_audit_log(log) do
    %{
      id: log.id,
      user_id: log.user_id,
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
    case Time.from_iso8601(time_string) do
      {:ok, time} -> time
      _ -> ~T[10:00:00]
    end
  end

  defp parse_datetime(dt_string) when is_binary(dt_string) do
    case DateTime.from_iso8601(dt_string) do
      {:ok, dt, _} -> dt
      _ -> DateTime.utc_now() |> DateTime.add(1, :hour)
    end
  end
end
