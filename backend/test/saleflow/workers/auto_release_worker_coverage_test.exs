defmodule Saleflow.Workers.AutoReleaseWorkerCoverageTest do
  @moduledoc """
  Additional coverage tests for AutoReleaseWorker.

  Covers:
  - Logger.info message during perform
  - fetch_stale_assignments error handling
  - release_stale_assignment error handling (via Logger.warning)
  """

  use Saleflow.DataCase, async: false

  import ExUnit.CaptureLog

  alias Saleflow.Workers.AutoReleaseWorker

  # ---------------------------------------------------------------------------
  # Tests
  # ---------------------------------------------------------------------------

  describe "AutoReleaseWorker — edge-case coverage" do
    test "Logger.info is exercised during perform (sets level temporarily)" do
      previous_level = Logger.level()
      Logger.configure(level: :info)

      log =
        capture_log([level: :info], fn ->
          assert :ok = AutoReleaseWorker.perform(%Oban.Job{})
        end)

      Logger.configure(level: previous_level)

      assert log =~ "AutoReleaseWorker"
      assert log =~ "stale assignment"
    end

    test "fetch_stale_assignments returns empty list and logs warning on DB error" do
      # Temporarily rename the table to cause a SQL error
      Saleflow.Repo.query!("ALTER TABLE assignments RENAME TO assignments_tmp")

      log =
        capture_log(fn ->
          cutoff = DateTime.add(DateTime.utc_now(), -1800, :second)
          result = AutoReleaseWorker.fetch_stale_assignments(cutoff)
          assert result == []
        end)

      # Restore the table name
      Saleflow.Repo.query!("ALTER TABLE assignments_tmp RENAME TO assignments")

      assert log =~ "AutoReleaseWorker"
      assert log =~ "failed to fetch stale assignments"
    end

    test "release_stale_assignment logs warning when assignment cannot be found" do
      # Use a random UUID that doesn't exist in the DB
      fake_id = Ecto.UUID.generate()

      log =
        capture_log(fn ->
          assert :ok = AutoReleaseWorker.release_stale_assignment(fake_id)
        end)

      assert log =~ "AutoReleaseWorker"
      assert log =~ "failed to release assignment"
    end
  end
end
