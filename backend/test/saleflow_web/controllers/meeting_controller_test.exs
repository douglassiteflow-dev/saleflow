defmodule SaleflowWeb.MeetingControllerTest do
  use SaleflowWeb.ConnCase

  alias Saleflow.Accounts
  alias Saleflow.Sales

  @user_params %{
    email: "agent@example.com",
    name: "Jane Agent",
    password: "password123",
    password_confirmation: "password123"
  }

  setup %{conn: conn} do
    {:ok, user} = Accounts.register(@user_params)
    {:ok, lead} = Sales.create_lead(%{företag: "Acme AB", telefon: "+46700000001"})
    conn = log_in_user(conn, user)
    %{conn: conn, user: user, lead: lead}
  end

  # -------------------------------------------------------------------------
  # GET /api/meetings
  # -------------------------------------------------------------------------

  describe "GET /api/meetings" do
    test "returns upcoming meetings", %{conn: conn, user: user, lead: lead} do
      tomorrow = Date.utc_today() |> Date.add(1)

      {:ok, _meeting} =
        Sales.create_meeting(%{
          lead_id: lead.id,
          user_id: user.id,
          title: "Demo",
          meeting_date: tomorrow,
          meeting_time: ~T[10:00:00]
        })

      conn = get(conn, "/api/meetings")
      assert %{"meetings" => meetings} = json_response(conn, 200)
      assert length(meetings) == 1
      assert hd(meetings)["title"] == "Demo"
    end

    test "returns empty list when no meetings", %{conn: conn} do
      conn = get(conn, "/api/meetings")
      assert %{"meetings" => []} = json_response(conn, 200)
    end
  end

  # -------------------------------------------------------------------------
  # POST /api/meetings
  # -------------------------------------------------------------------------

  describe "POST /api/meetings" do
    test "creates a meeting", %{conn: conn, lead: lead} do
      conn =
        post(conn, "/api/meetings", %{
          lead_id: lead.id,
          title: "Sales Demo",
          meeting_date: "2026-06-01",
          meeting_time: "14:30:00"
        })

      assert %{"meeting" => meeting} = json_response(conn, 201)
      assert meeting["title"] == "Sales Demo"
      assert meeting["status"] == "scheduled"
      assert meeting["lead_id"] == lead.id
    end

    test "creates meeting with notes", %{conn: conn, lead: lead} do
      conn =
        post(conn, "/api/meetings", %{
          lead_id: lead.id,
          title: "Follow-up",
          meeting_date: "2026-06-15",
          meeting_time: "09:00:00",
          notes: "Bring product samples"
        })

      assert %{"meeting" => meeting} = json_response(conn, 201)
      assert meeting["notes"] == "Bring product samples"
    end
  end

  # -------------------------------------------------------------------------
  # POST /api/meetings/:id/cancel
  # -------------------------------------------------------------------------

  describe "POST /api/meetings/:id/cancel" do
    test "cancels a meeting", %{conn: conn, user: user, lead: lead} do
      tomorrow = Date.utc_today() |> Date.add(1)

      {:ok, meeting} =
        Sales.create_meeting(%{
          lead_id: lead.id,
          user_id: user.id,
          title: "Demo",
          meeting_date: tomorrow,
          meeting_time: ~T[10:00:00]
        })

      conn = post(conn, "/api/meetings/#{meeting.id}/cancel")
      assert %{"meeting" => cancelled} = json_response(conn, 200)
      assert cancelled["status"] == "cancelled"
    end

    test "returns 404 for non-existent meeting", %{conn: conn} do
      conn = post(conn, "/api/meetings/00000000-0000-0000-0000-000000000000/cancel")
      assert json_response(conn, 404)
    end
  end
end
