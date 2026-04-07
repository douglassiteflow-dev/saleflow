defmodule Saleflow.Workers.DemoGeneration.DefaultRunner do
  @moduledoc """
  Default Claude CLI runner that spawns a Port.
  """

  @behaviour Saleflow.Workers.DemoGeneration.ClaudeRunner

  require Logger

  @timeout_ms 15 * 60 * 1_000

  @impl true
  def run(brief_path, id) do
    claude_bin = System.find_executable("claude") || "claude"
    prompt = "Read and follow the brief at #{brief_path}. Execute each step."

    args = [
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
        args: args
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

      Phoenix.PubSub.broadcast(
        Saleflow.PubSub,
        "demo_generation:#{id}",
        {:demo_generation, payload}
      )
    end)
  end
end
