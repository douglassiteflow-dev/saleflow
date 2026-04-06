defmodule Saleflow.Repo.Migrations.CreatePlaybooks do
  use Ecto.Migration

  def change do
    create table(:playbooks, primary_key: false) do
      add :id, :uuid, primary_key: true
      add :name, :string, null: false
      add :opening, :text
      add :pitch, :text
      add :objections, :text
      add :closing, :text
      add :guidelines, :text
      add :active, :boolean, null: false, default: false

      timestamps(type: :utc_datetime_usec)
    end
  end
end
