defmodule Saleflow.Workers.DemoGeneration.DefaultRunnerTest do
  use ExUnit.Case, async: false

  alias Saleflow.Workers.DemoGeneration.DefaultRunner

  setup do
    # Create a temporary brief file
    brief_path = Path.join(System.tmp_dir!(), "test_brief_#{:rand.uniform(100_000)}.md")
    File.write!(brief_path, "Test brief content")

    on_exit(fn -> File.rm(brief_path) end)

    # Subscribe to PubSub to verify broadcasts
    Phoenix.PubSub.subscribe(Saleflow.PubSub, "demo_generation:test-id-123")

    {:ok, brief_path: brief_path}
  end

  describe "run/2 with successful script" do
    test "returns {:ok, output} on exit code 0", %{brief_path: brief_path} do
      # Create a fake "claude" script that outputs text and exits 0
      script_path = create_fake_script!("""
      #!/bin/bash
      echo '{"type":"text","text":"Hello"}'
      exit 0
      """)

      # Temporarily override PATH so our script is found as "claude"
      result =
        with_fake_claude(script_path, fn ->
          DefaultRunner.run(brief_path, "test-id-123")
        end)

      assert {:ok, output} = result
      assert output =~ "Hello"
    end

    test "broadcasts stream data via PubSub", %{brief_path: brief_path} do
      script_path = create_fake_script!("""
      #!/bin/bash
      echo '{"type":"text","text":"streaming data"}'
      exit 0
      """)

      with_fake_claude(script_path, fn ->
        DefaultRunner.run(brief_path, "test-id-123")
      end)

      assert_receive {:demo_generation, %{status: "streaming"}}, 5_000
    end
  end

  describe "run/2 with failing script" do
    test "returns {:error, ...} on non-zero exit code", %{brief_path: brief_path} do
      script_path = create_fake_script!("""
      #!/bin/bash
      echo "error output"
      exit 1
      """)

      result =
        with_fake_claude(script_path, fn ->
          DefaultRunner.run(brief_path, "test-id-123")
        end)

      assert {:error, msg} = result
      assert msg =~ "exit code 1"
    end
  end

  describe "run/2 broadcasts JSON and raw lines" do
    test "parses valid JSON lines", %{brief_path: brief_path} do
      script_path = create_fake_script!("""
      #!/bin/bash
      echo '{"result":"ok"}'
      exit 0
      """)

      with_fake_claude(script_path, fn ->
        DefaultRunner.run(brief_path, "test-id-123")
      end)

      assert_receive {:demo_generation, %{status: "streaming", data: %{"result" => "ok"}}}, 5_000
    end

    test "wraps non-JSON lines in raw field", %{brief_path: brief_path} do
      script_path = create_fake_script!("""
      #!/bin/bash
      echo "plain text output"
      exit 0
      """)

      with_fake_claude(script_path, fn ->
        DefaultRunner.run(brief_path, "test-id-123")
      end)

      assert_receive {:demo_generation, %{status: "streaming", data: %{"raw" => "plain text output"}}},
                     5_000
    end
  end

  describe "run/2 with timeout" do
    test "returns timeout error when script exceeds elapsed time", %{brief_path: brief_path} do
      # Set 0ms timeout so elapsed check immediately triggers on re-entry
      Application.put_env(:saleflow, :demo_generation_timeout_ms, 0)

      # Script outputs multiple lines — the recursive call to collect_output
      # will find elapsed > 1ms and hit the early-return path
      script_path = create_fake_script!("""
      #!/bin/bash
      for i in $(seq 1 20); do echo "line$i"; done
      sleep 5
      """)

      result =
        with_fake_claude(script_path, fn ->
          DefaultRunner.run(brief_path, "test-id-123")
        end)

      assert {:error, msg} = result
      assert msg =~ "Timeout"

      # Reset
      Application.delete_env(:saleflow, :demo_generation_timeout_ms)
    end

    test "returns timeout error when script hangs in receive", %{brief_path: brief_path} do
      Application.put_env(:saleflow, :demo_generation_timeout_ms, 100)

      script_path = create_fake_script!("""
      #!/bin/bash
      sleep 30
      """)

      result =
        with_fake_claude(script_path, fn ->
          DefaultRunner.run(brief_path, "test-id-123")
        end)

      assert {:error, msg} = result
      assert msg =~ "Timeout"

      # Reset
      Application.delete_env(:saleflow, :demo_generation_timeout_ms)
    end
  end

  # -- Helpers --

  defp create_fake_script!(content) do
    dir = Path.join(System.tmp_dir!(), "fake_claude_#{:rand.uniform(100_000)}")
    File.mkdir_p!(dir)
    script_path = Path.join(dir, "claude")
    File.write!(script_path, content)
    File.chmod!(script_path, 0o755)
    script_path
  end

  defp with_fake_claude(script_path, fun) do
    dir = Path.dirname(script_path)
    original_path = System.get_env("PATH")
    System.put_env("PATH", "#{dir}:#{original_path}")

    try do
      fun.()
    after
      System.put_env("PATH", original_path)
      File.rm_rf!(dir)
    end
  end
end
