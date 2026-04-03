defmodule Saleflow.Workers.TelavoxPollWorker do
  @moduledoc """
  Polls Telavox GET /extensions/ every 5 seconds using the shared token.
  Broadcasts live call status via PubSub to the calls:live channel.
  """

  use Oban.Worker, queue: :default, max_attempts: 1

  require Logger

  @impl Oban.Worker
  def perform(%Oban.Job{}) do
    token = Application.get_env(:saleflow, :telavox_api_token, "")

    if token != "" do
      try do
        case client().get("/extensions/") do
          {:ok, extensions} when is_list(extensions) ->
            calls = extract_live_calls(extensions)
            broadcast_calls(calls)
            Logger.info("TelavoxPollWorker: #{length(calls)} active call(s)")

          {:error, :unauthorized} ->
            Logger.warning("TelavoxPollWorker: shared token expired (401)")

          {:error, reason} ->
            Logger.warning("TelavoxPollWorker: API error: #{inspect(reason)}")
        end
      rescue
        e ->
          Logger.error("TelavoxPollWorker: crashed: #{inspect(e)}")
      end
    else
      Logger.info("TelavoxPollWorker: no TELAVOX_API_TOKEN configured")
    end

    reschedule()

    :ok
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
        Map.new(rows, fn [id, ext] -> {ext, Saleflow.Sales.decode_uuid(id)} end)

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
    # Skip rescheduling in test mode to avoid infinite recursion with Oban inline testing
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
