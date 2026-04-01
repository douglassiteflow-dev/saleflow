defmodule Saleflow.Workers.QuarantineReleaseWorkerCoverageTest do
  @moduledoc """
  Additional coverage tests for QuarantineReleaseWorker.

  Covers:
  - Logger.info message during perform
  - release_quarantine happy path (already covered, but exercises log lines)
  """

  use Saleflow.DataCase, async: false

  import ExUnit.CaptureLog

  alias Saleflow.Workers.QuarantineReleaseWorker
  alias Saleflow.Sales

  # ---------------------------------------------------------------------------
  # Helpers
  # ---------------------------------------------------------------------------

  defp create_lead! do
    unique = System.unique_integer([:positive])
    {:ok, lead} = Sales.create_lead(%{företag: "QCov AB #{unique}", telefon: "+4698#{unique}"})
    lead
  end

  defp quarantine_lead_expired!(lead) do
    past = DateTime.add(DateTime.utc_now(), -3600, :second)
    {:ok, updated} = Sales.update_lead_status(lead, %{status: :quarantine, quarantine_until: past})
    updated
  end

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

    test "release_quarantine exercises the audit log creation path" do
      lead = create_lead!()
      _quarantined = quarantine_lead_expired!(lead)

      previous_level = Logger.level()
      Logger.configure(level: :info)

      log =
        capture_log([level: :info], fn ->
          assert :ok = QuarantineReleaseWorker.perform(%Oban.Job{})
        end)

      Logger.configure(level: previous_level)

      assert log =~ "QuarantineReleaseWorker"

      # Verify the lead was released
      {:ok, updated} = Sales.get_lead(lead.id)
      assert updated.status == :new
    end
  end
end
