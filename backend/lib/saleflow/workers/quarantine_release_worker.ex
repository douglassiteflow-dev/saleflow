defmodule Saleflow.Workers.QuarantineReleaseWorker do
  @moduledoc """
  Oban worker that releases expired quarantines every hour.

  A quarantine is considered expired when:
  - `status = :quarantine`, AND
  - `quarantine_until < NOW()`

  For each expired lead:
  1. Sets `status` back to `:new`
  2. Clears `quarantine_until` (sets to nil)
  3. Creates an audit log entry for the release event

  Scheduled via cron: `0 * * * *`
  """

  use Oban.Worker, queue: :scheduled

  require Logger

  alias Saleflow.Repo
  alias Saleflow.Sales

  @impl Oban.Worker
  def perform(%Oban.Job{}) do
    now = DateTime.utc_now()

    expired_lead_ids = fetch_expired_quarantine_ids(now)

    Logger.info(
      "QuarantineReleaseWorker: found #{length(expired_lead_ids)} expired quarantine(s)"
    )

    Enum.each(expired_lead_ids, &release_quarantine/1)

    :ok
  end

  # ---------------------------------------------------------------------------
  # Private helpers
  # ---------------------------------------------------------------------------

  defp fetch_expired_quarantine_ids(now) do
    query = """
    SELECT id FROM leads
    WHERE status = 'quarantine'
      AND quarantine_until < $1
    """

    case Repo.query(query, [now]) do
      {:ok, %{rows: rows}} ->
        Enum.map(rows, fn [id_binary] -> decode_uuid(id_binary) end)

      # coveralls-ignore-start
      {:error, reason} ->
        Logger.error(
          "QuarantineReleaseWorker: failed to query expired quarantines: #{inspect(reason)}"
        )

        []
      # coveralls-ignore-stop
    end
  end

  defp release_quarantine(lead_id) do
    case Sales.get_lead(lead_id) do
      {:ok, lead} ->
        case Sales.update_lead_status(lead, %{status: :new, quarantine_until: nil}) do
          {:ok, _updated} ->
            Saleflow.Audit.create_log(%{
              action: "lead.quarantine_released",
              resource_type: "Lead",
              resource_id: lead_id,
              changes: %{
                "status" => %{"from" => "quarantine", "to" => "new"},
                "quarantine_until" => %{"from" => to_string(lead.quarantine_until), "to" => nil}
              },
              metadata: %{"worker" => "QuarantineReleaseWorker"}
            })

          # coveralls-ignore-start
          {:error, reason} ->
            Logger.warning(
              "QuarantineReleaseWorker: failed to release lead #{lead_id}: #{inspect(reason)}"
            )
          # coveralls-ignore-stop
        end

      # coveralls-ignore-start
      {:error, reason} ->
        Logger.warning(
          "QuarantineReleaseWorker: could not load lead #{lead_id}: #{inspect(reason)}"
        )
      # coveralls-ignore-stop
    end
  end

  defp decode_uuid(value) when is_binary(value) and byte_size(value) == 16 do
    Ecto.UUID.load!(value)
  end

  # coveralls-ignore-start
  defp decode_uuid(value) when is_binary(value), do: value
  # coveralls-ignore-stop
end
