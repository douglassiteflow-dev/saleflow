defmodule Saleflow.Repo.Migrations.CreateContacts do
  use Ecto.Migration

  def change do
    create_if_not_exists table(:contacts, primary_key: false) do
      add :id, :uuid, primary_key: true, default: fragment("gen_random_uuid()")
      add :lead_id, references(:leads, type: :uuid, on_delete: :delete_all), null: false
      add :name, :string, null: false
      add :role, :string
      add :phone, :string
      add :email, :string

      timestamps(type: :utc_datetime)
    end

    create_if_not_exists index(:contacts, [:lead_id])
  end
end
