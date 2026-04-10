defmodule Saleflow.Workers.QuarantineReleaseWorkerTest do
  @moduledoc """
  Tests for QuarantineReleaseWorker.

  Uses async: false because tests manipulate lead timestamps via raw SQL
  and interact with the global leads table.
  """

  use Saleflow.DataCase, async: false

  alias Saleflow.Workers.QuarantineReleaseWorker
  alias Saleflow.Sales
  alias Saleflow.Audit

  # ---------------------------------------------------------------------------
  # Helpers
  # ---------------------------------------------------------------------------

  defp create_lead! do
    unique = System.unique_integer([:positive])
    {:ok, lead} = Sales.create_lead(%{företag: "Test AB #{unique}", telefon: "+4670#{unique}"})
    lead
  end

  defp create_user! do
    unique = System.unique_integer([:positive])

    {:ok, user} =
      Saleflow.Accounts.User
      |> Ash.Changeset.for_create(:register_with_password, %{
        email: "qrw#{unique}@test.se",
        name: "QR Worker Agent #{unique}",
        password: "Password123!",
        password_confirmation: "Password123!"
      })
      |> Ash.create()

    user
  end

  defp quarantine_lead_expired!(lead) do
    # Set quarantine_until to 1 hour in the past (expired)
    past = DateTime.add(DateTime.utc_now(), -3600, :second)
    {:ok, updated} = Sales.update_lead_status(lead, %{status: :quarantine, quarantine_until: past})
    updated
  end

  defp quarantine_lead_active!(lead) do
    # Set quarantine_until to 7 days in the future (still active)
    future = DateTime.add(DateTime.utc_now(), 7 * 24 * 3600, :second)
    {:ok, updated} = Sales.update_lead_status(lead, %{status: :quarantine, quarantine_until: future})
    updated
  end

  # ---------------------------------------------------------------------------
  # Tests
  # ---------------------------------------------------------------------------

  describe "QuarantineReleaseWorker — expired quarantine release" do
    test "releases leads with expired quarantine_until" do
      lead = create_lead!()
      _quarantined = quarantine_lead_expired!(lead)

      assert :ok = QuarantineReleaseWorker.perform(%Oban.Job{})

      {:ok, updated} = Sales.get_lead(lead.id)
      assert updated.status == :new
    end

    test "does NOT release leads with active quarantine (quarantine_until in the future)" do
      lead = create_lead!()
      _quarantined = quarantine_lead_active!(lead)

      assert :ok = QuarantineReleaseWorker.perform(%Oban.Job{})

      {:ok, updated} = Sales.get_lead(lead.id)
      assert updated.status == :quarantine
    end

    test "sets quarantine_until to nil after release" do
      lead = create_lead!()
      _quarantined = quarantine_lead_expired!(lead)

      assert :ok = QuarantineReleaseWorker.perform(%Oban.Job{})

      {:ok, updated} = Sales.get_lead(lead.id)
      assert is_nil(updated.quarantine_until)
    end

    test "creates audit log for quarantine release" do
      lead = create_lead!()
      _quarantined = quarantine_lead_expired!(lead)

      assert :ok = QuarantineReleaseWorker.perform(%Oban.Job{})

      {:ok, logs} = Audit.list_for_resource("Lead", lead.id)

      release_logs =
        Enum.filter(logs, fn log -> log.action == "lead.quarantine_released" end)

      assert length(release_logs) >= 1

      log = hd(release_logs)
      assert log.resource_type == "Lead"
      assert log.resource_id == lead.id
    end

    test "returns :ok even when no expired quarantines exist" do
      assert :ok = QuarantineReleaseWorker.perform(%Oban.Job{})
    end

    test "releases multiple expired quarantines in one run" do
      lead1 = create_lead!()
      lead2 = create_lead!()

      quarantine_lead_expired!(lead1)
      quarantine_lead_expired!(lead2)

      assert :ok = QuarantineReleaseWorker.perform(%Oban.Job{})

      {:ok, updated1} = Sales.get_lead(lead1.id)
      {:ok, updated2} = Sales.get_lead(lead2.id)

      assert updated1.status == :new
      assert updated2.status == :new
      assert is_nil(updated1.quarantine_until)
      assert is_nil(updated2.quarantine_until)
    end

    test "does not touch leads in other statuses" do
      new_lead = create_lead!()
      customer_lead = create_lead!()
      {:ok, customer_lead} = Sales.update_lead_status(customer_lead, %{status: :customer})

      assert :ok = QuarantineReleaseWorker.perform(%Oban.Job{})

      {:ok, unchanged_new} = Sales.get_lead(new_lead.id)
      {:ok, unchanged_customer} = Sales.get_lead(customer_lead.id)

      assert unchanged_new.status == :new
      assert unchanged_customer.status == :customer
    end

    test "lead re-enters the queue after quarantine is released" do
      lead = create_lead!()
      quarantine_lead_expired!(lead)

      assert :ok = QuarantineReleaseWorker.perform(%Oban.Job{})

      # Verify lead is now :new (eligible for queue)
      {:ok, refreshed} = Sales.get_lead(lead.id)
      assert refreshed.status == :new
    end

    test "clearing quarantine_until sets it to nil in database" do
      lead = create_lead!()
      quarantine_lead_expired!(lead)

      assert :ok = QuarantineReleaseWorker.perform(%Oban.Job{})

      {:ok, refreshed} = Sales.get_lead(lead.id)
      assert is_nil(refreshed.quarantine_until)
    end

    test "expired quarantine lead becomes available in next-lead queue" do
      lead = create_lead!()
      agent = create_user!()

      quarantine_lead_expired!(lead)

      assert :ok = QuarantineReleaseWorker.perform(%Oban.Job{})

      # lead should be :new now, so it's queueable
      {:ok, next} = Sales.get_next_lead(agent)
      assert next != nil
      assert next.id == lead.id
    end

    test "handles leads with nil quarantine_until (status check)" do
      lead = create_lead!()
      # lead is :new with nil quarantine_until — worker should not touch it
      assert :ok = QuarantineReleaseWorker.perform(%Oban.Job{})
      {:ok, refreshed} = Sales.get_lead(lead.id)
      assert refreshed.status == :new
    end
  end

  describe "QuarantineReleaseWorker — status guard (Bug #13)" do
    test "does not overwrite :assigned status when quarantine_until has expired" do
      lead = create_lead!()
      # First quarantine the lead with an expired time
      past = DateTime.add(DateTime.utc_now(), -3600, :second)
      {:ok, quarantined} = Sales.update_lead_status(lead, %{status: :quarantine, quarantine_until: past})

      # Simulate manual reactivation: lead was assigned while still having expired quarantine_until
      {:ok, _assigned} = Sales.update_lead_status(quarantined, %{status: :assigned})

      # Worker should find it via SQL (status was quarantine when quarantine_until was set),
      # but the lead is now :assigned — worker must NOT overwrite it
      assert :ok = QuarantineReleaseWorker.perform(%Oban.Job{})

      {:ok, refreshed} = Sales.get_lead(lead.id)
      assert refreshed.status == :assigned
    end

    test "does not overwrite :new status if lead was already released" do
      lead = create_lead!()
      # Lead is :new with no quarantine — worker should skip gracefully
      assert :ok = QuarantineReleaseWorker.perform(%Oban.Job{})

      {:ok, refreshed} = Sales.get_lead(lead.id)
      assert refreshed.status == :new
    end

    test "releases :quarantine leads with expired quarantine_until (guard allows it)" do
      lead = create_lead!()
      _quarantined = quarantine_lead_expired!(lead)

      assert :ok = QuarantineReleaseWorker.perform(%Oban.Job{})

      {:ok, updated} = Sales.get_lead(lead.id)
      assert updated.status == :new
      assert is_nil(updated.quarantine_until)
    end
  end
end
