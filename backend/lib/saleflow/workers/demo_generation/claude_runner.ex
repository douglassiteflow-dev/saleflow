defmodule Saleflow.Workers.DemoGeneration.ClaudeRunner do
  @moduledoc """
  Behaviour for running the Claude CLI.

  The default implementation spawns a Port; tests can mock this via Mox.
  """

  @callback run(brief_path :: String.t(), demo_config_id :: String.t()) ::
              {:ok, String.t()} | {:error, String.t()}
end
