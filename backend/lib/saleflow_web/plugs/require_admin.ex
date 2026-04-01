defmodule SaleflowWeb.Plugs.RequireAdmin do
  @moduledoc """
  Plug that requires the current user to be an admin.

  Must be used after `RequireAuth` — expects `conn.assigns.current_user`
  to already be set. Returns 403 JSON if the user is not an admin.
  """

  import Plug.Conn
  import Phoenix.Controller, only: [json: 2]

  def init(opts), do: opts

  def call(conn, _opts) do
    case conn.assigns[:current_user] do
      %{role: :admin} ->
        conn

      _ ->
        conn
        |> put_status(:forbidden)
        |> json(%{error: "Admin access required"})
        |> halt()
    end
  end
end
