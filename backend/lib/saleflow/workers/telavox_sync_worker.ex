defmodule Saleflow.Workers.TelavoxSyncWorker do
  @moduledoc """
  Periodically syncs calls from the Telavox /calls API to catch any
  calls missed by the real-time poll worker (e.g. very short calls,
  unanswered calls that ended between poll intervals).

  Runs every 2 minutes. Checks each connected agent's /calls endpoint
  and creates PhoneCall records for any calls not already in our database.
  """

  use Oban.Worker, queue: :default, max_attempts: 1

  require Logger

  alias Saleflow.{Repo, Sales}

  @impl Oban.Worker
  def perform(_job) do
    agents = get_connected_agents()

    Enum.each(agents, fn {user_id, token} ->
      sync_calls_for_agent(user_id, token)
    end)

    :ok
  end

  defp get_connected_agents do
    {:ok, %{rows: rows}} =
      Repo.query("SELECT id, telavox_token FROM users WHERE telavox_token IS NOT NULL AND telavox_token != ''")

    Enum.map(rows, fn [id, token] -> {Ecto.UUID.load!(id), token} end)
  end

  defp sync_calls_for_agent(user_id, token) do
    case client().get_as(token, "/calls?withRecordings=true") do
      {:ok, response} when is_map(response) ->
        outgoing = response["outgoing"] || []
        incoming = response["incoming"] || []
        all_calls = outgoing ++ incoming

        today = Date.utc_today()

        today_calls =
          all_calls
          |> Enum.filter(fn call ->
            case parse_date(call["dateTimeISO"]) do
              {:ok, date} -> date == today
              _ -> false
            end
          end)

        # Get existing telavox_call_ids for this user today
        uid = Ecto.UUID.dump!(user_id)

        {:ok, %{rows: existing_rows}} =
          Repo.query(
            "SELECT telavox_call_id FROM phone_calls WHERE user_id = $1 AND received_at::date = $2 AND telavox_call_id IS NOT NULL",
            [uid, today]
          )

        existing_ids = MapSet.new(existing_rows, fn [id] -> id end)

        # Create records for missing calls
        missing =
          today_calls
          |> Enum.filter(fn call ->
            call_id = call["callId"]
            call_id && not MapSet.member?(existing_ids, call_id)
          end)

        if length(missing) > 0 do
          Logger.info("TelavoxSyncWorker: found #{length(missing)} missed calls for user #{user_id}")
        end

        Enum.each(missing, fn call ->
          create_from_telavox_call(user_id, call)
        end)

      {:error, reason} ->
        Logger.warning("TelavoxSyncWorker: API error for user #{user_id}: #{inspect(reason)}")
    end
  end

  defp create_from_telavox_call(user_id, call) do
    number = call["number"] || ""
    duration = call["duration"] || 0
    direction = if call["direction"] == "in" || (call["type"] && String.contains?(call["type"], "incoming")), do: :incoming, else: :outgoing
    telavox_call_id = call["callId"]
    received_at = parse_datetime(call["dateTimeISO"])
    lead_id = Saleflow.Telavox.UserLookup.find_lead_id(number)

    attrs = %{
      caller: "",
      callee: number,
      duration: duration,
      user_id: user_id,
      direction: direction,
      lead_id: lead_id
    }

    case Sales.create_phone_call(attrs) do
      {:ok, phone_call} ->
        # Update with telavox_call_id and received_at
        uid = Ecto.UUID.dump!(phone_call.id)

        Repo.query(
          "UPDATE phone_calls SET telavox_call_id = $1, received_at = COALESCE($2, received_at) WHERE id = $3",
          [telavox_call_id, received_at, uid]
        )

        Logger.info("TelavoxSyncWorker: created phone_call #{phone_call.id} for #{number} (#{direction}, #{duration}s)")

        # Check for recording
        recording_id = call["recordingId"]

        if recording_id do
          %{phone_call_id: phone_call.id, user_id: user_id}
          |> Saleflow.Workers.RecordingFetchWorker.new()
          |> Oban.insert()
        end

        Phoenix.PubSub.broadcast(
          Saleflow.PubSub,
          "dashboard:updates",
          {:dashboard_update, %{event: "call_synced", user_id: user_id}}
        )

      {:error, reason} ->
        Logger.warning("TelavoxSyncWorker: failed to create call: #{inspect(reason)}")
    end
  end

  defp parse_date(nil), do: {:error, :nil}

  defp parse_date(iso_string) do
    case DateTime.from_iso8601(iso_string) do
      {:ok, dt, _offset} -> {:ok, DateTime.to_date(DateTime.shift_zone!(dt, "Etc/UTC"))}
      _ -> {:error, :parse}
    end
  end

  defp parse_datetime(nil), do: nil

  defp parse_datetime(iso_string) do
    case DateTime.from_iso8601(iso_string) do
      {:ok, dt, _offset} -> DateTime.to_naive(DateTime.shift_zone!(dt, "Etc/UTC"))
      _ -> nil
    end
  end

  defp client do
    Application.get_env(:saleflow, :telavox_client, Saleflow.Telavox.Client)
  end
end
