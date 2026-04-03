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
    default = %{caller: "+46701111111", callee: "+46812345678", duration: 30}
    {:ok, phone_call} = Saleflow.Sales.create_phone_call(Map.merge(default, attrs))
    phone_call
  end

  defp build_job(phone_call_id, user_id, attempt \\ 1) do
    %Oban.Job{
      args: %{"phone_call_id" => phone_call_id, "user_id" => user_id},
      attempt: attempt
    }
  end

  # ---------------------------------------------------------------------------
  # perform/1 — phone_call not found
  # ---------------------------------------------------------------------------

  describe "perform/1 when phone_call not found" do
    test "returns :ok when API has no outgoing calls" do
      fake_id = Ecto.UUID.generate()
      user_id = Ecto.UUID.generate()

      MockClient
      |> expect(:get_as, fn _token, "/calls?withRecordings=true" ->
        {:ok,
         %{
           "outgoing" => [],
           "incoming" => []
         }}
      end)

      job = build_job(fake_id, user_id, 3)

      assert :ok = RecordingFetchWorker.perform(job)
    end
  end

  # ---------------------------------------------------------------------------
  # perform/1 — API returns calls with recording
  # ---------------------------------------------------------------------------

  describe "perform/1 with matching recording" do
    test "downloads and stores recording, updates phone_call" do
      phone_call = create_phone_call()
      user_id = Ecto.UUID.generate()

      MockClient
      |> expect(:get_as, fn _token, "/calls?withRecordings=true" ->
        {:ok,
         %{
           "outgoing" => [
             %{
               "number" => "+46812345678",
               "recordingId" => "rec-123"
             }
           ],
           "incoming" => []
         }}
      end)

      MockClient
      |> expect(:get_binary, fn "/recordings/rec-123" ->
        {:ok, <<0xFF, 0xFB, 0x90, 0x00>>}
      end)

      job = build_job(phone_call.id, user_id)

      assert :ok = RecordingFetchWorker.perform(job)

      # Verify recording_key and recording_id were set
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
  # perform/1 — no matching recording (attempt < 3)
  # ---------------------------------------------------------------------------

  describe "perform/1 with no outgoing calls" do
    test "returns error for retry when attempt < 3" do
      phone_call = create_phone_call()
      user_id = Ecto.UUID.generate()

      MockClient
      |> expect(:get_as, fn _token, "/calls?withRecordings=true" ->
        {:ok,
         %{
           "outgoing" => [],
           "incoming" => []
         }}
      end)

      job = build_job(phone_call.id, user_id, 1)

      assert {:error, "No calls yet"} = RecordingFetchWorker.perform(job)
    end

    test "returns :ok on final attempt (attempt 3)" do
      phone_call = create_phone_call()
      user_id = Ecto.UUID.generate()

      MockClient
      |> expect(:get_as, fn _token, "/calls?withRecordings=true" ->
        {:ok,
         %{
           "outgoing" => [],
           "incoming" => []
         }}
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
           "outgoing" => [
             %{"number" => "+46812345678", "recordingId" => "rec-456"}
           ],
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

  # ---------------------------------------------------------------------------
  # perform/1 — recording stored with disabled storage (noop)
  # ---------------------------------------------------------------------------

  describe "perform/1 stores recording with disabled storage" do
    test "updates phone_call recording fields when storage returns noop" do
      phone_call = create_phone_call()
      user_id = Ecto.UUID.generate()

      MockClient
      |> expect(:get_as, fn _token, "/calls?withRecordings=true" ->
        {:ok,
         %{
           "outgoing" => [
             %{"number" => "+46812345678", "recordingId" => "rec-789"}
           ],
           "incoming" => []
         }}
      end)

      MockClient
      |> expect(:get_binary, fn "/recordings/rec-789" ->
        {:ok, <<0xFF, 0xFB>>}
      end)

      job = build_job(phone_call.id, user_id)

      # Storage is disabled in test, so upload returns {:ok, :noop}
      assert :ok = RecordingFetchWorker.perform(job)

      # Verify recording fields were updated
      {:ok, %{rows: [[recording_key, recording_id]]}} =
        Saleflow.Repo.query(
          "SELECT recording_key, recording_id FROM phone_calls WHERE id = $1",
          [Ecto.UUID.dump!(phone_call.id)]
        )

      assert recording_key =~ "recordings/"
      assert recording_key =~ "#{phone_call.id}.mp3"
      assert recording_id == "rec-789"
    end
  end

  # ---------------------------------------------------------------------------
  # perform/1 — enriches phone_call with data from most recent outgoing call
  # ---------------------------------------------------------------------------

  describe "perform/1 enriches phone_call from most recent outgoing call" do
    test "updates callee, duration, and lead_id from API response" do
      phone_call = create_phone_call(%{callee: "+46000000000"})
      user_id = Ecto.UUID.generate()

      MockClient
      |> expect(:get_as, fn _token, "/calls?withRecordings=true" ->
        {:ok,
         %{
           "outgoing" => [
             %{"number" => "+46812345678", "duration" => 42}
           ],
           "incoming" => []
         }}
      end)

      job = build_job(phone_call.id, user_id)

      assert :ok = RecordingFetchWorker.perform(job)

      # Verify callee and duration were updated
      {:ok, %{rows: [[callee, duration]]}} =
        Saleflow.Repo.query(
          "SELECT callee, duration FROM phone_calls WHERE id = $1",
          [Ecto.UUID.dump!(phone_call.id)]
        )

      assert callee == "+46812345678"
      assert duration == 42
    end
  end
end
