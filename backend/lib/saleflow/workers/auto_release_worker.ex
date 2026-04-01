defmodule Saleflow.Workers.AutoReleaseWorker do
  @moduledoc """
  Oban worker that releases stale assignments every 5 minutes.

  An assignment is considered stale when:
  - `released_at` IS NULL (still active), AND
  - `assigned_at` is more than 30 minutes ago

  For each stale assignment:
  1. Releases the assignment with reason `:timeout`
  2. If the lead's status is still `:assigned`, resets it to `:new`
  3. Creates an audit log entry for the auto-release event

  Scheduled via cron: `*/5 * * * *`
  """

  use Oban.Worker, queue: :scheduled

  require Logger

  alias Saleflow.Repo
  alias Saleflow.Sales

  @thirty_minutes_in_seconds 30 * 60

  @impl Oban.Worker
  def perform(%Oban.Job{}) do
    cutoff = DateTime.add(DateTime.utc_now(), -@thirty_minutes_in_seconds, :second)

    stale_assignments = fetch_stale_assignments(cutoff)

    Logger.info("AutoReleaseWorker: found #{length(stale_assignments)} stale assignment(s)")

    Enum.each(stale_assignments, &release_stale_assignment/1)

    :ok
  end

  # ---------------------------------------------------------------------------
  # Private helpers
  # ---------------------------------------------------------------------------

  defp fetch_stale_assignments(cutoff) do
    query = """
    SELECT id FROM assignments
    WHERE released_at IS NULL
      AND assigned_at < $1
    """

    case Repo.query(query, [cutoff]) do
      {:ok, %{rows: rows}} ->
        Enum.map(rows, fn [id_binary] -> decode_uuid(id_binary) end)

      {:error, reason} ->
        Logger.error("AutoReleaseWorker: failed to query stale assignments: #{inspect(reason)}")
        []
    end
  end

  defp release_stale_assignment(assignment_id) do
    case Ash.get(Saleflow.Sales.Assignment, assignment_id) do
      {:ok, assignment} ->
        with {:ok, _released} <- Sales.release_assignment(assignment, :timeout) do
          maybe_reset_lead_status(assignment.lead_id)

          Saleflow.Audit.create_log(%{
            action: "assignment.auto_released",
            resource_type: "Assignment",
            resource_id: assignment_id,
            changes: %{"release_reason" => %{"from" => nil, "to" => "timeout"}},
            metadata: %{"worker" => "AutoReleaseWorker"}
          })
        end

      {:error, reason} ->
        Logger.warning(
          "AutoReleaseWorker: could not load assignment #{assignment_id}: #{inspect(reason)}"
        )
    end
  end

  defp maybe_reset_lead_status(lead_id) do
    case Sales.get_lead(lead_id) do
      {:ok, lead} when lead.status == :assigned ->
        case Sales.update_lead_status(lead, %{status: :new}) do
          {:ok, _updated} ->
            :ok

          {:error, reason} ->
            Logger.warning(
              "AutoReleaseWorker: failed to reset lead #{lead_id} status: #{inspect(reason)}"
            )
        end

      {:ok, _lead} ->
        # Lead already moved to a different status — leave it alone
        :ok

      {:error, reason} ->
        Logger.warning(
          "AutoReleaseWorker: could not load lead #{lead_id}: #{inspect(reason)}"
        )
    end
  end

  defp decode_uuid(value) when is_binary(value) and byte_size(value) == 16 do
    Ecto.UUID.load!(value)
  end

  defp decode_uuid(value) when is_binary(value), do: value
end
