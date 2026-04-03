defmodule SaleflowWeb.TelavoxController do
  use SaleflowWeb, :controller

  defp client do
    Application.get_env(:saleflow, :telavox_client, Saleflow.Telavox.Client)
  end

  @doc "Connect agent's Telavox token. Verifies via /extensions/me."
  def connect(conn, %{"token" => token}) do
    case client().get_as(token, "/extensions/me") do
      {:ok, %{"extension" => ext, "name" => name}} ->
        user = conn.assigns.current_user

        case Ash.update(user, %{telavox_token: token, extension_number: ext}, action: :update_user) do
          {:ok, _user} ->
            json(conn, %{ok: true, extension: ext, name: name})

          {:error, _} ->
            conn |> put_status(500) |> json(%{error: "Kunde inte spara token"})
        end

      {:error, :unauthorized} ->
        conn |> put_status(401) |> json(%{error: "Ogiltig Telavox-token"})

      {:error, _reason} ->
        conn |> put_status(502) |> json(%{error: "Kunde inte nå Telavox API"})
    end
  end

  def connect(conn, _params) do
    conn |> put_status(422) |> json(%{error: "Token krävs"})
  end

  @doc "Disconnect agent's Telavox token."
  def disconnect(conn, _params) do
    user = conn.assigns.current_user

    case Ash.update(user, %{telavox_token: nil, extension_number: nil}, action: :update_user) do
      {:ok, _user} -> json(conn, %{ok: true})
      {:error, _} -> conn |> put_status(500) |> json(%{error: "Kunde inte koppla bort"})
    end
  end

  @doc "Get current Telavox connection status."
  def status(conn, _params) do
    user = conn.assigns.current_user
    connected = user.telavox_token != nil && user.telavox_token != ""

    if connected do
      case client().get_as(user.telavox_token, "/extensions/me") do
        {:ok, %{"extension" => ext, "name" => name}} ->
          json(conn, %{connected: true, extension: ext, name: name})

        {:error, :unauthorized} ->
          Ash.update(user, %{telavox_token: nil}, action: :update_user)
          json(conn, %{connected: false, expired: true})

        {:error, _} ->
          json(conn, %{connected: true, extension: user.extension_number, name: user.name})
      end
    else
      json(conn, %{connected: false})
    end
  end
end
