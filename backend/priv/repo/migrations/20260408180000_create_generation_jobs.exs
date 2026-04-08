defmodule Saleflow.Repo.Migrations.CreateGenerationJobs do
  use Ecto.Migration

  def change do
    create table(:generation_jobs, primary_key: false) do
      add :id, :uuid, primary_key: true
      add :deal_id, references(:deals, type: :uuid, on_delete: :nilify_all)
      add :demo_config_id, references(:demo_configs, type: :uuid, on_delete: :nilify_all)
      add :source_url, :string, null: false
      add :slug, :string, null: false
      add :status, :string, default: "pending", null: false
      add :result_url, :string
      add :error, :text
      add :picked_up_at, :utc_datetime_usec
      add :completed_at, :utc_datetime_usec

      timestamps()
    end

    create index(:generation_jobs, [:status])
    create index(:generation_jobs, [:deal_id])
  end
end
