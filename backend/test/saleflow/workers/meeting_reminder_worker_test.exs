defmodule Saleflow.Workers.MeetingReminderWorkerTest do
  @moduledoc """
  Tests for MeetingReminderWorker.

  Uses async: false because tests manipulate timestamps via raw SQL.
  """

  use Saleflow.DataCase, async: false

  alias Saleflow.Workers.MeetingReminderWorker
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

  defp create_meeting!(lead, user, opts \\ []) do
    date = Keyword.get(opts, :meeting_date, Date.utc_today())
    time = Keyword.get(opts, :meeting_time, ~T[10:00:00])

    {:ok, meeting} =
      Sales.create_meeting(%{
        lead_id: lead.id,
        user_id: user.id,
        title: "Test Meeting",
        meeting_date: date,
        meeting_time: time
      })

    meeting
  end

  # Adjust the meeting_time to be N minutes from now using raw SQL.
  # Uses NOW() AT TIME ZONE 'UTC' so the naive time matches UTC-based window.
  defp set_meeting_time_offset!(meeting_id, offset_minutes) do
    Saleflow.Repo.query!(
      """
      UPDATE meetings
      SET meeting_date = (NOW() AT TIME ZONE 'UTC' + ($1 * INTERVAL '1 minute'))::date,
          meeting_time = (NOW() AT TIME ZONE 'UTC' + ($1 * INTERVAL '1 minute'))::time
      WHERE id = $2
      """,
      [offset_minutes, Ecto.UUID.dump!(meeting_id)]
    )
  end

  # ---------------------------------------------------------------------------
  # Tests for fetch_upcoming_meeting_ids/2
  # ---------------------------------------------------------------------------

  describe "MeetingReminderWorker.fetch_upcoming_meeting_ids/2" do
    test "returns meetings within time window" do
      lead = create_lead!()
      user = create_user!()
      meeting = create_meeting!(lead, user)

      # Set meeting time to 30 minutes from now
      set_meeting_time_offset!(meeting.id, 30)

      now = DateTime.utc_now()
      cutoff = DateTime.add(now, 65 * 60, :second)

      ids = MeetingReminderWorker.fetch_upcoming_meeting_ids(now, cutoff)
      assert meeting.id in ids
    end

    test "does NOT return meetings more than 65 minutes away" do
      lead = create_lead!()
      user = create_user!()
      meeting = create_meeting!(lead, user)

      # Set meeting time to 120 minutes from now
      set_meeting_time_offset!(meeting.id, 120)

      now = DateTime.utc_now()
      cutoff = DateTime.add(now, 65 * 60, :second)

      ids = MeetingReminderWorker.fetch_upcoming_meeting_ids(now, cutoff)
      refute meeting.id in ids
    end

    test "does NOT return already reminded meetings" do
      lead = create_lead!()
      user = create_user!()
      meeting = create_meeting!(lead, user)

      set_meeting_time_offset!(meeting.id, 30)
      {:ok, _} = Sales.mark_meeting_reminded(meeting)

      now = DateTime.utc_now()
      cutoff = DateTime.add(now, 65 * 60, :second)

      ids = MeetingReminderWorker.fetch_upcoming_meeting_ids(now, cutoff)
      refute meeting.id in ids
    end

    test "does NOT return cancelled meetings" do
      lead = create_lead!()
      user = create_user!()
      meeting = create_meeting!(lead, user)

      set_meeting_time_offset!(meeting.id, 30)
      {:ok, _} = Sales.cancel_meeting(meeting)

      now = DateTime.utc_now()
      cutoff = DateTime.add(now, 65 * 60, :second)

      ids = MeetingReminderWorker.fetch_upcoming_meeting_ids(now, cutoff)
      refute meeting.id in ids
    end

    test "does NOT return meetings in the past" do
      lead = create_lead!()
      user = create_user!()
      meeting = create_meeting!(lead, user)

      # Set meeting time to 30 minutes ago
      set_meeting_time_offset!(meeting.id, -30)

      now = DateTime.utc_now()
      cutoff = DateTime.add(now, 65 * 60, :second)

      ids = MeetingReminderWorker.fetch_upcoming_meeting_ids(now, cutoff)
      refute meeting.id in ids
    end
  end

  # ---------------------------------------------------------------------------
  # Tests for perform/1
  # ---------------------------------------------------------------------------

  describe "MeetingReminderWorker.perform/1" do
    test "returns :ok" do
      assert :ok = MeetingReminderWorker.perform(%Oban.Job{})
    end

    test "sends reminder email and marks meeting as reminded" do
      lead = create_lead!()
      user = create_user!()
      meeting = create_meeting!(lead, user)

      set_meeting_time_offset!(meeting.id, 30)

      assert :ok = MeetingReminderWorker.perform(%Oban.Job{})

      # Give async task time to complete
      Process.sleep(50)

      {:ok, updated} = Ash.get(Saleflow.Sales.Meeting, meeting.id)
      refute is_nil(updated.reminded_at)
    end

    test "creates audit log after sending reminder" do
      lead = create_lead!()
      user = create_user!()
      meeting = create_meeting!(lead, user)

      set_meeting_time_offset!(meeting.id, 30)

      assert :ok = MeetingReminderWorker.perform(%Oban.Job{})

      {:ok, logs} = Audit.list_for_resource("Meeting", meeting.id)
      reminder_log = Enum.find(logs, fn l -> l.action == "meeting.reminder_sent" end)
      refute is_nil(reminder_log)
    end

    test "does not re-remind already reminded meeting" do
      lead = create_lead!()
      user = create_user!()
      meeting = create_meeting!(lead, user)

      set_meeting_time_offset!(meeting.id, 30)
      {:ok, _} = Sales.mark_meeting_reminded(meeting)

      assert :ok = MeetingReminderWorker.perform(%Oban.Job{})

      # reminded_at should not be changed again
      {:ok, updated} = Ash.get(Saleflow.Sales.Meeting, meeting.id)
      refute is_nil(updated.reminded_at)
    end

    test "returns :ok when there are no upcoming meetings" do
      assert :ok = MeetingReminderWorker.perform(%Oban.Job{})
    end
  end
end
