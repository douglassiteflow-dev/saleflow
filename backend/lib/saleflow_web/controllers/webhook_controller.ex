defmodule SaleflowWeb.WebhookController do
  use SaleflowWeb, :controller

  alias Saleflow.Sales

  @doc """
  Receives a Telavox hangup webhook and records the phone call.

  Matches the callee to a lead by `telefon` and the caller to a user
  by `phone_number`. Creates a PhoneCall record regardless of whether
  matches are found.
  """
  def telavox_hangup(conn, params) do
    require Logger
    Logger.info("Telavox hangup webhook: #{inspect(params)}")

    caller = to_string(Map.get(params, "caller", ""))
    callee = to_string(Map.get(params, "callee", ""))
    duration = parse_duration(Map.get(params, "duration", 0))

    lead_id = find_lead_id(callee)
    user_id = find_user_id(caller)

    attrs = %{
      caller: caller,
      callee: callee,
      duration: duration,
      lead_id: lead_id,
      user_id: user_id
    }

    case Sales.create_phone_call(attrs) do
      {:ok, _phone_call} ->
        json(conn, %{ok: true})

      {:error, _changeset} ->
        conn
        |> put_status(:unprocessable_entity)
        |> json(%{error: "Failed to create phone call"})
    end
  end

  defp find_lead_id(callee) when is_binary(callee) and callee != "" do
    query = "SELECT id FROM leads WHERE telefon = $1 LIMIT 1"

    case Saleflow.Repo.query(query, [callee]) do
      {:ok, %{rows: [[id]]}} -> Sales.decode_uuid(id)
      _ -> nil
    end
  end

  defp find_lead_id(_), do: nil

  defp find_user_id(caller) when is_binary(caller) and caller != "" do
    query = "SELECT id FROM users WHERE phone_number = $1 OR extension_number = $1 LIMIT 1"

    case Saleflow.Repo.query(query, [caller]) do
      {:ok, %{rows: [[id]]}} -> Sales.decode_uuid(id)
      _ -> nil
    end
  end

  defp find_user_id(_), do: nil

  defp parse_duration(val) when is_integer(val), do: val
  defp parse_duration(val) when is_binary(val) do
    case Integer.parse(val) do
      {n, _} -> n
      :error -> 0
    end
  end
  defp parse_duration(_), do: 0
end
