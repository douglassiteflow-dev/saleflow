defmodule SaleflowWeb.AdminController do
  use SaleflowWeb, :controller

  alias Saleflow.Accounts
  alias Saleflow.Repo

  @doc """
  List all users (admin only).
  """
  def users(conn, _params) do
    {:ok, users} = Accounts.list_users()
    json(conn, %{users: Enum.map(users, &serialize_user/1)})
  end

  @doc """
  Create a new user (admin only). Sends a welcome email after creation.
  """
  def create_user(conn, params) do
    user_params = %{
      email: params["email"],
      name: params["name"],
      password: params["password"],
      password_confirmation: params["password_confirmation"],
      role: parse_role(params["role"])
    }

    case Accounts.register(user_params) do
      {:ok, user} ->
        {subject, html} =
          Saleflow.Notifications.Templates.render_welcome(
            user.name,
            "http://localhost:5173/login"
          )

        Saleflow.Notifications.Mailer.send_email_async(to_string(user.email), subject, html)

        conn
        |> put_status(:created)
        |> json(%{user: serialize_user(user)})

      {:error, _} ->
        conn
        |> put_status(:unprocessable_entity)
        |> json(%{error: "Failed to create user"})
    end
  end

  @doc """
  List all sessions for a user (admin only). Includes ip_address.
  """
  def user_sessions(conn, %{"user_id" => user_id}) do
    {:ok, sessions} = Accounts.list_all_sessions(user_id)
    json(conn, %{sessions: Enum.map(sessions, &serialize_session_admin/1)})
  end

  @doc """
  Force-logout all sessions for a user (admin only). Sends force_logout email.
  """
  def force_logout_user(conn, %{"user_id" => user_id}) do
    case Ash.get(Saleflow.Accounts.User, user_id) do
      {:ok, user} when not is_nil(user) ->
        Accounts.force_logout_all(user_id)

        {subject, html} =
          Saleflow.Notifications.Templates.render_force_logout(user.name)

        Saleflow.Notifications.Mailer.send_email_async(to_string(user.email), subject, html)

        json(conn, %{ok: true})

      _ ->
        conn
        |> put_status(:not_found)
        |> json(%{error: "User not found"})
    end
  end

  @doc """
  Force-logout a single session by ID (admin only). Sends force_logout email to session owner.
  """
  def force_logout_session_action(conn, %{"id" => session_id}) do
    case Ash.get(Saleflow.Accounts.LoginSession, session_id) do
      {:ok, session} when not is_nil(session) ->
        Accounts.force_logout_session(session)

        with {:ok, user} when not is_nil(user) <-
               Ash.get(Saleflow.Accounts.User, session.user_id) do
          {subject, html} =
            Saleflow.Notifications.Templates.render_force_logout(user.name)

          Saleflow.Notifications.Mailer.send_email_async(to_string(user.email), subject, html)
        end

        json(conn, %{ok: true})

      _ ->
        conn
        |> put_status(:not_found)
        |> json(%{error: "Session not found"})
    end
  end

  @doc """
  Return lead counts grouped by status (admin-only global stats).
  """
  def stats(conn, _params) do
    query = """
    SELECT status, COUNT(*) as count
    FROM leads
    GROUP BY status
    ORDER BY status
    """

    {:ok, %{rows: rows}} = Repo.query(query)

    stats =
      Enum.into(rows, %{}, fn [status, count] ->
        {status, count}
      end)

    json(conn, %{stats: stats})
  end

  @doc """
  Return stats for the current authenticated user (role-aware).

  Agents receive their own stats: calls_today, meetings_booked_today,
  total meetings scheduled, and total calls made.
  Admins receive global stats: same fields but across all users.
  """
  def my_stats(conn, _params) do
    user = conn.assigns.current_user
    today = Date.utc_today()

    {calls_today, total_calls, meetings_today, total_meetings} =
      case user.role do
        :admin ->
          calls_today_query = """
          SELECT COUNT(*) FROM call_logs WHERE called_at::date = $1
          """

          total_calls_query = """
          SELECT COUNT(*) FROM call_logs
          """

          meetings_today_query = """
          SELECT COUNT(*) FROM meetings WHERE meeting_date = $1 AND status = 'scheduled'
          """

          total_meetings_query = """
          SELECT COUNT(*) FROM meetings WHERE status = 'scheduled'
          """

          {:ok, %{rows: [[ct]]}} = Repo.query(calls_today_query, [today])
          {:ok, %{rows: [[tc]]}} = Repo.query(total_calls_query, [])
          {:ok, %{rows: [[mt]]}} = Repo.query(meetings_today_query, [today])
          {:ok, %{rows: [[tm]]}} = Repo.query(total_meetings_query, [])
          {ct, tc, mt, tm}

        _ ->
          user_id_binary = Ecto.UUID.dump!(user.id)

          calls_today_query = """
          SELECT COUNT(*) FROM call_logs WHERE user_id = $1 AND called_at::date = $2
          """

          total_calls_query = """
          SELECT COUNT(*) FROM call_logs WHERE user_id = $1
          """

          meetings_today_query = """
          SELECT COUNT(*) FROM meetings WHERE user_id = $1 AND meeting_date = $2 AND status = 'scheduled'
          """

          total_meetings_query = """
          SELECT COUNT(*) FROM meetings WHERE user_id = $1 AND status = 'scheduled'
          """

          {:ok, %{rows: [[ct]]}} = Repo.query(calls_today_query, [user_id_binary, today])
          {:ok, %{rows: [[tc]]}} = Repo.query(total_calls_query, [user_id_binary])
          {:ok, %{rows: [[mt]]}} = Repo.query(meetings_today_query, [user_id_binary, today])
          {:ok, %{rows: [[tm]]}} = Repo.query(total_meetings_query, [user_id_binary])
          {ct, tc, mt, tm}
      end

    json(conn, %{
      stats: %{
        calls_today: calls_today,
        total_calls: total_calls,
        meetings_today: meetings_today,
        total_meetings: total_meetings
      }
    })
  end

  # ---------------------------------------------------------------------------
  # Helpers
  # ---------------------------------------------------------------------------

  defp serialize_user(user) do
    %{
      id: user.id,
      email: to_string(user.email),
      name: user.name,
      role: user.role
    }
  end

  defp serialize_session_admin(session) do
    %{
      id: session.id,
      device_type: session.device_type,
      browser: session.browser,
      ip_address: session.ip_address,
      city: session.city,
      country: session.country,
      logged_in_at: session.logged_in_at,
      last_active_at: session.last_active_at,
      logged_out_at: session.logged_out_at,
      force_logged_out: session.force_logged_out
    }
  end

  defp parse_role("admin"), do: :admin
  defp parse_role("agent"), do: :agent
  defp parse_role(_), do: :agent
end
