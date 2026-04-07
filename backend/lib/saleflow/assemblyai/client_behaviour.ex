defmodule Saleflow.AssemblyAI.ClientBehaviour do
  @moduledoc "Behaviour for AssemblyAI API client, enabling test mocking."

  @callback transcribe(audio_url :: String.t(), opts :: map()) ::
              {:ok, String.t()} | {:error, term()}
  @callback get_transcript(transcript_id :: String.t()) ::
              {:ok, map()} | {:error, term()}
  @callback lemur_task(transcript_ids :: [String.t()], prompt :: String.t(), opts :: map()) ::
              {:ok, map()} | {:error, term()}
end
