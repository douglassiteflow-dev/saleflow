defmodule Saleflow.Workers.TelavoxPollWorker do
  @moduledoc """
  GenServer that polls Telavox GET /extensions/ every 5 seconds.

  - Broadcasts live call status via PubSub to the calls:live channel.
  - Detects when calls end → creates PhoneCall record + dashboard update + recording fetch.
  """

  use GenServer

  require Logger

  alias Saleflow.Sales

  @poll_interval 5_000

  # --- Public API ---

  def start_link(_opts) do
    GenServer.start_link(__MODULE__, %{}, name: __MODULE__)
  end

  # --- GenServer callbacks ---

  @impl true
  def init(_state) do
    token = Application.get_env(:saleflow, :telavox_api_token, "")

    if token != "" do
      Logger.info("TelavoxPollWorker: started, polling every #{@poll_interval}ms")
      :timer.send_interval(@poll_interval, :poll)
      {:ok, %{previous_calls: []}}
    else
      Logger.info("TelavoxPollWorker: no TELAVOX_API_TOKEN, not polling")
      {:ok, %{previous_calls: []}}
    end
  end

  @impl true
  def handle_info(:poll, state) do
    new_state =
      try do
        do_poll(state)
      rescue
        e ->
          Logger.error("TelavoxPollWorker: crashed: #{inspect(e)}")
          state
      end

    {:noreply, new_state}
  end

  # --- Poll logic ---

  defp do_poll(state) do
    case client().get("/extensions/") do
      {:ok, extensions} when is_list(extensions) ->
        current_calls = extract_live_calls(extensions)
        previous_calls = state.previous_calls

        # Broadcast live calls to dashboard
        broadcast_calls(current_calls)

        # Detect ended calls
        ended_calls = find_ended_calls(previous_calls, current_calls)

        Enum.each(ended_calls, fn call ->
          handle_call_ended(call)
        end)

        if length(current_calls) > 0 || length(ended_calls) > 0 do
          Logger.info("TelavoxPollWorker: #{length(current_calls)} active, #{length(ended_calls)} ended")
        end

        %{state | previous_calls: current_calls}

      {:error, :unauthorized} ->
        Logger.warning("TelavoxPollWorker: shared token expired (401)")
        state

      {:error, reason} ->
        Logger.warning("TelavoxPollWorker: API error: #{inspect(reason)}")
        state
    end
  end

  defp handle_call_ended(call) do
    Logger.info("TelavoxPollWorker: call ended — #{call.agent_name} (#{call.extension})")

    direction =
      case call.direction do
        "out" -> :outgoing
        "in" -> :incoming
        _ -> :outgoing
      end

    # callerid during ringing may be agent's own number, not the customer's
    # RecordingFetchWorker will enrich with real number + duration from /calls API
    attrs = %{
      caller: call.extension,
      callee: call.callerid,
      duration: 0,
      user_id: call.user_id,
      direction: direction
    }

    case Sales.create_phone_call(attrs) do
      {:ok, phone_call} ->
        Phoenix.PubSub.broadcast(
          Saleflow.PubSub,
          "dashboard:updates",
          {:dashboard_update, %{event: "call_completed", user_id: call.user_id}}
        )

        # Always fetch duration + recording (user_id may be nil if extension not matched)
        %{phone_call_id: phone_call.id, user_id: call.user_id || "unknown"}
        |> Saleflow.Workers.RecordingFetchWorker.new(schedule_in: 30)
        |> Oban.insert()

      {:error, reason} ->
        Logger.warning("TelavoxPollWorker: failed to create phone_call: #{inspect(reason)}")
    end
  end

  # --- Call diffing ---

  @doc false
  def find_ended_calls(previous, current) do
    current_keys = MapSet.new(current, fn c -> {c.extension, c.callerid} end)

    Enum.filter(previous, fn prev ->
      not MapSet.member?(current_keys, {prev.extension, prev.callerid})
    end)
  end

  @doc false
  def extract_live_calls(extensions) do
    user_map = build_user_map()

    extensions
    |> Enum.flat_map(fn ext ->
      extension = ext["extension"] || ""
      mobile = ext["mobile"] || ""
      agent_name = ext["name"] || "Okänd"
      # Match on extension OR mobile number
      user_id = Map.get(user_map, extension) || Map.get(user_map, mobile)

      (ext["calls"] || [])
      |> Enum.map(fn call ->
        %{
          user_id: user_id,
          agent_name: agent_name,
          extension: extension,
          callerid: call["callerid"] || "",
          direction: call["direction"] || "unknown",
          linestatus: call["linestatus"] || "unknown"
        }
      end)
    end)
  end

  @doc false
  def build_user_map, do: Saleflow.Telavox.UserLookup.build_user_map()

  defp broadcast_calls(calls) do
    Phoenix.PubSub.broadcast(
      Saleflow.PubSub,
      "calls:live",
      {:live_calls, calls}
    )
  end

  defp client do
    Application.get_env(:saleflow, :telavox_client, Saleflow.Telavox.Client)
  end
end
