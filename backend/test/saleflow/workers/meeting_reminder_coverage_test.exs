defmodule Saleflow.Workers.MeetingReminderCoverageTest do
  @moduledoc """
  Coverage tests for uncovered branches in MeetingReminderWorker:
  - send_reminder error branch when lead is deleted (lines 93-98)
  """

  use Saleflow.DataCase, async: false

  import ExUnit.CaptureLog

  alias Saleflow.Workers.MeetingReminderWorker
  alias Saleflow.Sales

  defp create_user! do
    unique = System.unique_integer([:positive])

    {:ok, user} =
      Saleflow.Accounts.User
      |> Ash.Changeset.for_create(:register_with_password, %{
        email: "mrw#{unique}@test.se",
        name: "MRW Agent #{unique}",
        password: "Password123!",
        password_confirmation: "Password123!"
      })
      |> Ash.create()

    user
  end

  defp create_lead! do
    unique = System.unique_integer([:positive])
    {:ok, lead} = Sales.create_lead(%{företag: "MRCov AB #{unique}", telefon: "+4690#{unique}"})
    lead
  end

  defp create_meeting!(lead, user) do
    {:ok, meeting} =
      Sales.create_meeting(%{
        lead_id: lead.id,
        user_id: user.id,
        title: "Coverage Meeting",
        meeting_date: Date.utc_today(),
        meeting_time: ~T[10:00:00]
      })

    meeting
  end

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
  # send_reminder error branch
  # ---------------------------------------------------------------------------

  describe "perform/1 — send_reminder error branch" do
    test "logs warning when user is deleted before reminder is sent" do
      lead = create_lead!()
      user = create_user!()
      meeting = create_meeting!(lead, user)

      set_meeting_time_offset!(meeting.id, 30)

      # Delete the user so send_reminder's Ash.get(User, meeting.user_id) returns {:ok, nil}
      # which fails the `when not is_nil(user)` guard in the with chain
      Saleflow.Repo.query!(
        "DELETE FROM users WHERE id = $1",
        [Ecto.UUID.dump!(user.id)]
      )

      log =
        capture_log([level: :warning], fn ->
          assert :ok = MeetingReminderWorker.perform(%Oban.Job{})
        end)

      assert log =~ "MeetingReminderWorker"
      assert log =~ "failed to send reminder"
    end
  end
end
