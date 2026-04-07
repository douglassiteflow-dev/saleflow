defmodule Saleflow.Workers.RecordingFetchWorkerTest do
  use Saleflow.DataCase

  import Mox

  alias Saleflow.Workers.RecordingFetchWorker
  alias Saleflow.Telavox.MockClient

  setup :verify_on_exit!

  # ---------------------------------------------------------------------------
  # Helpers
  # ---------------------------------------------------------------------------

  defp create_phone_call(attrs \\ %{}) do
    default = %{caller: "+46701111111", callee: "+46812345678", duration: 0, direction: :outgoing}
    {:ok, phone_call} = Saleflow.Sales.create_phone_call(Map.merge(default, attrs))
    phone_call
  end

  defp build_job(phone_call_id, user_id, attempt \\ 1) do
    %Oban.Job{
      args: %{"phone_call_id" => phone_call_id, "user_id" => user_id},
      attempt: attempt
    }
  end

  # Build a Telavox call entry with dateTimeISO close to phone_call's received_at
  defp telavox_call(phone_call, overrides \\ %{}) do
    # phone_call.received_at is a DateTime — format as ISO 8601 with +0000 offset
    iso = DateTime.to_iso8601(phone_call.received_at)

    Map.merge(
      %{
        "number" => "+46812345678",
        "duration" => 42,
        "dateTimeISO" => iso,
        "callId" => Ecto.UUID.generate()
      },
      overrides
    )
  end

  # ---------------------------------------------------------------------------
  # perform/1 — matching and enrichment
  # ---------------------------------------------------------------------------

  describe "perform/1 with matching call" do
    test "syncs duration from Telavox but preserves callee" do
      phone_call = create_phone_call(%{callee: "+46000000000", duration: 15})
      user_id = Ecto.UUID.generate()

      MockClient
      |> expect(:get_as, fn _token, "/calls?withRecordings=true" ->
        {:ok,
         %{
           "outgoing" => [telavox_call(phone_call, %{"number" => "+46812345678", "duration" => 42})],
           "incoming" => []
         }}
      end)

      job = build_job(phone_call.id, user_id)
      assert :ok = RecordingFetchWorker.perform(job)

      {:ok, %{rows: [[callee, duration]]}} =
        Saleflow.Repo.query(
          "SELECT callee, duration FROM phone_calls WHERE id = $1",
          [Ecto.UUID.dump!(phone_call.id)]
        )

      # Callee preserved (set by our app), duration synced from Telavox
      assert callee == "+46000000000"
      assert duration == 42
    end

    test "sets telavox_call_id on phone_call" do
      phone_call = create_phone_call()
      user_id = Ecto.UUID.generate()
      call_id = Ecto.UUID.generate()

      MockClient
      |> expect(:get_as, fn _token, "/calls?withRecordings=true" ->
        {:ok,
         %{
           "outgoing" => [telavox_call(phone_call, %{"callId" => call_id})],
           "incoming" => []
         }}
      end)

      job = build_job(phone_call.id, user_id)
      assert :ok = RecordingFetchWorker.perform(job)

      {:ok, %{rows: [[saved_call_id]]}} =
        Saleflow.Repo.query(
          "SELECT telavox_call_id FROM phone_calls WHERE id = $1",
          [Ecto.UUID.dump!(phone_call.id)]
        )

      assert saved_call_id == call_id
    end

    test "downloads and stores recording when present" do
      phone_call = create_phone_call()
      user_id = Ecto.UUID.generate()

      MockClient
      |> expect(:get_as, fn _token, "/calls?withRecordings=true" ->
        {:ok,
         %{
           "outgoing" => [telavox_call(phone_call, %{"recordingId" => "rec-123"})],
           "incoming" => []
         }}
      end)

      MockClient
      |> expect(:get_binary, fn "/recordings/rec-123" ->
        {:ok, <<0xFF, 0xFB, 0x90, 0x00>>}
      end)

      job = build_job(phone_call.id, user_id)
      assert :ok = RecordingFetchWorker.perform(job)

      {:ok, %{rows: [[recording_key, recording_id]]}} =
        Saleflow.Repo.query(
          "SELECT recording_key, recording_id FROM phone_calls WHERE id = $1",
          [Ecto.UUID.dump!(phone_call.id)]
        )

      assert recording_key =~ "recordings/"
      assert recording_key =~ "#{phone_call.id}.mp3"
      assert recording_id == "rec-123"
    end
  end

  # ---------------------------------------------------------------------------
  # perform/1 — no matching call
  # ---------------------------------------------------------------------------

  describe "perform/1 with no matching call" do
    test "returns error for retry when attempt < 3" do
      phone_call = create_phone_call()
      user_id = Ecto.UUID.generate()

      MockClient
      |> expect(:get_as, fn _token, "/calls?withRecordings=true" ->
        {:ok, %{"outgoing" => [], "incoming" => []}}
      end)

      job = build_job(phone_call.id, user_id, 1)
      assert {:error, "No matching call yet"} = RecordingFetchWorker.perform(job)
    end

    test "returns :ok on final attempt" do
      phone_call = create_phone_call()
      user_id = Ecto.UUID.generate()

      MockClient
      |> expect(:get_as, fn _token, "/calls?withRecordings=true" ->
        {:ok, %{"outgoing" => [], "incoming" => []}}
      end)

      job = build_job(phone_call.id, user_id, 3)
      assert :ok = RecordingFetchWorker.perform(job)
    end
  end

  # ---------------------------------------------------------------------------
  # perform/1 — API error
  # ---------------------------------------------------------------------------

  describe "perform/1 with API error" do
    test "returns error" do
      phone_call = create_phone_call()
      user_id = Ecto.UUID.generate()

      MockClient
      |> expect(:get_as, fn _token, "/calls?withRecordings=true" ->
        {:error, :unauthorized}
      end)

      job = build_job(phone_call.id, user_id)
      assert {:error, "API error"} = RecordingFetchWorker.perform(job)
    end
  end

  # ---------------------------------------------------------------------------
  # perform/1 — download failure
  # ---------------------------------------------------------------------------

  describe "perform/1 with download failure" do
    test "returns error when recording download fails" do
      phone_call = create_phone_call()
      user_id = Ecto.UUID.generate()

      MockClient
      |> expect(:get_as, fn _token, "/calls?withRecordings=true" ->
        {:ok,
         %{
           "outgoing" => [telavox_call(phone_call, %{"recordingId" => "rec-456"})],
           "incoming" => []
         }}
      end)

      MockClient
      |> expect(:get_binary, fn "/recordings/rec-456" ->
        {:error, {:http, 500}}
      end)

      job = build_job(phone_call.id, user_id)
      assert {:error, "Download failed"} = RecordingFetchWorker.perform(job)
    end
  end
end
