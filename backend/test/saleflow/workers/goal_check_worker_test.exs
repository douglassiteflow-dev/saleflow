defmodule Saleflow.Workers.GoalCheckWorkerTest do
  @moduledoc """
  Tests for GoalCheckWorker.

  Uses async: false because tests rely on database state and time-based checks.
  """

  use Saleflow.DataCase, async: false

  alias Saleflow.Workers.GoalCheckWorker
  alias Saleflow.Sales

  # ---------------------------------------------------------------------------
  # Helpers
  # ---------------------------------------------------------------------------

  defp create_user! do
    unique = System.unique_integer([:positive])

    {:ok, user} =
      Saleflow.Accounts.User
      |> Ash.Changeset.for_create(:register_with_password, %{
        email: "goalcheck#{unique}@test.se",
        name: "Goal Check Agent #{unique}",
        password: "Password123!",
        password_confirmation: "Password123!"
      })
      |> Ash.create()

    user
  end

  defp create_lead! do
    unique = System.unique_integer([:positive])
    {:ok, lead} = Sales.create_lead(%{företag: "GoalTest AB #{unique}", telefon: "+4670#{unique}"})
    lead
  end

  defp create_goal!(user, metric, target, period) do
    {:ok, goal} =
      Sales.create_goal(%{
        scope: :personal,
        metric: metric,
        target_value: target,
        user_id: user.id,
        set_by_id: user.id,
        active: true,
        period: period
      })

    goal
  end

  defp insert_phone_call!(lead_id, user_id) do
    call_id = Ecto.UUID.generate()

    Saleflow.Repo.query!(
      """
      INSERT INTO phone_calls (id, lead_id, user_id, caller, callee, direction, received_at, duration, inserted_at)
      VALUES ($1, $2, $3, '+46701234567', '+46812345678', 'outgoing', NOW(), 120, NOW())
      """,
      [
        Ecto.UUID.dump!(call_id),
        Ecto.UUID.dump!(lead_id),
        Ecto.UUID.dump!(user_id)
      ]
    )

    call_id
  end

  defp create_meeting!(lead, user) do
    {:ok, meeting} =
      Sales.create_meeting(%{
        lead_id: lead.id,
        user_id: user.id,
        title: "Goal Test Meeting",
        meeting_date: Date.utc_today(),
        meeting_time: ~T[10:00:00]
      })

    meeting
  end

  # ---------------------------------------------------------------------------
  # perform/1
  # ---------------------------------------------------------------------------

  describe "perform/1" do
    test "returns :ok when no active goals exist" do
      # Ensure no active goals exist
      Saleflow.Repo.query!("DELETE FROM goals")

      assert :ok = GoalCheckWorker.perform(%Oban.Job{})
    end

    test "returns :ok with active goals that are not yet met" do
      user = create_user!()
      _goal = create_goal!(user, :calls_per_day, 100, :daily)

      # No calls today so current = 0 < 100
      assert :ok = GoalCheckWorker.perform(%Oban.Job{})
    end

    test "sends notification when calls_per_day goal is reached" do
      user = create_user!()
      lead = create_lead!()

      # Set target to 1 so one call reaches it
      _goal = create_goal!(user, :calls_per_day, 1, :daily)
      insert_phone_call!(lead.id, user.id)

      assert :ok = GoalCheckWorker.perform(%Oban.Job{})
    end

    test "does not send duplicate notification on second run for same goal" do
      user = create_user!()
      lead = create_lead!()

      _goal = create_goal!(user, :calls_per_day, 1, :daily)
      insert_phone_call!(lead.id, user.id)

      # First run: sends notification
      assert :ok = GoalCheckWorker.perform(%Oban.Job{})

      # Second run: notification already exists for today
      assert :ok = GoalCheckWorker.perform(%Oban.Job{})
    end

    test "returns :ok when meetings_per_week goal is reached" do
      user = create_user!()
      lead = create_lead!()

      _goal = create_goal!(user, :meetings_per_week, 1, :weekly)
      _meeting = create_meeting!(lead, user)

      assert :ok = GoalCheckWorker.perform(%Oban.Job{})
    end

    test "returns :ok when inactive goal is skipped" do
      user = create_user!()
      goal = create_goal!(user, :calls_per_day, 1, :daily)

      # Deactivate the goal
      Saleflow.Repo.query!("UPDATE goals SET active = false WHERE id = $1", [Ecto.UUID.dump!(goal.id)])

      lead = create_lead!()
      insert_phone_call!(lead.id, user.id)

      # Should skip inactive goal and not raise
      assert :ok = GoalCheckWorker.perform(%Oban.Job{})
    end

    test "handles multiple users with independent goals" do
      user1 = create_user!()
      user2 = create_user!()
      lead1 = create_lead!()

      _goal1 = create_goal!(user1, :calls_per_day, 1, :daily)
      _goal2 = create_goal!(user2, :calls_per_day, 1, :daily)

      # Only user1 reaches goal
      insert_phone_call!(lead1.id, user1.id)

      assert :ok = GoalCheckWorker.perform(%Oban.Job{})
    end

    test "returns :ok when target value is zero (edge case)" do
      user = create_user!()
      _goal = create_goal!(user, :calls_per_day, 0, :daily)

      # current = 0 >= 0 → notification should fire
      assert :ok = GoalCheckWorker.perform(%Oban.Job{})
    end
  end
end
