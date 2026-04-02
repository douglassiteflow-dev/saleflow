defmodule Saleflow.Repo.Migrations.AddPerformanceIndexes do
  use Ecto.Migration

  def up do
    create_if_not_exists index(:leads, [:status])
    create_if_not_exists index(:leads, [:lead_list_id])
    create_if_not_exists index(:leads, [:telefon], unique: true)
    create_if_not_exists index(:assignments, [:user_id, :released_at])
    create_if_not_exists index(:assignments, [:lead_id, :released_at])
    create_if_not_exists index(:call_logs, [:lead_id])
    create_if_not_exists index(:call_logs, [:user_id])
    create_if_not_exists index(:meetings, [:user_id, :status, :meeting_date])
    create_if_not_exists index(:audit_logs, [:user_id])
    create_if_not_exists index(:audit_logs, [:resource_type, :resource_id])
  end

  def down do
    drop_if_exists index(:leads, [:status])
    drop_if_exists index(:leads, [:lead_list_id])
    drop_if_exists index(:leads, [:telefon])
    drop_if_exists index(:assignments, [:user_id, :released_at])
    drop_if_exists index(:assignments, [:lead_id, :released_at])
    drop_if_exists index(:call_logs, [:lead_id])
    drop_if_exists index(:call_logs, [:user_id])
    drop_if_exists index(:meetings, [:user_id, :status, :meeting_date])
    drop_if_exists index(:audit_logs, [:user_id])
    drop_if_exists index(:audit_logs, [:resource_type, :resource_id])
  end
end
