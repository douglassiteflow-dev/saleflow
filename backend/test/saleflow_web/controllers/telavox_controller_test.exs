defmodule SaleflowWeb.TelavoxControllerTest do
  use SaleflowWeb.ConnCase

  import Mox

  alias Saleflow.Telavox.MockClient

  setup :verify_on_exit!

  # -------------------------------------------------------------------------
  # Helpers
  # -------------------------------------------------------------------------

  defp authenticated_conn(conn, attrs \\ %{}) do
    register_and_log_in_user(conn, attrs)
  end

  defp set_telavox_token(user, token) do
    {:ok, user} =
      user
      |> Ash.Changeset.for_update(:update_user, %{telavox_token: token})
      |> Ash.update()

    user
  end

  # -------------------------------------------------------------------------
  # POST /api/telavox/connect
  # -------------------------------------------------------------------------

  describe "POST /api/telavox/connect" do
    test "returns 422 when no token provided", %{conn: conn} do
      {conn, _user} = authenticated_conn(conn)

      conn = post(conn, "/api/telavox/connect", %{})

      assert json_response(conn, 422) == %{"error" => "Token krävs"}
    end

    test "returns 401 when Telavox token is invalid", %{conn: conn} do
      {conn, _user} = authenticated_conn(conn)

      MockClient
      |> expect(:get_as, fn "bad-token", "/extensions/me" ->
        {:error, :unauthorized}
      end)

      conn = post(conn, "/api/telavox/connect", %{"token" => "bad-token"})

      assert json_response(conn, 401) == %{"error" => "Ogiltig Telavox-token"}
    end

    test "returns 502 when Telavox API is unreachable", %{conn: conn} do
      {conn, _user} = authenticated_conn(conn)

      MockClient
      |> expect(:get_as, fn "some-token", "/extensions/me" ->
        {:error, :timeout}
      end)

      conn = post(conn, "/api/telavox/connect", %{"token" => "some-token"})

      assert json_response(conn, 502) == %{"error" => "Kunde inte nå Telavox API"}
    end

    test "returns 200 and saves token on success", %{conn: conn} do
      {conn, _user} = authenticated_conn(conn)

      MockClient
      |> expect(:get_as, fn "valid-token", "/extensions/me" ->
        {:ok, %{"extension" => "1234", "name" => "Test Agent"}}
      end)

      conn = post(conn, "/api/telavox/connect", %{"token" => "valid-token"})

      assert json_response(conn, 200) == %{
               "ok" => true,
               "extension" => "1234",
               "name" => "Test Agent"
             }
    end

    test "returns 502 for http error tuple", %{conn: conn} do
      {conn, _user} = authenticated_conn(conn)

      MockClient
      |> expect(:get_as, fn "err-token", "/extensions/me" ->
        {:error, {:http, 503, "Service Unavailable"}}
      end)

      conn = post(conn, "/api/telavox/connect", %{"token" => "err-token"})

      assert json_response(conn, 502) == %{"error" => "Kunde inte nå Telavox API"}
    end

    test "requires authentication", %{conn: conn} do
      conn =
        conn
        |> Plug.Test.init_test_session(%{})
        |> post("/api/telavox/connect", %{"token" => "any"})

      assert json_response(conn, 401)
    end
  end

  # -------------------------------------------------------------------------
  # POST /api/telavox/disconnect
  # -------------------------------------------------------------------------

  describe "POST /api/telavox/disconnect" do
    test "returns 200 and clears token", %{conn: conn} do
      {conn, user} = authenticated_conn(conn)
      _user = set_telavox_token(user, "existing-token")

      conn = post(conn, "/api/telavox/disconnect")

      assert json_response(conn, 200) == %{"ok" => true}
    end

    test "returns 200 even when no token was set", %{conn: conn} do
      {conn, _user} = authenticated_conn(conn)

      conn = post(conn, "/api/telavox/disconnect")

      assert json_response(conn, 200) == %{"ok" => true}
    end

    test "requires authentication", %{conn: conn} do
      conn =
        conn
        |> Plug.Test.init_test_session(%{})
        |> post("/api/telavox/disconnect")

      assert json_response(conn, 401)
    end
  end

  # -------------------------------------------------------------------------
  # GET /api/telavox/status
  # -------------------------------------------------------------------------

  describe "GET /api/telavox/status" do
    test "returns connected: false when no token set", %{conn: conn} do
      {conn, _user} = authenticated_conn(conn)

      conn = get(conn, "/api/telavox/status")

      assert json_response(conn, 200) == %{"connected" => false}
    end

    test "returns connected: false when token is empty string", %{conn: conn} do
      {conn, user} = authenticated_conn(conn)
      _user = set_telavox_token(user, "")

      conn = get(conn, "/api/telavox/status")

      assert json_response(conn, 200) == %{"connected" => false}
    end

    test "returns connected: true with extension info when API responds", %{conn: conn} do
      {conn, user} = authenticated_conn(conn)
      _user = set_telavox_token(user, "valid-token")

      MockClient
      |> expect(:get_as, fn "valid-token", "/extensions/me" ->
        {:ok, %{"extension" => "5678", "name" => "Agent Name"}}
      end)

      conn = get(conn, "/api/telavox/status")

      assert json_response(conn, 200) == %{
               "connected" => true,
               "extension" => "5678",
               "name" => "Agent Name"
             }
    end

    test "returns connected: false with expired: true when token is unauthorized", %{conn: conn} do
      {conn, user} = authenticated_conn(conn)
      _user = set_telavox_token(user, "expired-token")

      MockClient
      |> expect(:get_as, fn "expired-token", "/extensions/me" ->
        {:error, :unauthorized}
      end)

      conn = get(conn, "/api/telavox/status")

      assert json_response(conn, 200) == %{"connected" => false, "expired" => true}
    end

    test "returns connected: true with user info when API errors", %{conn: conn} do
      {conn, user} = authenticated_conn(conn)
      _user = set_telavox_token(user, "some-token")

      MockClient
      |> expect(:get_as, fn "some-token", "/extensions/me" ->
        {:error, :timeout}
      end)

      conn = get(conn, "/api/telavox/status")

      response = json_response(conn, 200)
      assert response["connected"] == true
      assert response["name"] == user.name
    end

    test "requires authentication", %{conn: conn} do
      conn =
        conn
        |> Plug.Test.init_test_session(%{})
        |> get("/api/telavox/status")

      assert json_response(conn, 401)
    end
  end
end
