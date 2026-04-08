defmodule Saleflow.Repo.Migrations.AddHealthScore do
  use Ecto.Migration

  def change do
    alter table(:demo_configs) do
      add :health_score, :integer
    end
  end
end
