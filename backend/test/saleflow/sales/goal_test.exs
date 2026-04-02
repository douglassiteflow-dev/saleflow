defmodule Saleflow.Sales.GoalTest do
  use Saleflow.DataCase, async: true

  alias Saleflow.Sales

  # ---------------------------------------------------------------------------
  # Helpers
  # ---------------------------------------------------------------------------

  defp create_user! do
    unique = System.unique_integer([:positive])

    {:ok, user} =
      Saleflow.Accounts.User
      |> Ash.Changeset.for_create(:register_with_password, %{
        email: "agent#{unique}@test.se",
        name: "Agent #{unique}",
        password: "Password123!",
        password_confirmation: "Password123!"
      })
      |> Ash.create()

    user
  end

  # ---------------------------------------------------------------------------
  # create_goal/1
  # ---------------------------------------------------------------------------

  describe "create_goal/1" do
    test "creates a global goal" do
      admin = create_user!()

      assert {:ok, goal} =
               Sales.create_goal(%{
                 scope: :global,
                 metric: :meetings_per_week,
                 target_value: 10,
                 set_by_id: admin.id,
                 period: :weekly
               })

      assert goal.scope == :global
      assert goal.metric == :meetings_per_week
      assert goal.target_value == 10
      assert goal.set_by_id == admin.id
      assert goal.period == :weekly
      assert goal.active == true
      assert is_nil(goal.user_id)
      refute is_nil(goal.id)
      refute is_nil(goal.inserted_at)
      refute is_nil(goal.updated_at)
    end

    test "creates a personal goal for an agent (self-set)" do
      agent = create_user!()

      assert {:ok, goal} =
               Sales.create_goal(%{
                 scope: :personal,
                 metric: :calls_per_day,
                 target_value: 20,
                 user_id: agent.id,
                 set_by_id: agent.id,
                 period: :daily
               })

      assert goal.scope == :personal
      assert goal.metric == :calls_per_day
      assert goal.target_value == 20
      assert goal.user_id == agent.id
      assert goal.set_by_id == agent.id
      assert goal.period == :daily
      assert goal.active == true
    end

    test "creates an admin-set goal for a specific agent" do
      admin = create_user!()
      agent = create_user!()

      assert {:ok, goal} =
               Sales.create_goal(%{
                 scope: :personal,
                 metric: :meetings_per_week,
                 target_value: 15,
                 user_id: agent.id,
                 set_by_id: admin.id,
                 period: :weekly
               })

      assert goal.scope == :personal
      assert goal.user_id == agent.id
      assert goal.set_by_id == admin.id
      assert goal.target_value == 15
    end
  end

  # ---------------------------------------------------------------------------
  # list_active_goals/1
  # ---------------------------------------------------------------------------

  describe "list_active_goals/1" do
    test "returns personal over global for same metric" do
      admin = create_user!()
      agent = create_user!()

      {:ok, _global} =
        Sales.create_goal(%{
          scope: :global,
          metric: :meetings_per_week,
          target_value: 5,
          set_by_id: admin.id,
          period: :weekly
        })

      {:ok, personal} =
        Sales.create_goal(%{
          scope: :personal,
          metric: :meetings_per_week,
          target_value: 8,
          user_id: agent.id,
          set_by_id: agent.id,
          period: :weekly
        })

      assert {:ok, goals} = Sales.list_active_goals(agent.id)
      assert length(goals) == 1
      assert hd(goals).id == personal.id
      assert hd(goals).target_value == 8
    end

    test "returns admin-set over self-set for same metric" do
      admin = create_user!()
      agent = create_user!()

      {:ok, _self_set} =
        Sales.create_goal(%{
          scope: :personal,
          metric: :calls_per_day,
          target_value: 15,
          user_id: agent.id,
          set_by_id: agent.id,
          period: :daily
        })

      {:ok, admin_set} =
        Sales.create_goal(%{
          scope: :personal,
          metric: :calls_per_day,
          target_value: 25,
          user_id: agent.id,
          set_by_id: admin.id,
          period: :daily
        })

      assert {:ok, goals} = Sales.list_active_goals(agent.id)
      assert length(goals) == 1
      assert hd(goals).id == admin_set.id
      assert hd(goals).target_value == 25
    end

    test "returns global when no personal exists" do
      admin = create_user!()
      agent = create_user!()

      {:ok, global} =
        Sales.create_goal(%{
          scope: :global,
          metric: :meetings_per_week,
          target_value: 10,
          set_by_id: admin.id,
          period: :weekly
        })

      assert {:ok, goals} = Sales.list_active_goals(agent.id)
      assert length(goals) == 1
      assert hd(goals).id == global.id
    end

    test "returns empty when no goals exist" do
      agent = create_user!()

      assert {:ok, []} = Sales.list_active_goals(agent.id)
    end

    test "deactivated goals are not returned" do
      admin = create_user!()
      agent = create_user!()

      {:ok, goal} =
        Sales.create_goal(%{
          scope: :global,
          metric: :meetings_per_week,
          target_value: 10,
          set_by_id: admin.id,
          period: :weekly
        })

      {:ok, _deactivated} = Sales.deactivate_goal(goal)

      assert {:ok, []} = Sales.list_active_goals(agent.id)
    end

    test "returns goals for multiple metrics" do
      admin = create_user!()
      agent = create_user!()

      {:ok, _g1} =
        Sales.create_goal(%{
          scope: :global,
          metric: :meetings_per_week,
          target_value: 10,
          set_by_id: admin.id,
          period: :weekly
        })

      {:ok, _g2} =
        Sales.create_goal(%{
          scope: :global,
          metric: :calls_per_day,
          target_value: 20,
          set_by_id: admin.id,
          period: :daily
        })

      assert {:ok, goals} = Sales.list_active_goals(agent.id)
      assert length(goals) == 2
      metrics = Enum.map(goals, & &1.metric) |> Enum.sort()
      assert metrics == [:calls_per_day, :meetings_per_week]
    end
  end

  # ---------------------------------------------------------------------------
  # update_goal/2
  # ---------------------------------------------------------------------------

  describe "update_goal/2" do
    test "changes target_value" do
      admin = create_user!()

      {:ok, goal} =
        Sales.create_goal(%{
          scope: :global,
          metric: :meetings_per_week,
          target_value: 10,
          set_by_id: admin.id,
          period: :weekly
        })

      assert {:ok, updated} = Sales.update_goal(goal, %{target_value: 20})
      assert updated.target_value == 20
      assert updated.id == goal.id
    end

    test "changes active status" do
      admin = create_user!()

      {:ok, goal} =
        Sales.create_goal(%{
          scope: :global,
          metric: :calls_per_day,
          target_value: 15,
          set_by_id: admin.id,
          period: :daily
        })

      assert {:ok, updated} = Sales.update_goal(goal, %{active: false})
      assert updated.active == false
    end
  end

  # ---------------------------------------------------------------------------
  # deactivate_goal/1
  # ---------------------------------------------------------------------------

  describe "deactivate_goal/1" do
    test "sets active to false" do
      admin = create_user!()

      {:ok, goal} =
        Sales.create_goal(%{
          scope: :global,
          metric: :meetings_per_week,
          target_value: 10,
          set_by_id: admin.id,
          period: :weekly
        })

      assert goal.active == true
      assert {:ok, deactivated} = Sales.deactivate_goal(goal)
      assert deactivated.active == false
      assert deactivated.id == goal.id
    end
  end
end
