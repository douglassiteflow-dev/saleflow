defmodule Saleflow.Repo.Migrations.AddLeadIdAndTrackingToQuestionnaires do
  use Ecto.Migration

  def change do
    alter table(:questionnaires) do
      add :lead_id, :uuid
      add :opened_at, :utc_datetime_usec
      add :started_at, :utc_datetime_usec
    end

    create index(:questionnaires, [:lead_id])
  end
end
