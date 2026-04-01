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

  # -------------------------------------------------------------------------
  # POST /api/auth/sign-in
  # -------------------------------------------------------------------------

  describe "POST /api/auth/sign-in" do
    test "returns user and sets session with valid credentials", %{conn: conn} do
      conn =
        conn
        |> Plug.Test.init_test_session(%{})
        |> post("/api/auth/sign-in", %{email: "agent@example.com", password: "password123"})

      assert %{"user" => user_json} = json_response(conn, 200)
      assert user_json["email"] == "agent@example.com"
      assert user_json["name"] == "Jane Agent"
      assert user_json["role"] == "agent"
      refute is_nil(user_json["id"])

      # Session should contain user_id
      assert get_session(conn, :user_id) != nil
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

  # -------------------------------------------------------------------------
  # GET /api/auth/me
  # -------------------------------------------------------------------------

  describe "GET /api/auth/me" do
    test "returns user when authenticated", %{conn: conn, user: user} do
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
  end

  # -------------------------------------------------------------------------
  # POST /api/auth/sign-out
  # -------------------------------------------------------------------------

  describe "POST /api/auth/sign-out" do
    test "clears session and returns ok", %{conn: conn, user: user} do
      conn =
        conn
        |> log_in_user(user)
        |> post("/api/auth/sign-out")

      assert %{"ok" => true} = json_response(conn, 200)
    end
  end
end
