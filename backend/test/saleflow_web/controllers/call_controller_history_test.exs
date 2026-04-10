defmodule SaleflowWeb.CallControllerHistoryTest do
  use SaleflowWeb.ConnCase

  # -------------------------------------------------------------------------
  # Helpers
  # -------------------------------------------------------------------------

  defp authenticated_conn(conn, attrs \\ %{}) do
    register_and_log_in_user(conn, attrs)
  end

  defp create_lead(attrs \\ %{}) do
    lead_attrs =
      Map.merge(
        %{
          företag: "Test AB",
          telefon: "+46701234567"
        },
        attrs
      )

    {:ok, lead} =
      Saleflow.Sales.Lead
      |> Ash.Changeset.for_create(:create_bulk, lead_attrs)
      |> Ash.create()

    lead
  end

  # -------------------------------------------------------------------------
  # GET /api/calls/history
  # -------------------------------------------------------------------------

  describe "GET /api/calls/history" do
    test "returns call_logs that have NO phone_call row", %{conn: conn} do
      {conn, user} = authenticated_conn(conn, %{role: :admin})
      lead = create_lead()

      {:ok, call_log} =
        Saleflow.Sales.log_call(%{
          lead_id: lead.id,
          user_id: user.id,
          outcome: :no_answer,
          notes: "Inget svar"
        })

      today = Date.to_iso8601(Date.utc_today())
      conn = get(conn, "/api/calls/history?from=#{today}&to=#{today}")

      response = json_response(conn, 200)
      calls = response["calls"]

      assert length(calls) == 1
      [call] = calls

      assert call["id"] == call_log.id
      assert call["outcome"] == "no_answer"
      assert call["notes"] == "Inget svar"
      assert call["lead_name"] == "Test AB"
      assert call["lead_phone"] == "+46701234567"
      # phone_call fields should be nil/false when no phone_call exists
      assert call["phone_call_id"] == nil
      assert call["duration"] == 0
      assert call["has_recording"] == false
    end

    test "returns call_logs WITH phone_call data when linked", %{conn: conn} do
      {conn, user} = authenticated_conn(conn, %{role: :admin})
      lead = create_lead()

      {:ok, call_log} =
        Saleflow.Sales.log_call(%{
          lead_id: lead.id,
          user_id: user.id,
          outcome: :meeting_booked,
          notes: "Bokat!"
        })

      {:ok, phone_call} =
        Saleflow.Sales.create_phone_call(%{
          caller: "100",
          callee: "+46701234567",
          user_id: user.id,
          lead_id: lead.id,
          call_log_id: call_log.id,
          direction: :outgoing,
          duration: 120
        })

      today = Date.to_iso8601(Date.utc_today())
      conn = get(conn, "/api/calls/history?from=#{today}&to=#{today}")

      response = json_response(conn, 200)
      calls = response["calls"]

      assert length(calls) == 1
      [call] = calls

      assert call["id"] == call_log.id
      assert call["outcome"] == "meeting_booked"
      assert call["notes"] == "Bokat!"
      assert call["phone_call_id"] == phone_call.id
      assert call["duration"] == 120
      assert call["lead_name"] == "Test AB"
    end

    test "returns empty list when no calls exist", %{conn: conn} do
      {conn, _user} = authenticated_conn(conn, %{role: :admin})

      today = Date.to_iso8601(Date.utc_today())
      conn = get(conn, "/api/calls/history?from=#{today}&to=#{today}")

      response = json_response(conn, 200)
      assert response["calls"] == []
    end
  end
end
