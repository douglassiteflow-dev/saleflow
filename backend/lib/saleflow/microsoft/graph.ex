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
  Creates a Teams meeting + calendar event with invitation.

  Strategy:
  1. Create online meeting via /me/onlineMeetings (gets join URL)
  2. Create calendar event with the join URL embedded + attendee (sends email invitation)
  """
  def create_meeting_with_invite(access_token, params) do
    # Step 1: Create the Teams online meeting
    Logger.info("MS Graph: Step 1 — creating online meeting")

    # onlineMeetings API requires ISO 8601 string with timezone offset (NOT nested object)
    # Sweden is UTC+2 in summer (CEST), UTC+1 in winter (CET)
    # Use +02:00 for now (April = summer time)
    online_params = %{
      subject: params.subject,
      startDateTime: params.start_datetime <> "+02:00",
      endDateTime: params.end_datetime <> "+02:00"
    }

    with {:ok, online_result} <- do_create_online_meeting(access_token, online_params) do
      join_url = online_result.join_url
      Logger.info("MS Graph: Step 1 OK — join_url=#{join_url}")

      # Step 2: Create calendar event with attendee + Teams link
      Logger.info("MS Graph: Step 2 — creating calendar event with attendee")

      meeting_body = """
      #{params[:description] || ""}

      Gå med i Teams-mötet:
      #{join_url}
      """

      event_body = %{
        subject: params.subject,
        start: %{dateTime: params.start_datetime, timeZone: "Europe/Stockholm"},
        end: %{dateTime: params.end_datetime, timeZone: "Europe/Stockholm"},
        body: %{contentType: "text", content: String.trim(meeting_body)},
        reminderMinutesBeforeStart: 15
      }

      event_body =
        if params[:attendee_email] && params[:attendee_email] != "" do
          Map.put(event_body, :attendees, [
            %{
              emailAddress: %{
                address: params.attendee_email,
                name: params[:attendee_name] || ""
              },
              type: "required"
            }
          ])
        else
          event_body
        end

      case Req.post("#{@graph_url}/me/events",
             json: event_body,
             headers: [{"authorization", "Bearer #{access_token}"}]
           ) do
        {:ok, %{status: 201, body: resp_body}} ->
          Logger.info("MS Graph: Step 2 OK — calendar event created, invitation sent")
          {:ok, %{
            event_id: resp_body["id"],
            join_url: join_url,
            web_link: resp_body["webLink"]
          }}

        {:ok, %{status: status, body: resp_body}} ->
          Logger.warning("MS Graph: Step 2 failed (#{status}), but Teams meeting exists. join_url=#{join_url}")
          # Return success with just the Teams link even if calendar fails
          {:ok, %{event_id: nil, join_url: join_url, web_link: nil}}

        {:error, reason} ->
          Logger.warning("MS Graph: Step 2 error: #{inspect(reason)}, but Teams meeting exists")
          {:ok, %{event_id: nil, join_url: join_url, web_link: nil}}
      end
    end
  end

  defp do_create_online_meeting(access_token, body) do
    case Req.post("#{@graph_url}/me/onlineMeetings",
           json: body,
           headers: [{"authorization", "Bearer #{access_token}"}]
         ) do
      {:ok, %{status: 201, body: resp_body}} ->
        {:ok, %{
          join_url: resp_body["joinWebUrl"],
          meeting_id: resp_body["id"]
        }}

      {:ok, %{status: status, body: resp_body}} ->
        Logger.error("MS Graph onlineMeetings failed: #{status} #{inspect(resp_body)}")
        {:error, {status, resp_body}}

      {:error, reason} ->
        Logger.error("MS Graph onlineMeetings error: #{inspect(reason)}")
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
