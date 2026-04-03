defmodule SaleflowWeb.DashboardControllerTest do
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
    {:ok, agent} = Accounts.register(@agent_params)
    %{conn: conn, admin: admin, agent: agent}
  end

  # -------------------------------------------------------------------------
  # GET /api/dashboard
  # -------------------------------------------------------------------------

  describe "GET /api/dashboard" do
    test "returns all dashboard sections for admin", %{conn: conn, admin: admin} do
      conn =
        conn
        |> log_in_user(admin)
        |> get("/api/dashboard")

      assert %{
               "stats" => stats,
               "todays_meetings" => _meetings,
               "callbacks" => _callbacks,
               "my_stats" => my_stats,
               "conversion" => conversion,
               "goal_progress" => goal_progress
             } = json_response(conn, 200)

      assert Map.has_key?(stats, "total_leads")
      assert Map.has_key?(my_stats, "calls_today")
      assert Map.has_key?(my_stats, "total_calls")
      assert Map.has_key?(my_stats, "meetings_today")
      assert Map.has_key?(my_stats, "total_meetings")

      assert Map.has_key?(conversion, "calls_today")
      assert Map.has_key?(conversion, "meetings_today")
      assert Map.has_key?(conversion, "rate")

      assert is_list(goal_progress)
    end

    test "returns all dashboard sections for agent", %{conn: conn, agent: agent} do
      conn =
        conn
        |> log_in_user(agent)
        |> get("/api/dashboard")

      assert %{
               "stats" => _,
               "todays_meetings" => _,
               "callbacks" => _,
               "my_stats" => _,
               "conversion" => _,
               "goal_progress" => _
             } = json_response(conn, 200)
    end

    test "includes today's meetings with lead data", %{conn: conn, admin: admin} do
      {:ok, lead} = Sales.create_lead(%{företag: "Test AB", telefon: "+46700000001"})

      {:ok, _} =
        Sales.create_meeting(%{
          lead_id: lead.id,
          user_id: admin.id,
          title: "Today Meeting",
          meeting_date: Date.utc_today(),
          meeting_time: ~T[14:00:00]
        })

      conn =
        conn
        |> log_in_user(admin)
        |> get("/api/dashboard")

      assert %{"todays_meetings" => meetings} = json_response(conn, 200)
      assert length(meetings) == 1
      assert hd(meetings)["title"] == "Today Meeting"
      assert hd(meetings)["lead"]["företag"] == "Test AB"
    end

    test "does not include non-today meetings", %{conn: conn, admin: admin} do
      {:ok, lead} = Sales.create_lead(%{företag: "Tomorrow AB", telefon: "+46700000002"})

      {:ok, _} =
        Sales.create_meeting(%{
          lead_id: lead.id,
          user_id: admin.id,
          title: "Tomorrow Meeting",
          meeting_date: Date.utc_today() |> Date.add(1),
          meeting_time: ~T[10:00:00]
        })

      conn =
        conn
        |> log_in_user(admin)
        |> get("/api/dashboard")

      assert %{"todays_meetings" => meetings} = json_response(conn, 200)
      assert length(meetings) == 0
    end

    test "returns callbacks as leads with callback status", %{conn: conn, admin: admin} do
      {:ok, lead} = Sales.create_lead(%{företag: "Callback AB", telefon: "+46700000003"})
      {:ok, _} = Sales.update_lead_status(lead, %{status: :callback})

      conn =
        conn
        |> log_in_user(admin)
        |> get("/api/dashboard")

      assert %{"callbacks" => callbacks} = json_response(conn, 200)
      assert length(callbacks) == 1
      assert hd(callbacks)["företag"] == "Callback AB"
    end

    test "agent sees only their own today's meetings", %{conn: conn, admin: admin, agent: agent} do
      {:ok, lead} = Sales.create_lead(%{företag: "Scoped AB", telefon: "+46700000004"})

      {:ok, _} =
        Sales.create_meeting(%{
          lead_id: lead.id,
          user_id: agent.id,
          title: "Agent Today",
          meeting_date: Date.utc_today(),
          meeting_time: ~T[10:00:00]
        })

      {:ok, _} =
        Sales.create_meeting(%{
          lead_id: lead.id,
          user_id: admin.id,
          title: "Admin Today",
          meeting_date: Date.utc_today(),
          meeting_time: ~T[11:00:00]
        })

      conn =
        conn
        |> log_in_user(agent)
        |> get("/api/dashboard")

      assert %{"todays_meetings" => meetings} = json_response(conn, 200)
      assert length(meetings) == 1
      assert hd(meetings)["title"] == "Agent Today"
    end

    test "my_stats includes correct counts from phone_calls", %{conn: conn, agent: agent} do
      {:ok, _} =
        Sales.create_phone_call(%{
          caller: "+46700000099",
          callee: "+46700000005",
          user_id: agent.id,
          duration: 60,
          direction: :outgoing
        })

      conn =
        conn
        |> log_in_user(agent)
        |> get("/api/dashboard")

      assert %{"my_stats" => stats} = json_response(conn, 200)
      assert stats["total_calls"] == 1
      assert stats["calls_today"] == 1
    end

    test "requires authentication", %{conn: conn} do
      conn =
        conn
        |> Plug.Test.init_test_session(%{})
        |> get("/api/dashboard")

      assert json_response(conn, 401)
    end

    test "stats shows lead counts", %{conn: conn, admin: admin} do
      {:ok, _} = Sales.create_lead(%{företag: "Lead1", telefon: "+46700000006"})
      {:ok, _} = Sales.create_lead(%{företag: "Lead2", telefon: "+46700000007"})

      conn =
        conn
        |> log_in_user(admin)
        |> get("/api/dashboard")

      assert %{"stats" => stats} = json_response(conn, 200)
      assert stats["total_leads"] == 2
      assert stats["new"] == 2
    end

    test "conversion rate is calculated correctly", %{conn: conn, agent: agent} do
      {:ok, lead} = Sales.create_lead(%{företag: "Conv AB", telefon: "+46700000010"})

      # Create 2 outgoing phone calls
      for _ <- 1..2 do
        {:ok, _} =
          Sales.create_phone_call(%{
            caller: "+46700000010",
            callee: "+46700000099",
            user_id: agent.id,
            duration: 30,
            direction: :outgoing
          })
      end

      # Create 1 meeting today
      {:ok, _} =
        Sales.create_meeting(%{
          lead_id: lead.id,
          user_id: agent.id,
          title: "Conv Meeting",
          meeting_date: Date.utc_today(),
          meeting_time: ~T[15:00:00]
        })

      conn =
        conn
        |> log_in_user(agent)
        |> get("/api/dashboard")

      assert %{"conversion" => conversion} = json_response(conn, 200)
      assert conversion["calls_today"] == 2
      assert conversion["meetings_today"] == 1
      assert conversion["rate"] == 50.0
    end

    test "conversion rate is 0 when no calls", %{conn: conn, agent: agent} do
      conn =
        conn
        |> log_in_user(agent)
        |> get("/api/dashboard")

      assert %{"conversion" => conversion} = json_response(conn, 200)
      assert conversion["rate"] == 0.0
    end

    test "returns meetings with user_name and updated_at", %{conn: conn, admin: admin} do
      {:ok, lead} = Sales.create_lead(%{företag: "Rich AB", telefon: "+46700000008"})

      {:ok, _} =
        Sales.create_meeting(%{
          lead_id: lead.id,
          user_id: admin.id,
          title: "Rich Meeting",
          meeting_date: Date.utc_today(),
          meeting_time: ~T[09:00:00]
        })

      conn =
        conn
        |> log_in_user(admin)
        |> get("/api/dashboard")

      assert %{"todays_meetings" => [meeting]} = json_response(conn, 200)
      assert meeting["user_name"] == "Admin User"
      assert Map.has_key?(meeting, "updated_at")
      assert Map.has_key?(meeting, "reminded_at")
    end
  end
end
