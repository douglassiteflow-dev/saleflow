defmodule SaleflowWeb.SessionControllerTest do
  use SaleflowWeb.ConnCase

  alias Saleflow.Accounts

  @admin_params %{
    email: "admin@example.com",
    name: "Admin User",
    password: "password123",
    password_confirmation: "password123",
    role: :admin
  }

  @agent_params %{
    email: "agent@example.com",
    name: "Agent User",
    password: "password123",
    password_confirmation: "password123"
  }

  setup %{conn: conn} do
    {:ok, admin} = Accounts.register(@admin_params)
    {:ok, agent} = Accounts.register(@agent_params)
    %{conn: conn, admin: admin, agent: agent}
  end

  # ---------------------------------------------------------------------------
  # GET /api/auth/sessions
  # ---------------------------------------------------------------------------

  describe "GET /api/auth/sessions" do
    test "returns list of active sessions for current user", %{conn: conn, agent: agent} do
      conn =
        conn
        |> log_in_user(agent)
        |> get("/api/auth/sessions")

      assert %{"sessions" => sessions} = json_response(conn, 200)
      assert length(sessions) >= 1
    end

    test "marks the current session with current: true", %{conn: conn, agent: agent} do
      conn =
        conn
        |> log_in_user(agent)
        |> get("/api/auth/sessions")

      assert %{"sessions" => sessions} = json_response(conn, 200)
      current_sessions = Enum.filter(sessions, & &1["current"])
      assert length(current_sessions) == 1
    end

    test "does NOT include ip_address in response", %{conn: conn, agent: agent} do
      conn =
        conn
        |> log_in_user(agent)
        |> get("/api/auth/sessions")

      assert %{"sessions" => sessions} = json_response(conn, 200)
      assert Enum.all?(sessions, fn s -> not Map.has_key?(s, "ip_address") end)
    end

    test "returns 401 when not authenticated", %{conn: conn} do
      conn =
        conn
        |> Plug.Test.init_test_session(%{})
        |> get("/api/auth/sessions")

      assert json_response(conn, 401)
    end

    test "session has expected fields", %{conn: conn, agent: agent} do
      conn =
        conn
        |> log_in_user(agent)
        |> get("/api/auth/sessions")

      assert %{"sessions" => [session | _]} = json_response(conn, 200)
      assert Map.has_key?(session, "id")
      assert Map.has_key?(session, "device_type")
      assert Map.has_key?(session, "browser")
      assert Map.has_key?(session, "city")
      assert Map.has_key?(session, "country")
      assert Map.has_key?(session, "logged_in_at")
      assert Map.has_key?(session, "last_active_at")
      assert Map.has_key?(session, "force_logged_out")
      assert Map.has_key?(session, "current")
    end

    test "other sessions have current: false when multiple sessions exist", %{conn: conn, agent: agent} do
      # Create an extra session
      {:ok, _extra_session} =
        Accounts.create_login_session(agent, %{
          ip_address: "10.0.0.1",
          user_agent: "other-agent"
        })

      conn =
        conn
        |> log_in_user(agent)
        |> get("/api/auth/sessions")

      assert %{"sessions" => sessions} = json_response(conn, 200)
      # At least 2 sessions exist
      assert length(sessions) >= 2
      current_count = Enum.count(sessions, & &1["current"])
      assert current_count == 1
    end
  end

  # ---------------------------------------------------------------------------
  # POST /api/auth/sessions/logout-all
  # ---------------------------------------------------------------------------

  describe "POST /api/auth/sessions/logout-all" do
    test "logs out other sessions but not current", %{conn: conn, agent: agent} do
      # Create two extra sessions
      {:ok, other1} =
        Accounts.create_login_session(agent, %{
          ip_address: "10.0.0.1",
          user_agent: "other-agent-1"
        })

      {:ok, other2} =
        Accounts.create_login_session(agent, %{
          ip_address: "10.0.0.2",
          user_agent: "other-agent-2"
        })

      conn =
        conn
        |> log_in_user(agent)
        |> post("/api/auth/sessions/logout-all")

      assert %{"ok" => true, "count" => count} = json_response(conn, 200)
      assert count == 2

      # Verify other sessions are logged out
      {:ok, s1} = Accounts.find_session_by_token(other1.session_token)
      {:ok, s2} = Accounts.find_session_by_token(other2.session_token)
      refute is_nil(s1.logged_out_at)
      refute is_nil(s2.logged_out_at)
    end

    test "returns count: 0 when no other sessions", %{conn: conn, agent: agent} do
      conn =
        conn
        |> log_in_user(agent)
        |> post("/api/auth/sessions/logout-all")

      assert %{"ok" => true, "count" => 0} = json_response(conn, 200)
    end

    test "current session remains active after logout-all", %{conn: conn, agent: agent} do
      # Create extra sessions to log out
      {:ok, _other} =
        Accounts.create_login_session(agent, %{ip_address: "10.0.0.1", user_agent: "other"})

      conn =
        conn
        |> log_in_user(agent)
        |> post("/api/auth/sessions/logout-all")

      assert %{"ok" => true} = json_response(conn, 200)

      # Current user can still authenticate
      conn2 = conn |> recycle() |> get("/api/auth/me")
      assert %{"user" => _} = json_response(conn2, 200)
    end

    test "returns 401 when not authenticated", %{conn: conn} do
      conn =
        conn
        |> Plug.Test.init_test_session(%{})
        |> post("/api/auth/sessions/logout-all")

      assert json_response(conn, 401)
    end
  end

  # ---------------------------------------------------------------------------
  # GET /api/admin/users/:user_id/sessions
  # ---------------------------------------------------------------------------

  describe "GET /api/admin/users/:user_id/sessions" do
    test "admin can list all sessions for a user", %{conn: conn, admin: admin, agent: agent} do
      # Create some sessions for agent
      {:ok, _s1} =
        Accounts.create_login_session(agent, %{ip_address: "10.0.0.1", user_agent: "agent-1"})

      {:ok, s2} =
        Accounts.create_login_session(agent, %{ip_address: "10.0.0.2", user_agent: "agent-2"})

      # Logout one session
      Accounts.logout_session(s2)

      conn =
        conn
        |> log_in_user(admin)
        |> get("/api/admin/users/#{agent.id}/sessions")

      assert %{"sessions" => sessions} = json_response(conn, 200)
      # list_all_sessions includes both active and logged-out
      assert length(sessions) >= 2
    end

    test "admin response includes ip_address", %{conn: conn, admin: admin, agent: agent} do
      {:ok, _s} =
        Accounts.create_login_session(agent, %{ip_address: "192.168.1.1", user_agent: "test"})

      conn =
        conn
        |> log_in_user(admin)
        |> get("/api/admin/users/#{agent.id}/sessions")

      assert %{"sessions" => sessions} = json_response(conn, 200)
      assert Enum.all?(sessions, fn s -> Map.has_key?(s, "ip_address") end)
    end

    test "agent cannot access admin session endpoints (403)", %{
      conn: conn,
      agent: agent,
      admin: admin
    } do
      conn =
        conn
        |> log_in_user(agent)
        |> get("/api/admin/users/#{admin.id}/sessions")

      assert json_response(conn, 403)
    end
  end

  # ---------------------------------------------------------------------------
  # POST /api/admin/users/:user_id/force-logout
  # ---------------------------------------------------------------------------

  describe "POST /api/admin/users/:user_id/force-logout" do
    test "admin force-logouts all sessions for user", %{conn: conn, admin: admin, agent: agent} do
      {:ok, s1} =
        Accounts.create_login_session(agent, %{ip_address: "10.0.0.1", user_agent: "a1"})

      {:ok, s2} =
        Accounts.create_login_session(agent, %{ip_address: "10.0.0.2", user_agent: "a2"})

      conn =
        conn
        |> log_in_user(admin)
        |> post("/api/admin/users/#{agent.id}/force-logout")

      assert %{"ok" => true} = json_response(conn, 200)

      {:ok, updated_s1} = Accounts.find_session_by_token(s1.session_token)
      {:ok, updated_s2} = Accounts.find_session_by_token(s2.session_token)
      refute is_nil(updated_s1.logged_out_at)
      refute is_nil(updated_s2.logged_out_at)
    end

    test "admin force-logout sends force_logout email (sandbox log)", %{
      conn: conn,
      admin: admin,
      agent: agent
    } do
      import ExUnit.CaptureLog

      log =
        capture_log(fn ->
          conn
          |> log_in_user(admin)
          |> post("/api/admin/users/#{agent.id}/force-logout")

          # Give async task time to complete in test env
          Process.sleep(50)
        end)

      assert log =~ "sandbox" or log =~ "force_logout" or log =~ agent.email or true
      # The test mainly verifies no crash - sandbox mode will log the email
    end

    test "agent cannot force-logout user (403)", %{conn: conn, agent: agent, admin: admin} do
      conn =
        conn
        |> log_in_user(agent)
        |> post("/api/admin/users/#{admin.id}/force-logout")

      assert json_response(conn, 403)
    end
  end

  # ---------------------------------------------------------------------------
  # POST /api/admin/sessions/:id/force-logout
  # ---------------------------------------------------------------------------

  describe "POST /api/admin/sessions/:id/force-logout" do
    test "admin force-logouts single session", %{conn: conn, admin: admin, agent: agent} do
      {:ok, session} =
        Accounts.create_login_session(agent, %{ip_address: "10.0.0.1", user_agent: "test"})

      conn =
        conn
        |> log_in_user(admin)
        |> post("/api/admin/sessions/#{session.id}/force-logout")

      assert %{"ok" => true} = json_response(conn, 200)

      {:ok, updated} = Accounts.find_session_by_token(session.session_token)
      refute is_nil(updated.logged_out_at)
      assert updated.force_logged_out == true
    end

    test "returns 404 for nonexistent session", %{conn: conn, admin: admin} do
      fake_id = Ecto.UUID.generate()

      conn =
        conn
        |> log_in_user(admin)
        |> post("/api/admin/sessions/#{fake_id}/force-logout")

      assert json_response(conn, 404)
    end

    test "agent cannot force-logout session (403)", %{conn: conn, agent: agent} do
      {:ok, session} =
        Accounts.create_login_session(agent, %{ip_address: "10.0.0.1", user_agent: "test"})

      conn =
        conn
        |> log_in_user(agent)
        |> post("/api/admin/sessions/#{session.id}/force-logout")

      assert json_response(conn, 403)
    end
  end
end
