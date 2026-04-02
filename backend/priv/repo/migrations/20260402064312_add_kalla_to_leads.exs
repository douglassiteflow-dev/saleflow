defmodule Saleflow.Repo.Migrations.AddKallaToLeads do
  use Ecto.Migration

  def up do
    alter table(:leads) do
      add :källa, :text
    end
  end

  def down do
    alter table(:leads) do
      remove :källa
    end
  end
end
