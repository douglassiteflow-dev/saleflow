defmodule Saleflow.Calls.ActiveCalls do
  @moduledoc """
  In-memory store for active calls. Replaces Telavox polling for live call tracking.
  Frontend sends call_started/call_ended events, this GenServer tracks them
  and broadcasts to the calls:live PubSub topic.
  """

  use GenServer

  def start_link(_opts) do
    GenServer.start_link(__MODULE__, %{}, name: __MODULE__)
  end

  def start_call(user_id, agent_name, lead_name, phone) do
    GenServer.cast(__MODULE__, {:start_call, user_id, agent_name, lead_name, phone})
  end

  def end_call(user_id) do
    GenServer.cast(__MODULE__, {:end_call, user_id})
  end

  def list_calls do
    GenServer.call(__MODULE__, :list_calls)
  end

  # --- GenServer ---

  @impl true
  def init(_state) do
    {:ok, %{calls: %{}}}
  end

  @impl true
  def handle_cast({:start_call, user_id, agent_name, lead_name, phone}, state) do
    call = %{
      user_id: user_id,
      agent_name: agent_name,
      lead_name: lead_name,
      phone: phone,
      started_at: System.system_time(:second)
    }

    new_calls = Map.put(state.calls, user_id, call)
    broadcast(new_calls)
    {:noreply, %{state | calls: new_calls}}
  end

  @impl true
  def handle_cast({:end_call, user_id}, state) do
    new_calls = Map.delete(state.calls, user_id)
    broadcast(new_calls)
    {:noreply, %{state | calls: new_calls}}
  end

  @impl true
  def handle_call(:list_calls, _from, state) do
    {:reply, Map.values(state.calls), state}
  end

  defp broadcast(calls_map) do
    calls_list = Map.values(calls_map)

    Phoenix.PubSub.broadcast(
      Saleflow.PubSub,
      "calls:live",
      {:live_calls, calls_list}
    )
  end
end
