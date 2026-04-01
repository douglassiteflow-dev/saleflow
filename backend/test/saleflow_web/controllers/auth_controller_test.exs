defmodule SaleflowWeb.AuthControllerTest do
  use SaleflowWeb.ConnCase

  alias Saleflow.Accounts

  @user_params %{
    email: "agent@example.com",
    name: "Jane Agent",
    password: "password123",
    password_confirmation: "password123"
  }

  setup %{conn: conn} do
    {:ok, user} = Accounts.register(@user_params)
    %{conn: conn, user: user}
  end

  # ---------------------------------------------------------------------------
  # POST /api/auth/sign-in  (Step 1 — sends OTP, no session yet)
  # ---------------------------------------------------------------------------

  describe "POST /api/auth/sign-in" do
    test "returns otp_sent and user_id with valid credentials", %{conn: conn, user: user} do
      conn =
        conn
        |> Plug.Test.init_test_session(%{})
        |> post("/api/auth/sign-in", %{email: "agent@example.com", password: "password123"})

      assert %{"otp_sent" => true, "user_id" => uid} = json_response(conn, 200)
      assert uid == user.id

      # No session_token should be set yet (OTP not verified)
      refute get_session(conn, :session_token)
    end

    test "returns 401 with bad password", %{conn: conn} do
      conn =
        conn
        |> Plug.Test.init_test_session(%{})
        |> post("/api/auth/sign-in", %{email: "agent@example.com", password: "wrongpassword"})

      assert %{"error" => _} = json_response(conn, 401)
    end

    test "returns 401 with unknown email", %{conn: conn} do
      conn =
        conn
        |> Plug.Test.init_test_session(%{})
        |> post("/api/auth/sign-in", %{email: "nobody@example.com", password: "password123"})

      assert %{"error" => _} = json_response(conn, 401)
    end

    test "returns 400 with missing params", %{conn: conn} do
      conn =
        conn
        |> Plug.Test.init_test_session(%{})
        |> post("/api/auth/sign-in", %{})

      assert %{"error" => _} = json_response(conn, 400)
    end
  end

  # ---------------------------------------------------------------------------
  # POST /api/auth/verify-otp  (Step 2 — verifies OTP, creates session)
  # ---------------------------------------------------------------------------

  describe "POST /api/auth/verify-otp" do
    test "returns user and sets session with valid OTP", %{conn: conn, user: user} do
      {:ok, otp} = Accounts.create_otp(user)

      conn =
        conn
        |> Plug.Test.init_test_session(%{})
        |> post("/api/auth/verify-otp", %{user_id: user.id, code: otp.code})

      assert %{"user" => user_json} = json_response(conn, 200)
      assert user_json["email"] == "agent@example.com"
      assert user_json["name"] == "Jane Agent"
      assert user_json["role"] == "agent"
      refute is_nil(user_json["id"])

      # Session should contain session_token
      assert get_session(conn, :session_token) != nil
    end

    test "returns 401 with wrong code", %{conn: conn, user: user} do
      # Create a real OTP so the user has one, but send a wrong code
      {:ok, _otp} = Accounts.create_otp(user)

      conn =
        conn
        |> Plug.Test.init_test_session(%{})
        |> post("/api/auth/verify-otp", %{user_id: user.id, code: "000000"})

      assert %{"error" => _} = json_response(conn, 401)
    end

    test "returns 401 with expired code", %{conn: conn, user: user} do
      {:ok, otp} = Accounts.create_otp(user)

      # Expire the OTP by setting expires_at in the past
      otp
      |> Ash.Changeset.for_update(:expire, %{})
      |> Ash.update!()

      conn =
        conn
        |> Plug.Test.init_test_session(%{})
        |> post("/api/auth/verify-otp", %{user_id: user.id, code: otp.code})

      assert %{"error" => _} = json_response(conn, 401)
    end

    test "returns 400 with missing params", %{conn: conn} do
      conn =
        conn
        |> Plug.Test.init_test_session(%{})
        |> post("/api/auth/verify-otp", %{})

      assert %{"error" => _} = json_response(conn, 400)
    end
  end

  # ---------------------------------------------------------------------------
  # GET /api/auth/me
  # ---------------------------------------------------------------------------

  describe "GET /api/auth/me" do
    test "returns user when authenticated via session_token", %{conn: conn, user: user} do
      conn =
        conn
        |> log_in_user(user)
        |> get("/api/auth/me")

      assert %{"user" => user_json} = json_response(conn, 200)
      assert user_json["email"] == "agent@example.com"
      assert user_json["name"] == "Jane Agent"
    end

    test "returns 401 when not authenticated", %{conn: conn} do
      conn =
        conn
        |> Plug.Test.init_test_session(%{})
        |> get("/api/auth/me")

      assert json_response(conn, 401)
    end

    test "returns 401 when session has been force-logged-out", %{conn: conn, user: user} do
      # Create a login session and log in
      {:ok, session} =
        Accounts.create_login_session(user, %{
          ip_address: "127.0.0.1",
          user_agent: "test-agent"
        })

      # Force-logout the session
      {:ok, _} = Accounts.logout_session(session)

      conn =
        conn
        |> Plug.Test.init_test_session(%{})
        |> Plug.Conn.put_session(:session_token, session.session_token)
        |> get("/api/auth/me")

      assert json_response(conn, 401)
    end
  end

  # ---------------------------------------------------------------------------
  # POST /api/auth/sign-out
  # ---------------------------------------------------------------------------

  describe "POST /api/auth/sign-out" do
    test "sets logged_out_at on the LoginSession and clears session", %{conn: conn, user: user} do
      # Create a login session
      {:ok, login_session} =
        Accounts.create_login_session(user, %{
          ip_address: "127.0.0.1",
          user_agent: "test-agent"
        })

      conn =
        conn
        |> Plug.Test.init_test_session(%{})
        |> Plug.Conn.put_session(:session_token, login_session.session_token)
        |> post("/api/auth/sign-out")

      assert %{"ok" => true} = json_response(conn, 200)

      # Verify LoginSession was marked as logged out
      {:ok, updated_session} = Accounts.find_session_by_token(login_session.session_token)
      refute is_nil(updated_session.logged_out_at)

      # Verify session is cleared by making an authenticated request
      conn_after =
        conn
        |> recycle()
        |> get("/api/auth/me")

      assert json_response(conn_after, 401)
    end
  end
end
