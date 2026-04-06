defmodule Saleflow.Workers.RecordingFetchWorker do
  @moduledoc "Fetches call recordings from Telavox and enriches phone_call records."

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
    # Fetch the phone_call's received_at + callee to match against Telavox data
    phone_call = get_phone_call(phone_call_id)

    case client().get_as(token, "/calls?withRecordings=true") do
      {:ok, response} when is_map(response) ->
        outgoing = response["outgoing"] || []

        matched = find_matching_call(outgoing, phone_call)

        if matched do
          enrich_from_call(phone_call_id, matched)
        else
          if attempt < 3 do
            Logger.info("RecordingFetchWorker: no matching call for #{phone_call_id}, will retry")
            {:error, "No matching call yet"}
          else
            Logger.info("RecordingFetchWorker: no match for #{phone_call_id} after #{attempt} attempts")
            :ok
          end
        end

      {:error, reason} ->
        Logger.warning("RecordingFetchWorker: API error: #{inspect(reason)}")
        {:error, "API error"}
    end
  end

  defp get_phone_call(phone_call_id) do
    case Saleflow.Repo.query(
           "SELECT received_at, callee FROM phone_calls WHERE id = $1",
           [Ecto.UUID.dump!(phone_call_id)]
         ) do
      {:ok, %{rows: [[received_at, callee]]}} -> %{received_at: received_at, callee: callee}
      _ -> %{received_at: nil, callee: nil}
    end
  end

  # Match by closest timestamp within 2 minutes
  defp find_matching_call(telavox_calls, %{received_at: received_at}) when not is_nil(received_at) do
    telavox_calls
    |> Enum.map(fn call ->
      telavox_time = parse_telavox_datetime(call["dateTimeISO"])
      diff = if telavox_time, do: abs(NaiveDateTime.diff(received_at, telavox_time, :second)), else: 999_999
      {call, diff}
    end)
    |> Enum.filter(fn {_call, diff} -> diff < 120 end)
    |> Enum.min_by(fn {_call, diff} -> diff end, fn -> nil end)
    |> case do
      {call, _diff} -> call
      nil -> nil
    end
  end

  defp find_matching_call(_telavox_calls, _phone_call), do: nil

  defp parse_telavox_datetime(nil), do: nil
  defp parse_telavox_datetime(iso_string) do
    # Telavox returns "2026-04-03T13:41:23.467+0200" — parse and convert to naive UTC
    case DateTime.from_iso8601(iso_string) do
      {:ok, dt, _offset} -> DateTime.to_naive(DateTime.shift_zone!(dt, "Etc/UTC"))
      _ -> nil
    end
  end

  defp enrich_from_call(phone_call_id, call_data) do
    recording_id = call_data["recordingId"]
    telavox_call_id = call_data["callId"]

    Logger.info("RecordingFetchWorker: #{phone_call_id} → callId=#{telavox_call_id || "none"}, recording=#{recording_id || "none"}")

    # Only store telavox_call_id for recording lookup — don't overwrite duration/callee/lead_id (set by our app)
    Saleflow.Repo.query(
      "UPDATE phone_calls SET telavox_call_id = $1 WHERE id = $2 AND telavox_call_id IS NULL",
      [telavox_call_id, Ecto.UUID.dump!(phone_call_id)]
    )

    case recording_id do
      nil -> :ok
      id -> download_and_store(phone_call_id, id)
    end
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
