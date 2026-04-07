defmodule SaleflowWeb.LeadControllerTest do
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

  setup %{conn: conn} do
    {:ok, admin} = Accounts.register(@admin_params)
    {:ok, user} = Accounts.register(@agent_params)
    conn = log_in_user(conn, user)
    %{conn: conn, user: user, admin: admin}
  end

  # -------------------------------------------------------------------------
  # GET /api/leads
  # -------------------------------------------------------------------------

  describe "GET /api/leads" do
    test "returns all leads", %{conn: conn, user: user} do
      {:ok, lead1} = Sales.create_lead(%{företag: "Acme AB", telefon: "+46700000001"})
      {:ok, lead2} = Sales.create_lead(%{företag: "Beta AB", telefon: "+46700000002"})

      # Agent scoping: agents only see leads they have assignments for
      {:ok, _} = Sales.assign_lead(lead1, user)
      {:ok, _} = Sales.assign_lead(lead2, user)

      conn = get(conn, "/api/leads")
      assert %{"leads" => leads} = json_response(conn, 200)
      assert length(leads) == 2
    end

    test "returns empty list when no leads", %{conn: conn} do
      conn = get(conn, "/api/leads")
      assert %{"leads" => []} = json_response(conn, 200)
    end

    test "searches leads with q param", %{conn: conn, user: user} do
      {:ok, lead1} = Sales.create_lead(%{företag: "Acme AB", telefon: "+46700000001"})
      {:ok, lead2} = Sales.create_lead(%{företag: "Beta Konsult", telefon: "+46700000002"})
      {:ok, lead3} = Sales.create_lead(%{företag: "Acme Nordic", telefon: "+46700000003"})

      # Agent scoping: agents only see leads they have assignments for
      {:ok, _} = Sales.assign_lead(lead1, user)
      {:ok, _} = Sales.assign_lead(lead2, user)
      {:ok, _} = Sales.assign_lead(lead3, user)

      conn = get(conn, "/api/leads?q=Acme")
      assert %{"leads" => leads} = json_response(conn, 200)
      assert length(leads) == 2
      names = Enum.map(leads, & &1["företag"])
      assert "Acme AB" in names
      assert "Acme Nordic" in names
    end

    test "requires authentication" do
      conn =
        build_conn()
        |> Plug.Test.init_test_session(%{})
        |> get("/api/leads")

      assert json_response(conn, 401)
    end
  end

  # -------------------------------------------------------------------------
  # GET /api/leads/:id
  # -------------------------------------------------------------------------

  describe "GET /api/leads/:id" do
    test "agent sees only their own calls and audit logs", %{conn: conn, user: user} do
      {:ok, lead} = Sales.create_lead(%{företag: "Acme AB", telefon: "+46700000001"})
      {:ok, _call} = Sales.log_call(%{lead_id: lead.id, user_id: user.id, outcome: :no_answer})

      conn = get(conn, "/api/leads/#{lead.id}")
      assert %{"lead" => lead_json, "calls" => calls, "audit_logs" => audit_logs} = json_response(conn, 200)
      assert lead_json["företag"] == "Acme AB"
      assert length(calls) == 1
      assert hd(calls)["outcome"] == "no_answer"
      assert hd(calls)["user_name"] == "Du"
      # System audit log (nil user_id) is excluded for agents
      assert Enum.all?(audit_logs, fn a -> a["user_id"] == user.id end)
    end

    test "admin sees all calls and audit logs including system entries", %{conn: conn, admin: admin, user: agent} do
      conn_admin = log_in_user(conn, admin)
      {:ok, lead} = Sales.create_lead(%{företag: "Acme AB", telefon: "+46700000001"})
      {:ok, _call} = Sales.log_call(%{lead_id: lead.id, user_id: agent.id, outcome: :no_answer})

      conn_admin = get(conn_admin, "/api/leads/#{lead.id}")
      assert %{"lead" => lead_json, "calls" => calls, "audit_logs" => audit_logs} = json_response(conn_admin, 200)
      assert lead_json["företag"] == "Acme AB"
      assert length(calls) == 1
      assert hd(calls)["user_name"] == "Jane Agent"
      # Admin sees system audit log (lead.created) too
      assert length(audit_logs) >= 1
    end

    test "returns 404 for non-existent lead", %{conn: conn} do
      conn = get(conn, "/api/leads/00000000-0000-0000-0000-000000000000")
      assert json_response(conn, 404)
    end
  end

  # -------------------------------------------------------------------------
  # PATCH /api/leads/:id (update_fields)
  # -------------------------------------------------------------------------

  describe "PATCH /api/leads/:id" do
    test "updates epost on a lead", %{conn: conn} do
      {:ok, lead} = Sales.create_lead(%{företag: "Acme AB", telefon: "+46700000001"})

      conn = patch(conn, "/api/leads/#{lead.id}", %{epost: "info@acme.se"})
      assert %{"lead" => lead_json} = json_response(conn, 200)
      assert lead_json["epost"] == "info@acme.se"
    end

    test "updates hemsida on a lead", %{conn: conn} do
      {:ok, lead} = Sales.create_lead(%{företag: "Acme AB", telefon: "+46700000001"})

      conn = patch(conn, "/api/leads/#{lead.id}", %{hemsida: "https://acme.se"})
      assert %{"lead" => lead_json} = json_response(conn, 200)
      assert lead_json["hemsida"] == "https://acme.se"
    end
  end

  # -------------------------------------------------------------------------
  # POST /api/leads/next
  # -------------------------------------------------------------------------

  describe "POST /api/leads/next" do
    test "returns next lead from queue", %{conn: conn} do
      {:ok, _lead} = Sales.create_lead(%{företag: "Acme AB", telefon: "+46700000001"})

      conn = post(conn, "/api/leads/next")
      assert %{"lead" => lead_json} = json_response(conn, 200)
      assert lead_json["företag"] == "Acme AB"
      assert lead_json["status"] == "assigned"
    end

    test "returns null when queue is empty", %{conn: conn} do
      conn = post(conn, "/api/leads/next")
      assert %{"lead" => nil} = json_response(conn, 200)
    end
  end

  # -------------------------------------------------------------------------
  # POST /api/leads/:id/outcome
  # -------------------------------------------------------------------------

  describe "POST /api/leads/:id/outcome" do
    setup %{user: user} do
      {:ok, lead} = Sales.create_lead(%{företag: "Acme AB", telefon: "+46700000001"})
      # Assign the lead so there's an active assignment to release
      {:ok, _assignment} = Sales.assign_lead(lead, user)
      {:ok, _lead} = Sales.update_lead_status(lead, %{status: :assigned})
      %{lead: lead}
    end

    test "no_answer quarantines lead for 24 hours", %{conn: conn, lead: lead} do
      conn = post(conn, "/api/leads/#{lead.id}/outcome", %{outcome: "no_answer"})
      assert %{"ok" => true} = json_response(conn, 200)

      {:ok, updated_lead} = Sales.get_lead(lead.id)
      assert updated_lead.status == :quarantine
      refute is_nil(updated_lead.quarantine_until)
    end

    test "meeting_booked creates a meeting", %{conn: conn, lead: lead} do
      conn =
        post(conn, "/api/leads/#{lead.id}/outcome", %{
          outcome: "meeting_booked",
          title: "Demo meeting",
          meeting_date: "2026-05-01",
          meeting_time: "10:00:00"
        })

      assert %{"ok" => true} = json_response(conn, 200)

      {:ok, updated_lead} = Sales.get_lead(lead.id)
      assert updated_lead.status == :meeting_booked

      {:ok, meetings} = Sales.list_meetings_for_lead(lead.id)
      assert length(meetings) == 1
      assert hd(meetings).title == "Demo meeting"
    end

    test "not_interested quarantines the lead", %{conn: conn, lead: lead} do
      conn = post(conn, "/api/leads/#{lead.id}/outcome", %{outcome: "not_interested"})
      assert %{"ok" => true} = json_response(conn, 200)

      {:ok, updated_lead} = Sales.get_lead(lead.id)
      assert updated_lead.status == :quarantine

      {:ok, quarantines} = Sales.list_active_quarantines()
      assert Enum.any?(quarantines, fn q -> q.lead_id == lead.id end)
    end

    test "bad_number sets lead to :bad_number", %{conn: conn, lead: lead} do
      conn = post(conn, "/api/leads/#{lead.id}/outcome", %{outcome: "bad_number"})
      assert %{"ok" => true} = json_response(conn, 200)

      {:ok, updated_lead} = Sales.get_lead(lead.id)
      assert updated_lead.status == :bad_number
    end

    test "customer sets lead to :customer", %{conn: conn, lead: lead} do
      conn = post(conn, "/api/leads/#{lead.id}/outcome", %{outcome: "customer"})
      assert %{"ok" => true} = json_response(conn, 200)

      {:ok, updated_lead} = Sales.get_lead(lead.id)
      assert updated_lead.status == :customer
    end

    test "callback sets lead to :callback", %{conn: conn, lead: lead} do
      callback_at = DateTime.utc_now() |> DateTime.add(2, :hour) |> DateTime.to_iso8601()

      conn = post(conn, "/api/leads/#{lead.id}/outcome", %{
        outcome: "callback",
        callback_at: callback_at
      })

      assert %{"ok" => true} = json_response(conn, 200)

      {:ok, updated_lead} = Sales.get_lead(lead.id)
      assert updated_lead.status == :callback
    end

    test "requires authentication" do
      {:ok, lead} = Sales.create_lead(%{företag: "Test AB", telefon: "+46700099999"})

      conn =
        build_conn()
        |> Plug.Test.init_test_session(%{})
        |> post("/api/leads/#{lead.id}/outcome", %{outcome: "no_answer"})

      assert json_response(conn, 401)
    end

    test "returns error with missing outcome param", %{conn: conn, lead: lead} do
      conn = post(conn, "/api/leads/#{lead.id}/outcome", %{})
      assert json_response(conn, 400)
    end

    test "unknown outcome returns 422", %{conn: conn, lead: lead} do
      # Use a valid atom string that maps to an unknown outcome handler
      conn = post(conn, "/api/leads/#{lead.id}/outcome", %{outcome: "new"})
      assert json_response(conn, 422)
    end

    test "callback without explicit callback_at sets a default 1-hour future time", %{conn: conn, lead: lead} do
      conn = post(conn, "/api/leads/#{lead.id}/outcome", %{outcome: "callback"})
      assert %{"ok" => true} = json_response(conn, 200)

      {:ok, updated_lead} = Sales.get_lead(lead.id)
      assert updated_lead.status == :callback
      refute is_nil(updated_lead.callback_at)
    end

    test "meeting_booked with meeting_notes persists notes", %{conn: conn, lead: lead} do
      conn =
        post(conn, "/api/leads/#{lead.id}/outcome", %{
          outcome: "meeting_booked",
          title: "Notes Meeting",
          meeting_date: "2026-07-01",
          meeting_time: "09:00:00",
          meeting_notes: "Bring samples"
        })

      assert %{"ok" => true} = json_response(conn, 200)

      {:ok, meetings} = Sales.list_meetings_for_lead(lead.id)
      assert length(meetings) == 1
      assert hd(meetings).notes == "Bring samples"
    end

    test "meeting_booked without title defaults to 'Möte med <företag>'", %{conn: conn, lead: lead} do
      conn =
        post(conn, "/api/leads/#{lead.id}/outcome", %{
          outcome: "meeting_booked",
          meeting_date: "2026-07-02",
          meeting_time: "11:00:00"
        })

      assert %{"ok" => true} = json_response(conn, 200)

      {:ok, meetings} = Sales.list_meetings_for_lead(lead.id)
      assert hd(meetings).title == "Möte med Acme AB"
    end

    test "meeting_booked without meeting_date and time uses defaults", %{conn: conn, lead: lead} do
      conn =
        post(conn, "/api/leads/#{lead.id}/outcome", %{
          outcome: "meeting_booked",
          title: "Default Date Meeting"
        })

      assert %{"ok" => true} = json_response(conn, 200)

      {:ok, meetings} = Sales.list_meetings_for_lead(lead.id)
      assert length(meetings) == 1
    end

    test "outcome for non-existent lead returns 422", %{conn: conn} do
      conn =
        post(conn, "/api/leads/00000000-0000-0000-0000-000000000000/outcome", %{
          outcome: "no_answer"
        })

      assert json_response(conn, 422)
    end

    test "callback with invalid callback_at string defaults to +1 hour", %{conn: conn, lead: lead} do
      conn =
        post(conn, "/api/leads/#{lead.id}/outcome", %{
          outcome: "callback",
          callback_at: "not-a-datetime"
        })

      assert %{"ok" => true} = json_response(conn, 200)

      {:ok, updated_lead} = Sales.get_lead(lead.id)
      assert updated_lead.status == :callback
    end
  end
end
