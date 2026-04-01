defmodule Saleflow.Workers.QuarantineReleaseWorkerCoverageTest do
  @moduledoc """
  Additional coverage tests for QuarantineReleaseWorker.

  Covers:
  - Logger.info message during perform
  - fetch_expired_quarantine_ids error handling
  """

  use Saleflow.DataCase, async: false

  import ExUnit.CaptureLog

  alias Saleflow.Workers.QuarantineReleaseWorker

  # ---------------------------------------------------------------------------
  # Tests
  # ---------------------------------------------------------------------------

  describe "QuarantineReleaseWorker — Logger.info coverage" do
    test "Logger.info is exercised during perform" do
      previous_level = Logger.level()
      Logger.configure(level: :info)

      log =
        capture_log([level: :info], fn ->
          assert :ok = QuarantineReleaseWorker.perform(%Oban.Job{})
        end)

      Logger.configure(level: previous_level)

      assert log =~ "QuarantineReleaseWorker"
      assert log =~ "expired quarantine"
    end

    test "fetch_expired_quarantine_ids returns empty list and logs warning on DB error" do
      # Temporarily rename the table to cause a SQL error
      Saleflow.Repo.query!("ALTER TABLE leads RENAME TO leads_tmp")

      log =
        capture_log(fn ->
          now = DateTime.utc_now()
          result = QuarantineReleaseWorker.fetch_expired_quarantine_ids(now)
          assert result == []
        end)

      # Restore the table name
      Saleflow.Repo.query!("ALTER TABLE leads_tmp RENAME TO leads")

      assert log =~ "QuarantineReleaseWorker"
      assert log =~ "failed to fetch expired quarantines"
    end
  end
end
