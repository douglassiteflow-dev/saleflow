defmodule Saleflow.Workers.CallbackReminderWorker do
  @moduledoc """
  Oban worker that sends callback reminders every 5 minutes.

  Finds leads where:
  - `status = :callback`
  - `callback_at` is between now and now+20 minutes
  - `callback_reminded_at` IS NULL (not yet reminded)

  For each match:
  1. Finds the assigned agent via the active assignment
  2. Sends a callback_reminder email
  3. Marks the lead as reminded

  Scheduled via cron: `*/5 * * * *`
  """

  use Oban.Worker, queue: :scheduled

  require Logger

  alias Saleflow.Repo
  alias Saleflow.Sales

  @twenty_minutes 20 * 60

  @impl Oban.Worker
  def perform(%Oban.Job{}) do
    now = DateTime.utc_now()
    cutoff = DateTime.add(now, @twenty_minutes, :second)

    lead_ids = fetch_callback_lead_ids(now, cutoff)

    Logger.info("CallbackReminderWorker: found #{length(lead_ids)} callback(s) to remind")

    Enum.each(lead_ids, &send_reminder/1)

    :ok
  end

  # ---------------------------------------------------------------------------
  # Private helpers
  # ---------------------------------------------------------------------------

  @doc false
  def fetch_callback_lead_ids(now, cutoff) do
    # callback_at is stored as timestamp without time zone; compare with naive datetimes
    now_naive = DateTime.to_naive(now)
    cutoff_naive = DateTime.to_naive(cutoff)

    query = """
    SELECT id FROM leads
    WHERE status = 'callback'
      AND callback_at > $1
      AND callback_at <= $2
      AND callback_reminded_at IS NULL
    """

    {:ok, %{rows: rows}} = Repo.query(query, [now_naive, cutoff_naive])
    Enum.map(rows, fn [id_binary] -> decode_uuid(id_binary) end)
  end

  defp send_reminder(lead_id) do
    with {:ok, lead} when not is_nil(lead) <- Ash.get(Saleflow.Sales.Lead, lead_id),
         {:ok, assignment} when not is_nil(assignment) <- get_active_assignment(lead_id),
         {:ok, user} when not is_nil(user) <- Ash.get(Saleflow.Accounts.User, assignment.user_id) do
      callback_time = format_datetime(lead.callback_at)

      {subject, html} =
        Saleflow.Notifications.Templates.render_callback_reminder(
          lead.företag,
          lead.telefon,
          callback_time
        )

      Saleflow.Notifications.Mailer.send_email_async(to_string(user.email), subject, html)

      {:ok, _} = Sales.mark_lead_callback_reminded(lead)

      Saleflow.Audit.create_log(%{
        action: "lead.callback_reminder_sent",
        resource_type: "Lead",
        resource_id: lead_id,
        changes: %{},
        metadata: %{"worker" => "CallbackReminderWorker", "user_id" => user.id}
      })
    else
      error ->
        Logger.warning(
          "CallbackReminderWorker: failed to send reminder for lead #{lead_id}: #{inspect(error)}"
        )

        :ok
    end
  end

  defp get_active_assignment(lead_id) do
    query = """
    SELECT id, user_id FROM assignments
    WHERE lead_id = $1
      AND released_at IS NULL
    LIMIT 1
    """

    case Repo.query(query, [Ecto.UUID.dump!(lead_id)]) do
      {:ok, %{rows: [[id_binary, user_id_binary]]}} ->
        assignment = %{
          id: decode_uuid(id_binary),
          user_id: decode_uuid(user_id_binary)
        }

        {:ok, assignment}

      {:ok, %{rows: []}} ->
        {:ok, nil}
    end
  end

  defp format_datetime(%DateTime{} = dt) do
    Calendar.strftime(dt, "%Y-%m-%d %H:%M")
  end

  defp decode_uuid(value) when is_binary(value) and byte_size(value) == 16 do
    Ecto.UUID.load!(value)
  end
end
