defmodule Saleflow.Repo.Migrations.FixTelefonUniqueIndex do
  use Ecto.Migration

  @doc """
  Drops any existing telefon index (which may have been created as UNIQUE
  by AshPostgres snapshots) and recreates it as a plain non-unique index.
  """
  def change do
    drop_if_exists index(:leads, [:telefon], name: "leads_telefon_index")
    create index(:leads, [:telefon])
  end
end
