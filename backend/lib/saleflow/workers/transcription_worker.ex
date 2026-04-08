defmodule Saleflow.Workers.TranscriptionWorker do
  @moduledoc """
  Call transcription and analysis using AssemblyAI Universal-2 + LeMUR.

  Flow:
  1. Generate presigned R2 URL for the recording
  2. Submit to AssemblyAI for transcription (speaker labels, sentiment, chapters, summary)
  3. Poll until complete
  4. Calculate talk ratio from utterances (speaker A = seller, B = customer)
  5. Send transcript to LeMUR with 25-point scorecard prompt + playbook
  6. Parse scorecard JSON, build unified transcription_analysis (bakåtkompatibelt)
  7. Save all fields to DB

  Triggered for calls with outcome meeting_booked that have a recording.
  """

  use Oban.Worker, queue: :default, max_attempts: 3

  require Logger

  @impl Oban.Worker
  def perform(%Oban.Job{args: %{"phone_call_id" => phone_call_id}}) do
    with {:ok, recording_key} <- get_recording(phone_call_id),
         {:ok, presigned_url} <- Saleflow.Storage.presigned_url(recording_key),
         {:ok, transcript_id} <- assemblyai_client().transcribe(presigned_url, %{}),
         {:ok, result} <- poll_transcript(transcript_id) do
      raw_text = build_raw_text(result)
      talk_ratio = calculate_talk_ratio(result["utterances"])
      sentiment = extract_sentiment(result)

      case run_lemur_scorecard(transcript_id) do
        {:ok, analysis} ->
          scorecard_avg = calculate_scorecard_avg(analysis["scorecard"])

          unified = build_unified_analysis(analysis, result, talk_ratio)

          save(phone_call_id, %{
            transcription: raw_text,
            transcription_analysis: unified,
            call_summary: analysis["summary"] || result["summary"],
            assemblyai_transcript_id: transcript_id,
            talk_ratio_seller: talk_ratio["seller_pct"],
            sentiment: sentiment,
            scorecard_avg: scorecard_avg
          })

          save_call_topics(phone_call_id, analysis)

          Logger.info("TranscriptionWorker: #{phone_call_id} done (full scorecard)")
          :ok

        {:error, lemur_reason} ->
          Logger.warning(
            "TranscriptionWorker: #{phone_call_id} LeMUR failed: #{inspect(lemur_reason)}, saving transcription only"
          )

          basic_analysis = %{
            "talk_ratio" => talk_ratio,
            "sentiment" => sentiment,
            "summary" => result["summary"],
            "lemur_error" => inspect(lemur_reason)
          }

          save(phone_call_id, %{
            transcription: raw_text,
            transcription_analysis: basic_analysis,
            call_summary: result["summary"],
            assemblyai_transcript_id: transcript_id,
            talk_ratio_seller: talk_ratio["seller_pct"],
            sentiment: sentiment,
            scorecard_avg: nil
          })

          :ok
      end
    else
      {:error, :no_recording} ->
        Logger.info("TranscriptionWorker: #{phone_call_id} no recording, skipping")
        :ok

      {:error, reason} ->
        Logger.warning("TranscriptionWorker: #{phone_call_id} failed: #{inspect(reason)}")
        {:error, reason}
    end
  end

  # ---------------------------------------------------------------------------
  # AssemblyAI polling
  # ---------------------------------------------------------------------------

  defp poll_transcript(transcript_id) do
    case assemblyai_client().get_transcript(transcript_id) do
      {:ok, %{"status" => "completed"} = result} ->
        word_count =
          result
          |> Map.get("text", "")
          |> String.split(~r/\s+/, trim: true)
          |> length()

        if word_count < 10 do
          {:ok, Map.put(result, "__voicemail", true)}
        else
          {:ok, result}
        end

      {:ok, %{"status" => "error", "error" => error}} ->
        {:error, {:transcription_failed, error}}

      {:ok, %{"status" => _}} ->
        # Still processing -- poll again after delay
        Process.sleep(3_000)
        poll_transcript(transcript_id)

      {:error, _} = err ->
        err
    end
  end

  # ---------------------------------------------------------------------------
  # Talk ratio
  # ---------------------------------------------------------------------------

  defp calculate_talk_ratio(utterances) do
    {seller_ms, customer_ms} =
      Enum.reduce(utterances || [], {0, 0}, fn u, {s, c} ->
        duration = (u["end"] || 0) - (u["start"] || 0)
        if u["speaker"] == "A", do: {s + duration, c}, else: {s, c + duration}
      end)

    total = max(seller_ms + customer_ms, 1)
    seller_pct = round(seller_ms / total * 100)

    %{
      "seller_pct" => seller_pct,
      "customer_pct" => 100 - seller_pct,
      "longest_monolog_seconds" => calculate_longest_monolog(utterances),
      "avg_seller_turn_seconds" => calculate_avg_turn(utterances, "A"),
      "avg_customer_turn_seconds" => calculate_avg_turn(utterances, "B")
    }
  end

  defp calculate_longest_monolog(nil), do: 0

  defp calculate_longest_monolog(utterances) do
    utterances
    |> Enum.map(fn u -> ((u["end"] || 0) - (u["start"] || 0)) / 1_000 end)
    |> Enum.max(fn -> 0 end)
    |> round()
  end

  defp calculate_avg_turn(nil, _speaker), do: 0

  defp calculate_avg_turn(utterances, speaker) do
    turns =
      utterances
      |> Enum.filter(fn u -> u["speaker"] == speaker end)
      |> Enum.map(fn u -> ((u["end"] || 0) - (u["start"] || 0)) / 1_000 end)

    case turns do
      [] -> 0
      list -> round(Enum.sum(list) / length(list))
    end
  end

  # ---------------------------------------------------------------------------
  # Sentiment
  # ---------------------------------------------------------------------------

  defp extract_sentiment(%{"sentiment_analysis_results" => results}) when is_list(results) do
    counts =
      Enum.reduce(results, %{"POSITIVE" => 0, "NEUTRAL" => 0, "NEGATIVE" => 0}, fn r, acc ->
        sentiment = r["sentiment"] || "NEUTRAL"
        Map.update(acc, sentiment, 1, &(&1 + 1))
      end)

    # Return the dominant sentiment
    {dominant, _} = Enum.max_by(counts, fn {_k, v} -> v end)
    String.downcase(dominant)
  end

  defp extract_sentiment(_), do: "neutral"

  # ---------------------------------------------------------------------------
  # LeMUR scorecard
  # ---------------------------------------------------------------------------

  defp run_lemur_scorecard(transcript_id) do
    playbook = get_active_playbook()
    prompt = build_lemur_prompt(playbook)

    case assemblyai_client().lemur_task([transcript_id], prompt, %{}) do
      {:ok, %{"response" => response_text}} ->
        parse_lemur_response(response_text)

      {:error, _} = err ->
        err
    end
  end

  defp parse_lemur_response(text) when is_binary(text) do
    # Strip markdown code fences if present
    cleaned =
      text
      |> String.replace(~r/```json\s*/, "")
      |> String.replace(~r/```\s*/, "")
      |> String.trim()

    case Jason.decode(cleaned) do
      {:ok, parsed} -> {:ok, parsed}
      {:error, _} -> {:error, {:json_parse_error, text}}
    end
  end

  defp parse_lemur_response(text) when is_map(text), do: {:ok, text}

  defp get_active_playbook do
    case Saleflow.Repo.query(
           "SELECT opening, pitch, objections, closing, guidelines FROM playbooks WHERE active = true LIMIT 1"
         ) do
      {:ok, %{rows: [[opening, pitch, objections, closing, guidelines]]}} ->
        %{
          opening: opening,
          pitch: pitch,
          objections: objections,
          closing: closing,
          guidelines: guidelines
        }

      _ ->
        nil
    end
  end

  defp playbook_section(nil), do: ""

  defp playbook_section(playbook) do
    """

    FÖRETAGETS PLAYBOOK (bedöm samtalet mot detta):

    ÖPPNING:
    #{playbook.opening}

    PITCH:
    #{playbook.pitch}

    INVÄNDNINGSHANTERING:
    #{playbook.objections}

    AVSLUT:
    #{playbook.closing}

    RIKTLINJER:
    #{playbook.guidelines}

    Bedöm hur väl säljaren följde detta manus. Referera till specifika delar av playbooken i din feedback.
    """
  end

  defp build_lemur_prompt(playbook) do
    """
    Du är en erfaren säljcoach som analyserar inspelade säljsamtal.
    #{playbook_section(playbook)}
    INSTRUKTIONER:
    1. Avgör FÖRST om detta är en telefonsvarare/röstbrevlåda. Om det bara är ett automatiskt meddelande — returnera: {"voicemail": true} och INGET annat.
    2. Om det är ett riktigt samtal, analysera det med 25-punkts scorecard nedan.
    3. Speaker A = säljare, Speaker B = kund.

    Returnera EXAKT detta JSON-format (inget annat):
    {
      "voicemail": false,
      "scorecard": {
        "opening": {
          "q1_greeting": {"score": 7, "comment": "Hälsade professionellt med namn"},
          "q2_introduction": {"score": 6, "comment": "Presenterade företaget men inte syftet tydligt"},
          "q3_rapport": {"score": 5, "comment": "Ingen småprat eller personlig koppling"},
          "q4_permission": {"score": 8, "comment": "Frågade om det passade att prata"},
          "q5_hook": {"score": 4, "comment": "Saknade tydlig hook eller värdeerbjudande"}
        },
        "needs_discovery": {
          "q1_open_questions": {"score": 7, "comment": "Ställde öppna frågor om behov"},
          "q2_active_listening": {"score": 6, "comment": "Bekräftade kundens svar"},
          "q3_pain_points": {"score": 5, "comment": "Identifierade delvis smärtpunkter"},
          "q4_current_situation": {"score": 7, "comment": "Kartlade nuvarande lösning"},
          "q5_decision_process": {"score": 4, "comment": "Frågade inte om beslutsprocessen"}
        },
        "pitch": {
          "q1_value_proposition": {"score": 7, "comment": "Tydligt värdeerbjudande"},
          "q2_customization": {"score": 6, "comment": "Anpassade pitch till kundens behov"},
          "q3_proof_points": {"score": 5, "comment": "Använde referenskunder"},
          "q4_differentiation": {"score": 7, "comment": "Skilde sig från konkurrenter"},
          "q5_engagement": {"score": 6, "comment": "Kontrollerade kundens intresse"}
        },
        "objection_handling": {
          "q1_acknowledge": {"score": 7, "comment": "Bekräftade invändningen"},
          "q2_clarify": {"score": 6, "comment": "Ställde följdfråga"},
          "q3_respond": {"score": 5, "comment": "Svarade med relevant argument"},
          "q4_confirm": {"score": 7, "comment": "Bekräftade att invändningen var hanterad"},
          "q5_pivot": {"score": 6, "comment": "Styrde tillbaka till värde"}
        },
        "closing": {
          "q1_summary": {"score": 7, "comment": "Sammanfattade samtalet"},
          "q2_next_step": {"score": 8, "comment": "Föreslog tydligt nästa steg"},
          "q3_commitment": {"score": 6, "comment": "Fick verbalt åtagande"},
          "q4_timeline": {"score": 5, "comment": "Satte tidslinje"},
          "q5_professional_end": {"score": 7, "comment": "Avslutade professionellt"}
        }
      },
      "score": {
        "opening": {"score": 6, "comment": "Sammanfattande bedömning av öppningen"},
        "needs_discovery": {"score": 6, "comment": "Sammanfattande bedömning av behovsanalys"},
        "pitch": {"score": 6, "comment": "Sammanfattande bedömning av pitch"},
        "objection_handling": {"score": 6, "comment": "Sammanfattande bedömning av invändningshantering"},
        "closing": {"score": 7, "comment": "Sammanfattande bedömning av avslut"},
        "overall": 6,
        "top_feedback": "Sammanfattande coaching med specifika citat från samtalet."
      },
      "summary": "2-3 meningar som sammanfattar samtalet och utfallet",
      "customer_needs": ["konkret behov 1", "konkret behov 2"],
      "objections": ["invändning 1"],
      "positive_signals": ["positiv signal 1"],
      "action_items": ["nästa steg 1", "nästa steg 2"],
      "keywords": {
        "competitors": [{"name": "Företag X", "timestamp": "02:15"}],
        "buying_signals": [{"signal": "vi är intresserade", "timestamp": "05:30"}],
        "red_flags": [{"flag": "vi har redan en leverantör", "timestamp": "01:45"}]
      }
    }

    Poäng 1-10 där 10 är perfekt. Var ärlig och konstruktiv. Citera specifika delar av samtalet.
    Fältet "score" är för bakåtkompatibilitet — fyll i det också med kategorisnitt.
    Svara BARA med JSON, inget annat.
    """
  end

  # ---------------------------------------------------------------------------
  # Build raw text from utterances
  # ---------------------------------------------------------------------------

  defp build_raw_text(%{"utterances" => utterances}) when is_list(utterances) do
    utterances
    |> Enum.map(fn u ->
      speaker = if u["speaker"] == "A", do: "Säljare", else: "Kund"
      "#{speaker}: #{u["text"]}"
    end)
    |> Enum.join("\n")
  end

  defp build_raw_text(%{"text" => text}), do: text
  defp build_raw_text(_), do: ""

  # ---------------------------------------------------------------------------
  # Scorecard average
  # ---------------------------------------------------------------------------

  defp calculate_scorecard_avg(nil), do: nil

  defp calculate_scorecard_avg(scorecard) when is_map(scorecard) do
    scores =
      scorecard
      |> Enum.flat_map(fn {_category, questions} ->
        if is_map(questions) do
          questions
          |> Enum.map(fn {_q, %{"score" => s}} -> s end)
          |> Enum.filter(&is_number/1)
        else
          []
        end
      end)

    case scores do
      [] -> nil
      list -> Float.round(Enum.sum(list) / length(list), 1)
    end
  end

  defp calculate_scorecard_avg(_), do: nil

  # ---------------------------------------------------------------------------
  # Build unified analysis (bakåtkompatibelt)
  # ---------------------------------------------------------------------------

  defp build_unified_analysis(analysis, result, talk_ratio) do
    voicemail = analysis["voicemail"] == true

    if voicemail do
      %{"voicemail" => true, "summary" => "Telefonsvarare/röstbrevlåda"}
    else
      analysis
      |> Map.put("talk_ratio", talk_ratio)
      |> Map.put("assemblyai_summary", result["summary"])
      |> Map.put("chapters", result["auto_chapters_result"])
      |> Map.put("entities", result["entities"])
    end
  end

  # ---------------------------------------------------------------------------
  # Storage
  # ---------------------------------------------------------------------------

  defp get_recording(phone_call_id) do
    case Saleflow.Repo.query(
           "SELECT recording_key FROM phone_calls WHERE id = $1 AND recording_key IS NOT NULL",
           [Ecto.UUID.dump!(phone_call_id)]
         ) do
      {:ok, %{rows: [[key]]}} -> {:ok, key}
      _ -> {:error, :no_recording}
    end
  end

  defp save(phone_call_id, fields) do
    analysis_json = Jason.encode!(fields.transcription_analysis)

    Saleflow.Repo.query(
      """
      UPDATE phone_calls SET
        transcription = $1,
        transcription_analysis = $2,
        call_summary = $3,
        assemblyai_transcript_id = $4,
        talk_ratio_seller = $5,
        sentiment = $6,
        scorecard_avg = $7
      WHERE id = $8
      """,
      [
        fields.transcription,
        analysis_json,
        fields.call_summary,
        fields.assemblyai_transcript_id,
        fields.talk_ratio_seller,
        fields.sentiment,
        fields.scorecard_avg,
        Ecto.UUID.dump!(phone_call_id)
      ]
    )
  end

  # ---------------------------------------------------------------------------
  # Call topics extraction
  # ---------------------------------------------------------------------------

  def save_call_topics(phone_call_id, analysis) do
    keywords = analysis["keywords"] || %{}

    topics =
      extract_topic_list(keywords["competitors"], "competitor") ++
        extract_topic_list(keywords["buying_signals"], "buying_signal") ++
        extract_topic_list(keywords["red_flags"], "red_flag") ++
        extract_objections(analysis["objections"])

    Enum.each(topics, fn topic ->
      Saleflow.Repo.query(
        """
        INSERT INTO call_topics (id, phone_call_id, topic_type, keyword, context, timestamp_seconds, sentiment, inserted_at, updated_at)
        VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, NOW(), NOW())
        """,
        [
          Ecto.UUID.dump!(phone_call_id),
          topic.type,
          topic.keyword,
          topic.context,
          topic.timestamp,
          topic.sentiment
        ]
      )
    end)
  end

  def extract_topic_list(nil, _type), do: []

  def extract_topic_list(items, type) when is_list(items) do
    Enum.map(items, fn item ->
      %{
        type: type,
        keyword: item["keyword"] || item["name"] || item["signal"] || item["flag"] || "",
        context: item["context"] || "",
        timestamp: parse_timestamp(item["timestamp"]),
        sentiment: nil
      }
    end)
  end

  def extract_topic_list(_, _), do: []

  def extract_objections(nil), do: []

  def extract_objections(objections) when is_list(objections) do
    Enum.map(objections, fn obj ->
      %{type: "objection", keyword: to_string(obj), context: nil, timestamp: nil, sentiment: "negative"}
    end)
  end

  def extract_objections(_), do: []

  def parse_timestamp(nil), do: nil
  def parse_timestamp(ts) when is_integer(ts), do: ts

  def parse_timestamp(ts) when is_binary(ts) do
    case Integer.parse(ts) do
      {n, _} -> n
      :error -> nil
    end
  end

  def parse_timestamp(_), do: nil

  # ---------------------------------------------------------------------------
  # Configurable client (for Mox)
  # ---------------------------------------------------------------------------

  defp assemblyai_client do
    Application.get_env(:saleflow, :assemblyai_client, Saleflow.AssemblyAI.Client)
  end
end
