defmodule Saleflow.Workers.MeetingStatusWorkerTest do
  @moduledoc """
  Tests for MeetingStatusWorker.

  Uses async: false because tests rely on time-based SQL queries.
  """

  use Saleflow.DataCase, async: false

  alias Saleflow.Workers.MeetingStatusWorker
  alias Saleflow.Sales

  # ---------------------------------------------------------------------------
  # Helpers
  # ---------------------------------------------------------------------------

  defp create_user! do
    unique = System.unique_integer([:positive])

    {:ok, user} =
      Saleflow.Accounts.User
      |> Ash.Changeset.for_create(:register_with_password, %{
        email: "meetstatus#{unique}@test.se",
        name: "Meet Status Agent #{unique}",
        password: "Password123!",
        password_confirmation: "Password123!"
      })
      |> Ash.create()

    user
  end

  defp create_lead! do
    unique = System.unique_integer([:positive])
    {:ok, lead} = Sales.create_lead(%{företag: "MeetStatus AB #{unique}", telefon: "+4670#{unique}"})
    lead
  end

  defp create_meeting!(lead, user) do
    {:ok, meeting} =
      Sales.create_meeting(%{
        lead_id: lead.id,
        user_id: user.id,
        title: "Status Test Meeting",
        meeting_date: Date.utc_today(),
        meeting_time: ~T[09:00:00]
      })

    meeting
  end

  # Set a meeting's date/time to be N hours in the past, so the worker picks it up.
  defp set_meeting_overdue!(meeting_id, hours_ago) do
    Saleflow.Repo.query!(
      """
      UPDATE meetings
      SET meeting_date = (NOW() AT TIME ZONE 'UTC' - ($1 * INTERVAL '1 hour'))::date,
          meeting_time = (NOW() AT TIME ZONE 'UTC' - ($1 * INTERVAL '1 hour'))::time
      WHERE id = $2
      """,
      [hours_ago, Ecto.UUID.dump!(meeting_id)]
    )
  end

  # ---------------------------------------------------------------------------
  # perform/1
  # ---------------------------------------------------------------------------

  describe "perform/1" do
    test "returns :ok when no overdue meetings exist" do
      assert :ok = MeetingStatusWorker.perform(%Oban.Job{})
    end

    test "returns :ok with overdue meetings and sends notification" do
      lead = create_lead!()
      user = create_user!()
      meeting = create_meeting!(lead, user)

      # Move the meeting to 2 hours in the past so it qualifies
      set_meeting_overdue!(meeting.id, 2)

      assert :ok = MeetingStatusWorker.perform(%Oban.Job{})
    end

    test "does not send duplicate notification for the same meeting" do
      lead = create_lead!()
      user = create_user!()
      meeting = create_meeting!(lead, user)
      set_meeting_overdue!(meeting.id, 2)

      # First run: sends notification
      assert :ok = MeetingStatusWorker.perform(%Oban.Job{})

      # Second run: notification exists, should not send again
      assert :ok = MeetingStatusWorker.perform(%Oban.Job{})
    end

    test "does not flag cancelled meetings" do
      lead = create_lead!()
      user = create_user!()
      meeting = create_meeting!(lead, user)

      set_meeting_overdue!(meeting.id, 2)
      {:ok, _} = Sales.cancel_meeting(meeting)

      # Should still return :ok and not error
      assert :ok = MeetingStatusWorker.perform(%Oban.Job{})
    end

    test "does not flag meetings that are only 30 minutes old (< 1 hour threshold)" do
      lead = create_lead!()
      user = create_user!()
      meeting = create_meeting!(lead, user)

      # Only 30 minutes old — below the 1-hour threshold
      Saleflow.Repo.query!(
        """
        UPDATE meetings
        SET meeting_date = (NOW() AT TIME ZONE 'UTC' - INTERVAL '30 minutes')::date,
            meeting_time = (NOW() AT TIME ZONE 'UTC' - INTERVAL '30 minutes')::time
        WHERE id = $1
        """,
        [Ecto.UUID.dump!(meeting.id)]
      )

      assert :ok = MeetingStatusWorker.perform(%Oban.Job{})
    end

    test "returns :ok for completed meetings (not scheduled)" do
      lead = create_lead!()
      user = create_user!()
      meeting = create_meeting!(lead, user)

      set_meeting_overdue!(meeting.id, 2)

      # Mark completed first
      {:ok, _} = Sales.update_meeting(meeting, %{status: :completed})

      assert :ok = MeetingStatusWorker.perform(%Oban.Job{})
    end
  end
end
