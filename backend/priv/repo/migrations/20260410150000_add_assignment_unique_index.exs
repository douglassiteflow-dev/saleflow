defmodule Saleflow.Repo.Migrations.AddAssignmentUniqueIndex do
  use Ecto.Migration

  def up do
    create unique_index(:assignments, [:lead_id],
      name: :assignments_one_active_per_lead,
      where: "released_at IS NULL"
    )
  end

  def down do
    drop_if_exists index(:assignments, [:lead_id], name: :assignments_one_active_per_lead)
  end
end
