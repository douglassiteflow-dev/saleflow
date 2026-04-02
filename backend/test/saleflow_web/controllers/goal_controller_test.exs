defmodule SaleflowWeb.GoalControllerTest do
  use SaleflowWeb.ConnCase

  alias Saleflow.Accounts
  alias Saleflow.Sales

  @admin_params %{
    email: "admin-goal@example.com",
    name: "Admin User",
    password: "password123",
    password_confirmation: "password123",
    role: :admin
  }

  @agent_params %{
    email: "agent-goal@example.com",
    name: "Agent User",
    password: "password123",
    password_confirmation: "password123"
  }

  @agent2_params %{
    email: "agent2-goal@example.com",
    name: "Agent Two",
    password: "password123",
    password_confirmation: "password123"
  }

  setup %{conn: conn} do
    {:ok, admin} = Accounts.register(@admin_params)
    {:ok, agent} = Accounts.register(@agent_params)
    {:ok, agent2} = Accounts.register(@agent2_params)
    %{conn: conn, admin: admin, agent: agent, agent2: agent2}
  end

  # ---------------------------------------------------------------------------
  # GET /api/goals
  # ---------------------------------------------------------------------------

  describe "GET /api/goals" do
    test "returns active goals for current user", %{conn: conn, agent: agent} do
      {:ok, _goal} =
        Sales.create_goal(%{
          scope: :personal,
          metric: :calls_per_day,
          target_value: 50,
          period: :daily,
          set_by_id: agent.id,
          user_id: agent.id
        })

      resp =
        conn
        |> log_in_user(agent)
        |> get("/api/goals")
        |> json_response(200)

      assert [goal] = resp["goals"]
      assert goal["metric"] == "calls_per_day"
      assert goal["target_value"] == 50
      assert goal["scope"] == "personal"
      assert goal["active"] == true
      assert goal["period"] == "daily"
      assert goal["user_id"] == agent.id
    end
  end

  # ---------------------------------------------------------------------------
  # POST /api/goals
  # ---------------------------------------------------------------------------

  describe "POST /api/goals" do
    test "agent creates personal goal successfully", %{conn: conn, agent: agent} do
      resp =
        conn
        |> log_in_user(agent)
        |> post("/api/goals", %{
          scope: "personal",
          metric: "calls_per_day",
          target_value: 30,
          period: "daily"
        })
        |> json_response(201)

      goal = resp["goal"]
      assert goal["scope"] == "personal"
      assert goal["metric"] == "calls_per_day"
      assert goal["target_value"] == 30
      assert goal["set_by_id"] == agent.id
      assert goal["user_id"] == agent.id
    end

    test "admin creates global goal successfully", %{conn: conn, admin: admin} do
      resp =
        conn
        |> log_in_user(admin)
        |> post("/api/goals", %{
          scope: "global",
          metric: "meetings_per_week",
          target_value: 10,
          period: "weekly"
        })
        |> json_response(201)

      goal = resp["goal"]
      assert goal["scope"] == "global"
      assert goal["metric"] == "meetings_per_week"
      assert goal["target_value"] == 10
      assert goal["set_by_id"] == admin.id
    end

    test "admin creates personal goal for specific agent", %{conn: conn, admin: admin, agent: agent} do
      resp =
        conn
        |> log_in_user(admin)
        |> post("/api/goals", %{
          scope: "personal",
          metric: "calls_per_day",
          target_value: 60,
          period: "daily",
          user_id: agent.id
        })
        |> json_response(201)

      goal = resp["goal"]
      assert goal["scope"] == "personal"
      assert goal["user_id"] == agent.id
      assert goal["set_by_id"] == admin.id
      assert goal["target_value"] == 60
    end

    test "agent cannot create global goal (403)", %{conn: conn, agent: agent} do
      conn
      |> log_in_user(agent)
      |> post("/api/goals", %{
        scope: "global",
        metric: "calls_per_day",
        target_value: 100,
        period: "daily"
      })
      |> json_response(403)
    end
  end

  # ---------------------------------------------------------------------------
  # PATCH /api/goals/:id
  # ---------------------------------------------------------------------------

  describe "PATCH /api/goals/:id" do
    test "updates target_value", %{conn: conn, agent: agent} do
      {:ok, goal} =
        Sales.create_goal(%{
          scope: :personal,
          metric: :calls_per_day,
          target_value: 20,
          period: :daily,
          set_by_id: agent.id,
          user_id: agent.id
        })

      resp =
        conn
        |> log_in_user(agent)
        |> patch("/api/goals/#{goal.id}", %{target_value: 40})
        |> json_response(200)

      assert resp["goal"]["target_value"] == 40
    end

    test "agent cannot update goal they didn't create (403)", %{conn: conn, admin: admin, agent: agent} do
      {:ok, goal} =
        Sales.create_goal(%{
          scope: :personal,
          metric: :calls_per_day,
          target_value: 20,
          period: :daily,
          set_by_id: admin.id,
          user_id: agent.id
        })

      conn
      |> log_in_user(agent)
      |> patch("/api/goals/#{goal.id}", %{target_value: 99})
      |> json_response(403)
    end
  end

  # ---------------------------------------------------------------------------
  # DELETE /api/goals/:id
  # ---------------------------------------------------------------------------

  describe "DELETE /api/goals/:id" do
    test "deactivates goal", %{conn: conn, agent: agent} do
      {:ok, goal} =
        Sales.create_goal(%{
          scope: :personal,
          metric: :calls_per_day,
          target_value: 20,
          period: :daily,
          set_by_id: agent.id,
          user_id: agent.id
        })

      resp =
        conn
        |> log_in_user(agent)
        |> delete("/api/goals/#{goal.id}")
        |> json_response(200)

      assert resp["ok"] == true

      # Verify goal is now inactive
      {:ok, goals} = Sales.list_active_goals(agent.id)
      assert Enum.empty?(goals)
    end

    test "agent cannot delete goal they didn't create (403)", %{conn: conn, admin: admin, agent: agent} do
      {:ok, goal} =
        Sales.create_goal(%{
          scope: :personal,
          metric: :calls_per_day,
          target_value: 20,
          period: :daily,
          set_by_id: admin.id,
          user_id: agent.id
        })

      conn
      |> log_in_user(agent)
      |> delete("/api/goals/#{goal.id}")
      |> json_response(403)
    end
  end
end
