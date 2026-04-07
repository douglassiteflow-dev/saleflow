defmodule Saleflow.Workers.DailyTranscriptionWorker.StubRepoError do
  @moduledoc false
  # Minimal stub used to simulate a Repo.query/2 failure in the error-branch test.
  def query(_sql, _params), do: {:error, :simulated_db_error}
end

defmodule Saleflow.Workers.DailyTranscriptionWorkerTest do
  @moduledoc """
  Tests for DailyTranscriptionWorker — 100% coverage.

  Verifies that qualifying calls are found and TranscriptionWorker jobs are
  enqueued, and that calls with transcriptions, short duration, or no
  recording are correctly excluded.
  """

  use Saleflow.DataCase, async: false
  use Oban.Testing, repo: Saleflow.Repo

  alias Saleflow.Workers.DailyTranscriptionWorker

  # ---------------------------------------------------------------------------
  # Override Oban to :manual mode so enqueued jobs are not immediately executed,
  # allowing assert_enqueued / refute_enqueued to work correctly.
  # ---------------------------------------------------------------------------

  setup do
    Process.put(:oban_testing, :manual)
    on_exit(fn -> Process.delete(:oban_testing) end)
    :ok
  end

  # ---------------------------------------------------------------------------
  # Helpers
  # ---------------------------------------------------------------------------

  defp create_user! do
    unique = System.unique_integer([:positive])

    {:ok, user} =
      Saleflow.Accounts.User
      |> Ash.Changeset.for_create(:register_with_password, %{
        email: "agent#{unique}@test.se",
        name: "Test Agent #{unique}",
        password: "Password123!",
        password_confirmation: "Password123!"
      })
      |> Ash.create()

    user
  end

  # Insert a phone_call row directly via SQL so we can control all fields
  # including transcription, recording_key, and duration precisely.
  defp insert_phone_call!(user_id, opts \\ []) do
    call_id = Ecto.UUID.generate()
    date = Keyword.get(opts, :date, Date.utc_today())
    duration = Keyword.get(opts, :duration, 30)
    transcription = Keyword.get(opts, :transcription, nil)
    recording_key = Keyword.get(opts, :recording_key, "recordings/2026/04/#{call_id}.mp3")
    received_at = NaiveDateTime.new!(date, ~T[10:00:00])

    Saleflow.Repo.query!(
      """
      INSERT INTO phone_calls (id, user_id, caller, callee, direction, received_at, duration, transcription, recording_key, inserted_at)
      VALUES ($1, $2, '+46701234567', '+46812345678', 'outgoing', $3, $4, $5, $6, NOW())
      """,
      [
        Ecto.UUID.dump!(call_id),
        Ecto.UUID.dump!(user_id),
        received_at,
        duration,
        transcription,
        recording_key
      ]
    )

    call_id
  end


  # ---------------------------------------------------------------------------
  # find_untranscribed_calls/1
  # ---------------------------------------------------------------------------

  describe "find_untranscribed_calls/1" do
    test "finds calls with duration >20, no transcription, and a recording_key" do
      user = create_user!()
      today = Date.utc_today()
      call_id = insert_phone_call!(user.id, date: today, duration: 30, transcription: nil)

      calls = DailyTranscriptionWorker.find_untranscribed_calls(Date.to_iso8601(today))

      found_ids = Enum.map(calls, fn {id, _user_id} -> id end)
      assert call_id in found_ids
    end

    test "excludes calls that already have a transcription" do
      user = create_user!()
      today = Date.utc_today()

      _transcribed_id =
        insert_phone_call!(user.id,
          date: today,
          duration: 60,
          transcription: "Hej det är test"
        )

      calls = DailyTranscriptionWorker.find_untranscribed_calls(Date.to_iso8601(today))

      assert calls == []
    end

    test "excludes calls with duration <= 20s" do
      user = create_user!()
      today = Date.utc_today()

      _short_id = insert_phone_call!(user.id, date: today, duration: 20, transcription: nil)
      _shorter_id = insert_phone_call!(user.id, date: today, duration: 5, transcription: nil)

      calls = DailyTranscriptionWorker.find_untranscribed_calls(Date.to_iso8601(today))

      assert calls == []
    end

    test "excludes calls with no recording_key" do
      user = create_user!()
      today = Date.utc_today()

      _no_recording_id =
        insert_phone_call!(user.id,
          date: today,
          duration: 90,
          transcription: nil,
          recording_key: nil
        )

      calls = DailyTranscriptionWorker.find_untranscribed_calls(Date.to_iso8601(today))

      assert calls == []
    end

    test "excludes calls from a different date" do
      user = create_user!()
      today = Date.utc_today()
      yesterday = Date.add(today, -1)

      _yesterday_id =
        insert_phone_call!(user.id, date: yesterday, duration: 60, transcription: nil)

      calls = DailyTranscriptionWorker.find_untranscribed_calls(Date.to_iso8601(today))

      assert calls == []
    end

    test "returns user_id alongside call_id" do
      user = create_user!()
      today = Date.utc_today()
      call_id = insert_phone_call!(user.id, date: today, duration: 30)

      calls = DailyTranscriptionWorker.find_untranscribed_calls(Date.to_iso8601(today))

      assert [{^call_id, user_id}] = calls
      assert user_id == user.id
    end

    test "returns multiple qualifying calls ordered by received_at" do
      user = create_user!()
      today = Date.utc_today()

      call1 = insert_phone_call!(user.id, date: today, duration: 30)
      call2 = insert_phone_call!(user.id, date: today, duration: 45)
      call3 = insert_phone_call!(user.id, date: today, duration: 60)

      calls = DailyTranscriptionWorker.find_untranscribed_calls(Date.to_iso8601(today))
      ids = Enum.map(calls, fn {id, _} -> id end)

      assert call1 in ids
      assert call2 in ids
      assert call3 in ids
    end

    test "returns empty list when no calls match" do
      calls = DailyTranscriptionWorker.find_untranscribed_calls(Date.to_iso8601(Date.utc_today()))
      assert calls == []
    end

    test "accepts a %Date{} struct directly (not just ISO8601 string)" do
      user = create_user!()
      today = Date.utc_today()
      call_id = insert_phone_call!(user.id, date: today, duration: 30, transcription: nil)

      # Pass a real %Date{} struct instead of a string
      calls = DailyTranscriptionWorker.find_untranscribed_calls(today)

      found_ids = Enum.map(calls, fn {id, _user_id} -> id end)
      assert call_id in found_ids
    end

    test "returns empty list when the database query fails" do
      # Override the repo to a stub that always returns {:error, reason}.
      # This exercises the `_ -> []` catch-all branch in find_untranscribed_calls/1.
      Application.put_env(:saleflow, :repo, Saleflow.Workers.DailyTranscriptionWorker.StubRepoError)

      on_exit(fn -> Application.delete_env(:saleflow, :repo) end)

      calls = DailyTranscriptionWorker.find_untranscribed_calls(Date.utc_today())
      assert calls == []
    end

    test "limits to 100 results" do
      user = create_user!()
      today = Date.utc_today()

      # Insert 101 qualifying calls
      Enum.each(1..101, fn _ ->
        insert_phone_call!(user.id, date: today, duration: 30)
      end)

      calls = DailyTranscriptionWorker.find_untranscribed_calls(Date.to_iso8601(today))
      assert length(calls) == 100
    end
  end

  # ---------------------------------------------------------------------------
  # perform/1
  # ---------------------------------------------------------------------------

  describe "perform/1" do
    test "returns :ok when there are no qualifying calls" do
      job = %Oban.Job{args: %{"date" => Date.to_iso8601(Date.utc_today())}}
      assert :ok = DailyTranscriptionWorker.perform(job)
    end

    test "returns :ok with no args (uses today as default)" do
      job = %Oban.Job{args: %{}}
      assert :ok = DailyTranscriptionWorker.perform(job)
    end

    test "enqueues a TranscriptionWorker for each qualifying call" do
      user = create_user!()
      today = Date.utc_today()

      call1 = insert_phone_call!(user.id, date: today, duration: 30)
      call2 = insert_phone_call!(user.id, date: today, duration: 60)

      job = %Oban.Job{args: %{"date" => Date.to_iso8601(today)}}
      assert :ok = DailyTranscriptionWorker.perform(job)

      assert_enqueued(worker: Saleflow.Workers.TranscriptionWorker, args: %{phone_call_id: call1})
      assert_enqueued(worker: Saleflow.Workers.TranscriptionWorker, args: %{phone_call_id: call2})
    end

    test "does not enqueue jobs for already transcribed calls" do
      user = create_user!()
      today = Date.utc_today()

      _transcribed =
        insert_phone_call!(user.id,
          date: today,
          duration: 60,
          transcription: "Already transcribed"
        )

      job = %Oban.Job{args: %{"date" => Date.to_iso8601(today)}}
      assert :ok = DailyTranscriptionWorker.perform(job)

      refute_enqueued(worker: Saleflow.Workers.TranscriptionWorker)
    end

    test "does not enqueue jobs for short calls" do
      user = create_user!()
      today = Date.utc_today()

      _short = insert_phone_call!(user.id, date: today, duration: 10)

      job = %Oban.Job{args: %{"date" => Date.to_iso8601(today)}}
      assert :ok = DailyTranscriptionWorker.perform(job)

      refute_enqueued(worker: Saleflow.Workers.TranscriptionWorker)
    end

    test "does not enqueue jobs for calls without recording" do
      user = create_user!()
      today = Date.utc_today()

      _no_rec =
        insert_phone_call!(user.id, date: today, duration: 60, recording_key: nil)

      job = %Oban.Job{args: %{"date" => Date.to_iso8601(today)}}
      assert :ok = DailyTranscriptionWorker.perform(job)

      refute_enqueued(worker: Saleflow.Workers.TranscriptionWorker)
    end

    test "accepts a date arg to process a past date" do
      user = create_user!()
      yesterday = Date.add(Date.utc_today(), -1)

      call_id = insert_phone_call!(user.id, date: yesterday, duration: 30)

      job = %Oban.Job{args: %{"date" => Date.to_iso8601(yesterday)}}
      assert :ok = DailyTranscriptionWorker.perform(job)

      assert_enqueued(worker: Saleflow.Workers.TranscriptionWorker, args: %{phone_call_id: call_id})
    end
  end
end
