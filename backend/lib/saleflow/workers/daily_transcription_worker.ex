defmodule Saleflow.Workers.DailyTranscriptionWorker do
  @moduledoc """
  Runs daily at 16:00 on weekdays. Finds all calls >20s that have a recording
  but no transcription yet, then enqueues a TranscriptionWorker for each,
  staggered by 3 seconds to avoid hammering the Whisper API.
  """

  use Oban.Worker, queue: :default, max_attempts: 1

  require Logger

  @min_duration 20
  @delay_between_jobs 3

  @impl Oban.Worker
  def perform(%Oban.Job{args: args}) do
    date = Map.get(args, "date", Date.utc_today() |> Date.to_iso8601())

    calls = find_untranscribed_calls(date)

    Logger.info("DailyTranscriptionWorker: found #{length(calls)} untranscribed calls for #{date}")

    calls
    |> Enum.with_index()
    |> Enum.each(fn {{phone_call_id, _user_id}, index} ->
      delay = index * @delay_between_jobs

      %{phone_call_id: phone_call_id}
      |> Saleflow.Workers.TranscriptionWorker.new(schedule_in: delay)
      |> Oban.insert()
    end)

    :ok
  end

  def find_untranscribed_calls(date) do
    date_value =
      case date do
        %Date{} = d -> d
        str when is_binary(str) -> Date.from_iso8601!(str)
      end

    repo = Application.get_env(:saleflow, :repo, Saleflow.Repo)

    case repo.query(
           """
           SELECT id, user_id
           FROM phone_calls
           WHERE received_at::date = $1
             AND duration > $2
             AND transcription IS NULL
             AND recording_key IS NOT NULL
           ORDER BY received_at ASC
           LIMIT 100
           """,
           [date_value, @min_duration]
         ) do
      {:ok, %{rows: rows}} ->
        Enum.map(rows, fn [id, user_id] ->
          {Ecto.UUID.load!(id), Ecto.UUID.load!(user_id)}
        end)

      _ ->
        []
    end
  end
end
