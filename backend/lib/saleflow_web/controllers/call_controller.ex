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

  @doc "List calls with lead/outcome data for the agent's call history."
  def history(conn, params) do
    user = conn.assigns.current_user
    date = parse_date(params["date"]) || Date.utc_today()

    query = """
    SELECT
      cl.id, cl.called_at, cl.outcome::text, cl.notes,
      cl.user_id, cl.lead_id,
      u.name as user_name,
      l.företag as lead_name, l.telefon as lead_phone
    FROM call_logs cl
    JOIN users u ON u.id = cl.user_id
    LEFT JOIN leads l ON l.id = cl.lead_id
    WHERE cl.called_at::date = $1
    """

    {query, query_params} =
      case user.role do
        :admin ->
          {query <> " ORDER BY cl.called_at DESC", [date]}

        _ ->
          uid = Ecto.UUID.dump!(user.id)
          {query <> " AND cl.user_id = $2 ORDER BY cl.called_at DESC", [date, uid]}
      end

    {:ok, %{rows: rows}} = Saleflow.Repo.query(query, query_params)

    calls =
      Enum.map(rows, fn [id, called_at, outcome, notes, user_id, lead_id,
                          user_name, lead_name, lead_phone] ->
        %{
          id: Saleflow.Sales.decode_uuid(id),
          called_at: called_at && NaiveDateTime.to_iso8601(called_at),
          outcome: outcome,
          notes: notes,
          user_id: user_id && Saleflow.Sales.decode_uuid(user_id),
          user_name: user_name,
          lead_id: lead_id && Saleflow.Sales.decode_uuid(lead_id),
          lead_name: lead_name,
          lead_phone: lead_phone
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
