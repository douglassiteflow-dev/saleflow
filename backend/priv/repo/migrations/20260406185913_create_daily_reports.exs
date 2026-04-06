defmodule Saleflow.Repo.Migrations.CreateDailyReports do
  use Ecto.Migration

  def change do
    create table(:daily_reports, primary_key: false) do
      add :id, :uuid, primary_key: true, default: fragment("gen_random_uuid()")
      add :date, :date, null: false
      add :report, :text, null: false
      add :inserted_at, :utc_datetime_usec, default: fragment("NOW()")
    end

    create unique_index(:daily_reports, [:date])
  end
end
