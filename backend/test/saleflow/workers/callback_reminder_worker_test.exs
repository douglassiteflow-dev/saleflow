defmodule Saleflow.Workers.CallbackReminderWorkerTest do
  @moduledoc """
  Tests for CallbackReminderWorker.

  Uses async: false because tests manipulate timestamps via raw SQL.
  """

  use Saleflow.DataCase, async: false

  alias Saleflow.Workers.CallbackReminderWorker
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

  defp set_lead_callback!(lead_id, offset_minutes) do
    # callback_at is stored as timestamp without time zone; use naive datetime
    callback_at =
      DateTime.utc_now()
      |> DateTime.add(offset_minutes * 60, :second)
      |> DateTime.to_naive()

    Saleflow.Repo.query!(
      "UPDATE leads SET status = 'callback', callback_at = $1 WHERE id = $2",
      [callback_at, Ecto.UUID.dump!(lead_id)]
    )
  end

  defp assign_lead_to_user!(lead, user) do
    {:ok, assignment} = Sales.assign_lead(lead, user)
    assignment
  end

  # ---------------------------------------------------------------------------
  # Tests for fetch_callback_lead_ids/2
  # ---------------------------------------------------------------------------

  describe "CallbackReminderWorker.fetch_callback_lead_ids/2" do
    test "returns leads with callback within the time window" do
      lead = create_lead!()
      user = create_user!()
      assign_lead_to_user!(lead, user)

      # Set callback 10 minutes from now
      set_lead_callback!(lead.id, 10)

      now = DateTime.utc_now()
      cutoff = DateTime.add(now, 20 * 60, :second)

      ids = CallbackReminderWorker.fetch_callback_lead_ids(now, cutoff)
      assert lead.id in ids
    end

    test "does NOT return leads whose callback is more than 20 minutes away" do
      lead = create_lead!()
      user = create_user!()
      assign_lead_to_user!(lead, user)

      # 30 minutes away — outside the 20-minute window
      set_lead_callback!(lead.id, 30)

      now = DateTime.utc_now()
      cutoff = DateTime.add(now, 20 * 60, :second)

      ids = CallbackReminderWorker.fetch_callback_lead_ids(now, cutoff)
      refute lead.id in ids
    end

    test "does NOT return leads with callback in the past" do
      lead = create_lead!()
      user = create_user!()
      assign_lead_to_user!(lead, user)

      # -5 minutes (past)
      set_lead_callback!(lead.id, -5)

      now = DateTime.utc_now()
      cutoff = DateTime.add(now, 20 * 60, :second)

      ids = CallbackReminderWorker.fetch_callback_lead_ids(now, cutoff)
      refute lead.id in ids
    end

    test "does NOT return already reminded leads" do
      lead = create_lead!()
      user = create_user!()
      assign_lead_to_user!(lead, user)

      set_lead_callback!(lead.id, 10)

      # Mark as reminded via raw SQL since lead needs to be :callback status
      Saleflow.Repo.query!(
        "UPDATE leads SET callback_reminded_at = NOW() AT TIME ZONE 'UTC' WHERE id = $1",
        [Ecto.UUID.dump!(lead.id)]
      )

      now = DateTime.utc_now()
      cutoff = DateTime.add(now, 20 * 60, :second)

      ids = CallbackReminderWorker.fetch_callback_lead_ids(now, cutoff)
      refute lead.id in ids
    end
  end

  # ---------------------------------------------------------------------------
  # Tests for perform/1
  # ---------------------------------------------------------------------------

  describe "CallbackReminderWorker.perform/1" do
    test "returns :ok" do
      assert :ok = CallbackReminderWorker.perform(%Oban.Job{})
    end

    test "sends reminder and marks lead as callback_reminded" do
      lead = create_lead!()
      user = create_user!()
      assign_lead_to_user!(lead, user)

      set_lead_callback!(lead.id, 10)

      assert :ok = CallbackReminderWorker.perform(%Oban.Job{})

      # Give async task time to complete
      Process.sleep(50)

      {:ok, updated} = Ash.get(Saleflow.Sales.Lead, lead.id)
      refute is_nil(updated.callback_reminded_at)
    end

    test "creates audit log for callback reminder" do
      lead = create_lead!()
      user = create_user!()
      assign_lead_to_user!(lead, user)

      set_lead_callback!(lead.id, 10)

      assert :ok = CallbackReminderWorker.perform(%Oban.Job{})

      {:ok, logs} = Audit.list_for_resource("Lead", lead.id)
      reminder_log = Enum.find(logs, fn l -> l.action == "lead.callback_reminder_sent" end)
      refute is_nil(reminder_log)
    end

    test "does not remind if no active assignment exists" do
      lead = create_lead!()

      set_lead_callback!(lead.id, 10)

      # No assignment — the worker should skip gracefully
      assert :ok = CallbackReminderWorker.perform(%Oban.Job{})

      {:ok, updated} = Ash.get(Saleflow.Sales.Lead, lead.id)
      # callback_reminded_at should remain nil since no agent to notify
      assert is_nil(updated.callback_reminded_at)
    end

    test "does not re-remind already reminded lead" do
      lead = create_lead!()
      user = create_user!()
      assign_lead_to_user!(lead, user)

      set_lead_callback!(lead.id, 10)

      # Mark already reminded
      Saleflow.Repo.query!(
        "UPDATE leads SET callback_reminded_at = NOW() AT TIME ZONE 'UTC' WHERE id = $1",
        [Ecto.UUID.dump!(lead.id)]
      )

      assert :ok = CallbackReminderWorker.perform(%Oban.Job{})
    end

    test "returns :ok when there are no callback leads" do
      assert :ok = CallbackReminderWorker.perform(%Oban.Job{})
    end
  end
end
