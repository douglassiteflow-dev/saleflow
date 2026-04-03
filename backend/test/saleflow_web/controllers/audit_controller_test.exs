defmodule SaleflowWeb.AuditControllerTest do
  use SaleflowWeb.ConnCase

  alias Saleflow.Accounts
  alias Saleflow.Audit
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
    name: "Jane Agent",
    password: "password123",
    password_confirmation: "password123"
  }

  setup %{conn: conn} do
    {:ok, admin} = Accounts.register(@admin_params)
    {:ok, agent} = Accounts.register(@agent_params)
    %{conn: conn, admin: admin, agent: agent}
  end

  # -------------------------------------------------------------------------
  # GET /api/audit — agent scoping
  # -------------------------------------------------------------------------

  describe "GET /api/audit — agent sees only own logs" do
    test "agent sees only their own audit logs", %{conn: conn, agent: agent} do
      {:ok, lead} = Sales.create_lead(%{företag: "Acme AB", telefon: "+46700000001"})

      # Log with agent's user_id
      {:ok, _} =
        Audit.create_log(%{
          user_id: agent.id,
          action: "test.agent_action",
          resource_type: "Lead",
          resource_id: lead.id,
          changes: %{},
          metadata: %{}
        })

      # System log (nil user_id) on a DIFFERENT resource — agent should NOT see this
      {:ok, _} =
        Audit.create_log(%{
          action: "system.unrelated",
          resource_type: "Lead",
          resource_id: Ecto.UUID.generate(),
          changes: %{},
          metadata: %{}
        })

      conn =
        conn
        |> log_in_user(agent)
        |> get("/api/audit")

      assert %{"audit_logs" => logs} = json_response(conn, 200)
      # Agent sees their own log + system logs on resources they touched
      # (the lead auto-creates a "lead.created" audit log, plus the agent's own log)
      agent_logs = Enum.filter(logs, fn l -> l["user_id"] == agent.id end)
      assert length(agent_logs) >= 1

      # Verify unrelated resource logs are excluded
      unrelated = Enum.filter(logs, fn l -> l["action"] == "system.unrelated" end)
      assert unrelated == []
    end

    test "agent action filter scopes to own logs only", %{conn: conn, agent: agent} do
      {:ok, lead} = Sales.create_lead(%{företag: "Acme AB", telefon: "+46700000001"})

      {:ok, _} =
        Audit.create_log(%{
          user_id: agent.id,
          action: "test.user_action",
          resource_type: "Lead",
          resource_id: lead.id
        })

      conn =
        conn
        |> log_in_user(agent)
        |> get("/api/audit?action=test.user_action")

      assert %{"audit_logs" => logs} = json_response(conn, 200)
      assert Enum.all?(logs, fn log -> log["user_id"] == agent.id end)
    end
  end

  # -------------------------------------------------------------------------
  # GET /api/audit — admin sees all
  # -------------------------------------------------------------------------

  describe "GET /api/audit — admin sees all logs" do
    test "admin returns all audit logs", %{conn: conn, admin: admin, agent: agent} do
      {:ok, lead} = Sales.create_lead(%{företag: "Acme AB", telefon: "+46700000001"})

      {:ok, _} =
        Audit.create_log(%{
          user_id: agent.id,
          action: "test.action",
          resource_type: "Lead",
          resource_id: lead.id,
          changes: %{},
          metadata: %{}
        })

      conn =
        conn
        |> log_in_user(admin)
        |> get("/api/audit")

      assert %{"audit_logs" => logs} = json_response(conn, 200)
      assert length(logs) >= 2
    end

    test "admin can filter by user_id", %{conn: conn, admin: admin, agent: agent} do
      {:ok, lead} = Sales.create_lead(%{företag: "Acme AB", telefon: "+46700000001"})

      {:ok, _} =
        Audit.create_log(%{
          user_id: agent.id,
          action: "test.user_action",
          resource_type: "Lead",
          resource_id: lead.id
        })

      conn =
        conn
        |> log_in_user(admin)
        |> get("/api/audit?user_id=#{agent.id}")

      assert %{"audit_logs" => logs} = json_response(conn, 200)
      assert Enum.all?(logs, fn log -> log["user_id"] == agent.id end)
    end

    test "admin audit log includes user_name", %{conn: conn, admin: admin, agent: agent} do
      {:ok, lead} = Sales.create_lead(%{företag: "Acme AB", telefon: "+46700000001"})

      {:ok, _} =
        Audit.create_log(%{
          user_id: agent.id,
          action: "test.named_action",
          resource_type: "Lead",
          resource_id: lead.id
        })

      conn =
        conn
        |> log_in_user(admin)
        |> get("/api/audit?action=test.named_action")

      assert %{"audit_logs" => logs} = json_response(conn, 200)
      assert length(logs) == 1
      assert hd(logs)["user_name"] == "Jane Agent"
    end

    test "admin can filter by action", %{conn: conn, admin: admin} do
      {:ok, _lead} = Sales.create_lead(%{företag: "Acme AB", telefon: "+46700000001"})

      conn =
        conn
        |> log_in_user(admin)
        |> get("/api/audit?action=lead.created")

      assert %{"audit_logs" => logs} = json_response(conn, 200)
      assert Enum.all?(logs, fn log -> log["action"] == "lead.created" end)
    end
  end

  # -------------------------------------------------------------------------
  # Shared tests
  # -------------------------------------------------------------------------

  describe "GET /api/audit — shared" do
    test "requires authentication" do
      conn =
        build_conn()
        |> Plug.Test.init_test_session(%{})
        |> get("/api/audit")

      assert json_response(conn, 401)
    end

    test "returns empty list when no logs match filter", %{conn: conn, agent: agent} do
      conn =
        conn
        |> log_in_user(agent)
        |> get("/api/audit?action=nonexistent.action")

      assert %{"audit_logs" => []} = json_response(conn, 200)
    end
  end
end
