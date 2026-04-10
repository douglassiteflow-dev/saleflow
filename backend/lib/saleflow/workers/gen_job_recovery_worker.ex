defmodule Saleflow.Workers.GenJobRecoveryWorker do
  @moduledoc """
  Oban cron worker that manages generation job lifecycle.

  Runs every 2 minutes and:
  1. Syncs completed/failed genflow jobs back to their demo_configs
  2. Resets "processing" jobs older than 50 min back to "pending"
  3. Retries "failed" jobs back to "pending" (max 3 retries)
  """

  use Oban.Worker, queue: :default, max_attempts: 1

  require Logger
  require Ash.Query

  alias Saleflow.Generation
  alias Saleflow.Generation.GenerationJob
  alias Saleflow.Sales

  @max_retries 3
  @stuck_threshold_minutes 50

  @impl Oban.Worker
  def perform(_job) do
    sync_completed_jobs()
    sync_failed_jobs()
    reset_stuck_jobs()
    retry_failed_jobs()
    :ok
  end

  # Synka genflow-jobb som blivit klara tillbaka till demo_config
  defp sync_completed_jobs do
    GenerationJob
    |> Ash.Query.filter(status == :completed and not is_nil(demo_config_id))
    |> Ash.read!()
    |> Enum.each(fn job ->
      case Sales.get_demo_config(job.demo_config_id) do
        {:ok, dc} when dc.stage == :generating ->
          friendly_url = "https://demo.siteflow.se/#{job.slug}"

          case Sales.generation_complete(dc, %{
                 website_path: job.result_url,
                 preview_url: friendly_url
               }) do
            {:ok, dc} ->
              Saleflow.Workers.DemoGenerationWorker.maybe_advance_deal(dc)

              Saleflow.Workers.DemoGenerationWorker.broadcast(
                job.demo_config_id,
                %{status: "complete", website_path: job.result_url, preview_url: friendly_url}
              )

              Logger.info("GenJobRecovery: synced completed job #{job.slug} → demo_config #{job.demo_config_id}")

            {:error, reason} ->
              Logger.warning("GenJobRecovery: failed to sync completed job #{job.slug}: #{inspect(reason)}")
          end

        _ ->
          # demo_config redan uppdaterad eller saknas — ignorera
          :ok
      end
    end)
  end

  # Synka genflow-jobb som failat (efter max retries) tillbaka till demo_config
  defp sync_failed_jobs do
    GenerationJob
    |> Ash.Query.filter(
      status == :failed and
        not is_nil(demo_config_id) and
        retry_count >= ^@max_retries
    )
    |> Ash.read!()
    |> Enum.each(fn job ->
      case Sales.get_demo_config(job.demo_config_id) do
        {:ok, dc} when dc.stage == :generating ->
          error_msg = job.error || "Generation failed after #{@max_retries} retries"

          case Sales.generation_failed(dc, %{error: error_msg}) do
            {:ok, _} ->
              Saleflow.Workers.DemoGenerationWorker.broadcast(
                job.demo_config_id,
                %{status: "error", error: error_msg}
              )

              Logger.warning("GenJobRecovery: synced permanently failed job #{job.slug} → demo_config #{job.demo_config_id}")

            {:error, reason} ->
              Logger.warning("GenJobRecovery: failed to sync failed job #{job.slug}: #{inspect(reason)}")
          end

        _ ->
          :ok
      end
    end)
  end

  # Resetta jobb som suttit fast i processing för länge
  defp reset_stuck_jobs do
    cutoff = DateTime.add(DateTime.utc_now(), -@stuck_threshold_minutes, :minute)

    GenerationJob
    |> Ash.Query.filter(status == :processing and picked_up_at < ^cutoff)
    |> Ash.read!()
    |> Enum.each(fn job ->
      if job.retry_count < @max_retries do
        case job |> Ash.Changeset.for_update(:reset, %{}) |> Ash.update() do
          {:ok, _} ->
            Logger.info("GenJobRecovery: reset stuck job #{job.slug} (retry #{job.retry_count + 1}/#{@max_retries})")

          {:error, reason} ->
            Logger.warning("GenJobRecovery: failed to reset stuck job #{job.slug}: #{inspect(reason)}")
        end
      else
        error_msg = "Max retries (#{@max_retries}) reached after being stuck in processing"

        case job |> Ash.Changeset.for_update(:fail, %{error: error_msg}) |> Ash.update() do
          {:ok, _} ->
            Logger.warning("GenJobRecovery: permanently failed stuck job #{job.slug} after #{@max_retries} retries")

          {:error, reason} ->
            Logger.warning("GenJobRecovery: failed to mark job #{job.slug} as failed: #{inspect(reason)}")
        end
      end
    end)
  end

  # Retria failade jobb som har retries kvar
  defp retry_failed_jobs do
    GenerationJob
    |> Ash.Query.filter(status == :failed and retry_count < ^@max_retries)
    |> Ash.read!()
    |> Enum.each(fn job ->
      case job |> Ash.Changeset.for_update(:reset, %{}) |> Ash.update() do
        {:ok, _} ->
          Logger.info("GenJobRecovery: retrying failed job #{job.slug} (retry #{job.retry_count + 1}/#{@max_retries})")

        {:error, reason} ->
          Logger.warning("GenJobRecovery: failed to retry job #{job.slug}: #{inspect(reason)}")
      end
    end)
  end
end
