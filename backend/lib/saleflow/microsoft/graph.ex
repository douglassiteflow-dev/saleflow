defmodule Saleflow.Microsoft.Graph do
  @moduledoc """
  Microsoft Graph API client for Teams meetings and calendar events.
  """

  require Logger

  @graph_url "https://graph.microsoft.com/v1.0"

  @doc """
  Ensures the access token is fresh. Refreshes if expired.
  Returns `{:ok, connection}` with potentially updated tokens.
  """
  def ensure_fresh_token(connection) do
    if DateTime.compare(connection.token_expires_at, DateTime.utc_now()) == :lt do
      refresh_and_update(connection)
    else
      {:ok, connection}
    end
  end

  @doc """
  Creates an online Teams meeting via MS Graph.
  """
  def create_online_meeting(access_token, params) do
    body = %{
      subject: params.subject,
      startDateTime: params.start_datetime,
      endDateTime: params.end_datetime
    }

    body =
      if params[:attendee_email] do
        Map.put(body, :participants, %{
          attendees: [%{upn: params.attendee_email, role: "attendee"}]
        })
      else
        body
      end

    case Req.post("#{@graph_url}/me/onlineMeetings",
           json: body,
           headers: [{"authorization", "Bearer #{access_token}"}]
         ) do
      {:ok, %{status: 201, body: resp_body}} ->
        {:ok,
         %{
           join_url: resp_body["joinWebUrl"],
           meeting_id: resp_body["id"],
           join_info: resp_body
         }}

      {:ok, %{status: status, body: resp_body}} ->
        Logger.error("MS Graph create_online_meeting failed: #{status} #{inspect(resp_body)}")
        {:error, {status, resp_body}}

      {:error, reason} ->
        Logger.error("MS Graph create_online_meeting error: #{inspect(reason)}")
        {:error, reason}
    end
  end

  @doc """
  Creates a calendar event with Teams meeting link via MS Graph.
  """
  def create_calendar_event(access_token, params) do
    body = %{
      subject: params.subject,
      start: %{dateTime: params.start_datetime, timeZone: "Europe/Stockholm"},
      end: %{dateTime: params.end_datetime, timeZone: "Europe/Stockholm"},
      location: %{displayName: params[:location] || ""},
      body: %{contentType: "text", content: params[:description] || ""},
      isOnlineMeeting: true,
      onlineMeetingProvider: "teamsForBusiness",
      reminderMinutesBeforeStart: 15
    }

    body =
      if params[:attendee_email] do
        Map.put(body, :attendees, [
          %{
            emailAddress: %{
              address: params.attendee_email,
              name: params[:attendee_name] || ""
            },
            type: "required"
          }
        ])
      else
        body
      end

    case Req.post("#{@graph_url}/me/events",
           json: body,
           headers: [{"authorization", "Bearer #{access_token}"}]
         ) do
      {:ok, %{status: 201, body: resp_body}} ->
        Logger.info("MS Graph event created. onlineMeeting=#{inspect(resp_body["onlineMeeting"])}")

        join_url =
          get_in(resp_body, ["onlineMeeting", "joinUrl"]) ||
          get_in(resp_body, ["onlineMeeting", "joinWebUrl"]) ||
          resp_body["webLink"]

        {:ok,
         %{
           event_id: resp_body["id"],
           join_url: join_url,
           web_link: resp_body["webLink"]
         }}

      {:ok, %{status: status, body: resp_body}} ->
        Logger.error("MS Graph create_calendar_event failed: #{status} #{inspect(resp_body)}")
        {:error, {status, resp_body}}

      {:error, reason} ->
        Logger.error("MS Graph create_calendar_event error: #{inspect(reason)}")
        {:error, reason}
    end
  end

  @doc """
  Refreshes an access token using the refresh token.
  """
  def refresh_token(refresh_token_value) do
    case Req.post(
           "https://login.microsoftonline.com/#{tenant_id()}/oauth2/v2.0/token",
           form: [
             client_id: client_id(),
             client_secret: client_secret(),
             grant_type: "refresh_token",
             refresh_token: refresh_token_value,
             scope:
               "openid profile email Calendars.ReadWrite OnlineMeetings.ReadWrite User.Read offline_access"
           ]
         ) do
      {:ok, %{status: 200, body: body}} ->
        {:ok,
         %{
           access_token: body["access_token"],
           refresh_token: body["refresh_token"] || refresh_token_value,
           expires_in: body["expires_in"]
         }}

      {:ok, %{status: status, body: body}} ->
        Logger.error("MS token refresh failed: #{status} #{inspect(body)}")
        {:error, :refresh_failed}

      {:error, reason} ->
        Logger.error("MS token refresh error: #{inspect(reason)}")
        {:error, :refresh_failed}
    end
  end

  @doc """
  Exchanges an authorization code for tokens.
  """
  def exchange_code(code) do
    case Req.post(
           "https://login.microsoftonline.com/#{tenant_id()}/oauth2/v2.0/token",
           form: [
             client_id: client_id(),
             client_secret: client_secret(),
             grant_type: "authorization_code",
             code: code,
             redirect_uri: redirect_uri(),
             scope:
               "openid profile email Calendars.ReadWrite OnlineMeetings.ReadWrite User.Read offline_access"
           ]
         ) do
      {:ok, %{status: 200, body: body}} ->
        {:ok,
         %{
           access_token: body["access_token"],
           refresh_token: body["refresh_token"],
           expires_in: body["expires_in"]
         }}

      {:ok, %{status: status, body: body}} ->
        Logger.error("MS code exchange failed: #{status} #{inspect(body)}")
        {:error, {status, body}}

      {:error, reason} ->
        Logger.error("MS code exchange error: #{inspect(reason)}")
        {:error, reason}
    end
  end

  @doc """
  Gets the current user's profile from MS Graph.
  """
  def get_me(access_token) do
    case Req.get("#{@graph_url}/me",
           headers: [{"authorization", "Bearer #{access_token}"}]
         ) do
      {:ok, %{status: 200, body: body}} ->
        {:ok,
         %{
           id: body["id"],
           email: body["mail"] || body["userPrincipalName"],
           display_name: body["displayName"]
         }}

      {:ok, %{status: status, body: body}} ->
        {:error, {status, body}}

      {:error, reason} ->
        {:error, reason}
    end
  end

  # --- Private helpers ---

  defp refresh_and_update(connection) do
    case refresh_token(connection.refresh_token) do
      {:ok, tokens} ->
        expires_at =
          DateTime.utc_now()
          |> DateTime.add(tokens.expires_in, :second)

        case connection
             |> Ash.Changeset.for_update(:update_tokens, %{
               access_token: tokens.access_token,
               refresh_token: tokens.refresh_token,
               token_expires_at: expires_at
             })
             |> Ash.update() do
          {:ok, updated} -> {:ok, updated}
          {:error, reason} -> {:error, reason}
        end

      {:error, reason} ->
        {:error, reason}
    end
  end

  def tenant_id, do: Application.get_env(:saleflow, :microsoft_tenant_id)
  def client_id, do: Application.get_env(:saleflow, :microsoft_client_id)
  def client_secret, do: Application.get_env(:saleflow, :microsoft_client_secret)
  def redirect_uri, do: Application.get_env(:saleflow, :microsoft_redirect_uri)
end
