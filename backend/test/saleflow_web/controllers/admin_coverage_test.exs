defmodule SaleflowWeb.AdminCoverageTest do
  @moduledoc """
  Coverage tests for uncovered branches in AdminController:
  - force_logout_session_action: user not found after force-logout (line 93)
  """

  use SaleflowWeb.ConnCase, async: false

  alias Saleflow.Accounts

  @admin_params %{
    email: "admincov@example.com",
    name: "AdminCov User",
    password: "password123",
    password_confirmation: "password123",
    role: :admin
  }

  @agent_params %{
    email: "agentcov@example.com",
    name: "AgentCov User",
    password: "password123",
    password_confirmation: "password123"
  }

  setup %{conn: conn} do
    {:ok, admin} = Accounts.register(@admin_params)
    {:ok, agent} = Accounts.register(@agent_params)
    %{conn: conn, admin: admin, agent: agent}
  end

  describe "POST /api/admin/users/:user_id/force-logout — user not found" do
    test "returns 404 when user_id does not exist", %{conn: conn, admin: admin} do
      fake_user_id = Ecto.UUID.generate()

      conn =
        conn
        |> log_in_user(admin)
        |> post("/api/admin/users/#{fake_user_id}/force-logout")

      assert %{"error" => "User not found"} = json_response(conn, 404)
    end
  end
end
