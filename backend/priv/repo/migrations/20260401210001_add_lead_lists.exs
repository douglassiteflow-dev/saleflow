defmodule Saleflow.Repo.Migrations.AddLeadLists do
  use Ecto.Migration

  def change do
    create table(:lead_lists, primary_key: false) do
      add :id, :uuid, primary_key: true
      add :name, :string, null: false
      add :description, :string
      add :imported_at, :utc_datetime_usec
      add :total_count, :integer, default: 0, null: false
      add :status, :string, default: "active", null: false

      timestamps(type: :utc_datetime_usec)
    end

    create table(:lead_list_assignments, primary_key: false) do
      add :id, :uuid, primary_key: true
      add :lead_list_id, references(:lead_lists, type: :uuid, on_delete: :delete_all), null: false
      add :user_id, references(:users, type: :uuid, on_delete: :delete_all), null: false

      add :inserted_at, :utc_datetime_usec, null: false
    end

    create unique_index(:lead_list_assignments, [:lead_list_id, :user_id])
    create index(:lead_list_assignments, [:user_id])

    alter table(:leads) do
      add :lead_list_id, references(:lead_lists, type: :uuid, on_delete: :nilify_all)
    end

    create index(:leads, [:lead_list_id])
  end
end
