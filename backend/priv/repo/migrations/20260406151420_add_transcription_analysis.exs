defmodule Saleflow.Repo.Migrations.AddTranscriptionAnalysis do
  use Ecto.Migration

  def change do
    alter table(:phone_calls) do
      add :transcription_analysis, :text
    end
  end
end
