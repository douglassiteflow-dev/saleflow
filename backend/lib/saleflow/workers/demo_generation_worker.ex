defmodule Saleflow.Workers.DemoGenerationWorker do
  @moduledoc """
  Oban worker that spawns the Claude CLI to generate demo websites.

  Flow:
  1. Load DemoConfig with source_url
  2. Build brief.md from template (replace $SOURCE_URL, $OUTPUT_DIR)
  3. Write brief to the output directory
  4. Spawn Claude CLI via Port with --output-format stream-json
  5. Collect output, broadcast progress via PubSub
  6. On success: update stage -> demo_ready, save website_path
  7. On error: update the error field
  """

  use Oban.Worker, queue: :demo_generation, max_attempts: 2

  require Logger

  alias Saleflow.Sales
  alias Saleflow.Generation

  @brief_template_path "priv/demo_generation/brief.md"

  @impl Oban.Worker
  def perform(%Oban.Job{args: %{"demo_config_id" => id}}) do
    with {:ok, demo_config} <- Sales.get_demo_config(id),
         {:ok, demo_config} <- Sales.start_generation(demo_config) do
      if use_genflow_jobs?() do
        run_via_genflow(demo_config, id)
      else
        run_locally(demo_config, id)
      end
    else
      {:error, reason} ->
        Logger.warning("DemoGenerationWorker: failed for #{id}: #{inspect(reason)}")
        {:error, reason}
    end
  end

  # ---------------------------------------------------------------------------
  # GenFlow job queue mode
  # ---------------------------------------------------------------------------

  defp run_via_genflow(demo_config, id) do
    slug = slug_from_url(demo_config.source_url)

    case Generation.create_job(%{
           demo_config_id: id,
           source_url: demo_config.source_url || "",
           slug: slug
         }) do
      {:ok, gen_job} ->
        Logger.info("DemoGenerationWorker: created genflow job #{gen_job.id} for #{id}")
        broadcast(id, %{status: "queued", genflow_job_id: gen_job.id})
        poll_genflow_job(gen_job.id, demo_config, id, 0)

      {:error, reason} ->
        error_msg = "Failed to create genflow job: #{inspect(reason)}"
        {:ok, _} = Sales.generation_failed(demo_config, %{error: error_msg})
        broadcast(id, %{status: "error", error: error_msg})
        Logger.warning("DemoGenerationWorker: #{error_msg}")
        {:error, error_msg}
    end
  end

  defp poll_genflow_job(job_id, demo_config, id, poll_count) do
    max_polls = Application.get_env(:saleflow, :genflow_max_polls, 180)

    if poll_count >= max_polls do
      error_msg = "Genflow job timed out after #{max_polls} polls"
      {:ok, _} = Sales.generation_failed(demo_config, %{error: error_msg})
      broadcast(id, %{status: "error", error: error_msg})
      Logger.warning("DemoGenerationWorker: #{error_msg} for #{id}")
      {:error, error_msg}
    else
      poll_interval = Application.get_env(:saleflow, :genflow_poll_interval_ms, 5_000)
      Process.sleep(poll_interval)

      case Generation.get_job(job_id) do
        {:ok, %{status: :completed, result_url: result_url, slug: slug}} ->
          friendly_url = "https://demo.siteflow.se/#{slug}"

          {:ok, demo_config} =
            Sales.generation_complete(demo_config, %{
              website_path: result_url,
              preview_url: friendly_url
            })

          maybe_advance_deal(demo_config)
          broadcast(id, %{status: "complete", website_path: result_url, preview_url: friendly_url})
          Logger.info("DemoGenerationWorker: genflow job completed for #{id} (preview: #{friendly_url})")
          :ok

        {:ok, %{status: :failed, error: error}} ->
          error_msg = "Genflow job failed: #{error}"
          {:ok, _} = Sales.generation_failed(demo_config, %{error: error_msg})
          broadcast(id, %{status: "error", error: error_msg})
          Logger.warning("DemoGenerationWorker: #{error_msg} for #{id}")
          {:error, error_msg}

        {:ok, _job} ->
          # Still pending or processing — keep polling
          poll_genflow_job(job_id, demo_config, id, poll_count + 1)

        {:error, reason} ->
          error_msg = "Failed to poll genflow job: #{inspect(reason)}"
          {:ok, _} = Sales.generation_failed(demo_config, %{error: error_msg})
          broadcast(id, %{status: "error", error: error_msg})
          Logger.warning("DemoGenerationWorker: #{error_msg} for #{id}")
          {:error, error_msg}
      end
    end
  end

  @doc """
  Generates a slug from a URL by extracting the LAST path segment.

  For Bokadirekt URLs like `https://www.bokadirekt.se/places/sakura-relax-massage-59498`
  this returns `"sakura-relax-massage-59498"`. Falls back to hostname-derived slug
  if there's no path.
  """
  def slug_from_url(nil), do: "unknown"
  def slug_from_url(""), do: "unknown"

  def slug_from_url(url) do
    case URI.parse(url) do
      # Valid URL with scheme + host + path — extract last path segment
      %URI{scheme: scheme, host: host, path: path}
      when is_binary(scheme) and is_binary(host) and is_binary(path) ->
        path
        |> String.trim("/")
        |> String.split("/")
        |> List.last()
        |> case do
          nil -> hostname_slug(url)
          "" -> hostname_slug(url)
          segment -> sanitize_slug(segment)
        end

      # Valid URL with scheme + host but no path — fall back to hostname
      %URI{scheme: scheme, host: host} when is_binary(scheme) and is_binary(host) ->
        hostname_slug(url)

      # No scheme/host → not a URL
      _ ->
        "unknown"
    end
  end

  defp hostname_slug(url) do
    case URI.parse(url) do
      %URI{host: host} when is_binary(host) and host != "" ->
        host
        |> String.replace(~r/^www\./, "")
        |> sanitize_slug()

      _ ->
        "unknown"
    end
  end

  defp sanitize_slug(str) do
    str
    |> String.replace(~r/[^a-zA-Z0-9\-]/, "-")
    |> String.trim("-")
  end

  # ---------------------------------------------------------------------------
  # Local generation mode (existing behaviour)
  # ---------------------------------------------------------------------------

  defp run_locally(demo_config, id) do
    out_dir = output_dir(demo_config)
    File.mkdir_p!(out_dir)

    brief_content = build_brief(demo_config, out_dir)
    brief_path = Path.join(out_dir, "brief.md")
    File.write!(brief_path, brief_content)

    case runner().run(brief_path, id) do
      {:ok, _output} ->
        site_index = Path.join([out_dir, "site", "index.html"])

        if File.exists?(site_index) do
          website_path = Path.join([out_dir, "site"])

          {:ok, demo_config} =
            Sales.generation_complete(demo_config, %{
              website_path: website_path,
              preview_url: "/demos/#{id}/site/index.html"
            })

          maybe_advance_deal(demo_config)
          broadcast(id, %{status: "complete", website_path: website_path})
          Logger.info("DemoGenerationWorker: completed for #{id}")
          :ok
        else
          error_msg = "Generation finished but site/index.html not found"
          {:ok, _} = Sales.generation_failed(demo_config, %{error: error_msg})
          broadcast(id, %{status: "error", error: error_msg})
          Logger.warning("DemoGenerationWorker: #{error_msg} for #{id}")
          {:error, error_msg}
        end

      {:error, reason} ->
        error_msg = "Claude CLI failed: #{reason}"
        {:ok, _} = Sales.generation_failed(demo_config, %{error: error_msg})
        broadcast(id, %{status: "error", error: error_msg})
        Logger.warning("DemoGenerationWorker: #{error_msg} for #{id}")
        {:error, error_msg}
    end
  end

  @doc """
  Builds the brief content by reading the template and replacing placeholders.
  """
  def build_brief(demo_config, output_dir) do
    Application.app_dir(:saleflow, @brief_template_path)
    |> File.read!()
    |> String.replace("$SOURCE_URL", demo_config.source_url || "")
    |> String.replace("$OUTPUT_DIR", output_dir)
  end

  @doc """
  Returns the output directory path for a given demo config.
  """
  def output_dir(demo_config) do
    base = Application.get_env(:saleflow, :demo_generation_dir, "priv/static/demos")
    Path.join(base, demo_config.id)
  end

  @doc """
  Broadcasts a demo generation event via PubSub.
  """
  def broadcast(id, payload) do
    Phoenix.PubSub.broadcast(
      Saleflow.PubSub,
      "demo_generation:#{id}",
      {:demo_generation, payload}
    )
  end

  @doc false
  def maybe_advance_deal(demo_config) do
    with {:ok, meetings} <- Sales.list_meetings_for_demo_config(demo_config.id),
         meeting when not is_nil(meeting) <- Enum.find(meetings, &(&1.deal_id != nil)),
         {:ok, deal} <- Sales.get_deal(meeting.deal_id),
         true <- deal.stage == :booking_wizard,
         {:ok, deal} <- Sales.update_deal(deal, %{website_url: demo_config.preview_url}),
         {:ok, _} <- Sales.advance_deal(deal) do
      Logger.info("DemoGenerationWorker: advanced deal #{deal.id} to demo_scheduled")
      :ok
    else
      nil ->
        Logger.info("DemoGenerationWorker: no meeting with deal_id found, skipping advance")
        :ok

      false ->
        Logger.info("DemoGenerationWorker: deal not at booking_wizard, skipping advance")
        :ok

      {:error, reason} ->
        Logger.warning("DemoGenerationWorker: failed to advance deal: #{inspect(reason)}")
        :ok
    end
  end

  defp runner do
    Application.get_env(
      :saleflow,
      :demo_generation_runner,
      Saleflow.Workers.DemoGeneration.DefaultRunner
    )
  end

  defp use_genflow_jobs? do
    Application.get_env(:saleflow, :use_genflow_jobs, false)
  end
end
