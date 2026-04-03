defmodule SaleflowWeb.AdminController do
  use SaleflowWeb, :controller

  alias Saleflow.Accounts

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
    json(conn, %{stats: Saleflow.Stats.lead_stats()})
  end

  @doc """
  Return stats for the current authenticated user (role-aware).

  Agents receive their own stats: calls_today, meetings_booked_today,
  total meetings scheduled, and total calls made.
  Admins receive global stats: same fields but across all users.
  """
  def my_stats(conn, _params) do
    user = conn.assigns.current_user
    stats = compute_my_stats(user)
    json(conn, %{stats: stats})
  end

  @doc """
  Computes my_stats for a user. Shared between my_stats endpoint and dashboard.
  """
  def compute_my_stats(user) do
    alias Saleflow.Stats

    {ct, tc, mt, tm} =
      case user.role do
        :admin ->
          {Stats.all_calls_today(), Stats.all_total_calls(),
           Stats.all_meetings_booked_today(), Stats.all_total_meetings()}

        _ ->
          {Stats.calls_today(user.id), Stats.total_calls(user.id),
           Stats.meetings_booked_today(user.id), Stats.total_meetings(user.id)}
      end

    %{calls_today: ct, total_calls: tc, meetings_today: mt, total_meetings: tm}
  end

  # ---------------------------------------------------------------------------
  # Helpers
  # ---------------------------------------------------------------------------

  @doc """
  Update a user's phone number (admin only).
  """
  def update_user(conn, %{"user_id" => user_id} = params) do
    with {:ok, user} <- Ash.get(Saleflow.Accounts.User, user_id) do
      update_params =
        %{}
        |> then(fn p -> if params["phone_number"], do: Map.put(p, :phone_number, params["phone_number"]), else: p end)
        |> then(fn p -> if params["extension_number"], do: Map.put(p, :extension_number, params["extension_number"]), else: p end)
        |> then(fn p -> if params["name"], do: Map.put(p, :name, params["name"]), else: p end)
        |> then(fn p -> if params["role"], do: Map.put(p, :role, parse_role(params["role"])), else: p end)

      case user |> Ash.Changeset.for_update(:update_user, update_params) |> Ash.update() do
        {:ok, updated} ->
          json(conn, %{user: serialize_user(updated)})

        {:error, error} ->
          conn |> put_status(422) |> json(%{error: inspect(error)})
      end
    else
      {:error, _} ->
        conn |> put_status(404) |> json(%{error: "Användare hittades inte"})
    end
  end

  defp serialize_user(user) do
    %{
      id: user.id,
      email: to_string(user.email),
      name: user.name,
      role: user.role,
      phone_number: user.phone_number,
      extension_number: user.extension_number
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
