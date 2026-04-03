defmodule SaleflowWeb.CallHistoryTest do
  use SaleflowWeb.ConnCase

  alias Saleflow.Sales
  alias Saleflow.Accounts

  describe "GET /api/calls/history" do
    test "returns agent's call logs for today with lead data", %{conn: conn} do
      {conn, agent} = register_and_log_in_user(conn)

      {:ok, lead} = Sales.create_lead(%{företag: "Test AB", telefon: "+46700000001"})

      {:ok, _} =
        Sales.log_call(%{
          lead_id: lead.id,
          user_id: agent.id,
          outcome: :meeting_booked,
          notes: "Bokat demo"
        })

      conn = get(conn, "/api/calls/history")

      assert %{"calls" => [call]} = json_response(conn, 200)
      assert call["lead_name"] == "Test AB"
      assert call["lead_phone"] == "+46700000001"
      assert call["outcome"] == "meeting_booked"
      assert call["notes"] == "Bokat demo"
      assert call["user_name"] == agent.name
    end

    test "filters by date param", %{conn: conn} do
      {conn, _agent} = register_and_log_in_user(conn)

      conn = get(conn, "/api/calls/history?date=2020-01-01")

      assert %{"calls" => []} = json_response(conn, 200)
    end

    test "agent sees only own calls", %{conn: conn} do
      {conn, _agent} = register_and_log_in_user(conn)

      {:ok, other} =
        Accounts.register(%{
          email: "other-hist@example.com",
          name: "Other",
          password: "password123",
          password_confirmation: "password123"
        })

      {:ok, lead} = Sales.create_lead(%{företag: "Other AB", telefon: "+46700000002"})

      {:ok, _} =
        Sales.log_call(%{
          lead_id: lead.id,
          user_id: other.id,
          outcome: :no_answer
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
