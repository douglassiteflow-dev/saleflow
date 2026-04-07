defmodule Saleflow.AssemblyAI.Client do
  @moduledoc """
  HTTP client for the AssemblyAI API.

  Handles transcription requests, polling for completion, and LeMUR tasks.
  """

  @behaviour Saleflow.AssemblyAI.ClientBehaviour

  require Logger

  @base_url "https://api.assemblyai.com"
  @default_poll_interval_ms 3_000
  @max_poll_attempts 120

  # ---------------------------------------------------------------------------
  # Public API
  # ---------------------------------------------------------------------------

  @impl true
  @doc "Submit an audio URL for transcription with all features enabled."
  def transcribe(audio_url, opts \\ %{}) do
    body =
      %{
        audio_url: audio_url,
        speaker_labels: true,
        sentiment_analysis: true,
        entity_detection: true,
        iab_categories: true,
        auto_highlights: true,
        auto_chapters: true,
        summarization: true,
        summary_model: "informative",
        summary_type: "paragraph"
      }
      |> Map.merge(opts)

    case post("/v2/transcript", body) do
      {:ok, %{"id" => transcript_id}} -> {:ok, transcript_id}
      {:ok, body} -> {:error, {:unexpected_response, body}}
      {:error, _} = err -> err
    end
  end

  @impl true
  @doc "Get the current status/result of a transcript."
  def get_transcript(transcript_id) do
    get("/v2/transcript/#{transcript_id}")
  end

  @doc "Poll get_transcript every 3s until status is 'completed' or 'error'. Max 120 attempts."
  def poll_until_complete(transcript_id) do
    poll_until_complete(transcript_id, 0)
  end

  @impl true
  @doc "Submit a LeMUR task with transcript IDs and a prompt."
  def lemur_task(transcript_ids, prompt, opts \\ %{}) do
    body =
      %{
        transcript_ids: transcript_ids,
        prompt: prompt
      }
      |> Map.merge(opts)

    case post("/lemur/v3/generate/task", body) do
      {:ok, %{"response" => response_text} = resp} ->
        {:ok, Map.put(resp, "response", response_text)}

      {:ok, body} ->
        {:error, {:unexpected_response, body}}

      {:error, _} = err ->
        err
    end
  end

  # ---------------------------------------------------------------------------
  # Private helpers
  # ---------------------------------------------------------------------------

  defp poll_until_complete(_transcript_id, attempt) when attempt >= @max_poll_attempts do
    {:error, :timeout}
  end

  defp poll_until_complete(transcript_id, attempt) do
    case get_transcript(transcript_id) do
      {:ok, %{"status" => "completed"} = body} ->
        {:ok, body}

      {:ok, %{"status" => "error", "error" => error}} ->
        {:error, {:transcription_failed, error}}

      {:ok, %{"status" => status}} ->
        Logger.debug("AssemblyAI transcript #{transcript_id} status: #{status} (attempt #{attempt + 1})")
        Process.sleep(poll_interval_ms())
        poll_until_complete(transcript_id, attempt + 1)

      {:error, _} = err ->
        err
    end
  end

  defp get(path) do
    url = @base_url <> path
    extra = req_options()

    case Req.get(url, [headers: headers()] ++ extra) do
      {:ok, %{status: 200, body: body}} -> {:ok, body}
      {:ok, %{status: 401}} -> {:error, :unauthorized}
      {:ok, %{status: status, body: body}} -> {:error, {:http, status, body}}
      {:error, reason} -> {:error, reason}
    end
  end

  defp post(path, body) do
    url = @base_url <> path
    extra = req_options()

    case Req.post(url, [headers: headers(), json: body] ++ extra) do
      {:ok, %{status: 200, body: body}} -> {:ok, body}
      {:ok, %{status: 401}} -> {:error, :unauthorized}
      {:ok, %{status: status, body: body}} -> {:error, {:http, status, body}}
      {:error, reason} -> {:error, reason}
    end
  end

  defp headers do
    api_key = Application.get_env(:saleflow, :assemblyai_api_key, "")
    [{"authorization", api_key}, {"content-type", "application/json"}]
  end

  # Extra Req options injected at runtime — used to plug in Req.Test stubs during tests.
  defp req_options do
    Application.get_env(:saleflow, :assemblyai_req_options, [])
  end

  # Poll interval in ms — overridable via config for fast tests.
  defp poll_interval_ms do
    Application.get_env(:saleflow, :assemblyai_poll_interval_ms, @default_poll_interval_ms)
  end
end
