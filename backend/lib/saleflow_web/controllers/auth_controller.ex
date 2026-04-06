defmodule SaleflowWeb.AuthController do
  use SaleflowWeb, :controller

  alias Saleflow.Accounts

  @device_cookie "saleflow_device_token"
  @thirty_days 30 * 24 * 3600

  @doc """
  Sign in with email and password. Step 1 of 2-step OTP flow.

  If a valid `device_token` cookie exists for this user, skips OTP entirely
  and returns `%{user: ...}` directly. Otherwise creates an OTP and returns
  `%{otp_sent: true, user_id: id}`.
  """
  def sign_in(conn, %{"email" => email, "password" => password}) do
    origin = Plug.Conn.get_req_header(conn, "origin") |> List.first("unknown")
    ua = Plug.Conn.get_req_header(conn, "user-agent") |> List.first("unknown")
    Logger.info("SIGN_IN attempt: email=#{email} origin=#{origin} ua=#{String.slice(ua, 0, 50)} pw_len=#{String.length(password)}")

    case Accounts.sign_in(%{email: email, password: password}) do
      {:ok, user} ->
        Logger.info("SIGN_IN success: #{email}")

        if Application.get_env(:saleflow, :skip_otp, false) do
          # Skip OTP entirely (staging) — create session directly
          create_direct_session(conn, user)
        else
          # Check for trusted device cookie
          device_token = conn.cookies[@device_cookie]

          if device_token && device_token != "" do
            case Accounts.find_trusted_device(user.id, device_token) do
              {:ok, device} when not is_nil(device) ->
                create_direct_session(conn, user)

              _ ->
                send_otp_response(conn, user)
            end
          else
            send_otp_response(conn, user)
          end
        end

      {:error, reason} ->
        Logger.warning("SIGN_IN failed: email=#{email} reason=#{inspect(reason)}")

        conn
        |> put_status(:unauthorized)
        |> json(%{error: "Invalid email or password"})
    end
  end

  def sign_in(conn, _params) do
    conn
    |> put_status(:bad_request)
    |> json(%{error: "email and password are required"})
  end

  @doc """
  Verify OTP code. Step 2 of 2-step OTP flow.

  On success, creates a LoginSession, puts session_token in the Phoenix session,
  and returns `%{user: ...}`. If `remember_me: true` is passed, also creates a
  trusted device and sets a long-lived cookie.
  """
  def verify_otp(conn, %{"user_id" => user_id, "code" => code} = params) do
    case Accounts.verify_otp(user_id, code) do
      {:ok, user} ->
        ip = conn.remote_ip |> :inet.ntoa() |> to_string()
        ua = Plug.Conn.get_req_header(conn, "user-agent") |> List.first("")

        {:ok, session} = Accounts.create_login_session(user, %{ip_address: ip, user_agent: ua})

        conn = put_session(conn, :session_token, session.session_token)

        conn =
          if params["remember_me"] == true do
            device_name = parse_device_name(ua)
            {:ok, device} = Accounts.create_trusted_device(user, device_name)

            put_resp_cookie(conn, @device_cookie, device.device_token,
              http_only: true,
              secure: Application.get_env(:saleflow, :cookie_secure, false),
              max_age: @thirty_days,
              same_site: "Lax",
              path: "/"
            )
          else
            conn
          end

        conn
        |> put_status(:ok)
        |> json(%{user: serialize_user(user)})

      {:error, :rate_limited} ->
        conn
        |> put_status(:too_many_requests)
        |> json(%{error: "Too many attempts. Please wait before trying again."})

      {:error, _} ->
        conn
        |> put_status(:unauthorized)
        |> json(%{error: "Invalid or expired OTP code"})
    end
  end

  def verify_otp(conn, _params) do
    conn
    |> put_status(:bad_request)
    |> json(%{error: "user_id and code are required"})
  end

  @doc """
  Returns the currently authenticated user.
  """
  def me(conn, _params) do
    user = conn.assigns.current_user
    json(conn, %{user: serialize_user(user)})
  end

  @doc """
  Signs out by marking the LoginSession as logged out and dropping the session.
  """
  def sign_out(conn, _params) do
    Accounts.logout_session(conn.assigns.current_session)

    conn
    |> configure_session(drop: true)
    |> json(%{ok: true})
  end

  # ---------------------------------------------------------------------------
  # Password reset endpoints
  # ---------------------------------------------------------------------------

  @doc """
  Request a password reset email. Always returns `{ok: true}` to avoid leaking
  whether the email exists.
  """
  def forgot_password(conn, %{"email" => email}) do
    Accounts.request_password_reset(email)

    conn
    |> put_status(:ok)
    |> json(%{ok: true})
  end

  def forgot_password(conn, _params) do
    conn
    |> put_status(:bad_request)
    |> json(%{error: "email is required"})
  end

  @doc """
  Reset password using a valid token. Returns `{ok: true}` on success.
  """
  def reset_password(conn, %{
        "token" => token,
        "password" => password,
        "password_confirmation" => password_confirmation
      }) do
    case Accounts.reset_password(token, password, password_confirmation) do
      {:ok, _user} ->
        conn
        |> put_status(:ok)
        |> json(%{ok: true})

      {:error, :invalid_or_expired_token} ->
        conn
        |> put_status(:bad_request)
        |> json(%{error: "Invalid or expired reset token"})

      {:error, :passwords_do_not_match} ->
        conn
        |> put_status(:bad_request)
        |> json(%{error: "Passwords do not match"})

      {:error, _reason} ->
        conn
        |> put_status(:bad_request)
        |> json(%{error: "Failed to reset password"})
    end
  end

  def reset_password(conn, _params) do
    conn
    |> put_status(:bad_request)
    |> json(%{error: "token, password, and password_confirmation are required"})
  end

  # ---------------------------------------------------------------------------
  # Private helpers
  # ---------------------------------------------------------------------------

  defp send_otp_response(conn, user) do
    {:ok, _otp} = Accounts.create_otp(user)

    conn
    |> put_status(:ok)
    |> json(%{otp_sent: true, user_id: user.id})
  end

  defp create_direct_session(conn, user) do
    ip = conn.remote_ip |> :inet.ntoa() |> to_string()
    ua = Plug.Conn.get_req_header(conn, "user-agent") |> List.first("")

    {:ok, session} =
      Accounts.create_login_session(user, %{ip_address: ip, user_agent: ua})

    conn
    |> put_session(:session_token, session.session_token)
    |> put_status(:ok)
    |> json(%{user: serialize_user(user)})
  end

  defp serialize_user(user) do
    %{
      id: user.id,
      email: to_string(user.email),
      name: user.name,
      role: user.role
    }
  end

  defp parse_device_name(user_agent) when is_binary(user_agent) and user_agent != "" do
    ua = Saleflow.Auth.UserAgentParser.parse(user_agent)
    parts = [ua.browser, ua.device_type] |> Enum.filter(& &1) |> Enum.filter(&(&1 != ""))

    case parts do
      [] -> "Unknown device"
      _ -> Enum.join(parts, " / ")
    end
  end

  defp parse_device_name(_), do: "Unknown device"
end
