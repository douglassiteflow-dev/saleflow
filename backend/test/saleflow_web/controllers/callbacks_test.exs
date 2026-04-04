defmodule SaleflowWeb.CallbacksTest do
  use SaleflowWeb.ConnCase

  alias Saleflow.Accounts
  alias Saleflow.Sales

  @admin_params %{
    email: "admin-cb@example.com",
    name: "Admin User",
    password: "password123",
    password_confirmation: "password123",
    role: :admin
  }

  @agent_params %{
    email: "agent-cb@example.com",
    name: "Jane Agent",
    password: "password123",
    password_confirmation: "password123"
  }

  @agent2_params %{
    email: "agent2-cb@example.com",
    name: "Other Agent",
    password: "password123",
    password_confirmation: "password123"
  }

  setup %{conn: conn} do
    {:ok, admin} = Accounts.register(@admin_params)
    {:ok, agent} = Accounts.register(@agent_params)
    {:ok, agent2} = Accounts.register(@agent2_params)
    %{conn: conn, admin: admin, agent: agent, agent2: agent2}
  end

  # -------------------------------------------------------------------------
  # GET /api/callbacks
  # -------------------------------------------------------------------------

  describe "GET /api/callbacks" do
    test "returns empty list when no callbacks", %{conn: conn, admin: admin} do
      conn = log_in_user(conn, admin)
      conn = get(conn, "/api/callbacks")
      assert %{"callbacks" => []} = json_response(conn, 200)
    end

    test "returns leads with callback status", %{conn: conn, admin: admin} do
      conn = log_in_user(conn, admin)

      {:ok, lead1} = Sales.create_lead(%{företag: "Callback AB", telefon: "+46700000001"})
      {:ok, _lead2} = Sales.create_lead(%{företag: "Normal AB", telefon: "+46700000002"})
      {:ok, lead3} = Sales.create_lead(%{företag: "Callback 2 AB", telefon: "+46700000003"})

      callback_at_early = DateTime.utc_now() |> DateTime.add(1, :hour)
      callback_at_late = DateTime.utc_now() |> DateTime.add(3, :hour)

      {:ok, _} = Sales.update_lead_status(lead1, %{status: :callback, callback_at: callback_at_early})
      {:ok, _} = Sales.update_lead_status(lead3, %{status: :callback, callback_at: callback_at_late})
      # lead2 stays in :new status

      conn = get(conn, "/api/callbacks")
      assert %{"callbacks" => callbacks} = json_response(conn, 200)
      assert length(callbacks) == 2

      names = Enum.map(callbacks, & &1["företag"])
      assert "Callback AB" in names
      assert "Callback 2 AB" in names
      refute "Normal AB" in names

      # Verify sorted by callback_at ascending (early first)
      assert hd(callbacks)["företag"] == "Callback AB"
    end

    test "agent only sees own assigned callbacks", %{conn: conn, agent: agent, agent2: agent2} do
      conn = log_in_user(conn, agent)

      {:ok, lead1} = Sales.create_lead(%{företag: "My Callback", telefon: "+46700000010"})
      {:ok, lead2} = Sales.create_lead(%{företag: "Other Callback", telefon: "+46700000011"})

      callback_at = DateTime.utc_now() |> DateTime.add(1, :hour)
      {:ok, _} = Sales.update_lead_status(lead1, %{status: :callback, callback_at: callback_at})
      {:ok, _} = Sales.update_lead_status(lead2, %{status: :callback, callback_at: callback_at})

      # Assign lead1 to agent, lead2 to agent2
      {:ok, _} = Sales.assign_lead(lead1, agent)
      {:ok, _} = Sales.assign_lead(lead2, agent2)

      conn = get(conn, "/api/callbacks")
      assert %{"callbacks" => callbacks} = json_response(conn, 200)
      assert length(callbacks) == 1
      assert hd(callbacks)["företag"] == "My Callback"
    end

    test "requires authentication" do
      conn =
        build_conn()
        |> Plug.Test.init_test_session(%{})
        |> get("/api/callbacks")

      assert json_response(conn, 401)
    end
  end
end
