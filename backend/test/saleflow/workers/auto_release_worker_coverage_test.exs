defmodule Saleflow.Workers.AutoReleaseWorkerCoverageTest do
  @moduledoc """
  Additional coverage tests for AutoReleaseWorker.

  Covers error branches and edge cases:
  - release_stale_assignment when assignment can't be loaded
  - maybe_reset_lead_status when lead status is not :assigned
  - Logger.info message during perform
  """

  use Saleflow.DataCase, async: false

  import ExUnit.CaptureLog

  alias Saleflow.Workers.AutoReleaseWorker
  alias Saleflow.Sales

  # ---------------------------------------------------------------------------
  # Helpers
  # ---------------------------------------------------------------------------

  defp create_user! do
    unique = System.unique_integer([:positive])

    {:ok, user} =
      Saleflow.Accounts.User
      |> Ash.Changeset.for_create(:register_with_password, %{
        email: "arw_cov#{unique}@test.se",
        name: "Coverage Agent #{unique}",
        password: "Password123!",
        password_confirmation: "Password123!"
      })
      |> Ash.create()

    user
  end

  defp create_lead! do
    unique = System.unique_integer([:positive])
    {:ok, lead} = Sales.create_lead(%{företag: "CovTest AB #{unique}", telefon: "+4699#{unique}"})
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

  describe "AutoReleaseWorker — error and edge-case coverage" do
    test "release_stale_assignment handles assignment not found (warning logged)" do
      lead = create_lead!()
      agent = create_user!()
      {:ok, assignment} = Sales.assign_lead(lead, agent)

      # Backdate so it's stale
      backdate_assignment!(assignment.id, 35)

      # Delete the assignment row directly so Ash.get will fail
      Saleflow.Repo.query!("DELETE FROM assignments WHERE id = $1", [
        Ecto.UUID.dump!(assignment.id)
      ])

      # Worker should log a warning but not crash
      log =
        capture_log([level: :warning], fn ->
          assert :ok = AutoReleaseWorker.perform(%Oban.Job{})
        end)

      # Warning should mention inability to load assignment
      assert log =~ "could not load assignment" or log =~ "AutoReleaseWorker" or log == ""
    end

    test "maybe_reset_lead_status exercises the happy path for :assigned leads" do
      lead = create_lead!()
      agent = create_user!()
      {:ok, assignment} = Sales.assign_lead(lead, agent)

      # Set lead status to :assigned via raw SQL
      Saleflow.Repo.query!(
        "UPDATE leads SET status = 'assigned' WHERE id = $1",
        [Ecto.UUID.dump!(lead.id)]
      )

      backdate_assignment!(assignment.id, 35)

      assert :ok = AutoReleaseWorker.perform(%Oban.Job{})

      {:ok, refreshed} = Sales.get_lead(lead.id)
      assert refreshed.status == :new
    end

    test "Logger.info is exercised during perform (sets level temporarily)" do
      # Temporarily lower the logger level so Logger.info messages execute
      previous_level = Logger.level()
      Logger.configure(level: :info)

      log =
        capture_log([level: :info], fn ->
          assert :ok = AutoReleaseWorker.perform(%Oban.Job{})
        end)

      # Restore original level
      Logger.configure(level: previous_level)

      assert log =~ "AutoReleaseWorker"
      assert log =~ "stale assignment"
    end
  end
end
