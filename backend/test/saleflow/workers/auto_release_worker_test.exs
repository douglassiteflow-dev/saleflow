defmodule Saleflow.Workers.AutoReleaseWorkerTest do
  @moduledoc """
  Tests for AutoReleaseWorker.

  Uses async: false because tests manipulate assignment timestamps via raw SQL
  and interact with global state in the assignments table.
  """

  use Saleflow.DataCase, async: false

  alias Saleflow.Workers.AutoReleaseWorker
  alias Saleflow.Sales
  alias Saleflow.Audit

  # ---------------------------------------------------------------------------
  # Helpers
  # ---------------------------------------------------------------------------

  defp create_user! do
    unique = System.unique_integer([:positive])

    {:ok, user} =
      Saleflow.Accounts.User
      |> Ash.Changeset.for_create(:register_with_password, %{
        email: "worker#{unique}@test.se",
        name: "Worker Agent #{unique}",
        password: "Password123!",
        password_confirmation: "Password123!"
      })
      |> Ash.create()

    user
  end

  defp create_lead! do
    unique = System.unique_integer([:positive])
    {:ok, lead} = Sales.create_lead(%{företag: "Test AB #{unique}", telefon: "+4670#{unique}"})
    lead
  end

  defp backdate_assignment!(assignment_id, minutes_ago) do
    Saleflow.Repo.query!(
      "UPDATE assignments SET assigned_at = assigned_at - ($1 * INTERVAL '1 minute') WHERE id = $2",
      [minutes_ago, Ecto.UUID.dump!(assignment_id)]
    )
  end

  # ---------------------------------------------------------------------------
  # Tests
  # ---------------------------------------------------------------------------

  describe "AutoReleaseWorker — stale assignment release" do
    test "releases stale assignments older than 30 minutes" do
      lead = create_lead!()
      agent = create_user!()
      {:ok, assignment} = Sales.assign_lead(lead, agent)

      # Backdate assigned_at to 35 minutes ago
      backdate_assignment!(assignment.id, 35)

      assert :ok = AutoReleaseWorker.perform(%Oban.Job{})

      # Assignment should now be released
      {:ok, updated} = Ash.get(Saleflow.Sales.Assignment, assignment.id)
      refute is_nil(updated.released_at)
      assert updated.release_reason == :timeout
    end

    test "does NOT release fresh assignments (less than 30 minutes old)" do
      lead = create_lead!()
      agent = create_user!()
      {:ok, assignment} = Sales.assign_lead(lead, agent)

      # Backdate assigned_at to only 10 minutes ago — should NOT be released
      backdate_assignment!(assignment.id, 10)

      assert :ok = AutoReleaseWorker.perform(%Oban.Job{})

      {:ok, updated} = Ash.get(Saleflow.Sales.Assignment, assignment.id)
      assert is_nil(updated.released_at)
    end

    test "sets lead status back to :new when assignment times out" do
      lead = create_lead!()
      agent = create_user!()
      {:ok, assignment} = Sales.assign_lead(lead, agent)

      # Mark lead as assigned (as would happen in normal flow)
      {:ok, _} = Sales.update_lead_status(lead, %{status: :assigned})

      backdate_assignment!(assignment.id, 35)

      assert :ok = AutoReleaseWorker.perform(%Oban.Job{})

      {:ok, updated_lead} = Sales.get_lead(lead.id)
      assert updated_lead.status == :new
    end

    test "does not change lead status if lead is no longer :assigned" do
      lead = create_lead!()
      agent = create_user!()
      {:ok, assignment} = Sales.assign_lead(lead, agent)

      # Agent progressed the lead to :callback before timeout
      {:ok, _} = Sales.update_lead_status(lead, %{status: :callback})

      backdate_assignment!(assignment.id, 35)

      assert :ok = AutoReleaseWorker.perform(%Oban.Job{})

      # Assignment should be released (timed out)
      {:ok, updated_assignment} = Ash.get(Saleflow.Sales.Assignment, assignment.id)
      refute is_nil(updated_assignment.released_at)

      # But lead status should remain :callback, not be reset to :new
      {:ok, updated_lead} = Sales.get_lead(lead.id)
      assert updated_lead.status == :callback
    end

    test "handles already-released assignments gracefully (skips them)" do
      lead = create_lead!()
      agent = create_user!()
      {:ok, assignment} = Sales.assign_lead(lead, agent)

      # Release manually first
      {:ok, _} = Sales.release_assignment(assignment, :manual)

      # Backdate — but since released_at is set, the query won't pick it up
      backdate_assignment!(assignment.id, 35)

      assert :ok = AutoReleaseWorker.perform(%Oban.Job{})

      # Release reason should still be :manual (not overwritten to :timeout)
      {:ok, updated} = Ash.get(Saleflow.Sales.Assignment, assignment.id)
      assert updated.release_reason == :manual
    end

    test "creates audit log for auto-released assignment" do
      lead = create_lead!()
      agent = create_user!()
      {:ok, assignment} = Sales.assign_lead(lead, agent)

      backdate_assignment!(assignment.id, 35)

      assert :ok = AutoReleaseWorker.perform(%Oban.Job{})

      {:ok, logs} = Audit.list_for_resource("Assignment", assignment.id)

      auto_release_logs =
        Enum.filter(logs, fn log -> log.action == "assignment.auto_released" end)

      assert length(auto_release_logs) >= 1

      log = hd(auto_release_logs)
      assert log.resource_type == "Assignment"
      assert log.resource_id == assignment.id
    end

    test "returns :ok even when no stale assignments exist" do
      assert :ok = AutoReleaseWorker.perform(%Oban.Job{})
    end

    test "releases multiple stale assignments in one run" do
      lead1 = create_lead!()
      lead2 = create_lead!()
      agent1 = create_user!()
      agent2 = create_user!()

      {:ok, assignment1} = Sales.assign_lead(lead1, agent1)
      {:ok, assignment2} = Sales.assign_lead(lead2, agent2)

      backdate_assignment!(assignment1.id, 40)
      backdate_assignment!(assignment2.id, 45)

      assert :ok = AutoReleaseWorker.perform(%Oban.Job{})

      {:ok, a1} = Ash.get(Saleflow.Sales.Assignment, assignment1.id)
      {:ok, a2} = Ash.get(Saleflow.Sales.Assignment, assignment2.id)

      assert a1.release_reason == :timeout
      assert a2.release_reason == :timeout
    end

    test "logs and resets lead to :new when assignment was :assigned before timeout" do
      lead = create_lead!()
      agent = create_user!()
      {:ok, assignment} = Sales.assign_lead(lead, agent)

      # Simulate lead status being :assigned (as set by queue)
      Saleflow.Repo.query!(
        "UPDATE leads SET status = 'assigned' WHERE id = $1",
        [Ecto.UUID.dump!(lead.id)]
      )

      backdate_assignment!(assignment.id, 35)

      assert :ok = AutoReleaseWorker.perform(%Oban.Job{})

      {:ok, refreshed_lead} = Sales.get_lead(lead.id)
      assert refreshed_lead.status == :new
    end

    test "does not reset lead if it has a non-assigned status after timeout" do
      lead = create_lead!()
      agent = create_user!()
      {:ok, assignment} = Sales.assign_lead(lead, agent)

      # Lead progressed to :customer while assignment was still open
      Saleflow.Repo.query!(
        "UPDATE leads SET status = 'customer' WHERE id = $1",
        [Ecto.UUID.dump!(lead.id)]
      )

      backdate_assignment!(assignment.id, 35)

      assert :ok = AutoReleaseWorker.perform(%Oban.Job{})

      {:ok, refreshed_lead} = Sales.get_lead(lead.id)
      assert refreshed_lead.status == :customer
    end
  end
end
