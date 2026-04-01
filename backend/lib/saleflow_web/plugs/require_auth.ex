defmodule SaleflowWeb.Plugs.RequireAuth do
  @moduledoc """
  Plug that requires an authenticated user.

  Reads `user_id` from the session, loads the user from the database,
  and assigns `:current_user` to the conn. Returns 401 JSON if the
  session is missing or the user cannot be found.
  """

  import Plug.Conn
  import Phoenix.Controller, only: [json: 2]

  def init(opts), do: opts

  def call(conn, _opts) do
    with user_id when is_binary(user_id) <- get_session(conn, :user_id),
         {:ok, user} <- Ash.get(Saleflow.Accounts.User, user_id) do
      assign(conn, :current_user, user)
    else
      _ ->
        conn
        |> put_status(:unauthorized)
        |> json(%{error: "Authentication required"})
        |> halt()
    end
  end
end
