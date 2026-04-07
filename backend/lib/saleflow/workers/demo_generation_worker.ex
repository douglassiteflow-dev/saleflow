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
  @timeout_ms 15 * 60 * 1_000

  @impl Oban.Worker
  def perform(%Oban.Job{args: %{"demo_config_id" => id}}) do
    with {:ok, demo_config} when not is_nil(demo_config) <- Sales.get_demo_config(id),
         {:ok, demo_config} <- Sales.start_generation(demo_config) do
      out_dir = output_dir(demo_config)
      File.mkdir_p!(out_dir)

      brief_content = build_brief(demo_config, out_dir)
      brief_path = Path.join(out_dir, "brief.md")
      File.write!(brief_path, brief_content)

      case run_claude_cli(brief_path, id) do
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
      {:ok, nil} ->
        Logger.warning("DemoGenerationWorker: DemoConfig #{id} not found")
        {:error, "DemoConfig not found"}

      {:error, reason} ->
        Logger.warning("DemoGenerationWorker: failed to start generation for #{id}: #{inspect(reason)}")
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

  # ---------------------------------------------------------------------------
  # Private helpers
  # ---------------------------------------------------------------------------

  defp run_claude_cli(brief_path, id) do
    claude_bin = System.find_executable("claude") || "claude"
    prompt = "Read and follow the brief at #{brief_path}. Execute each step."

    args = [
      claude_bin,
      "--dangerously-skip-permissions",
      "-p",
      prompt,
      "--output-format",
      "stream-json"
    ]

    port =
      Port.open({:spawn_executable, claude_bin}, [
        :binary,
        :exit_status,
        :stderr_to_stdout,
        args: tl(args)
      ])

    collect_output(port, id, "", System.monotonic_time(:millisecond))
  end

  defp collect_output(port, id, acc, start_time) do
    elapsed = System.monotonic_time(:millisecond) - start_time

    if elapsed > @timeout_ms do
      Port.close(port)
      {:error, "Timeout after 15 minutes"}
    else
      remaining = @timeout_ms - elapsed

      receive do
        {^port, {:data, data}} ->
          broadcast_stream(id, data)
          collect_output(port, id, acc <> data, start_time)

        {^port, {:exit_status, 0}} ->
          {:ok, acc}

        {^port, {:exit_status, code}} ->
          {:error, "exit code #{code}"}
      after
        remaining ->
          Port.close(port)
          {:error, "Timeout after 15 minutes"}
      end
    end
  end

  defp broadcast_stream(id, data) do
    data
    |> String.split("\n", trim: true)
    |> Enum.each(fn line ->
      payload =
        case Jason.decode(line) do
          {:ok, parsed} -> %{status: "streaming", data: parsed}
          {:error, _} -> %{status: "streaming", data: %{"raw" => line}}
        end

      broadcast(id, payload)
    end)
  end

  defp broadcast(id, payload) do
    Phoenix.PubSub.broadcast(
      Saleflow.PubSub,
      "demo_generation:#{id}",
      {:demo_generation, payload}
    )
  end
end
