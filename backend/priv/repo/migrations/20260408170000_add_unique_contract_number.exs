defmodule Saleflow.Repo.Migrations.AddUniqueContractNumber do
  use Ecto.Migration

  def change do
    drop index(:contracts, [:contract_number])
    create_if_not_exists unique_index(:contracts, [:contract_number])
  end
end
