defmodule Saleflow.Repo.Migrations.AddSourceTypeToDemoConfigsAndGenerationJobs do
  use Ecto.Migration

  def change do
    alter table(:demo_configs) do
      add :source_type, :string, default: "bokadirekt"
      add :source_text, :text
    end

    alter table(:generation_jobs) do
      add :source_type, :string, default: "bokadirekt"
      add :source_text, :text
    end
  end
end
