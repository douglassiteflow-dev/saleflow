defmodule Saleflow.Repo.Migrations.AddUniqueContractNumber do
  use Ecto.Migration

  def change do
    drop index(:contracts, [:contract_number])
    create unique_index(:contracts, [:contract_number])
  end
end
