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

  @brief_template_path "priv/demo_generation/brief.md"

  @impl Oban.Worker
  def perform(%Oban.Job{args: %{"demo_config_id" => id}}) do
    with {:ok, demo_config} <- Sales.get_demo_config(id),
         {:ok, demo_config} <- Sales.start_generation(demo_config) do
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

            {:ok, _} =
              Sales.generation_complete(demo_config, %{
                website_path: website_path,
                preview_url: "/demos/#{id}/site/index.html"
              })

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
    else
      {:error, reason} ->
        Logger.warning("DemoGenerationWorker: failed for #{id}: #{inspect(reason)}")
        {:error, reason}
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

  defp runner do
    Application.get_env(
      :saleflow,
      :demo_generation_runner,
      Saleflow.Workers.DemoGeneration.DefaultRunner
    )
  end
end
