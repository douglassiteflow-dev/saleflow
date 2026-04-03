defmodule Saleflow.Workers.TelavoxPollWorker do
  @moduledoc """
  Polls Telavox GET /extensions/ every 5 seconds using the shared token.

  - Broadcasts live call status via PubSub to the calls:live channel.
  - Detects when calls end (disappear from poll) → creates PhoneCall record
    + broadcasts dashboard update + enqueues recording fetch.
  - Replaces the need for Telavox webhooks entirely.
  """

  use Oban.Worker, queue: :default, max_attempts: 1, unique: [period: 4, states: [:available, :scheduled, :executing]]

  require Logger

  alias Saleflow.Sales

  # ETS table to track previous poll state
  @state_table :telavox_poll_state

  @impl Oban.Worker
  def perform(%Oban.Job{}) do
    token = Application.get_env(:saleflow, :telavox_api_token, "")

    if token != "" do
      try do
        case client().get("/extensions/") do
          {:ok, extensions} when is_list(extensions) ->
            current_calls = extract_live_calls(extensions)
            previous_calls = get_previous_calls()

            # Broadcast live calls
            broadcast_calls(current_calls)

            # Detect ended calls (were in previous, not in current)
            ended_calls = find_ended_calls(previous_calls, current_calls)

            Enum.each(ended_calls, fn call ->
              handle_call_ended(call)
            end)

            # Store current state for next poll
            store_calls(current_calls)

            if length(current_calls) > 0 || length(ended_calls) > 0 do
              Logger.info("TelavoxPollWorker: #{length(current_calls)} active, #{length(ended_calls)} ended")
            end

          {:error, :unauthorized} ->
            Logger.warning("TelavoxPollWorker: shared token expired (401)")

          {:error, reason} ->
            Logger.warning("TelavoxPollWorker: API error: #{inspect(reason)}")
        end
      rescue
        e ->
          Logger.error("TelavoxPollWorker: crashed: #{inspect(e)}")
      end
    end

    reschedule()
    :ok
  end

  defp handle_call_ended(call) do
    Logger.info("TelavoxPollWorker: call ended — #{call.agent_name} → #{call.callerid}")

    # Find lead by callee number
    lead_id = find_lead_id(call.callerid)

    # Map direction
    direction =
      case call.direction do
        "out" -> :outgoing
        "in" -> :incoming
        _ -> :outgoing
      end

    # Create PhoneCall record
    attrs = %{
      caller: call.extension,
      callee: call.callerid,
      duration: 0,
      lead_id: lead_id,
      user_id: call.user_id,
      direction: direction
    }

    case Sales.create_phone_call(attrs) do
      {:ok, phone_call} ->
        # Broadcast dashboard update
        Phoenix.PubSub.broadcast(
          Saleflow.PubSub,
          "dashboard:updates",
          {:dashboard_update, %{event: "call_completed", user_id: call.user_id}}
        )

        # Enqueue recording fetch
        if call.user_id do
          %{phone_call_id: phone_call.id, user_id: call.user_id}
          |> Saleflow.Workers.RecordingFetchWorker.new(schedule_in: 30)
          |> Oban.insert()
        end

      {:error, reason} ->
        Logger.warning("TelavoxPollWorker: failed to create phone_call: #{inspect(reason)}")
    end
  end

  defp find_lead_id(callee) when is_binary(callee) and callee != "" do
    query = "SELECT id FROM leads WHERE telefon = $1 LIMIT 1"

    case Saleflow.Repo.query(query, [callee]) do
      {:ok, %{rows: [[id]]}} -> Sales.decode_uuid(id)
      _ -> nil
    end
  end

  defp find_lead_id(_), do: nil

  # --- State management via ETS ---

  defp ensure_table do
    case :ets.whereis(@state_table) do
      :undefined -> :ets.new(@state_table, [:named_table, :public, :set])
      _ -> @state_table
    end
  end

  defp get_previous_calls do
    ensure_table()

    case :ets.lookup(@state_table, :calls) do
      [{:calls, calls}] -> calls
      [] -> []
    end
  end

  defp store_calls(calls) do
    ensure_table()
    :ets.insert(@state_table, {:calls, calls})
  end

  # --- Call diffing ---

  @doc false
  def find_ended_calls(previous, current) do
    current_keys = MapSet.new(current, fn c -> {c.extension, c.callerid} end)

    Enum.filter(previous, fn prev ->
      prev.linestatus == "up" &&
        not MapSet.member?(current_keys, {prev.extension, prev.callerid})
    end)
  end

  @doc false
  def extract_live_calls(extensions) do
    user_map = build_user_map()

    extensions
    |> Enum.flat_map(fn ext ->
      extension = ext["extension"] || ""
      agent_name = ext["name"] || "Okänd"
      user_id = Map.get(user_map, extension)

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
  def build_user_map do
    case Saleflow.Repo.query(
           "SELECT id, extension_number FROM users WHERE extension_number IS NOT NULL"
         ) do
      {:ok, %{rows: rows}} ->
        Map.new(rows, fn [id, ext] -> {ext, Sales.decode_uuid(id)} end)

      _ ->
        %{}
    end
  end

  defp broadcast_calls(calls) do
    Phoenix.PubSub.broadcast(
      Saleflow.PubSub,
      "calls:live",
      {:live_calls, calls}
    )
  end

  @doc false
  def reschedule do
    oban_conf = Application.get_env(:saleflow, Oban, [])

    unless oban_conf[:testing] == :inline do
      %{}
      |> __MODULE__.new(schedule_in: 5)
      |> Oban.insert()
    end

    :ok
  end

  defp client do
    Application.get_env(:saleflow, :telavox_client, Saleflow.Telavox.Client)
  end
end
