defmodule Saleflow.Workers.MeetingReminderWorker do
  @moduledoc """
  Oban worker that sends meeting reminders every 5 minutes.

  Finds meetings where:
  - `status = :scheduled`
  - `meeting_date` is today
  - The combined date+time is between now and now+65 minutes
  - `reminded_at` IS NULL (not yet reminded)

  For each match:
  1. Loads the meeting owner (user)
  2. Sends a meeting_reminder email
  3. Marks the meeting as reminded

  Scheduled via cron: `*/5 * * * *`
  """

  use Oban.Worker, queue: :scheduled

  require Logger

  alias Saleflow.Repo
  alias Saleflow.Sales

  @sixty_five_minutes 65 * 60

  @impl Oban.Worker
  def perform(%Oban.Job{}) do
    now = DateTime.utc_now()
    cutoff = DateTime.add(now, @sixty_five_minutes, :second)

    meeting_ids = fetch_upcoming_meeting_ids(now, cutoff)

    Logger.info("MeetingReminderWorker: found #{length(meeting_ids)} meeting(s) to remind")

    Enum.each(meeting_ids, &send_reminder/1)

    :ok
  end

  # ---------------------------------------------------------------------------
  # Private helpers
  # ---------------------------------------------------------------------------

  @doc false
  def fetch_upcoming_meeting_ids(now, cutoff) do
    # Convert UTC datetimes to naive timestamps for comparison with the
    # naive meeting_date + meeting_time composite.
    now_naive = DateTime.to_naive(now)
    cutoff_naive = DateTime.to_naive(cutoff)

    query = """
    SELECT id FROM meetings
    WHERE status = 'scheduled'
      AND reminded_at IS NULL
      AND (meeting_date + meeting_time)::timestamp > $1
      AND (meeting_date + meeting_time)::timestamp <= $2
    """

    {:ok, %{rows: rows}} = Repo.query(query, [now_naive, cutoff_naive])
    Enum.map(rows, fn [id_binary] -> decode_uuid(id_binary) end)
  end

  defp send_reminder(meeting_id) do
    with {:ok, meeting} when not is_nil(meeting) <- Ash.get(Saleflow.Sales.Meeting, meeting_id),
         {:ok, user} when not is_nil(user) <- Ash.get(Saleflow.Accounts.User, meeting.user_id),
         {:ok, lead} when not is_nil(lead) <- Ash.get(Saleflow.Sales.Lead, meeting.lead_id) do
      date_str = Date.to_string(meeting.meeting_date)
      time_str = Time.to_string(meeting.meeting_time)
      company = lead.företag

      {subject, html} =
        Saleflow.Notifications.Templates.render_meeting_reminder(
          meeting.title,
          date_str,
          time_str,
          company
        )

      Saleflow.Notifications.Mailer.send_email_async(to_string(user.email), subject, html)

      {:ok, _} = Sales.mark_meeting_reminded(meeting)

      Saleflow.Notifications.Notify.send(%{
        user_id: user.id,
        type: "meeting_soon",
        title: "Möte om 15 min",
        body: "#{company} — #{time_str}",
        resource_type: "Meeting",
        resource_id: meeting_id
      })

      Saleflow.Audit.create_log(%{
        action: "meeting.reminder_sent",
        resource_type: "Meeting",
        resource_id: meeting_id,
        changes: %{},
        metadata: %{"worker" => "MeetingReminderWorker", "user_id" => user.id}
      })
    else
      error ->
        Logger.warning(
          "MeetingReminderWorker: failed to send reminder for meeting #{meeting_id}: #{inspect(error)}"
        )

        :ok
    end
  end

  defp decode_uuid(value) when is_binary(value) and byte_size(value) == 16 do
    Ecto.UUID.load!(value)
  end
end
