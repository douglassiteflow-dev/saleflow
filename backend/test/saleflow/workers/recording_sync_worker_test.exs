defmodule Saleflow.Workers.RecordingSyncWorkerTest do
  use Saleflow.DataCase, async: false

  import Mox

  alias Saleflow.Workers.RecordingSyncWorker

  setup :verify_on_exit!

  defp create_phone_call!(user, lead, opts \\ []) do
    received_at = Keyword.get(opts, :received_at, DateTime.utc_now())
    naive = DateTime.to_naive(received_at)
    recording_key = Keyword.get(opts, :recording_key, nil)

    {:ok, %{rows: [[id]]}} =
      Saleflow.Repo.query(
        """
        INSERT INTO phone_calls (id, user_id, lead_id, caller, callee, duration, direction, received_at, recording_key, inserted_at)
        VALUES (gen_random_uuid(), $1, $2, '100', '08123456', 60, 'outgoing', $3, $4, NOW())
        RETURNING id
        """,
        [Ecto.UUID.dump!(user.id), Ecto.UUID.dump!(lead.id), naive, recording_key]
      )

    Ecto.UUID.load!(id)
  end

  defp create_lead! do
    unique = System.unique_integer([:positive])
    {:ok, lead} = Saleflow.Sales.create_lead(%{företag: "Test AB #{unique}", telefon: "+4670#{unique}"})
    lead
  end

  defp create_user! do
    unique = System.unique_integer([:positive])

    {:ok, user} =
      Saleflow.Accounts.User
      |> Ash.Changeset.for_create(:register_with_password, %{
        email: "sync#{unique}@test.se",
        name: "Sync Agent #{unique}",
        password: "Password123!",
        password_confirmation: "Password123!"
      })
      |> Ash.create()

    user
  end

  describe "find_unmatched_calls/0" do
    test "finds calls without recording_key from last 24h" do
      user = create_user!()
      lead = create_lead!()
      _id = create_phone_call!(user, lead)

      calls = RecordingSyncWorker.find_unmatched_calls()
      assert length(calls) >= 1
      assert Enum.all?(calls, fn c -> is_binary(c.id) end)
    end

    test "excludes calls that already have recording_key" do
      user = create_user!()
      lead = create_lead!()
      _id = create_phone_call!(user, lead, recording_key: "recordings/2026/04/test.mp3")

      calls = RecordingSyncWorker.find_unmatched_calls()
      ids = Enum.map(calls, & &1.id)
      refute _id in ids
    end

    test "excludes calls older than 24 hours" do
      user = create_user!()
      lead = create_lead!()
      old_time = DateTime.utc_now() |> DateTime.add(-25 * 3600, :second)
      _id = create_phone_call!(user, lead, received_at: old_time)

      calls = RecordingSyncWorker.find_unmatched_calls()
      ids = Enum.map(calls, & &1.id)
      refute _id in ids
    end
  end

  describe "perform/1" do
    test "logs no unmatched calls when none exist" do
      # All calls have recording_key or are old
      assert :ok = RecordingSyncWorker.perform(%Oban.Job{args: %{}})
    end

    test "enqueues RecordingFetchWorker for matched calls" do
      user = create_user!()
      lead = create_lead!()
      now = DateTime.utc_now()
      pc_id = create_phone_call!(user, lead, received_at: now)

      telavox_time = now |> DateTime.to_iso8601()

      # Mock get for sync worker's API call
      Mox.expect(Saleflow.Telavox.MockClient, :get, fn "/calls?withRecordings=true" ->
        {:ok,
         %{
           "outgoing" => [
             %{
               "dateTimeISO" => telavox_time,
               "callId" => "tv-123",
               "recordingId" => "rec-456",
               "callee" => "08123456"
             }
           ]
         }}
      end)

      # Mock get_as for the RecordingFetchWorker that Oban inline-engine will run
      Mox.expect(Saleflow.Telavox.MockClient, :get_as, fn _token, "/calls?withRecordings=true" ->
        {:ok,
         %{
           "outgoing" => [
             %{
               "dateTimeISO" => telavox_time,
               "callId" => "tv-123",
               "recordingId" => "rec-456",
               "callee" => "08123456"
             }
           ]
         }}
      end)

      # Mock get_binary for recording download
      Mox.expect(Saleflow.Telavox.MockClient, :get_binary, fn "/recordings/rec-456" ->
        {:ok, "fake-mp3-data"}
      end)

      Application.put_env(:saleflow, :telavox_client, Saleflow.Telavox.MockClient)

      assert :ok = RecordingSyncWorker.perform(%Oban.Job{args: %{}})

      Application.delete_env(:saleflow, :telavox_client)
    end

    test "handles Telavox API error gracefully" do
      user = create_user!()
      lead = create_lead!()
      _id = create_phone_call!(user, lead)

      Mox.expect(Saleflow.Telavox.MockClient, :get, fn _ ->
        {:error, :timeout}
      end)

      Application.put_env(:saleflow, :telavox_client, Saleflow.Telavox.MockClient)
      assert :ok = RecordingSyncWorker.perform(%Oban.Job{args: %{}})
      Application.delete_env(:saleflow, :telavox_client)
    end

    test "skips calls with no matching telavox record" do
      user = create_user!()
      lead = create_lead!()
      _id = create_phone_call!(user, lead)

      Mox.expect(Saleflow.Telavox.MockClient, :get, fn _ ->
        {:ok, %{"outgoing" => []}}
      end)

      Application.put_env(:saleflow, :telavox_client, Saleflow.Telavox.MockClient)
      assert :ok = RecordingSyncWorker.perform(%Oban.Job{args: %{}})
      Application.delete_env(:saleflow, :telavox_client)
    end
  end
end
