defmodule Saleflow.Calls.ActiveCallsTest do
  use ExUnit.Case, async: false

  alias Saleflow.Calls.ActiveCalls

  setup do
    # GenServer is already started by the application
    # Clear any existing calls
    for call <- ActiveCalls.list_calls() do
      ActiveCalls.end_call(call.user_id)
    end
    :ok
  end

  test "start_call adds a call" do
    ActiveCalls.start_call("user1", "Agent", "Company", "0701234567")
    calls = ActiveCalls.list_calls()
    assert length(calls) == 1
    assert hd(calls).agent_name == "Agent"
  end

  test "end_call removes a call" do
    ActiveCalls.start_call("user1", "Agent", "Company", "0701234567")
    ActiveCalls.end_call("user1")
    assert ActiveCalls.list_calls() == []
  end

  test "multiple calls tracked" do
    ActiveCalls.start_call("user1", "Agent1", "Company1", "070")
    ActiveCalls.start_call("user2", "Agent2", "Company2", "071")
    assert length(ActiveCalls.list_calls()) == 2
  end
end
