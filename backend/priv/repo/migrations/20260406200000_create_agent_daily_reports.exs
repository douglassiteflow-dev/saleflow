defmodule Saleflow.Repo.Migrations.CreateAgentDailyReports do
  use Ecto.Migration

  def change do
    create table(:agent_daily_reports, primary_key: false) do
      add :id, :uuid, primary_key: true, default: fragment("gen_random_uuid()")
      add :user_id, references(:users, type: :uuid, on_delete: :delete_all), null: false
      add :date, :date, null: false
      add :report, :text, null: false
      add :score_avg, :float
      add :call_count, :integer
      add :inserted_at, :utc_datetime_usec, default: fragment("NOW()")
    end

    create unique_index(:agent_daily_reports, [:user_id, :date])
  end
end
