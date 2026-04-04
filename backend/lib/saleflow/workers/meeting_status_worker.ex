defmodule Saleflow.Workers.MeetingStatusWorker do
  @moduledoc """
  Oban worker that creates notifications for overdue meetings.

  Runs every 15 minutes. Finds meetings where:
  - status = scheduled
  - meeting_date + meeting_time + 1 hour < now
  - No existing notification with type="meeting_update" for this meeting

  Also checks daily: meetings where meeting_date < today and status still scheduled.
  """

  use Oban.Worker, queue: :scheduled

  require Logger

  alias Saleflow.Repo

  @impl Oban.Worker
  def perform(%Oban.Job{}) do
    now = DateTime.utc_now()
    now_naive = DateTime.to_naive(now)

    # Find meetings where time has passed by 1+ hour and no notification exists
    query = """
    SELECT m.id, m.user_id, m.title, l.företag
    FROM meetings m
    LEFT JOIN leads l ON l.id = m.lead_id
    WHERE m.status = 'scheduled'
      AND (m.meeting_date + m.meeting_time + interval '1 hour')::timestamp < $1
      AND NOT EXISTS (
        SELECT 1 FROM notifications n
        WHERE n.resource_id = m.id
          AND n.type = 'meeting_update'
          AND n.user_id = m.user_id
      )
    """

    {:ok, %{rows: rows}} = Repo.query(query, [now_naive])

    Logger.info("MeetingStatusWorker: found #{length(rows)} overdue meeting(s)")

    Enum.each(rows, fn [id, user_id, title, company] ->
      uid = Saleflow.Sales.decode_uuid(user_id)
      mid = Saleflow.Sales.decode_uuid(id)

      Saleflow.Notifications.Notify.send(%{
        user_id: uid,
        type: "meeting_update",
        title: "Uppdatera mötesstatus",
        body: company || title,
        resource_type: "Meeting",
        resource_id: mid
      })
    end)

    :ok
  end
end
