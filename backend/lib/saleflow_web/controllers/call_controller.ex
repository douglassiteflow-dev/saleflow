defmodule SaleflowWeb.CallController do
  use SaleflowWeb, :controller

  require Logger

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
      (pc.recording_key IS NOT NULL) as has_recording
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
                          user_name, lead_name, lead_phone, duration, has_recording] ->
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
          has_recording: has_recording || false
        }
      end)

    json(conn, %{calls: calls})
  end

  defp to_int(nil), do: 0
  defp to_int(%Decimal{} = d), do: Decimal.to_integer(d)
  defp to_int(n) when is_integer(n), do: n
  defp to_int(_), do: 0

  defp parse_date(nil), do: nil
  defp parse_date(str) when is_binary(str) do
    case Date.from_iso8601(str) do
      {:ok, date} -> date
      _ -> nil
    end
  end

  defp get_lead_phone(lead_id) do
    query = "SELECT telefon FROM leads WHERE id = $1 LIMIT 1"

    case Saleflow.Repo.query(query, [Ecto.UUID.dump!(lead_id)]) do
      {:ok, %{rows: [[phone]]}} when is_binary(phone) and phone != "" -> phone
      _ -> nil
    end
  end

  defp get_lead_name(lead_id) do
    case Saleflow.Repo.query("SELECT företag FROM leads WHERE id = $1 LIMIT 1", [Ecto.UUID.dump!(lead_id)]) do
      {:ok, %{rows: [[name]]}} when is_binary(name) -> name
      _ -> "Okänt företag"
    end
  end
end
