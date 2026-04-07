defmodule Saleflow.Workers.TranscriptionWorkerTest do
  use Saleflow.DataCase

  import Mox

  alias Saleflow.Workers.TranscriptionWorker
  alias Saleflow.AssemblyAI.MockClient

  setup :verify_on_exit!

  # ---------------------------------------------------------------------------
  # Helpers
  # ---------------------------------------------------------------------------

  defp create_phone_call_with_recording do
    {:ok, phone_call} =
      Saleflow.Sales.create_phone_call(%{
        caller: "+46701111111",
        callee: "+46812345678",
        duration: 120,
        direction: :outgoing
      })

    # Set recording_key via raw SQL since the Ash resource doesn't expose it on create
    Saleflow.Repo.query(
      "UPDATE phone_calls SET recording_key = $1 WHERE id = $2",
      ["recordings/#{phone_call.id}.mp3", Ecto.UUID.dump!(phone_call.id)]
    )

    phone_call
  end

  defp create_phone_call_without_recording do
    {:ok, phone_call} =
      Saleflow.Sales.create_phone_call(%{
        caller: "+46701111111",
        callee: "+46812345678",
        duration: 120,
        direction: :outgoing
      })

    phone_call
  end

  defp build_job(phone_call_id) do
    %Oban.Job{args: %{"phone_call_id" => phone_call_id}}
  end

  defp sample_utterances do
    [
      %{"speaker" => "A", "text" => "Hej, jag ringer från Saleflow.", "start" => 0, "end" => 3000},
      %{
        "speaker" => "B",
        "text" => "Hej, vad gäller det?",
        "start" => 3000,
        "end" => 5000
      },
      %{
        "speaker" => "A",
        "text" =>
          "Vi hjälper företag att effektivisera sin försäljning med AI-driven samtalsanalys.",
        "start" => 5000,
        "end" => 12000
      },
      %{
        "speaker" => "B",
        "text" => "Det låter intressant, berätta mer.",
        "start" => 12000,
        "end" => 15000
      },
      %{
        "speaker" => "A",
        "text" => "Ska vi boka ett möte på torsdag kl 10?",
        "start" => 15000,
        "end" => 20000
      },
      %{"speaker" => "B", "text" => "Ja, det fungerar.", "start" => 20000, "end" => 22000}
    ]
  end

  defp sample_sentiment_results do
    [
      %{"text" => "Hej", "sentiment" => "NEUTRAL"},
      %{"text" => "Det låter intressant", "sentiment" => "POSITIVE"},
      %{"text" => "Ja, det fungerar", "sentiment" => "POSITIVE"}
    ]
  end

  defp completed_transcript(overrides \\ %{}) do
    Map.merge(
      %{
        "status" => "completed",
        "text" =>
          "Hej jag ringer från Saleflow. Hej vad gäller det? Vi hjälper företag att effektivisera sin försäljning. Det låter intressant berätta mer.",
        "utterances" => sample_utterances(),
        "sentiment_analysis_results" => sample_sentiment_results(),
        "summary" => "Säljsamtal om AI-driven samtalsanalys. Möte bokat.",
        "auto_chapters_result" => [%{"headline" => "Introduktion"}],
        "entities" => []
      },
      overrides
    )
  end

  defp sample_lemur_scorecard do
    %{
      "voicemail" => false,
      "scorecard" => %{
        "opening" => %{
          "q1_greeting" => %{"score" => 8, "comment" => "Bra hälsning"},
          "q2_introduction" => %{"score" => 7, "comment" => "Tydlig presentation"},
          "q3_rapport" => %{"score" => 6, "comment" => "Lite småprat"},
          "q4_permission" => %{"score" => 5, "comment" => "Frågade inte om det passade"},
          "q5_hook" => %{"score" => 7, "comment" => "Bra hook"}
        },
        "needs_discovery" => %{
          "q1_open_questions" => %{"score" => 7, "comment" => "Öppna frågor"},
          "q2_active_listening" => %{"score" => 6, "comment" => "Lyssnade aktivt"},
          "q3_pain_points" => %{"score" => 5, "comment" => "Identifierade smärtpunkter"},
          "q4_current_situation" => %{"score" => 7, "comment" => "Kartlade situation"},
          "q5_decision_process" => %{"score" => 4, "comment" => "Missade beslutsprocess"}
        },
        "pitch" => %{
          "q1_value_proposition" => %{"score" => 8, "comment" => "Tydligt värde"},
          "q2_customization" => %{"score" => 7, "comment" => "Anpassad pitch"},
          "q3_proof_points" => %{"score" => 6, "comment" => "Referenskunder"},
          "q4_differentiation" => %{"score" => 7, "comment" => "Differentiering"},
          "q5_engagement" => %{"score" => 6, "comment" => "Engagemang"}
        },
        "objection_handling" => %{
          "q1_acknowledge" => %{"score" => 7, "comment" => "Bekräftade"},
          "q2_clarify" => %{"score" => 6, "comment" => "Klargjorde"},
          "q3_respond" => %{"score" => 5, "comment" => "Svarade"},
          "q4_confirm" => %{"score" => 7, "comment" => "Bekräftade hanterad"},
          "q5_pivot" => %{"score" => 6, "comment" => "Pivoterade"}
        },
        "closing" => %{
          "q1_summary" => %{"score" => 7, "comment" => "Sammanfattade"},
          "q2_next_step" => %{"score" => 9, "comment" => "Bokade möte"},
          "q3_commitment" => %{"score" => 8, "comment" => "Fick åtagande"},
          "q4_timeline" => %{"score" => 7, "comment" => "Torsdag kl 10"},
          "q5_professional_end" => %{"score" => 7, "comment" => "Professionellt avslut"}
        }
      },
      "score" => %{
        "opening" => %{"score" => 7, "comment" => "Bra öppning"},
        "needs_discovery" => %{"score" => 6, "comment" => "Behovsanalys ok"},
        "pitch" => %{"score" => 7, "comment" => "Stark pitch"},
        "objection_handling" => %{"score" => 6, "comment" => "Hantering ok"},
        "closing" => %{"score" => 8, "comment" => "Starkt avslut"},
        "overall" => 7,
        "top_feedback" => "Bra samtal med tydlig struktur."
      },
      "summary" => "Säljsamtal om Saleflow. Möte bokat torsdag kl 10.",
      "customer_needs" => ["Effektivisera försäljning"],
      "objections" => [],
      "positive_signals" => ["Det låter intressant"],
      "action_items" => ["Möte torsdag kl 10"],
      "keywords" => %{
        "competitors" => [],
        "buying_signals" => [%{"signal" => "Det låter intressant", "timestamp" => "00:12"}],
        "red_flags" => []
      }
    }
  end

  defp get_phone_call_fields(phone_call_id) do
    {:ok, %{rows: [row], columns: cols}} =
      Saleflow.Repo.query(
        """
        SELECT transcription, transcription_analysis, call_summary,
               assemblyai_transcript_id, talk_ratio_seller, sentiment, scorecard_avg
        FROM phone_calls WHERE id = $1
        """,
        [Ecto.UUID.dump!(phone_call_id)]
      )

    cols
    |> Enum.zip(row)
    |> Map.new()
  end

  # ---------------------------------------------------------------------------
  # Tests: successful transcription + scorecard
  # ---------------------------------------------------------------------------

  describe "perform/1 successful transcription + scorecard" do
    test "transcribes, scores, and saves all fields" do
      phone_call = create_phone_call_with_recording()

      MockClient
      |> expect(:transcribe, fn _url, _opts -> {:ok, "tid-123"} end)
      |> expect(:get_transcript, fn "tid-123" -> {:ok, completed_transcript()} end)
      |> expect(:lemur_task, fn ["tid-123"], _prompt, _opts ->
        {:ok, %{"response" => Jason.encode!(sample_lemur_scorecard())}}
      end)

      assert :ok = TranscriptionWorker.perform(build_job(phone_call.id))

      fields = get_phone_call_fields(phone_call.id)

      # Transcription built from utterances
      assert fields["transcription"] =~ "Säljare: Hej, jag ringer från Saleflow."
      assert fields["transcription"] =~ "Kund: Hej, vad gäller det?"

      # Analysis includes scorecard and score (bakåtkompatibelt)
      analysis = Jason.decode!(fields["transcription_analysis"])
      assert analysis["scorecard"]["opening"]["q1_greeting"]["score"] == 8
      assert analysis["score"]["opening"]["score"] == 7
      assert analysis["score"]["overall"] == 7

      # Talk ratio included in analysis
      assert analysis["talk_ratio"]["seller_pct"] > 0
      assert analysis["talk_ratio"]["customer_pct"] > 0

      # Summary saved
      assert fields["call_summary"] == "Säljsamtal om Saleflow. Möte bokat torsdag kl 10."

      # AssemblyAI transcript ID saved
      assert fields["assemblyai_transcript_id"] == "tid-123"

      # Talk ratio seller saved as integer
      assert is_integer(fields["talk_ratio_seller"])
      assert fields["talk_ratio_seller"] > 0

      # Sentiment saved
      assert fields["sentiment"] == "positive"

      # Scorecard avg saved as float
      assert is_float(fields["scorecard_avg"])
      assert fields["scorecard_avg"] > 0.0
    end
  end

  # ---------------------------------------------------------------------------
  # Tests: no recording
  # ---------------------------------------------------------------------------

  describe "perform/1 with no recording" do
    test "skips gracefully when phone_call has no recording_key" do
      phone_call = create_phone_call_without_recording()

      # No mocks needed — should exit before calling AssemblyAI
      assert :ok = TranscriptionWorker.perform(build_job(phone_call.id))
    end
  end

  # ---------------------------------------------------------------------------
  # Tests: AssemblyAI transcription failure
  # ---------------------------------------------------------------------------

  describe "perform/1 with AssemblyAI transcription failure" do
    test "returns error when transcribe fails" do
      phone_call = create_phone_call_with_recording()

      MockClient
      |> expect(:transcribe, fn _url, _opts -> {:error, :timeout} end)

      assert {:error, :timeout} = TranscriptionWorker.perform(build_job(phone_call.id))
    end

    test "returns error when transcript polling returns error" do
      phone_call = create_phone_call_with_recording()

      MockClient
      |> expect(:transcribe, fn _url, _opts -> {:ok, "tid-fail"} end)
      |> expect(:get_transcript, fn "tid-fail" ->
        {:ok, %{"status" => "error", "error" => "audio format not supported"}}
      end)

      assert {:error, {:transcription_failed, "audio format not supported"}} =
               TranscriptionWorker.perform(build_job(phone_call.id))
    end
  end

  # ---------------------------------------------------------------------------
  # Tests: LeMUR failure falls back to transcription-only
  # ---------------------------------------------------------------------------

  describe "perform/1 with LeMUR failure" do
    test "saves transcription and basic analysis when LeMUR fails" do
      phone_call = create_phone_call_with_recording()

      MockClient
      |> expect(:transcribe, fn _url, _opts -> {:ok, "tid-456"} end)
      |> expect(:get_transcript, fn "tid-456" -> {:ok, completed_transcript()} end)
      |> expect(:lemur_task, fn ["tid-456"], _prompt, _opts ->
        {:error, {:http, 500, "Internal Server Error"}}
      end)

      assert :ok = TranscriptionWorker.perform(build_job(phone_call.id))

      fields = get_phone_call_fields(phone_call.id)

      # Transcription saved
      assert fields["transcription"] =~ "Säljare:"
      assert fields["transcription"] =~ "Kund:"

      # Basic analysis with talk_ratio and sentiment but no scorecard
      analysis = Jason.decode!(fields["transcription_analysis"])
      assert analysis["talk_ratio"]["seller_pct"] > 0
      assert analysis["sentiment"] == "positive"
      assert analysis["lemur_error"] != nil
      refute Map.has_key?(analysis, "scorecard")

      # Summary from AssemblyAI (fallback)
      assert fields["call_summary"] == "Säljsamtal om AI-driven samtalsanalys. Möte bokat."

      # AssemblyAI transcript ID saved
      assert fields["assemblyai_transcript_id"] == "tid-456"

      # Talk ratio seller saved
      assert is_integer(fields["talk_ratio_seller"])

      # Sentiment saved
      assert fields["sentiment"] == "positive"

      # No scorecard avg when LeMUR fails
      assert is_nil(fields["scorecard_avg"])
    end
  end

  # ---------------------------------------------------------------------------
  # Tests: voicemail detection
  # ---------------------------------------------------------------------------

  describe "perform/1 voicemail detection" do
    test "detects voicemail from short transcription (<10 words)" do
      phone_call = create_phone_call_with_recording()

      short_transcript =
        completed_transcript(%{
          "text" => "Välkommen till röstbrevlådan.",
          "utterances" => [
            %{
              "speaker" => "A",
              "text" => "Välkommen till röstbrevlådan.",
              "start" => 0,
              "end" => 3000
            }
          ]
        })

      MockClient
      |> expect(:transcribe, fn _url, _opts -> {:ok, "tid-vm"} end)
      |> expect(:get_transcript, fn "tid-vm" -> {:ok, short_transcript} end)
      |> expect(:lemur_task, fn ["tid-vm"], _prompt, _opts ->
        {:ok, %{"response" => Jason.encode!(%{"voicemail" => true})}}
      end)

      assert :ok = TranscriptionWorker.perform(build_job(phone_call.id))

      fields = get_phone_call_fields(phone_call.id)

      analysis = Jason.decode!(fields["transcription_analysis"])
      assert analysis["voicemail"] == true
    end

    test "detects voicemail from LeMUR response" do
      phone_call = create_phone_call_with_recording()

      MockClient
      |> expect(:transcribe, fn _url, _opts -> {:ok, "tid-vm2"} end)
      |> expect(:get_transcript, fn "tid-vm2" -> {:ok, completed_transcript()} end)
      |> expect(:lemur_task, fn ["tid-vm2"], _prompt, _opts ->
        {:ok, %{"response" => Jason.encode!(%{"voicemail" => true})}}
      end)

      assert :ok = TranscriptionWorker.perform(build_job(phone_call.id))

      fields = get_phone_call_fields(phone_call.id)

      analysis = Jason.decode!(fields["transcription_analysis"])
      assert analysis["voicemail"] == true
      assert analysis["summary"] == "Telefonsvarare/röstbrevlåda"
    end
  end

  # ---------------------------------------------------------------------------
  # Tests: saves all new fields correctly
  # ---------------------------------------------------------------------------

  describe "perform/1 saves all new fields correctly" do
    test "assemblyai_transcript_id, talk_ratio_seller, sentiment, scorecard_avg, call_summary" do
      phone_call = create_phone_call_with_recording()

      MockClient
      |> expect(:transcribe, fn _url, _opts -> {:ok, "tid-fields"} end)
      |> expect(:get_transcript, fn "tid-fields" -> {:ok, completed_transcript()} end)
      |> expect(:lemur_task, fn ["tid-fields"], _prompt, _opts ->
        {:ok, %{"response" => Jason.encode!(sample_lemur_scorecard())}}
      end)

      assert :ok = TranscriptionWorker.perform(build_job(phone_call.id))

      fields = get_phone_call_fields(phone_call.id)

      # assemblyai_transcript_id
      assert fields["assemblyai_transcript_id"] == "tid-fields"

      # talk_ratio_seller — seller A has 3000+7000+5000 = 15000ms, customer B has 2000+3000+2000 = 7000ms
      # total = 22000ms, seller_pct = round(15000/22000*100) = 68
      assert fields["talk_ratio_seller"] == 68

      # sentiment — 2 POSITIVE, 1 NEUTRAL = dominant positive
      assert fields["sentiment"] == "positive"

      # scorecard_avg — average of all 25 scores
      scorecard = sample_lemur_scorecard()["scorecard"]

      all_scores =
        scorecard
        |> Enum.flat_map(fn {_cat, questions} ->
          Enum.map(questions, fn {_q, %{"score" => s}} -> s end)
        end)

      expected_avg = Float.round(Enum.sum(all_scores) / length(all_scores), 1)
      assert fields["scorecard_avg"] == expected_avg

      # call_summary
      assert fields["call_summary"] == "Säljsamtal om Saleflow. Möte bokat torsdag kl 10."
    end
  end

  # ---------------------------------------------------------------------------
  # Tests: talk ratio calculation edge cases
  # ---------------------------------------------------------------------------

  describe "talk ratio calculation" do
    test "handles nil utterances" do
      phone_call = create_phone_call_with_recording()

      transcript = completed_transcript(%{"utterances" => nil})

      MockClient
      |> expect(:transcribe, fn _url, _opts -> {:ok, "tid-nil"} end)
      |> expect(:get_transcript, fn "tid-nil" -> {:ok, transcript} end)
      |> expect(:lemur_task, fn ["tid-nil"], _prompt, _opts ->
        {:ok, %{"response" => Jason.encode!(sample_lemur_scorecard())}}
      end)

      assert :ok = TranscriptionWorker.perform(build_job(phone_call.id))

      fields = get_phone_call_fields(phone_call.id)
      assert fields["talk_ratio_seller"] == 0
    end

    test "handles empty utterances" do
      phone_call = create_phone_call_with_recording()

      transcript = completed_transcript(%{"utterances" => []})

      MockClient
      |> expect(:transcribe, fn _url, _opts -> {:ok, "tid-empty"} end)
      |> expect(:get_transcript, fn "tid-empty" -> {:ok, transcript} end)
      |> expect(:lemur_task, fn ["tid-empty"], _prompt, _opts ->
        {:ok, %{"response" => Jason.encode!(sample_lemur_scorecard())}}
      end)

      assert :ok = TranscriptionWorker.perform(build_job(phone_call.id))

      fields = get_phone_call_fields(phone_call.id)
      assert fields["talk_ratio_seller"] == 0
    end
  end

  # ---------------------------------------------------------------------------
  # Tests: LeMUR JSON parse error
  # ---------------------------------------------------------------------------

  describe "perform/1 with LeMUR returning invalid JSON" do
    test "falls back to transcription-only save" do
      phone_call = create_phone_call_with_recording()

      MockClient
      |> expect(:transcribe, fn _url, _opts -> {:ok, "tid-bad-json"} end)
      |> expect(:get_transcript, fn "tid-bad-json" -> {:ok, completed_transcript()} end)
      |> expect(:lemur_task, fn ["tid-bad-json"], _prompt, _opts ->
        {:ok, %{"response" => "This is not valid JSON at all {{"}}
      end)

      assert :ok = TranscriptionWorker.perform(build_job(phone_call.id))

      fields = get_phone_call_fields(phone_call.id)

      # Transcription saved
      assert fields["transcription"] =~ "Säljare:"

      # Basic analysis (no scorecard) due to parse failure
      analysis = Jason.decode!(fields["transcription_analysis"])
      assert analysis["lemur_error"] != nil
      refute Map.has_key?(analysis, "scorecard")
    end
  end

  # ---------------------------------------------------------------------------
  # Tests: poll_transcript still-processing branch (polls again after delay)
  # ---------------------------------------------------------------------------

  describe "perform/1 poll_transcript polling" do
    test "polls again when transcript status is still processing" do
      phone_call = create_phone_call_with_recording()

      # First call returns "processing", second returns "completed"
      MockClient
      |> expect(:transcribe, fn _url, _opts -> {:ok, "tid-poll"} end)
      |> expect(:get_transcript, fn "tid-poll" ->
        {:ok, %{"status" => "processing"}}
      end)
      |> expect(:get_transcript, fn "tid-poll" ->
        {:ok, completed_transcript()}
      end)
      |> expect(:lemur_task, fn ["tid-poll"], _prompt, _opts ->
        {:ok, %{"response" => Jason.encode!(sample_lemur_scorecard())}}
      end)

      assert :ok = TranscriptionWorker.perform(build_job(phone_call.id))

      fields = get_phone_call_fields(phone_call.id)
      assert fields["transcription"] =~ "Säljare:"
    end

    test "returns error when get_transcript returns network error" do
      phone_call = create_phone_call_with_recording()

      MockClient
      |> expect(:transcribe, fn _url, _opts -> {:ok, "tid-net-err"} end)
      |> expect(:get_transcript, fn "tid-net-err" ->
        {:error, :econnrefused}
      end)

      assert {:error, :econnrefused} = TranscriptionWorker.perform(build_job(phone_call.id))
    end
  end

  # ---------------------------------------------------------------------------
  # Tests: extract_sentiment fallback
  # ---------------------------------------------------------------------------

  describe "perform/1 sentiment extraction" do
    test "defaults to neutral when no sentiment_analysis_results in transcript" do
      phone_call = create_phone_call_with_recording()

      # Transcript without sentiment_analysis_results key
      transcript =
        completed_transcript()
        |> Map.delete("sentiment_analysis_results")

      MockClient
      |> expect(:transcribe, fn _url, _opts -> {:ok, "tid-no-sent"} end)
      |> expect(:get_transcript, fn "tid-no-sent" -> {:ok, transcript} end)
      |> expect(:lemur_task, fn ["tid-no-sent"], _prompt, _opts ->
        {:ok, %{"response" => Jason.encode!(sample_lemur_scorecard())}}
      end)

      assert :ok = TranscriptionWorker.perform(build_job(phone_call.id))

      fields = get_phone_call_fields(phone_call.id)
      assert fields["sentiment"] == "neutral"
    end

    test "defaults to neutral when sentiment_analysis_results is nil" do
      phone_call = create_phone_call_with_recording()

      transcript = completed_transcript(%{"sentiment_analysis_results" => nil})

      MockClient
      |> expect(:transcribe, fn _url, _opts -> {:ok, "tid-nil-sent"} end)
      |> expect(:get_transcript, fn "tid-nil-sent" -> {:ok, transcript} end)
      |> expect(:lemur_task, fn ["tid-nil-sent"], _prompt, _opts ->
        {:ok, %{"response" => Jason.encode!(sample_lemur_scorecard())}}
      end)

      assert :ok = TranscriptionWorker.perform(build_job(phone_call.id))

      fields = get_phone_call_fields(phone_call.id)
      assert fields["sentiment"] == "neutral"
    end
  end

  # ---------------------------------------------------------------------------
  # Tests: parse_lemur_response when LeMUR already returns a map
  # ---------------------------------------------------------------------------

  describe "perform/1 LeMUR response already a map" do
    test "handles map response from LeMUR (no JSON parsing needed)" do
      phone_call = create_phone_call_with_recording()

      # LeMUR returns the map directly in the response field (already decoded)
      # We simulate this by having the mock return a pre-decoded map as the "response" value
      # The parse_lemur_response/1 is_map clause handles this
      MockClient
      |> expect(:transcribe, fn _url, _opts -> {:ok, "tid-map"} end)
      |> expect(:get_transcript, fn "tid-map" -> {:ok, completed_transcript()} end)
      |> expect(:lemur_task, fn ["tid-map"], _prompt, _opts ->
        # Return response as a map directly (not a JSON string) to hit is_map clause
        {:ok, %{"response" => sample_lemur_scorecard()}}
      end)

      assert :ok = TranscriptionWorker.perform(build_job(phone_call.id))

      fields = get_phone_call_fields(phone_call.id)
      analysis = Jason.decode!(fields["transcription_analysis"])
      assert analysis["scorecard"] != nil
    end
  end

  # ---------------------------------------------------------------------------
  # Tests: build_raw_text fallback clauses
  # ---------------------------------------------------------------------------

  describe "perform/1 build_raw_text fallbacks" do
    test "uses text field when utterances key is absent" do
      phone_call = create_phone_call_with_recording()

      # Transcript with no utterances key, only text
      transcript = %{
        "status" => "completed",
        "text" =>
          "Hej jag ringer från Saleflow. Hej vad gäller det? Vi hjälper företag att effektivisera sin försäljning. Det låter intressant berätta mer.",
        "sentiment_analysis_results" => sample_sentiment_results(),
        "summary" => "Samtal utan utterances."
      }

      MockClient
      |> expect(:transcribe, fn _url, _opts -> {:ok, "tid-no-utt"} end)
      |> expect(:get_transcript, fn "tid-no-utt" -> {:ok, transcript} end)
      |> expect(:lemur_task, fn ["tid-no-utt"], _prompt, _opts ->
        {:ok, %{"response" => Jason.encode!(sample_lemur_scorecard())}}
      end)

      assert :ok = TranscriptionWorker.perform(build_job(phone_call.id))

      fields = get_phone_call_fields(phone_call.id)
      # Falls back to raw text (no speaker labels)
      assert fields["transcription"] =~ "Hej jag ringer från Saleflow"
      refute fields["transcription"] =~ "Säljare:"
    end

    test "uses empty string when transcript has neither utterances nor text key" do
      phone_call = create_phone_call_with_recording()

      # Transcript with no "text" key and no "utterances" key.
      # poll_transcript uses Map.get(result, "text", "") which returns "" -> word_count = 0 < 10
      # so it marks the result with __voicemail: true and still calls build_raw_text on it.
      # build_raw_text receives %{"status" => "completed", "__voicemail" => true, "summary" => ...}
      # which matches neither clause 1 (no utterances list) nor clause 2 (no text key),
      # so it hits the catch-all clause 3: build_raw_text(_) -> ""
      no_text_transcript = %{
        "status" => "completed",
        "summary" => "Röstbrevlåda utan text"
      }

      MockClient
      |> expect(:transcribe, fn _url, _opts -> {:ok, "tid-no-text"} end)
      |> expect(:get_transcript, fn "tid-no-text" -> {:ok, no_text_transcript} end)
      |> expect(:lemur_task, fn ["tid-no-text"], _prompt, _opts ->
        {:ok, %{"response" => Jason.encode!(%{"voicemail" => true})}}
      end)

      assert :ok = TranscriptionWorker.perform(build_job(phone_call.id))

      fields = get_phone_call_fields(phone_call.id)
      # build_raw_text(_) returns "" for a transcript with no utterances list and no text key
      assert fields["transcription"] == ""
    end
  end

  # ---------------------------------------------------------------------------
  # Tests: calculate_scorecard_avg edge cases
  # ---------------------------------------------------------------------------

  describe "perform/1 scorecard avg edge cases" do
    test "scorecard_avg is nil when LeMUR returns nil scorecard" do
      phone_call = create_phone_call_with_recording()

      lemur_response = sample_lemur_scorecard() |> Map.put("scorecard", nil)

      MockClient
      |> expect(:transcribe, fn _url, _opts -> {:ok, "tid-nil-sc"} end)
      |> expect(:get_transcript, fn "tid-nil-sc" -> {:ok, completed_transcript()} end)
      |> expect(:lemur_task, fn ["tid-nil-sc"], _prompt, _opts ->
        {:ok, %{"response" => Jason.encode!(lemur_response)}}
      end)

      assert :ok = TranscriptionWorker.perform(build_job(phone_call.id))

      fields = get_phone_call_fields(phone_call.id)
      assert is_nil(fields["scorecard_avg"])
    end

    test "scorecard_avg is nil when scorecard has non-map category values" do
      phone_call = create_phone_call_with_recording()

      # Scorecard with non-map questions value (e.g. a list) - hits the else [] branch
      lemur_response =
        sample_lemur_scorecard()
        |> put_in(["scorecard", "opening"], ["not", "a", "map"])

      MockClient
      |> expect(:transcribe, fn _url, _opts -> {:ok, "tid-bad-sc"} end)
      |> expect(:get_transcript, fn "tid-bad-sc" -> {:ok, completed_transcript()} end)
      |> expect(:lemur_task, fn ["tid-bad-sc"], _prompt, _opts ->
        {:ok, %{"response" => Jason.encode!(lemur_response)}}
      end)

      assert :ok = TranscriptionWorker.perform(build_job(phone_call.id))

      fields = get_phone_call_fields(phone_call.id)
      # Still gets a valid avg from the other 4 categories (opening is skipped)
      assert is_float(fields["scorecard_avg"])
    end

    test "scorecard_avg is nil when scorecard has all non-map categories (empty scores)" do
      phone_call = create_phone_call_with_recording()

      # All categories are non-map values -> empty scores list -> nil avg
      lemur_response =
        sample_lemur_scorecard()
        |> Map.put("scorecard", %{
          "opening" => "bad",
          "needs_discovery" => 42,
          "pitch" => [],
          "objection_handling" => nil,
          "closing" => true
        })

      MockClient
      |> expect(:transcribe, fn _url, _opts -> {:ok, "tid-all-bad-sc"} end)
      |> expect(:get_transcript, fn "tid-all-bad-sc" -> {:ok, completed_transcript()} end)
      |> expect(:lemur_task, fn ["tid-all-bad-sc"], _prompt, _opts ->
        {:ok, %{"response" => Jason.encode!(lemur_response)}}
      end)

      assert :ok = TranscriptionWorker.perform(build_job(phone_call.id))

      fields = get_phone_call_fields(phone_call.id)
      assert is_nil(fields["scorecard_avg"])
    end

    test "scorecard_avg is nil when scorecard is not a map (non-map non-nil value)" do
      phone_call = create_phone_call_with_recording()

      # scorecard is a string (not nil, not a map) -> hits calculate_scorecard_avg(_)
      lemur_response = sample_lemur_scorecard() |> Map.put("scorecard", "invalid")

      MockClient
      |> expect(:transcribe, fn _url, _opts -> {:ok, "tid-str-sc"} end)
      |> expect(:get_transcript, fn "tid-str-sc" -> {:ok, completed_transcript()} end)
      |> expect(:lemur_task, fn ["tid-str-sc"], _prompt, _opts ->
        {:ok, %{"response" => Jason.encode!(lemur_response)}}
      end)

      assert :ok = TranscriptionWorker.perform(build_job(phone_call.id))

      fields = get_phone_call_fields(phone_call.id)
      assert is_nil(fields["scorecard_avg"])
    end
  end

  # ---------------------------------------------------------------------------
  # Tests: active playbook included in LeMUR prompt
  # ---------------------------------------------------------------------------

  describe "perform/1 with active playbook" do
    test "includes playbook sections in prompt when a playbook row exists" do
      phone_call = create_phone_call_with_recording()

      # Insert an active playbook row
      {:ok, _} =
        Saleflow.Repo.query(
          """
          INSERT INTO playbooks (id, name, opening, pitch, objections, closing, guidelines, active, inserted_at, updated_at)
          VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, true, NOW(), NOW())
          """,
          [
            "Test Playbook",
            "Hälsa med namn",
            "Presentera produkten",
            "Hantera invändningar",
            "Boka möte",
            "Var tydlig"
          ]
        )

      captured_prompt = :persistent_term.put(:test_prompt_capture, nil)
      _ = captured_prompt

      MockClient
      |> expect(:transcribe, fn _url, _opts -> {:ok, "tid-playbook"} end)
      |> expect(:get_transcript, fn "tid-playbook" -> {:ok, completed_transcript()} end)
      |> expect(:lemur_task, fn ["tid-playbook"], prompt, _opts ->
        # Verify prompt contains playbook content
        assert prompt =~ "FÖRETAGETS PLAYBOOK"
        assert prompt =~ "Hälsa med namn"
        assert prompt =~ "Presentera produkten"
        {:ok, %{"response" => Jason.encode!(sample_lemur_scorecard())}}
      end)

      assert :ok = TranscriptionWorker.perform(build_job(phone_call.id))
    end
  end
end
