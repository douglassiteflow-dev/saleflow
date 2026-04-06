defmodule Saleflow.Workers.TranscriptionWorker do
  @moduledoc """
  Two-step call transcription:
  1. OpenAI Whisper → raw transcription
  2. Claude → structured analysis (speakers, summary, score, key info)

  Triggered for calls with outcome meeting_booked that have a recording.
  """

  use Oban.Worker, queue: :default, max_attempts: 3

  require Logger

  @impl Oban.Worker
  def perform(%Oban.Job{args: %{"phone_call_id" => phone_call_id}}) do
    with {:ok, recording_key} <- get_recording(phone_call_id),
         {:ok, mp3_data} <- download_from_r2(recording_key),
         {:ok, raw_text} <- whisper_transcribe(mp3_data),
         {:ok, analysis} <- claude_analyze(raw_text) do
      save(phone_call_id, raw_text, analysis)
      Logger.info("TranscriptionWorker: #{phone_call_id} done")
      :ok
    else
      {:error, :no_recording} ->
        Logger.info("TranscriptionWorker: #{phone_call_id} no recording, skipping")
        :ok

      {:error, reason} ->
        Logger.warning("TranscriptionWorker: #{phone_call_id} failed: #{inspect(reason)}")
        {:error, reason}
    end
  end

  # --- Step 1: Whisper ---

  defp whisper_transcribe(mp3_data) do
    api_key = Application.get_env(:saleflow, :openai_api_key, "")
    if api_key == "", do: throw({:error, "OPENAI_API_KEY not set"})

    boundary = "----Whisper#{:rand.uniform(999_999)}"

    body =
      "--#{boundary}\r\n" <>
        "Content-Disposition: form-data; name=\"file\"; filename=\"call.mp3\"\r\n" <>
        "Content-Type: audio/mpeg\r\n\r\n" <>
        mp3_data <>
        "\r\n--#{boundary}\r\n" <>
        "Content-Disposition: form-data; name=\"model\"\r\n\r\nwhisper-1\r\n" <>
        "--#{boundary}--\r\n"

    case Req.post("https://api.openai.com/v1/audio/transcriptions",
           body: body,
           headers: [
             {"authorization", "Bearer #{api_key}"},
             {"content-type", "multipart/form-data; boundary=#{boundary}"}
           ],
           receive_timeout: 120_000
         ) do
      {:ok, %{status: 200, body: %{"text" => text}}} -> {:ok, text}
      {:ok, %{status: s, body: b}} -> {:error, "Whisper #{s}: #{inspect(b)}"}
      {:error, reason} -> {:error, reason}
    end
  end

  # --- Step 2: Claude ---

  defp get_active_playbook do
    case Saleflow.Repo.query(
           "SELECT opening, pitch, objections, closing, guidelines FROM playbooks WHERE active = true LIMIT 1"
         ) do
      {:ok, %{rows: [[opening, pitch, objections, closing, guidelines]]}} ->
        %{opening: opening, pitch: pitch, objections: objections, closing: closing, guidelines: guidelines}

      _ ->
        nil
    end
  end

  defp playbook_prompt(nil), do: ""

  defp playbook_prompt(playbook) do
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

  defp claude_analyze(raw_text) do
    api_key = Application.get_env(:saleflow, :anthropic_api_key, "")
    if api_key == "", do: throw({:error, "ANTHROPIC_API_KEY not set"})

    playbook = get_active_playbook()

    prompt = """
    Du är en erfaren säljcoach som analyserar inspelade säljsamtal. Samtalet är mellan en säljare och en potentiell kund.
    #{playbook_prompt(playbook)}
    Här är den råa transkriptionen (kan innehålla felstavningar och grammatikfel från tal-till-text):
    ---
    #{raw_text}
    ---

    INSTRUKTIONER:
    1. Rätta ALL text grammatiskt. Fixa felstavningar, hörfel och tal-till-text-artefakter. Gör texten naturlig och lättläst men behåll innebörden och tonen exakt.
    2. Separera vem som pratar (säljare vs kund) baserat på kontext.
    3. Ge detaljerad feedback som CITERAR specifika delar av samtalet.

    Returnera EXAKT detta JSON-format (inget annat):
    {
      "conversation": [
        {"speaker": "Säljare", "text": "Grammatiskt korrekt text..."},
        {"speaker": "Kund", "text": "Grammatiskt korrekt text..."}
      ],
      "summary": "2-3 meningar som sammanfattar samtalet och utfallet",
      "meeting_time": "om ett möte bokades, exakt tid och datum som nämndes, annars null",
      "customer_needs": ["konkret behov som kunden uttryckte"],
      "objections": ["invändning kunden hade"],
      "positive_signals": ["positiva signaler från kunden, t.ex. 'vi är intresserade'"],
      "score": {
        "opening": {
          "score": 7,
          "comment": "Referera till exakt vad säljaren sa i öppningen och vad som var bra/dåligt. Citera."
        },
        "needs_discovery": {
          "score": 5,
          "comment": "Vilka frågor ställdes? Vilka missades? Citera specifika delar."
        },
        "pitch": {
          "score": 7,
          "comment": "Hur presenterades produkten? Kopplades den till kundens behov? Citera."
        },
        "objection_handling": {
          "score": 6,
          "comment": "Hur hanterades invändningar? Citera vad kunden sa och hur säljaren svarade."
        },
        "closing": {
          "score": 8,
          "comment": "Hur avslutades samtalet? Bokades nästa steg? Citera."
        },
        "overall": 7,
        "top_feedback": "Sammanfattande coaching: vad var bäst, vad ska förbättras till nästa samtal. Var specifik och referera till samtalet."
      }
    }

    Poäng 1-10 där 10 är perfekt. Var ärlig och konstruktiv. Svara BARA med JSON, inget annat.
    """

    body = Jason.encode!(%{
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      messages: [%{role: "user", content: prompt}]
    })

    case Req.post("https://api.anthropic.com/v1/messages",
           body: body,
           headers: [
             {"x-api-key", api_key},
             {"anthropic-version", "2023-06-01"},
             {"content-type", "application/json"}
           ],
           receive_timeout: 60_000
         ) do
      {:ok, %{status: 200, body: %{"content" => [%{"text" => text} | _]}}} ->
        case Jason.decode(text) do
          {:ok, analysis} -> {:ok, analysis}
          {:error, _} -> {:ok, %{"raw_analysis" => text}}
        end

      {:ok, %{status: s, body: b}} -> {:error, "Claude #{s}: #{inspect(b)}"}
      {:error, reason} -> {:error, reason}
    end
  end

  # --- Storage ---

  defp get_recording(phone_call_id) do
    case Saleflow.Repo.query(
           "SELECT recording_key FROM phone_calls WHERE id = $1 AND recording_key IS NOT NULL",
           [Ecto.UUID.dump!(phone_call_id)]
         ) do
      {:ok, %{rows: [[key]]}} -> {:ok, key}
      _ -> {:error, :no_recording}
    end
  end

  defp download_from_r2(key) do
    bucket = Application.get_env(:saleflow, :r2_bucket, "saleflow-inspelningar")

    case ExAws.S3.get_object(bucket, key) |> ExAws.request() do
      {:ok, %{body: data}} -> {:ok, data}
      {:error, reason} -> {:error, reason}
    end
  end

  defp save(phone_call_id, raw_text, analysis) do
    analysis_json = Jason.encode!(analysis)

    Saleflow.Repo.query(
      "UPDATE phone_calls SET transcription = $1, transcription_analysis = $2 WHERE id = $3",
      [raw_text, analysis_json, Ecto.UUID.dump!(phone_call_id)]
    )
  end
end
