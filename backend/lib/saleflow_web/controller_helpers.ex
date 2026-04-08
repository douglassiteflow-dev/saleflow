defmodule SaleflowWeb.ControllerHelpers do
  @moduledoc "Shared helpers for SaleflowWeb controllers."

  alias Saleflow.Accounts

  # ---------------------------------------------------------------------------
  # Map helpers
  # ---------------------------------------------------------------------------

  @doc "Add key to map only if value is not nil or empty string"
  def maybe_put(map, _key, nil), do: map
  def maybe_put(map, _key, ""), do: map
  def maybe_put(map, key, value), do: Map.put(map, key, value)

  # ---------------------------------------------------------------------------
  # Authorization
  # ---------------------------------------------------------------------------

  @doc "Check that user owns the resource or is admin."
  def check_ownership(_resource, %{role: :admin}), do: :ok

  def check_ownership(resource, user) do
    if resource.user_id == user.id do
      :ok
    else
      {:error, :forbidden}
    end
  end

  # ---------------------------------------------------------------------------
  # User name maps
  # ---------------------------------------------------------------------------

  @doc "Batch-load leads by IDs, returning an id => lead map (no N+1)."
  def build_lead_map(ids) do
    case Saleflow.Sales.get_leads_by_ids(Enum.uniq(ids)) do
      {:ok, map} -> map
      _ -> %{}
    end
  end

  @doc "Build a global user_id => name map from all users."
  def build_global_user_name_map do
    case Accounts.list_users() do
      {:ok, users} -> Enum.into(users, %{}, fn u -> {u.id, u.name} end)
      _ -> %{}
    end
  end

  @doc """
  Build a role-aware user name map.
  Agents only see their own name as "Du"; admins get all names from the given collection lists.
  Accepts (calls, audit_logs, user) for lead/meeting controllers,
  or (logs, user) for the audit controller.
  """
  def build_user_name_map(_calls, _audit_logs, %{role: :agent} = user) do
    %{user.id => "Du"}
  end

  def build_user_name_map(calls, audit_logs, _admin_user) do
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

  @doc "2-arity variant for audit controller: build_user_name_map(logs, user)."
  def build_user_name_map(_logs, %{role: :agent} = user) do
    %{user.id => "Du"}
  end

  def build_user_name_map(logs, _admin_user) do
    user_ids =
      logs
      |> Enum.map(& &1.user_id)
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

  # ---------------------------------------------------------------------------
  # PubSub
  # ---------------------------------------------------------------------------

  @doc "Broadcast a dashboard update event via PubSub."
  def broadcast_dashboard_update(event) do
    Phoenix.PubSub.broadcast(
      Saleflow.PubSub,
      "dashboard:updates",
      {:dashboard_update, %{event: event}}
    )
  end

  # ---------------------------------------------------------------------------
  # Type coercion
  # ---------------------------------------------------------------------------

  @doc "Safely convert a value to integer. Returns 0 for nil/unknown."
  def to_int(nil), do: 0
  def to_int(%Decimal{} = d), do: Decimal.to_integer(d)
  def to_int(n) when is_integer(n), do: n
  def to_int(_), do: 0

  # ---------------------------------------------------------------------------
  # Date/time parsing (nil-returning variants used by call_controller)
  # ---------------------------------------------------------------------------

  @doc "Parse an ISO 8601 date string, returning nil on failure."
  def parse_date(nil), do: nil

  def parse_date(str) when is_binary(str) do
    case Date.from_iso8601(str) do
      {:ok, date} -> date
      _ -> nil
    end
  end

  @doc "Parse an ISO 8601 time string (accepts HH:MM or HH:MM:SS), returning nil on failure."
  def parse_time(nil), do: nil

  def parse_time(str) when is_binary(str) do
    padded = if String.length(str) == 5, do: str <> ":00", else: str

    case Time.from_iso8601(padded) do
      {:ok, time} -> time
      _ -> nil
    end
  end

  @doc "Parse an ISO 8601 date string, defaulting to tomorrow on nil or parse failure."
  def parse_date_with_default(nil), do: Date.utc_today() |> Date.add(1)

  def parse_date_with_default(date_string) when is_binary(date_string) do
    case Date.from_iso8601(date_string) do
      {:ok, date} -> date
      _ -> Date.utc_today() |> Date.add(1)
    end
  end

  @doc "Parse an ISO 8601 time string (HH:MM or HH:MM:SS), defaulting to 10:00:00 on nil or parse failure."
  def parse_time_with_default(nil), do: ~T[10:00:00]

  def parse_time_with_default(time_string) when is_binary(time_string) do
    padded = if String.length(time_string) == 5, do: time_string <> ":00", else: time_string

    case Time.from_iso8601(padded) do
      {:ok, time} -> time
      _ -> ~T[10:00:00]
    end
  end

  @doc """
  Enrich a list of meetings with embedded lead summaries and user names.
  Used in meeting_controller and dashboard_controller.
  """
  def enrich_meetings(meetings) do
    lead_ids = meetings |> Enum.map(& &1.lead_id) |> Enum.uniq()
    lead_map = build_lead_map(lead_ids)
    user_names = build_global_user_name_map()

    Enum.map(meetings, fn m ->
      lead = Map.get(lead_map, m.lead_id)
      SaleflowWeb.Serializers.serialize_meeting_with_lead(m, lead, user_names)
    end)
  end

  # ---------------------------------------------------------------------------
  # Call phone data (shared between lead_controller and meeting_controller)
  # ---------------------------------------------------------------------------

  @doc "Fetch aggregated phone call data for a call_log_id."
  def get_call_phone_data(call_log_id) do
    case Saleflow.Repo.query(
           "SELECT COALESCE(SUM(duration), 0), bool_or(recording_key IS NOT NULL), (SELECT id FROM phone_calls WHERE call_log_id = $1 AND recording_key IS NOT NULL LIMIT 1), (SELECT transcription FROM phone_calls WHERE call_log_id = $1 AND transcription IS NOT NULL LIMIT 1), (SELECT transcription_analysis FROM phone_calls WHERE call_log_id = $1 AND transcription_analysis IS NOT NULL LIMIT 1) FROM phone_calls WHERE call_log_id = $1",
           [Ecto.UUID.dump!(call_log_id)]
         ) do
      {:ok, %{rows: [[dur, has_rec, pc_id, transcription, analysis]]}} ->
        {to_int(dur), has_rec || false, pc_id && Saleflow.Sales.decode_uuid(pc_id), transcription, analysis}

      _ ->
        {0, false, nil, nil, nil}
    end
  end
end
