defmodule Saleflow.Sales.MeetingTest do
  use Saleflow.DataCase, async: true

  alias Saleflow.Sales

  # ---------------------------------------------------------------------------
  # Helpers
  # ---------------------------------------------------------------------------

  defp create_lead! do
    unique = System.unique_integer([:positive])
    {:ok, lead} = Sales.create_lead(%{företag: "Test AB #{unique}", telefon: "+46701234567"})
    lead
  end

  defp create_user! do
    unique = System.unique_integer([:positive])

    {:ok, user} =
      Saleflow.Accounts.User
      |> Ash.Changeset.for_create(:register_with_password, %{
        email: "agent#{unique}@test.se",
        name: "Agent #{unique}",
        password: "Password123!",
        password_confirmation: "Password123!"
      })
      |> Ash.create()

    user
  end

  defp create_meeting!(lead, user, opts \\ []) do
    title = Keyword.get(opts, :title, "Sales Demo")
    date = Keyword.get(opts, :meeting_date, Date.utc_today() |> Date.add(7))
    time = Keyword.get(opts, :meeting_time, ~T[10:00:00])

    {:ok, meeting} =
      Sales.create_meeting(%{
        lead_id: lead.id,
        user_id: user.id,
        title: title,
        meeting_date: date,
        meeting_time: time
      })

    meeting
  end

  # ---------------------------------------------------------------------------
  # create_meeting/1
  # ---------------------------------------------------------------------------

  describe "create_meeting/1" do
    test "creates a meeting with valid params" do
      lead = create_lead!()
      user = create_user!()

      assert {:ok, meeting} =
               Sales.create_meeting(%{
                 lead_id: lead.id,
                 user_id: user.id,
                 title: "Sales Demo",
                 meeting_date: ~D[2026-05-01],
                 meeting_time: ~T[10:00:00]
               })

      assert meeting.lead_id == lead.id
      assert meeting.user_id == user.id
      assert meeting.title == "Sales Demo"
      assert meeting.meeting_date == ~D[2026-05-01]
      assert meeting.meeting_time == ~T[10:00:00]
    end

    test "defaults status to :scheduled" do
      lead = create_lead!()
      user = create_user!()

      meeting = create_meeting!(lead, user)
      assert meeting.status == :scheduled
    end

    test "accepts optional notes" do
      lead = create_lead!()
      user = create_user!()

      assert {:ok, meeting} =
               Sales.create_meeting(%{
                 lead_id: lead.id,
                 user_id: user.id,
                 title: "Demo",
                 meeting_date: ~D[2026-06-01],
                 meeting_time: ~T[14:30:00],
                 notes: "Bring product brochure"
               })

      assert meeting.notes == "Bring product brochure"
    end

    test "sets inserted_at timestamp" do
      lead = create_lead!()
      user = create_user!()

      meeting = create_meeting!(lead, user)
      refute is_nil(meeting.inserted_at)
    end

    test "creates an audit log entry on create" do
      lead = create_lead!()
      user = create_user!()

      meeting = create_meeting!(lead, user)

      assert {:ok, logs} = Saleflow.Audit.list_for_resource("Meeting", meeting.id)
      created_log = Enum.find(logs, fn l -> l.action == "meeting.created" end)
      refute is_nil(created_log)
      assert created_log.resource_id == meeting.id
    end
  end

  # ---------------------------------------------------------------------------
  # cancel_meeting/1
  # ---------------------------------------------------------------------------

  describe "cancel_meeting/1" do
    test "changes meeting status to :cancelled" do
      lead = create_lead!()
      user = create_user!()
      meeting = create_meeting!(lead, user)

      assert {:ok, cancelled} = Sales.cancel_meeting(meeting)
      assert cancelled.status == :cancelled
    end

    test "creates an audit log entry on cancel" do
      lead = create_lead!()
      user = create_user!()
      meeting = create_meeting!(lead, user)

      assert {:ok, cancelled} = Sales.cancel_meeting(meeting)

      assert {:ok, logs} = Saleflow.Audit.list_for_resource("Meeting", cancelled.id)
      cancel_log = Enum.find(logs, fn l -> l.action == "meeting.cancelled" end)
      refute is_nil(cancel_log)
    end
  end

  # ---------------------------------------------------------------------------
  # complete_meeting/1
  # ---------------------------------------------------------------------------

  describe "complete_meeting/1" do
    test "changes meeting status to :completed" do
      lead = create_lead!()
      user = create_user!()
      meeting = create_meeting!(lead, user)

      assert {:ok, completed} = Sales.complete_meeting(meeting)
      assert completed.status == :completed
    end

    test "creates an audit log entry on complete" do
      lead = create_lead!()
      user = create_user!()
      meeting = create_meeting!(lead, user)

      assert {:ok, completed} = Sales.complete_meeting(meeting)

      assert {:ok, logs} = Saleflow.Audit.list_for_resource("Meeting", completed.id)
      complete_log = Enum.find(logs, fn l -> l.action == "meeting.completed" end)
      refute is_nil(complete_log)
    end
  end

  # ---------------------------------------------------------------------------
  # list_upcoming_meetings/0
  # ---------------------------------------------------------------------------

  describe "list_upcoming_meetings/0" do
    test "returns scheduled meetings with a future date" do
      lead = create_lead!()
      user = create_user!()
      future_date = Date.utc_today() |> Date.add(7)

      {:ok, meeting} =
        Sales.create_meeting(%{
          lead_id: lead.id,
          user_id: user.id,
          title: "Upcoming",
          meeting_date: future_date,
          meeting_time: ~T[10:00:00]
        })

      assert {:ok, upcoming} = Sales.list_upcoming_meetings()
      ids = Enum.map(upcoming, & &1.id)
      assert meeting.id in ids
    end

    test "does not return cancelled meetings" do
      lead = create_lead!()
      user = create_user!()
      meeting = create_meeting!(lead, user, meeting_date: Date.utc_today() |> Date.add(3))
      {:ok, _cancelled} = Sales.cancel_meeting(meeting)

      assert {:ok, upcoming} = Sales.list_upcoming_meetings()
      ids = Enum.map(upcoming, & &1.id)
      refute meeting.id in ids
    end

    test "does not return completed meetings" do
      lead = create_lead!()
      user = create_user!()
      meeting = create_meeting!(lead, user, meeting_date: Date.utc_today() |> Date.add(3))
      {:ok, _completed} = Sales.complete_meeting(meeting)

      assert {:ok, upcoming} = Sales.list_upcoming_meetings()
      ids = Enum.map(upcoming, & &1.id)
      refute meeting.id in ids
    end

    test "returns empty list when no upcoming meetings" do
      assert {:ok, []} = Sales.list_upcoming_meetings()
    end

    test "includes meetings scheduled for today" do
      lead = create_lead!()
      user = create_user!()
      meeting = create_meeting!(lead, user, meeting_date: Date.utc_today())

      assert {:ok, upcoming} = Sales.list_upcoming_meetings()
      ids = Enum.map(upcoming, & &1.id)
      assert meeting.id in ids
    end
  end

  # ---------------------------------------------------------------------------
  # mark_meeting_reminded/1
  # ---------------------------------------------------------------------------

  describe "mark_meeting_reminded/1" do
    test "reminded_at field is nil by default" do
      lead = create_lead!()
      user = create_user!()
      meeting = create_meeting!(lead, user)

      assert is_nil(meeting.reminded_at)
    end

    test "sets reminded_at to now" do
      lead = create_lead!()
      user = create_user!()
      meeting = create_meeting!(lead, user)

      before = DateTime.utc_now()
      assert {:ok, reminded} = Sales.mark_meeting_reminded(meeting)
      after_time = DateTime.utc_now()

      refute is_nil(reminded.reminded_at)
      assert DateTime.compare(reminded.reminded_at, before) != :lt
      assert DateTime.compare(reminded.reminded_at, after_time) != :gt
    end
  end

  # ---------------------------------------------------------------------------
  # list_meetings_for_lead/1
  # ---------------------------------------------------------------------------

  describe "list_meetings_for_lead/1" do
    test "returns meetings for a given lead" do
      lead = create_lead!()
      user = create_user!()

      create_meeting!(lead, user, title: "First", meeting_date: Date.utc_today() |> Date.add(5))
      create_meeting!(lead, user, title: "Second", meeting_date: Date.utc_today() |> Date.add(10))

      assert {:ok, meetings} = Sales.list_meetings_for_lead(lead.id)
      assert length(meetings) == 2
      assert Enum.all?(meetings, fn m -> m.lead_id == lead.id end)
    end

    test "returns empty list when lead has no meetings" do
      lead = create_lead!()
      assert {:ok, []} = Sales.list_meetings_for_lead(lead.id)
    end

    test "does not return meetings for other leads" do
      lead1 = create_lead!()
      lead2 = create_lead!()
      user = create_user!()

      create_meeting!(lead1, user, title: "For Lead 1")
      create_meeting!(lead2, user, title: "For Lead 2")

      assert {:ok, meetings} = Sales.list_meetings_for_lead(lead1.id)
      assert length(meetings) == 1
      assert hd(meetings).lead_id == lead1.id
    end
  end
end
