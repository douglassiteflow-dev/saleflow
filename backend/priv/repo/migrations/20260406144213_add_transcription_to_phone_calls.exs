defmodule Saleflow.Repo.Migrations.AddTranscriptionToPhoneCalls do
  use Ecto.Migration

  def change do
    alter table(:phone_calls) do
      add :transcription, :text
      add :transcription_analysis, :text
      add :transcription_language, :string
    end
  end
end
