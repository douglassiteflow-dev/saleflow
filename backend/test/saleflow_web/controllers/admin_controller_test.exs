defmodule SaleflowWeb.AdminControllerTest do
  use SaleflowWeb.ConnCase

  alias Saleflow.Accounts
  alias Saleflow.Sales

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

  # -------------------------------------------------------------------------
  # GET /api/admin/users
  # -------------------------------------------------------------------------

  describe "GET /api/admin/users" do
    test "returns all users for admin", %{conn: conn, admin: admin} do
      conn =
        conn
        |> log_in_user(admin)
        |> get("/api/admin/users")

      assert %{"users" => users} = json_response(conn, 200)
      assert length(users) == 2
      emails = Enum.map(users, & &1["email"])
      assert "admin@example.com" in emails
      assert "agent@example.com" in emails
    end

    test "returns 403 for agent", %{conn: conn, agent: agent} do
      conn =
        conn
        |> log_in_user(agent)
        |> get("/api/admin/users")

      assert json_response(conn, 403)
    end

    test "returns 401 when not authenticated", %{conn: conn} do
      conn =
        conn
        |> Plug.Test.init_test_session(%{})
        |> get("/api/admin/users")

      assert json_response(conn, 401)
    end
  end

  # -------------------------------------------------------------------------
  # POST /api/admin/users
  # -------------------------------------------------------------------------

  describe "POST /api/admin/users" do
    test "creates a user as admin", %{conn: conn, admin: admin} do
      conn =
        conn
        |> log_in_user(admin)
        |> post("/api/admin/users", %{
          email: "new@example.com",
          name: "New Agent",
          password: "password123",
          password_confirmation: "password123",
          role: "agent"
        })

      assert %{"user" => user} = json_response(conn, 201)
      assert user["email"] == "new@example.com"
      assert user["name"] == "New Agent"
      assert user["role"] == "agent"
    end

    test "returns 403 for non-admin", %{conn: conn, agent: agent} do
      conn =
        conn
        |> log_in_user(agent)
        |> post("/api/admin/users", %{
          email: "new2@example.com",
          name: "New User",
          password: "password123",
          password_confirmation: "password123"
        })

      assert json_response(conn, 403)
    end

    test "returns 422 when registration fails (duplicate email)", %{conn: conn, admin: admin} do
      conn =
        conn
        |> log_in_user(admin)
        |> post("/api/admin/users", %{
          email: "admin@example.com",
          name: "Duplicate Admin",
          password: "password123",
          password_confirmation: "password123",
          role: "admin"
        })

      assert json_response(conn, 422)
    end

    test "parse_role defaults to :agent for unknown role string", %{conn: conn, admin: admin} do
      conn =
        conn
        |> log_in_user(admin)
        |> post("/api/admin/users", %{
          email: "somerole@example.com",
          name: "Custom Role",
          password: "password123",
          password_confirmation: "password123",
          role: "superuser"
        })

      assert %{"user" => user} = json_response(conn, 201)
      assert user["role"] == "agent"
    end

    test "sends welcome email (sandbox log) on user creation", %{conn: conn, admin: admin} do
      import ExUnit.CaptureLog

      log =
        capture_log(fn ->
          conn
          |> log_in_user(admin)
          |> post("/api/admin/users", %{
            email: "welcome-test@example.com",
            name: "Welcome User",
            password: "password123",
            password_confirmation: "password123",
            role: "agent"
          })

          # Give the async task time to complete
          Process.sleep(50)
        end)

      assert log =~ "sandbox"
      assert log =~ "welcome-test@example.com"
    end
  end

  # -------------------------------------------------------------------------
  # GET /api/admin/stats
  # -------------------------------------------------------------------------

  describe "GET /api/admin/stats" do
    test "returns lead counts by status", %{conn: conn, admin: admin} do
      {:ok, _} = Sales.create_lead(%{företag: "Acme AB", telefon: "+46700000001"})
      {:ok, _} = Sales.create_lead(%{företag: "Beta AB", telefon: "+46700000002"})
      {:ok, lead3} = Sales.create_lead(%{företag: "Gamma AB", telefon: "+46700000003"})
      {:ok, _} = Sales.update_lead_status(lead3, %{status: :customer})

      conn =
        conn
        |> log_in_user(admin)
        |> get("/api/admin/stats")

      assert %{"stats" => stats} = json_response(conn, 200)
      assert stats["new"] == 2
      assert stats["customer"] == 1
    end

    test "returns empty stats when no leads", %{conn: conn, admin: admin} do
      conn =
        conn
        |> log_in_user(admin)
        |> get("/api/admin/stats")

      assert %{"stats" => stats} = json_response(conn, 200)
      assert stats == %{}
    end
  end

  # -------------------------------------------------------------------------
  # GET /api/my-stats
  # -------------------------------------------------------------------------

  describe "GET /api/my-stats" do
    test "agent gets their own stats", %{conn: conn, agent: agent} do
      {:ok, lead} = Sales.create_lead(%{företag: "Acme AB", telefon: "+46700000001"})
      {:ok, _call} = Sales.log_call(%{lead_id: lead.id, user_id: agent.id, outcome: :no_answer})

      conn =
        conn
        |> log_in_user(agent)
        |> get("/api/my-stats")

      assert %{"stats" => stats} = json_response(conn, 200)
      assert Map.has_key?(stats, "calls_today")
      assert Map.has_key?(stats, "total_calls")
      assert Map.has_key?(stats, "meetings_today")
      assert Map.has_key?(stats, "total_meetings")
      assert stats["total_calls"] == 1
    end

    test "admin gets global stats", %{conn: conn, admin: admin, agent: agent} do
      {:ok, lead} = Sales.create_lead(%{företag: "Acme AB", telefon: "+46700000001"})
      {:ok, _call} = Sales.log_call(%{lead_id: lead.id, user_id: agent.id, outcome: :no_answer})

      conn =
        conn
        |> log_in_user(admin)
        |> get("/api/my-stats")

      assert %{"stats" => stats} = json_response(conn, 200)
      assert Map.has_key?(stats, "calls_today")
      assert stats["total_calls"] >= 1
    end

    test "requires authentication", %{conn: conn} do
      conn =
        conn
        |> Plug.Test.init_test_session(%{})
        |> get("/api/my-stats")

      assert json_response(conn, 401)
    end
  end

  # -------------------------------------------------------------------------
  # POST /api/admin/import
  # -------------------------------------------------------------------------

  describe "POST /api/admin/import" do
    test "imports leads from xlsx file", %{conn: conn, admin: admin} do
      xlsx_path = Path.join([File.cwd!(), "test", "fixtures", "leads.xlsx"])

      upload = %Plug.Upload{
        path: xlsx_path,
        filename: "leads.xlsx",
        content_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      }

      conn =
        conn
        |> log_in_user(admin)
        |> post("/api/admin/import", %{file: upload})

      assert %{"created" => created, "skipped" => skipped} = json_response(conn, 201)
      # leads.xlsx fixture contains exactly 2 data rows
      assert created == 2
      assert skipped == 0
    end

    test "returns 400 when no file is provided", %{conn: conn, admin: admin} do
      conn =
        conn
        |> log_in_user(admin)
        |> post("/api/admin/import", %{})

      assert json_response(conn, 400)
    end

    test "returns 403 for non-admin", %{conn: conn, agent: agent} do
      conn =
        conn
        |> log_in_user(agent)
        |> post("/api/admin/import", %{})

      assert json_response(conn, 403)
    end
  end
end
