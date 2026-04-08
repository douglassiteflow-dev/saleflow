defmodule SaleflowWeb.CallController do
  use SaleflowWeb, :controller

  require Logger

  import SaleflowWeb.ControllerHelpers, only: [to_int: 1, parse_date: 1]

  defp client do
    Application.get_env(:saleflow, :telavox_client, Saleflow.Telavox.Client)
  end

  @doc "Initiate a call to a lead via Telavox."
  def dial(conn, %{"lead_id" => lead_id}) do
    user = conn.assigns.current_user
    token = user.telavox_token

    cond do
      is_nil(token) || token == "" ->
        conn |> put_status(422) |> json(%{error: "Koppla Telavox i din profil för att ringa"})

      true ->
        case get_lead_phone(lead_id) do
          nil ->
            conn |> put_status(404) |> json(%{error: "Lead saknar telefonnummer"})

          phone ->
            Logger.info("CallController.dial: calling #{phone}")
            result = client().get_as(token, "/dial/#{phone}")
            Logger.info("CallController.dial: result=#{inspect(result)}")

            case result do
              {:ok, _body} ->
                # Track active call for live dashboard
                lead_name = get_lead_name(lead_id)
                Saleflow.Calls.ActiveCalls.start_call(user.id, user.name, lead_name, phone)
                json(conn, %{ok: true, number: phone})

              {:error, :unauthorized} ->
                Ash.update(user, %{telavox_token: nil}, action: :update_user)
                conn |> put_status(401) |> json(%{error: "Telavox-token har gått ut"})

              {:error, reason} ->
                conn |> put_status(502) |> json(%{error: "Telavox fel: #{inspect(reason)}"})
            end
        end
    end
  end

  def dial(conn, _params) do
    conn |> put_status(422) |> json(%{error: "lead_id krävs"})
  end

  @doc "Hang up the agent's current call via Telavox. No records are created here — the outcome endpoint handles PhoneCall/CallLog creation."
  def hangup(conn, _params) do
    user = conn.assigns.current_user
    token = user.telavox_token

    if is_nil(token) || token == "" do
      conn |> put_status(422) |> json(%{error: "Inte kopplad till Telavox"})
    else
      hangup_result =
        case client().post_as(token, "/hangup") do
          {:ok, _body} -> :ok
          {:error, {:bad_request, _}} -> :ok
          {:error, :unauthorized} ->
            Ash.update(user, %{telavox_token: nil}, action: :update_user)
            :unauthorized
          {:error, reason} -> {:error, reason}
        end

      case hangup_result do
        :ok ->
          Saleflow.Calls.ActiveCalls.end_call(user.id)
          json(conn, %{ok: true})

        :unauthorized ->
          conn |> put_status(401) |> json(%{error: "Telavox-token har gått ut"})

        {:error, reason} ->
          conn |> put_status(502) |> json(%{error: "Telavox fel: #{inspect(reason)}"})
      end
    end
  end

  def recording(conn, %{"id" => phone_call_id}) do
    user = conn.assigns.current_user

    # TODO: move to Saleflow.Sales context module (e.g. Sales.get_phone_call_recording/1)
    case Saleflow.Repo.query(
           "SELECT recording_key, user_id FROM phone_calls WHERE id = $1",
           [Ecto.UUID.dump!(phone_call_id)]
         ) do
      {:ok, %{rows: [[key, uid]]}} when is_binary(key) ->
        owner_id = if uid, do: Ecto.UUID.load!(uid), else: nil

        if user.role == :admin || owner_id == user.id do
          {:ok, url} = Saleflow.Storage.presigned_url(key)
          json(conn, %{url: url})
        else
          conn |> put_status(:forbidden) |> json(%{error: "Access denied"})
        end

      _ ->
        conn |> put_status(404) |> json(%{error: "Ingen inspelning"})
    end
  end

  @doc "List calls with lead/outcome data for the agent's call history."
  def history(conn, params) do
    user = conn.assigns.current_user

    # Support date range (from/to) with backwards-compatible single "date" param
    {from_date, to_date} =
      case {parse_date(params["from"]), parse_date(params["to"])} do
        {nil, nil} ->
          date = parse_date(params["date"]) || Date.utc_today()
          {date, date}

        {from, nil} ->
          {from || Date.utc_today(), from || Date.utc_today()}

        {nil, to} ->
          {to || Date.utc_today(), to || Date.utc_today()}

        {from, to} ->
          {from, to}
      end

    # TODO: move to Saleflow.Stats or Saleflow.Sales context module (e.g. Sales.list_call_history/2)
    query = """
    SELECT
      COALESCE(cl.id, pc.id) as id,
      COALESCE(cl.called_at, pc.received_at) as called_at,
      cl.outcome::text,
      cl.notes,
      COALESCE(cl.user_id, pc.user_id) as user_id,
      COALESCE(cl.lead_id, pc.lead_id) as lead_id,
      u.name as user_name,
      l.företag as lead_name, l.telefon as lead_phone,
      pc.duration as duration,
      (pc.recording_key IS NOT NULL) as has_recording,
      pc.id as phone_call_id,
      pc.transcription,
      pc.transcription_analysis
    FROM phone_calls pc
    LEFT JOIN call_logs cl ON cl.id = pc.call_log_id
    JOIN users u ON u.id = COALESCE(cl.user_id, pc.user_id)
    LEFT JOIN leads l ON l.id = COALESCE(cl.lead_id, pc.lead_id)
    WHERE pc.received_at::date >= $1 AND pc.received_at::date <= $2
      AND pc.direction = 'outgoing'
    """

    {query, query_params} =
      case user.role do
        :admin ->
          {query <> " ORDER BY called_at DESC", [from_date, to_date]}

        _ ->
          uid = Ecto.UUID.dump!(user.id)
          {query <> " AND pc.user_id = $3 ORDER BY called_at DESC", [from_date, to_date, uid]}
      end

    {:ok, %{rows: rows}} = Saleflow.Repo.query(query, query_params)

    calls =
      Enum.map(rows, fn [id, called_at, outcome, notes, user_id, lead_id,
                          user_name, lead_name, lead_phone, duration, has_recording, phone_call_id, transcription, transcription_analysis] ->
        %{
          id: Saleflow.Sales.decode_uuid(id),
          called_at: called_at && NaiveDateTime.to_iso8601(called_at),
          outcome: outcome,
          notes: notes,
          user_id: user_id && Saleflow.Sales.decode_uuid(user_id),
          user_name: user_name,
          lead_id: lead_id && Saleflow.Sales.decode_uuid(lead_id),
          lead_name: lead_name,
          lead_phone: lead_phone,
          duration: to_int(duration),
          has_recording: has_recording || false,
          phone_call_id: phone_call_id && Saleflow.Sales.decode_uuid(phone_call_id),
          transcription: transcription,
          transcription_analysis: transcription_analysis
        }
      end)

    json(conn, %{calls: calls})
  end

  # TODO: move to Saleflow.Sales context module (e.g. Sales.get_lead_phone/1)
  defp get_lead_phone(lead_id) do
    query = "SELECT telefon FROM leads WHERE id = $1 LIMIT 1"

    case Saleflow.Repo.query(query, [Ecto.UUID.dump!(lead_id)]) do
      {:ok, %{rows: [[phone]]}} when is_binary(phone) and phone != "" -> phone
      _ -> nil
    end
  end

  @doc "Daily summary of calls with transcription analysis for a given date."
  def daily_summary(conn, params) do
    date = parse_date(params["date"]) || Date.utc_today()

    # TODO: move to Saleflow.Stats or Saleflow.Sales context module (e.g. Stats.daily_call_summary/1)
    {:ok, %{rows: rows}} =
      Saleflow.Repo.query(
        """
        SELECT pc.transcription_analysis, pc.duration, cl.outcome::text, u.name as agent_name
        FROM phone_calls pc
        LEFT JOIN call_logs cl ON cl.id = pc.call_log_id
        LEFT JOIN users u ON u.id = pc.user_id
        WHERE pc.received_at::date = $1 AND pc.transcription_analysis IS NOT NULL
        """,
        [date]
      )

    analyses =
      Enum.map(rows, fn [analysis, duration, outcome, agent] ->
        parsed =
          case Jason.decode(analysis || "") do
            {:ok, %{"raw_analysis" => raw}} ->
              raw_cleaned = String.replace(raw, ~r/```json\n?|\n?```/, "")

              case Jason.decode(raw_cleaned) do
                {:ok, data} -> data
                _ -> %{}
              end

            {:ok, data} ->
              data

            _ ->
              %{}
          end

        %{
          analysis: parsed,
          duration: to_int(duration),
          outcome: outcome,
          agent: agent
        }
      end)

    json(conn, %{date: Date.to_iso8601(date), calls: analyses})
  end

  def daily_report(conn, params) do
    date = parse_date(params["date"]) || Date.utc_today()

    case Saleflow.Repo.query("SELECT report FROM daily_reports WHERE date = $1", [date]) do
      {:ok, %{rows: [[report_json]]}} ->
        case Jason.decode(report_json || "") do
          {:ok, report} -> json(conn, %{date: Date.to_iso8601(date), report: report})
          _ -> json(conn, %{date: Date.to_iso8601(date), report: nil})
        end

      _ ->
        json(conn, %{date: Date.to_iso8601(date), report: nil})
    end
  end

  @doc "Personal AI coaching report for the authenticated agent."
  def agent_report(conn, params) do
    user = conn.assigns.current_user
    date = parse_date(params["date"]) || Date.utc_today()

    case Saleflow.Repo.query(
           "SELECT report, score_avg, call_count FROM agent_daily_reports WHERE user_id = $1 AND date = $2",
           [Ecto.UUID.dump!(user.id), date]
         ) do
      {:ok, %{rows: [[report, score, calls]]}} when is_binary(report) ->
        trimmed = String.trim(report)

        if String.starts_with?(trimmed, "<!DOCTYPE") || String.starts_with?(trimmed, "<html") do
          # HTML report (new format)
          json(conn, %{date: Date.to_iso8601(date), html: report, report: nil, score_avg: score, call_count: calls})
        else
          # JSON report (legacy format)
          parsed =
            case Jason.decode(report) do
              {:ok, data} -> data
              _ -> nil
            end

          json(conn, %{date: Date.to_iso8601(date), html: nil, report: parsed, score_avg: score, call_count: calls})
        end

      _ ->
        json(conn, %{date: Date.to_iso8601(date), html: nil, report: nil, score_avg: nil, call_count: nil})
    end
  end

  # TODO: move to Saleflow.Sales context module (e.g. Sales.get_lead_name/1)
  defp get_lead_name(lead_id) do
    case Saleflow.Repo.query("SELECT företag FROM leads WHERE id = $1 LIMIT 1", [Ecto.UUID.dump!(lead_id)]) do
      {:ok, %{rows: [[name]]}} when is_binary(name) -> name
      _ -> "Okänt företag"
    end
  end
end
