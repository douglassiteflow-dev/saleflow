defmodule Saleflow.Workers.RecordingSyncWorker do
  @moduledoc """
  Periodically syncs missing recordings from Telavox.

  Runs every 30 minutes via Oban Cron. Finds phone_calls from the last 24 hours
  that have no recording_key, then attempts to match and download recordings
  from the Telavox API.
  """

  use Oban.Worker, queue: :default, max_attempts: 1

  require Logger

  @lookback_hours 24

  @impl Oban.Worker
  def perform(%Oban.Job{}) do
    case find_unmatched_calls() do
      [] ->
        Logger.info("RecordingSyncWorker: no unmatched calls found")
        :ok

      calls ->
        Logger.info("RecordingSyncWorker: found #{length(calls)} unmatched calls, syncing...")
        sync_recordings(calls)
        :ok
    end
  end

  @doc false
  def find_unmatched_calls do
    cutoff = NaiveDateTime.utc_now() |> NaiveDateTime.add(-@lookback_hours * 3600, :second)

    case Saleflow.Repo.query(
           """
           SELECT pc.id, pc.user_id, pc.received_at, pc.callee
           FROM phone_calls pc
           WHERE pc.recording_key IS NULL
             AND pc.received_at >= $1
             AND pc.direction = 'outgoing'
           ORDER BY pc.received_at DESC
           """,
           [cutoff]
         ) do
      {:ok, %{rows: rows}} ->
        Enum.map(rows, fn [id, user_id, received_at, callee] ->
          %{
            id: Ecto.UUID.load!(id),
            user_id: if(user_id, do: Ecto.UUID.load!(user_id), else: nil),
            received_at: received_at,
            callee: callee
          }
        end)

      _ ->
        []
    end
  end

  defp sync_recordings(calls) do
    token = Application.get_env(:saleflow, :telavox_api_token, "")

    case client().get("/calls?withRecordings=true") do
      {:ok, response} when is_map(response) ->
        outgoing = response["outgoing"] || []

        Enum.each(calls, fn call ->
          match_and_enqueue(call, outgoing, token)
        end)

      {:error, reason} ->
        Logger.warning("RecordingSyncWorker: Telavox API error: #{inspect(reason)}")
    end
  end

  defp match_and_enqueue(call, telavox_calls, _token) do
    matched =
      telavox_calls
      |> Enum.map(fn tc ->
        telavox_time = parse_telavox_datetime(tc["dateTimeISO"])

        diff =
          if telavox_time && call.received_at,
            do: abs(NaiveDateTime.diff(call.received_at, telavox_time, :second)),
            else: 999_999

        {tc, diff}
      end)
      |> Enum.filter(fn {_tc, diff} -> diff < 120 end)
      |> Enum.min_by(fn {_tc, diff} -> diff end, fn -> nil end)

    case matched do
      {tc, _diff} ->
        recording_id = tc["recordingId"]

        if recording_id do
          Logger.info(
            "RecordingSyncWorker: matched #{call.id} → recording #{recording_id}, enqueueing fetch"
          )

          Oban.insert(
            Saleflow.Workers.RecordingFetchWorker.new(%{
              phone_call_id: call.id,
              user_id: call.user_id || "unknown"
            })
          )
        end

      nil ->
        :ok
    end
  end

  defp parse_telavox_datetime(nil), do: nil

  defp parse_telavox_datetime(iso_string) do
    case DateTime.from_iso8601(iso_string) do
      {:ok, dt, _offset} -> DateTime.to_naive(DateTime.shift_zone!(dt, "Etc/UTC"))
      _ -> nil
    end
  end

  defp client do
    Application.get_env(:saleflow, :telavox_client, Saleflow.Telavox.Client)
  end
end
