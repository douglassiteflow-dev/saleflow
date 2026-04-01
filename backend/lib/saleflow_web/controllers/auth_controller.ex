defmodule SaleflowWeb.AuthController do
  use SaleflowWeb, :controller

  alias Saleflow.Accounts

  @doc """
  Sign in with email and password. Step 1 of 2-step OTP flow.

  On success, creates an OTP and returns `%{otp_sent: true, user_id: id}`.
  The caller must then verify the OTP via `POST /api/auth/verify-otp`.
  """
  def sign_in(conn, %{"email" => email, "password" => password}) do
    case Accounts.sign_in(%{email: email, password: password}) do
      {:ok, user} ->
        {:ok, _otp} = Accounts.create_otp(user)

        conn
        |> put_status(:ok)
        |> json(%{otp_sent: true, user_id: user.id})

      {:error, _} ->
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
  and returns `%{user: ...}`.
  """
  def verify_otp(conn, %{"user_id" => user_id, "code" => code}) do
    case Accounts.verify_otp(user_id, code) do
      {:ok, user} ->
        ip = conn.remote_ip |> :inet.ntoa() |> to_string()
        ua = Plug.Conn.get_req_header(conn, "user-agent") |> List.first("")

        {:ok, session} = Accounts.create_login_session(user, %{ip_address: ip, user_agent: ua})

        conn
        |> put_session(:session_token, session.session_token)
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

  defp serialize_user(user) do
    %{
      id: user.id,
      email: to_string(user.email),
      name: user.name,
      role: user.role
    }
  end
end
