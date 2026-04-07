defmodule Saleflow.Repo.Migrations.CreateDemoConfigs do
  use Ecto.Migration

  def change do
    create table(:demo_configs, primary_key: false) do
      add :id, :uuid, primary_key: true, default: fragment("gen_random_uuid()")
      add :lead_id, references(:leads, type: :uuid, on_delete: :nothing), null: false
      add :user_id, references(:users, type: :uuid, on_delete: :nothing), null: false
      add :stage, :string, null: false, default: "meeting_booked"
      add :source_url, :string
      add :website_path, :string
      add :preview_url, :string
      add :notes, :text
      add :error, :text

      timestamps(type: :utc_datetime)
    end

    create index(:demo_configs, [:lead_id])
    create index(:demo_configs, [:user_id])
    create index(:demo_configs, [:stage])

    alter table(:meetings) do
      add :demo_config_id, references(:demo_configs, type: :uuid, on_delete: :nilify_all)
    end

    create index(:meetings, [:demo_config_id])
  end
end
