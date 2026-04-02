defmodule SaleflowWeb.MicrosoftController do
  use SaleflowWeb, :controller

  alias Saleflow.Microsoft.Graph
  require Logger

  @scopes "openid profile email Calendars.ReadWrite OnlineMeetings.ReadWrite User.Read offline_access"

  @doc """
  GET /api/auth/microsoft — redirects the user to Microsoft login (for linking Teams, requires auth).
  """
  def authorize(conn, _params) do
    user = conn.assigns.current_user

    authorize_url =
      "https://login.microsoftonline.com/#{Graph.tenant_id()}/oauth2/v2.0/authorize?" <>
        URI.encode_query(%{
          client_id: Graph.client_id(),
          response_type: "code",
          redirect_uri: Graph.redirect_uri(),
          scope: @scopes,
          state: "link:#{user.id}"
        })

    json(conn, %{url: authorize_url})
  end

  @doc """
  GET /api/auth/microsoft/login — Microsoft SSO login (no auth required).
  Redirects browser to Microsoft, callback will create session.
  """
  def login_authorize(conn, _params) do
    authorize_url =
      "https://login.microsoftonline.com/#{Graph.tenant_id()}/oauth2/v2.0/authorize?" <>
        URI.encode_query(%{
          client_id: Graph.client_id(),
          response_type: "code",
          redirect_uri: Graph.redirect_uri(),
          scope: @scopes,
          state: "login"
        })

    redirect(conn, external: authorize_url)
  end

  @doc """
  GET /api/auth/microsoft/callback — receives code from Microsoft.
  This is hit by the browser redirect, so we redirect back to the frontend.
  """
  def callback(conn, %{"code" => code, "state" => "login"}) do
    # Microsoft SSO login flow
    with {:ok, tokens} <- Graph.exchange_code(code),
         {:ok, ms_user} <- Graph.get_me(tokens.access_token),
         {:ok, user} <- find_user_by_email(ms_user.email) do
      # Create login session
      ip = conn.remote_ip |> :inet.ntoa() |> to_string()
      ua = Plug.Conn.get_req_header(conn, "user-agent") |> List.first("")

      {:ok, session} =
        Saleflow.Accounts.create_login_session(user, %{ip_address: ip, user_agent: ua})

      # Save/update Microsoft connection
      save_microsoft_connection(user.id, tokens, ms_user)

      conn
      |> put_session(:session_token, session.session_token)
      |> redirect(external: frontend_url() <> "/dashboard?login=microsoft")
    else
      {:error, :user_not_found} ->
        Logger.warning("Microsoft SSO: no SaleFlow user for email")
        redirect(conn, external: frontend_url() <> "/login?error=no_account")

      {:error, reason} ->
        Logger.error("Microsoft SSO login failed: #{inspect(reason)}")
        redirect(conn, external: frontend_url() <> "/login?error=microsoft")
    end
  end

  def callback(conn, %{"code" => code, "state" => "link:" <> user_id}) do
    # Link Teams to existing account
    with {:ok, tokens} <- Graph.exchange_code(code),
         {:ok, ms_user} <- Graph.get_me(tokens.access_token) do
      save_microsoft_connection(user_id, tokens, ms_user)
      redirect(conn, external: frontend_url() <> "/profile?microsoft=connected")
    else
      {:error, reason} ->
        Logger.error("Microsoft OAuth callback failed: #{inspect(reason)}")
        redirect(conn, external: frontend_url() <> "/profile?microsoft=error")
    end
  end

  # Legacy callback format (state = user_id directly)
  def callback(conn, %{"code" => code, "state" => user_id}) when is_binary(user_id) do
    with {:ok, tokens} <- Graph.exchange_code(code),
         {:ok, ms_user} <- Graph.get_me(tokens.access_token) do
      save_microsoft_connection(user_id, tokens, ms_user)
      redirect(conn, external: frontend_url() <> "/profile?microsoft=connected")
    else
      {:error, reason} ->
        Logger.error("Microsoft OAuth callback failed: #{inspect(reason)}")
        redirect(conn, external: frontend_url() <> "/profile?microsoft=error")
    end
  end

  def callback(conn, %{"error" => error}) do
    Logger.warning("Microsoft OAuth denied: #{error}")
    redirect(conn, external: frontend_url() <> "/profile?microsoft=denied")
  end

  @doc """
  GET /api/microsoft/status — check if current user has Microsoft connected.
  """
  def status(conn, _params) do
    user = conn.assigns.current_user

    case get_connection_for_user(user.id) do
      {:ok, connection} ->
        json(conn, %{connected: true, email: connection.email})

      _ ->
        json(conn, %{connected: false})
    end
  end

  @doc """
  POST /api/microsoft/disconnect — removes the Microsoft connection.
  """
  def disconnect(conn, _params) do
    user = conn.assigns.current_user

    case get_connection_for_user(user.id) do
      {:ok, connection} ->
        Ash.destroy!(connection)
        json(conn, %{ok: true})

      _ ->
        json(conn, %{ok: true})
    end
  end

  @doc """
  POST /api/meetings/:id/create-teams-meeting — manually create a Teams meeting.
  """
  def create_teams_meeting(conn, %{"id" => meeting_id}) do
    user = conn.assigns.current_user

    with {:ok, meeting} <- Ash.get(Saleflow.Sales.Meeting, meeting_id),
         :ok <- check_no_existing_teams(meeting),
         :ok <- check_ownership(meeting, user),
         {:ok, ms_conn} <- get_connection_for_user(user.id),
         {:ok, ms_conn} <- Graph.ensure_fresh_token(ms_conn) do
      # Build datetimes
      start_dt = build_datetime(meeting.meeting_date, meeting.meeting_time)
      end_dt = NaiveDateTime.add(start_dt, 3600)

      case Graph.create_calendar_event(ms_conn.access_token, %{
             subject: meeting.title,
             start_datetime: NaiveDateTime.to_iso8601(start_dt),
             end_datetime: NaiveDateTime.to_iso8601(end_dt)
           }) do
        {:ok, result} ->
          join_url = result.join_url
          event_id = result.event_id

          # Update meeting with teams info
          meeting
          |> Ash.Changeset.for_update(:update_teams, %{
            teams_join_url: join_url,
            teams_event_id: event_id
          })
          |> Ash.update!()

          # Audit log
          Saleflow.Audit.create_log(%{
            user_id: user.id,
            action: "teams.meeting_created",
            resource_type: "Meeting",
            resource_id: meeting.id
          })

          json(conn, %{ok: true, teams_join_url: join_url, teams_event_id: event_id})

        {:error, reason} ->
          Logger.error("Teams meeting creation failed: #{inspect(reason)}")
          conn |> put_status(:bad_gateway) |> json(%{error: "Failed to create Teams meeting"})
      end
    else
      {:error, :not_found} ->
        conn |> put_status(:not_found) |> json(%{error: "Not found"})

      {:error, :forbidden} ->
        conn |> put_status(:forbidden) |> json(%{error: "Access denied"})

      {:error, :teams_already_exists} ->
        conn
        |> put_status(:conflict)
        |> json(%{error: "Teams-möte finns redan för detta möte"})

      {:error, :no_connection} ->
        conn
        |> put_status(:unprocessable_entity)
        |> json(%{error: "No Microsoft connection. Connect Teams first."})

      {:error, reason} ->
        Logger.error("Teams meeting error: #{inspect(reason)}")
        conn |> put_status(:internal_server_error) |> json(%{error: "Unexpected error"})
    end
  end

  # --- Helpers ---

  defp find_user_by_email(email) do
    require Ash.Query

    case Saleflow.Accounts.User
         |> Ash.Query.filter(email == ^email)
         |> Ash.read_one() do
      {:ok, nil} -> {:error, :user_not_found}
      {:ok, user} -> {:ok, user}
      {:error, reason} -> {:error, reason}
    end
  end

  defp save_microsoft_connection(user_id, tokens, ms_user) do
    expires_at = DateTime.utc_now() |> DateTime.add(tokens.expires_in, :second)

    attrs = %{
      user_id: user_id,
      microsoft_user_id: ms_user.id,
      email: ms_user.email,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_expires_at: expires_at
    }

    case get_connection_for_user(user_id) do
      {:ok, existing} -> Ash.destroy!(existing)
      _ -> :ok
    end

    Saleflow.Accounts.MicrosoftConnection
    |> Ash.Changeset.for_create(:create, attrs)
    |> Ash.create()
  end

  defp get_connection_for_user(user_id) do
    require Ash.Query

    case Saleflow.Accounts.MicrosoftConnection
         |> Ash.Query.filter(user_id == ^user_id)
         |> Ash.read() do
      {:ok, [connection | _]} -> {:ok, connection}
      {:ok, []} -> {:error, :no_connection}
      {:error, reason} -> {:error, reason}
    end
  end

  defp check_no_existing_teams(meeting) do
    if meeting.teams_join_url do
      {:error, :teams_already_exists}
    else
      :ok
    end
  end

  defp check_ownership(_meeting, %{role: :admin}), do: :ok

  defp check_ownership(meeting, user) do
    if meeting.user_id == user.id, do: :ok, else: {:error, :forbidden}
  end

  defp build_datetime(date, time) do
    NaiveDateTime.new!(date, time)
  end

  defp frontend_url do
    # In prod, derive from PHX_HOST; in dev, use localhost
    case Application.get_env(:saleflow, SaleflowWeb.Endpoint)[:url][:host] do
      "localhost" -> "http://localhost:5173"
      host when is_binary(host) -> "https://#{host}"
      _ -> "http://localhost:5173"
    end
  end
end
