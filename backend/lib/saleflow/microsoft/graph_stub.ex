defmodule Saleflow.Microsoft.GraphStub do
  @moduledoc """
  Test stub for `Saleflow.Microsoft.Graph`.

  Enable by setting `config :saleflow, :graph_module, Saleflow.Microsoft.GraphStub`
  (typically in test setup). Returns a canned successful response for
  `create_meeting_with_invite/2`.

  To simulate a failure in a specific test, set
  `Application.put_env(:saleflow, :graph_stub_response, {:error, reason})`
  before the code under test runs.
  """

  def create_meeting_with_invite(_access_token, _params) do
    case Application.get_env(:saleflow, :graph_stub_response) do
      nil ->
        {:ok, %{join_url: "https://teams.stub/join", event_id: "stub-event-1"}}

      response ->
        response
    end
  end

  def ensure_fresh_token(conn), do: {:ok, conn}
end
