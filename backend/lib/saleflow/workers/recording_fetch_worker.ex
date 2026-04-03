defmodule Saleflow.Workers.RecordingFetchWorker do
  @moduledoc "Fetches call recordings from Telavox and stores them in R2."

  use Oban.Worker, queue: :default, max_attempts: 3

  require Logger

  @impl Oban.Worker
  def perform(%Oban.Job{
        args: %{"phone_call_id" => phone_call_id, "user_id" => user_id},
        attempt: attempt
      }) do
    token = get_agent_token(user_id)
    enrich_phone_call(phone_call_id, token, attempt)
  end

  defp get_agent_token(user_id) when is_binary(user_id) and user_id != "unknown" do
    case Saleflow.Repo.query("SELECT telavox_token FROM users WHERE id = $1", [Ecto.UUID.dump!(user_id)]) do
      {:ok, %{rows: [[token]]}} when is_binary(token) and token != "" -> token
      _ -> Application.get_env(:saleflow, :telavox_api_token, "")
    end
  end

  defp get_agent_token(_), do: Application.get_env(:saleflow, :telavox_api_token, "")

  defp enrich_phone_call(phone_call_id, token, attempt) do
    case client().get_as(token, "/calls?withRecordings=true") do
      {:ok, response} when is_map(response) ->
        outgoing = response["outgoing"] || []
        most_recent = List.first(outgoing)

        if most_recent do
          enrich_from_call(phone_call_id, most_recent)
        else
          if attempt < 3 do
            Logger.info("RecordingFetchWorker: no calls yet for #{phone_call_id}, will retry")
            {:error, "No calls yet"}
          else
            Logger.info("RecordingFetchWorker: no calls for #{phone_call_id} after #{attempt} attempts")
            :ok
          end
        end

      {:error, reason} ->
        Logger.warning("RecordingFetchWorker: API error: #{inspect(reason)}")
        {:error, "API error"}
    end
  end

  defp enrich_from_call(phone_call_id, call_data) do
    number = call_data["number"] || ""
    duration = call_data["duration"] || 0
    recording_id = call_data["recordingId"]

    Logger.info("RecordingFetchWorker: #{phone_call_id} → number=#{number}, duration=#{duration}s, recording=#{recording_id || "none"}")

    lead_id = find_lead_id(number)

    Saleflow.Repo.query(
      "UPDATE phone_calls SET callee = $1, duration = $2, lead_id = $3 WHERE id = $4",
      [number, duration, lead_id && Ecto.UUID.dump!(lead_id), Ecto.UUID.dump!(phone_call_id)]
    )

    Phoenix.PubSub.broadcast(
      Saleflow.PubSub,
      "dashboard:updates",
      {:dashboard_update, %{event: "call_enriched", phone_call_id: phone_call_id}}
    )

    case recording_id do
      nil -> :ok
      id -> download_and_store(phone_call_id, id)
    end
  end

  defp find_lead_id(number), do: Saleflow.Telavox.UserLookup.find_lead_id(number)

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
