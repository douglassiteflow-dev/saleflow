defmodule Saleflow.Repo.Migrations.AddRetryCountToGenerationJobs do
  use Ecto.Migration

  def up do
    alter table(:generation_jobs) do
      add :retry_count, :integer, null: false, default: 0
    end
  end

  def down do
    alter table(:generation_jobs) do
      remove :retry_count
    end
  end
end
