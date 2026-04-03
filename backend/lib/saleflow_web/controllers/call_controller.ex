defmodule SaleflowWeb.CallController do
  use SaleflowWeb, :controller

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
            case client().get_as(token, "/dial/#{phone}?autoanswer=false") do
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

  defp get_lead_phone(lead_id) do
    query = "SELECT telefon FROM leads WHERE id = $1 LIMIT 1"

    case Saleflow.Repo.query(query, [Ecto.UUID.dump!(lead_id)]) do
      {:ok, %{rows: [[phone]]}} when is_binary(phone) and phone != "" -> phone
      _ -> nil
    end
  end
end
