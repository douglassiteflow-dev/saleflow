defmodule SaleflowWeb.AuditControllerTest do
  use SaleflowWeb.ConnCase

  alias Saleflow.Accounts
  alias Saleflow.Audit
  alias Saleflow.Sales

  @user_params %{
    email: "agent@example.com",
    name: "Jane Agent",
    password: "password123",
    password_confirmation: "password123"
  }

  setup %{conn: conn} do
    {:ok, user} = Accounts.register(@user_params)
    conn = log_in_user(conn, user)
    %{conn: conn, user: user}
  end

  # -------------------------------------------------------------------------
  # GET /api/audit
  # -------------------------------------------------------------------------

  describe "GET /api/audit" do
    test "returns audit logs", %{conn: conn, user: user} do
      # Creating a lead generates audit logs
      {:ok, lead} = Sales.create_lead(%{företag: "Acme AB", telefon: "+46700000001"})

      # Also create an explicit audit log
      {:ok, _} =
        Audit.create_log(%{
          user_id: user.id,
          action: "test.action",
          resource_type: "Lead",
          resource_id: lead.id,
          changes: %{},
          metadata: %{}
        })

      conn = get(conn, "/api/audit")
      assert %{"audit_logs" => logs} = json_response(conn, 200)
      assert length(logs) >= 2
    end

    test "filters by user_id", %{conn: conn, user: user} do
      {:ok, lead} = Sales.create_lead(%{företag: "Acme AB", telefon: "+46700000001"})

      {:ok, _} =
        Audit.create_log(%{
          user_id: user.id,
          action: "test.user_action",
          resource_type: "Lead",
          resource_id: lead.id
        })

      conn = get(conn, "/api/audit?user_id=#{user.id}")
      assert %{"audit_logs" => logs} = json_response(conn, 200)
      # All returned logs should belong to this user
      assert Enum.all?(logs, fn log -> log["user_id"] == user.id end)
    end

    test "filters by action", %{conn: conn} do
      {:ok, _lead} = Sales.create_lead(%{företag: "Acme AB", telefon: "+46700000001"})

      conn = get(conn, "/api/audit?action=lead.created")
      assert %{"audit_logs" => logs} = json_response(conn, 200)
      assert Enum.all?(logs, fn log -> log["action"] == "lead.created" end)
    end

    test "requires authentication" do
      conn =
        build_conn()
        |> Plug.Test.init_test_session(%{})
        |> get("/api/audit")

      assert json_response(conn, 401)
    end

    test "returns empty list when no logs match filter", %{conn: conn} do
      conn = get(conn, "/api/audit?action=nonexistent.action")
      assert %{"audit_logs" => []} = json_response(conn, 200)
    end
  end
end
