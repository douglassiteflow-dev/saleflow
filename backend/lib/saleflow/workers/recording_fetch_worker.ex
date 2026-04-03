defmodule Saleflow.Workers.RecordingFetchWorker do
  @moduledoc "Fetches call recordings from Telavox and stores them in R2."

  use Oban.Worker, queue: :default, max_attempts: 3

  require Logger

  @impl Oban.Worker
  def perform(%Oban.Job{
        args: %{"phone_call_id" => phone_call_id, "user_id" => user_id},
        attempt: attempt
      }) do
    case Saleflow.Repo.query("SELECT callee, received_at FROM phone_calls WHERE id = $1", [
           Ecto.UUID.dump!(phone_call_id)
         ]) do
      {:ok, %{rows: [[callee, _received_at]]}} ->
        token = get_agent_token(user_id)
        fetch_and_store_recording(phone_call_id, callee, token, attempt)

      _ ->
        Logger.warning("RecordingFetchWorker: phone_call #{phone_call_id} not found")
        :ok
    end
  end

  defp get_agent_token(user_id) when is_binary(user_id) and user_id != "unknown" do
    case Saleflow.Repo.query("SELECT telavox_token FROM users WHERE id = $1", [Ecto.UUID.dump!(user_id)]) do
      {:ok, %{rows: [[token]]}} when is_binary(token) and token != "" -> token
      _ -> Application.get_env(:saleflow, :telavox_api_token, "")
    end
  end

  defp get_agent_token(_), do: Application.get_env(:saleflow, :telavox_api_token, "")

  defp fetch_and_store_recording(phone_call_id, callee, token, attempt) do
    case client().get_as(token, "/calls?withRecordings=true") do
      {:ok, %{"outgoing" => outgoing, "incoming" => incoming}} ->
        all_calls = (outgoing || []) ++ (incoming || [])

        case find_matching_call(all_calls, callee) do
          nil ->
            if attempt < 3 do
              Logger.info(
                "RecordingFetchWorker: no match yet for #{phone_call_id}, will retry"
              )

              {:error, "Call not ready"}
            else
              Logger.info(
                "RecordingFetchWorker: no match for #{phone_call_id} after #{attempt} attempts"
              )

              :ok
            end

          matched_call ->
            # Update duration from Telavox call data
            duration = matched_call["duration"] || 0

            Saleflow.Repo.query(
              "UPDATE phone_calls SET duration = $1 WHERE id = $2 AND duration = 0",
              [duration, Ecto.UUID.dump!(phone_call_id)]
            )

            Logger.info("RecordingFetchWorker: #{phone_call_id} duration=#{duration}s")

            case matched_call["recordingId"] do
              nil -> :ok
              recording_id -> download_and_store(phone_call_id, recording_id)
            end
        end

      {:error, reason} ->
        Logger.warning("RecordingFetchWorker: API error: #{inspect(reason)}")
        {:error, "API error"}
    end
  end

  @doc false
  def find_matching_call(calls, callee) do
    Enum.find(calls, fn call ->
      number = call["number"] || call["numberE164"] || ""
      String.contains?(number, callee) || String.contains?(callee, number)
    end)
  end

  defp download_and_store(phone_call_id, recording_id) do
    case client().get_binary("/recordings/#{recording_id}") do
      {:ok, mp3_data} ->
        now = DateTime.utc_now()

        key =
          "recordings/#{now.year}/#{String.pad_leading("#{now.month}", 2, "0")}/#{phone_call_id}.mp3"

        case Saleflow.Storage.upload(key, mp3_data, "audio/mpeg") do
          {:ok, _} ->
            Saleflow.Repo.query(
              "UPDATE phone_calls SET recording_key = $1, recording_id = $2 WHERE id = $3",
              [key, recording_id, Ecto.UUID.dump!(phone_call_id)]
            )

            Logger.info(
              "RecordingFetchWorker: stored recording #{recording_id} for #{phone_call_id}"
            )

            :ok

          {:error, reason} ->
            Logger.warning("RecordingFetchWorker: R2 upload failed: #{inspect(reason)}")
            {:error, "Upload failed"}
        end

      {:error, reason} ->
        Logger.warning("RecordingFetchWorker: recording download failed: #{inspect(reason)}")
        {:error, "Download failed"}
    end
  end

  defp client do
    Application.get_env(:saleflow, :telavox_client, Saleflow.Telavox.Client)
  end
end
