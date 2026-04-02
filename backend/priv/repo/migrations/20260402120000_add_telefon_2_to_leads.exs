defmodule Saleflow.Repo.Migrations.AddTelefon2ToLeads do
  use Ecto.Migration

  def change do
    alter table(:leads) do
      add :telefon_2, :string
    end
  end
end
