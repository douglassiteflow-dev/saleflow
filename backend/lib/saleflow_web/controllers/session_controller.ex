defmodule SaleflowWeb.SessionController do
  use SaleflowWeb, :controller

  alias Saleflow.Accounts

  @doc """
  List current user's active sessions.

  GET /api/auth/sessions
  """
  def index(conn, _params) do
    user = conn.assigns.current_user
    current_session = conn.assigns.current_session

    {:ok, sessions} = Accounts.list_active_sessions(user.id)

    serialized =
      Enum.map(sessions, fn s ->
        serialize_session(s, s.session_token == current_session.session_token)
      end)

    json(conn, %{sessions: serialized})
  end

  @doc """
  Logout all sessions except the current one.

  POST /api/auth/sessions/logout-all
  """
  def logout_all(conn, _params) do
    user = conn.assigns.current_user
    current_session = conn.assigns.current_session

    {:ok, sessions} = Accounts.list_active_sessions(user.id)

    others = Enum.reject(sessions, fn s -> s.session_token == current_session.session_token end)

    Enum.each(others, fn s -> Accounts.logout_session(s) end)

    json(conn, %{ok: true, count: length(others)})
  end

  # ---------------------------------------------------------------------------
  # Helpers
  # ---------------------------------------------------------------------------

  defp serialize_session(session, current?) do
    %{
      id: session.id,
      device_type: session.device_type,
      browser: session.browser,
      city: session.city,
      country: session.country,
      logged_in_at: session.logged_in_at,
      last_active_at: session.last_active_at,
      force_logged_out: session.force_logged_out,
      current: current?
    }
  end
end
