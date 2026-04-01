defmodule SaleflowWeb.Plugs.RequireAuth do
  @moduledoc """
  Plug that requires an authenticated user.

  Reads `session_token` from the Phoenix session, looks up the LoginSession,
  verifies it is still active (not logged out), touches it, and assigns both
  `:current_user` and `:current_session` to the conn.

  Returns 401 JSON if the session is missing, invalid, or logged out.
  """

  import Plug.Conn
  import Phoenix.Controller, only: [json: 2]

  alias Saleflow.Accounts

  def init(opts), do: opts

  def call(conn, _opts) do
    with token when is_binary(token) <- get_session(conn, :session_token),
         {:ok, session} when not is_nil(session) <- Accounts.find_session_by_token(token),
         true <- is_nil(session.logged_out_at),
         {:ok, session} <- Accounts.touch_session(session),
         {:ok, user} <- Ash.get(Saleflow.Accounts.User, session.user_id) do
      conn
      |> assign(:current_user, user)
      |> assign(:current_session, session)
    else
      _ ->
        conn
        |> delete_session(:session_token)
        |> put_status(:unauthorized)
        |> json(%{error: "Authentication required"})
        |> halt()
    end
  end
end
