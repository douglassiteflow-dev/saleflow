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
            Logger.info("CallController.dial: calling #{phone} with token=#{String.slice(token || "", 0..19)}...")
            result = client().get_as(token, "/dial/#{phone}?autoanswer=false")
            Logger.info("CallController.dial: result=#{inspect(result)}")

            case result do
              {:ok, _body} ->
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

  @doc "Hang up the agent's current call."
  def hangup(conn, _params) do
    user = conn.assigns.current_user
    token = user.telavox_token

    if is_nil(token) || token == "" do
      conn |> put_status(422) |> json(%{error: "Inte kopplad till Telavox"})
    else
      case client().post_as(token, "/hangup") do
        {:ok, _body} ->
          json(conn, %{ok: true})

        {:error, {:bad_request, _}} ->
          json(conn, %{ok: true, message: "Inget samtal att lägga på"})

        {:error, :unauthorized} ->
          Ash.update(user, %{telavox_token: nil}, action: :update_user)
          conn |> put_status(401) |> json(%{error: "Telavox-token har gått ut"})

        {:error, reason} ->
          conn |> put_status(502) |> json(%{error: "Telavox fel: #{inspect(reason)}"})
      end
    end
  end

  def recording(conn, %{"id" => phone_call_id}) do
    case Saleflow.Repo.query(
           "SELECT recording_key FROM phone_calls WHERE id = $1",
           [Ecto.UUID.dump!(phone_call_id)]
         ) do
      {:ok, %{rows: [[key]]}} when is_binary(key) ->
        {:ok, url} = Saleflow.Storage.presigned_url(key)
        json(conn, %{url: url})

      _ ->
        conn |> put_status(404) |> json(%{error: "Ingen inspelning"})
    end
  end

  @doc "List outgoing calls with lead/outcome data for the agent's call history."
  def history(conn, params) do
    user = conn.assigns.current_user
    date = parse_date(params["date"]) || Date.utc_today()

    query = """
    SELECT
      pc.id, pc.caller, pc.callee, pc.duration, pc.direction::text,
      pc.received_at, pc.user_id, pc.lead_id, pc.recording_key,
      u.name as user_name,
      l.företag as lead_name,
      cl.outcome::text, cl.notes
    FROM phone_calls pc
    LEFT JOIN users u ON u.id = pc.user_id
    LEFT JOIN leads l ON l.id = pc.lead_id
    LEFT JOIN LATERAL (
      SELECT outcome, notes FROM call_logs
      WHERE call_logs.lead_id = pc.lead_id
        AND call_logs.user_id = pc.user_id
        AND call_logs.called_at::date = pc.received_at::date
      ORDER BY call_logs.called_at DESC
      LIMIT 1
    ) cl ON true
    WHERE pc.direction = 'outgoing'
      AND pc.received_at::date = $1
    """

    {query, query_params} =
      case user.role do
        :admin ->
          {query <> " ORDER BY pc.received_at DESC", [date]}

        _ ->
          uid = Ecto.UUID.dump!(user.id)
          {query <> " AND pc.user_id = $2 ORDER BY pc.received_at DESC", [date, uid]}
      end

    {:ok, %{rows: rows}} = Saleflow.Repo.query(query, query_params)

    calls =
      Enum.map(rows, fn [id, caller, callee, duration, direction, received_at, user_id,
                          lead_id, recording_key, user_name, lead_name, outcome, notes] ->
        %{
          id: Saleflow.Sales.decode_uuid(id),
          caller: caller,
          callee: callee,
          duration: duration || 0,
          direction: direction,
          received_at: received_at && NaiveDateTime.to_iso8601(received_at),
          user_id: user_id && Saleflow.Sales.decode_uuid(user_id),
          user_name: user_name,
          lead_id: lead_id && Saleflow.Sales.decode_uuid(lead_id),
          lead_name: lead_name,
          has_recording: recording_key != nil,
          outcome: outcome,
          notes: notes
        }
      end)

    json(conn, %{calls: calls})
  end

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
end
