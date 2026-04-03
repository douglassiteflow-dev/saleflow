defmodule SaleflowWeb.CallHistoryTest do
  use SaleflowWeb.ConnCase

  alias Saleflow.Sales
  alias Saleflow.Accounts

  describe "GET /api/calls/history" do
    test "returns agent's outgoing calls for today", %{conn: conn} do
      {conn, agent} = register_and_log_in_user(conn)

      {:ok, lead} = Sales.create_lead(%{företag: "Test AB", telefon: "+46700000001"})

      {:ok, _} =
        Sales.create_phone_call(%{
          caller: "+46701111111",
          callee: "+46700000001",
          user_id: agent.id,
          duration: 42,
          direction: :outgoing
        })

      conn = get(conn, "/api/calls/history")

      assert %{"calls" => [call]} = json_response(conn, 200)
      assert call["callee"] == "+46700000001"
      assert call["duration"] == 42
      assert call["user_name"] == agent.name
    end

    test "filters by date param", %{conn: conn} do
      {conn, _agent} = register_and_log_in_user(conn)

      conn = get(conn, "/api/calls/history?date=2020-01-01")

      assert %{"calls" => []} = json_response(conn, 200)
    end

    test "agent sees only own calls", %{conn: conn} do
      {conn, _agent} = register_and_log_in_user(conn)

      {:ok, other} = Accounts.register(%{
        email: "other-hist@example.com", name: "Other",
        password: "password123", password_confirmation: "password123"
      })

      {:ok, _} =
        Sales.create_phone_call(%{
          caller: "+46709999999",
          callee: "+46700000002",
          user_id: other.id,
          duration: 10,
          direction: :outgoing
        })

      conn = get(conn, "/api/calls/history")

      assert %{"calls" => []} = json_response(conn, 200)
    end

    test "does not include incoming calls", %{conn: conn} do
      {conn, agent} = register_and_log_in_user(conn)

      {:ok, _} =
        Sales.create_phone_call(%{
          caller: "+46700000003",
          callee: "+46701111111",
          user_id: agent.id,
          duration: 10,
          direction: :incoming
        })

      conn = get(conn, "/api/calls/history")

      assert %{"calls" => []} = json_response(conn, 200)
    end

    test "requires authentication", %{conn: conn} do
      conn =
        conn
        |> Plug.Test.init_test_session(%{})
        |> get("/api/calls/history")

      assert json_response(conn, 401)
    end
  end
end
