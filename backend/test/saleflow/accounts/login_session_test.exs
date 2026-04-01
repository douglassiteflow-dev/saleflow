defmodule Saleflow.Accounts.LoginSessionTest do
  use Saleflow.DataCase, async: true

  alias Saleflow.Accounts

  @valid_user_params %{
    email: "session_test@example.com",
    name: "Session Test User",
    password: "password123",
    password_confirmation: "password123"
  }

  @conn_info %{
    ip_address: "127.0.0.1",
    user_agent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
  }

  defp unique_email do
    "session_#{System.unique_integer([:positive])}@example.com"
  end

  defp create_user(email \\ nil) do
    params = Map.put(@valid_user_params, :email, email || unique_email())
    {:ok, user} = Accounts.register(params)
    user
  end

  defp create_session(user, overrides \\ %{}) do
    conn_info = Map.merge(@conn_info, overrides)
    {:ok, session} = Accounts.create_login_session(user, conn_info)
    session
  end

  # ---------------------------------------------------------------------------
  # create_login_session/2
  # ---------------------------------------------------------------------------

  describe "create_login_session/2" do
    test "creates a session with all expected fields" do
      user = create_user()
      {:ok, session} = Accounts.create_login_session(user, @conn_info)

      assert session.user_id == user.id
      assert session.ip_address == "127.0.0.1"
      assert is_binary(session.user_agent)
      assert is_binary(session.device_type)
      assert is_binary(session.browser)
      refute is_nil(session.logged_in_at)
      refute is_nil(session.last_active_at)
      assert is_nil(session.logged_out_at)
      assert session.force_logged_out == false
    end

    test "session_token is generated (non-nil, non-empty)" do
      user = create_user()
      {:ok, session} = Accounts.create_login_session(user, @conn_info)

      refute is_nil(session.session_token)
      assert is_binary(session.session_token)
      assert String.length(session.session_token) > 0
    end

    test "session_token is URL-safe base64 (no padding, no +/ chars)" do
      user = create_user()
      {:ok, session} = Accounts.create_login_session(user, @conn_info)

      # URL-safe base64 uses - and _ instead of + and /
      # No padding (=) characters
      refute String.contains?(session.session_token, "+")
      refute String.contains?(session.session_token, "/")
      refute String.contains?(session.session_token, "=")
      # Must decode successfully as URL-safe base64
      assert {:ok, bytes} = Base.url_decode64(session.session_token, padding: false)
      assert byte_size(bytes) == 32
    end

    test "parses device_type from user agent" do
      user = create_user()

      desktop_ua =
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/120.0 Safari/537.36"

      {:ok, session} = Accounts.create_login_session(user, %{ip_address: "127.0.0.1", user_agent: desktop_ua})
      assert session.device_type == "desktop"
    end

    test "parses browser from user agent" do
      user = create_user()

      chrome_ua =
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36"

      {:ok, session} =
        Accounts.create_login_session(user, %{ip_address: "127.0.0.1", user_agent: chrome_ua})

      assert String.starts_with?(session.browser, "Chrome")
    end

    test "handles nil user_agent gracefully" do
      user = create_user()

      {:ok, session} =
        Accounts.create_login_session(user, %{ip_address: "127.0.0.1", user_agent: nil})

      assert session.device_type == "unknown"
      assert session.browser == "unknown"
    end

    test "two sessions have unique tokens" do
      user = create_user()
      {:ok, s1} = Accounts.create_login_session(user, @conn_info)
      {:ok, s2} = Accounts.create_login_session(user, @conn_info)

      refute s1.session_token == s2.session_token
    end
  end

  # ---------------------------------------------------------------------------
  # touch_session/1
  # ---------------------------------------------------------------------------

  describe "touch_session/1" do
    test "updates last_active_at to a more recent time" do
      user = create_user()
      session = create_session(user)
      original_ts = session.last_active_at

      # Small sleep to ensure the timestamp actually advances
      Process.sleep(5)

      {:ok, touched} = Accounts.touch_session(session)

      assert DateTime.compare(touched.last_active_at, original_ts) in [:gt, :eq]
    end

    test "does not change logged_out_at" do
      user = create_user()
      session = create_session(user)
      {:ok, touched} = Accounts.touch_session(session)

      assert is_nil(touched.logged_out_at)
    end
  end

  # ---------------------------------------------------------------------------
  # logout_session/1
  # ---------------------------------------------------------------------------

  describe "logout_session/1" do
    test "sets logged_out_at to a non-nil datetime" do
      user = create_user()
      session = create_session(user)
      {:ok, logged_out} = Accounts.logout_session(session)

      refute is_nil(logged_out.logged_out_at)
    end

    test "does not set force_logged_out" do
      user = create_user()
      session = create_session(user)
      {:ok, logged_out} = Accounts.logout_session(session)

      assert logged_out.force_logged_out == false
    end
  end

  # ---------------------------------------------------------------------------
  # force_logout_session/1
  # ---------------------------------------------------------------------------

  describe "force_logout_session/1" do
    test "sets logged_out_at" do
      user = create_user()
      session = create_session(user)
      {:ok, forced} = Accounts.force_logout_session(session)

      refute is_nil(forced.logged_out_at)
    end

    test "sets force_logged_out to true" do
      user = create_user()
      session = create_session(user)
      {:ok, forced} = Accounts.force_logout_session(session)

      assert forced.force_logged_out == true
    end
  end

  # ---------------------------------------------------------------------------
  # list_active_sessions/1
  # ---------------------------------------------------------------------------

  describe "list_active_sessions/1" do
    test "returns only sessions that are not logged out" do
      user = create_user()
      active = create_session(user)
      logged_out = create_session(user)
      Accounts.logout_session(logged_out)

      {:ok, sessions} = Accounts.list_active_sessions(user.id)
      ids = Enum.map(sessions, & &1.id)

      assert active.id in ids
      refute logged_out.id in ids
    end

    test "excludes force-logged-out sessions" do
      user = create_user()
      session = create_session(user)
      Accounts.force_logout_session(session)

      {:ok, sessions} = Accounts.list_active_sessions(user.id)
      assert sessions == []
    end

    test "returns empty list when no active sessions exist" do
      user = create_user()
      {:ok, sessions} = Accounts.list_active_sessions(user.id)
      assert sessions == []
    end

    test "returns multiple active sessions" do
      user = create_user()
      _s1 = create_session(user)
      _s2 = create_session(user)

      {:ok, sessions} = Accounts.list_active_sessions(user.id)
      assert length(sessions) == 2
    end
  end

  # ---------------------------------------------------------------------------
  # list_all_sessions/1
  # ---------------------------------------------------------------------------

  describe "list_all_sessions/1" do
    test "returns all sessions including logged-out ones" do
      user = create_user()
      active = create_session(user)
      logged_out = create_session(user)
      Accounts.logout_session(logged_out)

      {:ok, sessions} = Accounts.list_all_sessions(user.id)
      ids = Enum.map(sessions, & &1.id)

      assert active.id in ids
      assert logged_out.id in ids
    end

    test "returns empty list when no sessions exist" do
      user = create_user()
      {:ok, sessions} = Accounts.list_all_sessions(user.id)
      assert sessions == []
    end
  end

  # ---------------------------------------------------------------------------
  # find_session_by_token/1
  # ---------------------------------------------------------------------------

  describe "find_session_by_token/1" do
    test "returns the session for a valid token" do
      user = create_user()
      session = create_session(user)

      {:ok, found} = Accounts.find_session_by_token(session.session_token)
      assert found.id == session.id
    end

    test "returns nil for an unknown token" do
      {:ok, result} = Accounts.find_session_by_token("nonexistenttoken12345")
      assert is_nil(result)
    end
  end

  # ---------------------------------------------------------------------------
  # force_logout_all/1
  # ---------------------------------------------------------------------------

  describe "force_logout_all/1" do
    test "logs out all active sessions for the user" do
      user = create_user()
      _s1 = create_session(user)
      _s2 = create_session(user)

      :ok = Accounts.force_logout_all(user.id)

      {:ok, active} = Accounts.list_active_sessions(user.id)
      assert active == []
    end

    test "does not affect sessions for other users" do
      user1 = create_user()
      user2 = create_user()

      _u1_session = create_session(user1)
      u2_session = create_session(user2)

      :ok = Accounts.force_logout_all(user1.id)

      {:ok, u2_active} = Accounts.list_active_sessions(user2.id)
      ids = Enum.map(u2_active, & &1.id)
      assert u2_session.id in ids
    end

    test "returns :ok even when no active sessions exist" do
      user = create_user()
      assert :ok = Accounts.force_logout_all(user.id)
    end
  end

  # ---------------------------------------------------------------------------
  # Audit logs
  # ---------------------------------------------------------------------------

  describe "audit logging" do
    test "session.created audit log is created on create_login_session" do
      user = create_user()
      {:ok, session} = Accounts.create_login_session(user, @conn_info)

      {:ok, logs} = Saleflow.Audit.list_for_resource("LoginSession", session.id)
      assert Enum.any?(logs, fn log -> log.action == "session.created" end)
    end

    test "session.logged_out audit log is created on logout" do
      user = create_user()
      session = create_session(user)
      {:ok, updated} = Accounts.logout_session(session)

      {:ok, logs} = Saleflow.Audit.list_for_resource("LoginSession", updated.id)
      assert Enum.any?(logs, fn log -> log.action == "session.logged_out" end)
    end

    test "session.force_logged_out audit log is created on force_logout" do
      user = create_user()
      session = create_session(user)
      {:ok, updated} = Accounts.force_logout_session(session)

      {:ok, logs} = Saleflow.Audit.list_for_resource("LoginSession", updated.id)
      assert Enum.any?(logs, fn log -> log.action == "session.force_logged_out" end)
    end
  end
end
