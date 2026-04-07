defmodule Saleflow.Repo.Migrations.AddAssemblyaiFields do
  use Ecto.Migration

  def change do
    alter table(:phone_calls) do
      add :call_summary, :text
      add :assemblyai_transcript_id, :string
      add :talk_ratio_seller, :integer
      add :sentiment, :string
      add :scorecard_avg, :float
    end

    execute(
      "CREATE INDEX idx_phone_calls_transcription_search ON phone_calls USING GIN (to_tsvector('swedish', COALESCE(transcription, '')))",
      "DROP INDEX idx_phone_calls_transcription_search"
    )
  end
end
