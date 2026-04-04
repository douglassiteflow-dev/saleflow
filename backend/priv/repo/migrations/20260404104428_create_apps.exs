defmodule Saleflow.Repo.Migrations.CreateApps do
  use Ecto.Migration

  def change do
    create table(:apps, primary_key: false) do
      add :id, :uuid, primary_key: true, default: fragment("gen_random_uuid()")
      add :slug, :text, null: false
      add :name, :text, null: false
      add :description, :text
      add :long_description, :text
      add :icon, :text
      add :active, :boolean, null: false, default: false
      timestamps()
    end

    create unique_index(:apps, [:slug])

    create table(:app_permissions, primary_key: false) do
      add :id, :uuid, primary_key: true, default: fragment("gen_random_uuid()")
      add :app_id, references(:apps, type: :uuid, on_delete: :delete_all), null: false
      add :user_id, references(:users, type: :uuid, on_delete: :delete_all), null: false
      add :inserted_at, :utc_datetime_usec, null: false, default: fragment("now()")
    end

    create unique_index(:app_permissions, [:app_id, :user_id])
    create index(:app_permissions, [:user_id])
  end
end
