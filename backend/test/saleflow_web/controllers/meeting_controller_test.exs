defmodule SaleflowWeb.MeetingControllerTest do
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
    name: "Jane Agent",
    password: "password123",
    password_confirmation: "password123"
  }

  @agent2_params %{
    email: "agent2@example.com",
    name: "Bob Agent",
    password: "password123",
    password_confirmation: "password123"
  }

  setup %{conn: conn} do
    {:ok, admin} = Accounts.register(@admin_params)
    {:ok, user} = Accounts.register(@agent_params)
    {:ok, agent2} = Accounts.register(@agent2_params)
    {:ok, lead} = Sales.create_lead(%{företag: "Acme AB", telefon: "+46700000001"})
    conn = log_in_user(conn, user)
    %{conn: conn, user: user, admin: admin, agent2: agent2, lead: lead}
  end

  # -------------------------------------------------------------------------
  # GET /api/meetings
  # -------------------------------------------------------------------------

  describe "GET /api/meetings — agent scoping" do
    test "agent sees only their own meetings", %{conn: conn, user: user, admin: admin, lead: lead} do
      tomorrow = Date.utc_today() |> Date.add(1)

      {:ok, _agent_meeting} =
        Sales.create_meeting(%{
          lead_id: lead.id,
          user_id: user.id,
          title: "Agent Demo",
          meeting_date: tomorrow,
          meeting_time: ~T[10:00:00]
        })

      # Admin's meeting — agent should NOT see this
      {:ok, _admin_meeting} =
        Sales.create_meeting(%{
          lead_id: lead.id,
          user_id: admin.id,
          title: "Admin Demo",
          meeting_date: tomorrow,
          meeting_time: ~T[11:00:00]
        })

      conn = get(conn, "/api/meetings")
      assert %{"meetings" => meetings} = json_response(conn, 200)
      assert length(meetings) == 1
      assert hd(meetings)["title"] == "Agent Demo"
    end

    test "returns empty list when agent has no meetings", %{conn: conn} do
      conn = get(conn, "/api/meetings")
      assert %{"meetings" => []} = json_response(conn, 200)
    end

    test "meetings include lead data and user_name", %{conn: conn, user: user, lead: lead} do
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
      assert %{"meetings" => [meeting]} = json_response(conn, 200)
      assert meeting["user_name"] == "Jane Agent"
      assert meeting["lead"]["företag"] == "Acme AB"
      assert meeting["reminded_at"] == nil
      assert Map.has_key?(meeting, "updated_at")
    end
  end

  describe "GET /api/meetings — admin sees all" do
    test "admin sees all meetings", %{conn: conn, user: user, admin: admin, lead: lead} do
      tomorrow = Date.utc_today() |> Date.add(1)

      {:ok, _} =
        Sales.create_meeting(%{
          lead_id: lead.id,
          user_id: user.id,
          title: "Agent Demo",
          meeting_date: tomorrow,
          meeting_time: ~T[10:00:00]
        })

      {:ok, _} =
        Sales.create_meeting(%{
          lead_id: lead.id,
          user_id: admin.id,
          title: "Admin Demo",
          meeting_date: tomorrow,
          meeting_time: ~T[11:00:00]
        })

      conn_admin =
        conn
        |> log_in_user(admin)
        |> get("/api/meetings")

      assert %{"meetings" => meetings} = json_response(conn_admin, 200)
      assert length(meetings) == 2
    end
  end

  # -------------------------------------------------------------------------
  # GET /api/meetings/:id — show
  # -------------------------------------------------------------------------

  describe "GET /api/meetings/:id — show" do
    test "returns meeting detail with lead data", %{conn: conn, user: user, lead: lead} do
      tomorrow = Date.utc_today() |> Date.add(1)

      {:ok, meeting} =
        Sales.create_meeting(%{
          lead_id: lead.id,
          user_id: user.id,
          title: "Detail Demo",
          meeting_date: tomorrow,
          meeting_time: ~T[10:00:00]
        })

      conn = get(conn, "/api/meetings/#{meeting.id}")
      assert %{"meeting" => m, "lead" => l, "calls" => _, "audit_logs" => _} = json_response(conn, 200)
      assert m["title"] == "Detail Demo"
      assert l["företag"] == "Acme AB"
    end

    test "agent cannot see another agent's meeting", %{conn: conn, agent2: agent2, lead: lead} do
      tomorrow = Date.utc_today() |> Date.add(1)

      {:ok, meeting} =
        Sales.create_meeting(%{
          lead_id: lead.id,
          user_id: agent2.id,
          title: "Agent2 Meeting",
          meeting_date: tomorrow,
          meeting_time: ~T[10:00:00]
        })

      conn = get(conn, "/api/meetings/#{meeting.id}")
      assert json_response(conn, 403)
    end

    test "admin can see any meeting", %{conn: conn, admin: admin, user: user, lead: lead} do
      tomorrow = Date.utc_today() |> Date.add(1)

      {:ok, meeting} =
        Sales.create_meeting(%{
          lead_id: lead.id,
          user_id: user.id,
          title: "Agent Meeting",
          meeting_date: tomorrow,
          meeting_time: ~T[10:00:00]
        })

      conn =
        conn
        |> log_in_user(admin)
        |> get("/api/meetings/#{meeting.id}")

      assert %{"meeting" => m} = json_response(conn, 200)
      assert m["title"] == "Agent Meeting"
    end

    test "returns 404 for non-existent meeting", %{conn: conn} do
      conn = get(conn, "/api/meetings/00000000-0000-0000-0000-000000000000")
      assert json_response(conn, 404)
    end

    test "agent sees only own calls and audit in meeting detail", %{conn: conn, user: user, agent2: agent2, lead: lead} do
      tomorrow = Date.utc_today() |> Date.add(1)

      {:ok, meeting} =
        Sales.create_meeting(%{
          lead_id: lead.id,
          user_id: user.id,
          title: "My Meeting",
          meeting_date: tomorrow,
          meeting_time: ~T[10:00:00]
        })

      # Create calls from both agents
      {:ok, _} = Sales.log_call(%{lead_id: lead.id, user_id: user.id, outcome: :no_answer})
      {:ok, _} = Sales.log_call(%{lead_id: lead.id, user_id: agent2.id, outcome: :callback})

      conn = get(conn, "/api/meetings/#{meeting.id}")
      assert %{"calls" => calls} = json_response(conn, 200)
      # Agent should only see their own call
      assert length(calls) == 1
      assert hd(calls)["user_id"] == user.id
    end
  end

  # -------------------------------------------------------------------------
  # PUT /api/meetings/:id — update
  # -------------------------------------------------------------------------

  describe "PUT /api/meetings/:id — update" do
    test "updates meeting fields", %{conn: conn, user: user, lead: lead} do
      tomorrow = Date.utc_today() |> Date.add(1)

      {:ok, meeting} =
        Sales.create_meeting(%{
          lead_id: lead.id,
          user_id: user.id,
          title: "Original",
          meeting_date: tomorrow,
          meeting_time: ~T[10:00:00]
        })

      conn = put(conn, "/api/meetings/#{meeting.id}", %{
        notes: "Updated notes",
        status: "completed"
      })

      assert %{"meeting" => m} = json_response(conn, 200)
      assert m["notes"] == "Updated notes"
      assert m["status"] == "completed"
    end

    test "agent cannot update another agent's meeting", %{conn: conn, agent2: agent2, lead: lead} do
      tomorrow = Date.utc_today() |> Date.add(1)

      {:ok, meeting} =
        Sales.create_meeting(%{
          lead_id: lead.id,
          user_id: agent2.id,
          title: "Agent2 Meeting",
          meeting_date: tomorrow,
          meeting_time: ~T[10:00:00]
        })

      conn = put(conn, "/api/meetings/#{meeting.id}", %{notes: "Nope"})
      assert json_response(conn, 403)
    end

    test "admin can update any meeting", %{conn: conn, admin: admin, user: user, lead: lead} do
      tomorrow = Date.utc_today() |> Date.add(1)

      {:ok, meeting} =
        Sales.create_meeting(%{
          lead_id: lead.id,
          user_id: user.id,
          title: "Agent Meeting",
          meeting_date: tomorrow,
          meeting_time: ~T[10:00:00]
        })

      conn =
        conn
        |> log_in_user(admin)
        |> put("/api/meetings/#{meeting.id}", %{notes: "Admin updated"})

      assert %{"meeting" => m} = json_response(conn, 200)
      assert m["notes"] == "Admin updated"
    end

    test "returns 404 for non-existent meeting", %{conn: conn} do
      conn = put(conn, "/api/meetings/00000000-0000-0000-0000-000000000000", %{notes: "test"})
      assert json_response(conn, 404)
    end

    test "updates meeting date and time", %{conn: conn, user: user, lead: lead} do
      tomorrow = Date.utc_today() |> Date.add(1)

      {:ok, meeting} =
        Sales.create_meeting(%{
          lead_id: lead.id,
          user_id: user.id,
          title: "Rebook Me",
          meeting_date: tomorrow,
          meeting_time: ~T[10:00:00]
        })

      new_date = Date.utc_today() |> Date.add(7) |> Date.to_iso8601()

      conn = put(conn, "/api/meetings/#{meeting.id}", %{
        meeting_date: new_date,
        meeting_time: "15:30:00"
      })

      assert %{"meeting" => m} = json_response(conn, 200)
      assert m["meeting_date"] == new_date
      assert m["meeting_time"] == "15:30:00"
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

  # -------------------------------------------------------------------------
  # POST /api/meetings — error and fallback paths
  # -------------------------------------------------------------------------

  describe "POST /api/meetings — parse fallbacks" do
    test "creates meeting with invalid date string — falls back to tomorrow", %{conn: conn, lead: lead} do
      conn =
        post(conn, "/api/meetings", %{
          lead_id: lead.id,
          title: "Fallback Date",
          meeting_date: "not-a-date",
          meeting_time: "10:00:00"
        })

      assert %{"meeting" => meeting} = json_response(conn, 201)
      assert meeting["title"] == "Fallback Date"
    end

    test "creates meeting with invalid time string — falls back to 10:00", %{conn: conn, lead: lead} do
      conn =
        post(conn, "/api/meetings", %{
          lead_id: lead.id,
          title: "Fallback Time",
          meeting_date: "2026-08-01",
          meeting_time: "not-a-time"
        })

      assert %{"meeting" => meeting} = json_response(conn, 201)
      assert meeting["title"] == "Fallback Time"
    end

    test "creates meeting without date or time — uses defaults", %{conn: conn, lead: lead} do
      conn =
        post(conn, "/api/meetings", %{
          lead_id: lead.id,
          title: "No DateTime"
        })

      assert %{"meeting" => meeting} = json_response(conn, 201)
      assert meeting["title"] == "No DateTime"
    end

    test "returns 422 when required params are missing (no lead_id)", %{conn: conn} do
      conn =
        post(conn, "/api/meetings", %{
          title: "Missing Lead"
        })

      assert json_response(conn, 422)
    end
  end
end
