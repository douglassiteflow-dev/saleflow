defmodule Saleflow.Repo.Migrations.CreateDeals do
  use Ecto.Migration

  def change do
    create table(:deals, primary_key: false) do
      add :id, :uuid, primary_key: true
      add :lead_id, references(:leads, type: :uuid, on_delete: :restrict), null: false
      add :user_id, references(:users, type: :uuid, on_delete: :restrict), null: false
      add :stage, :string, null: false, default: "meeting_booked"
      add :website_url, :string
      add :contract_url, :string
      add :domain, :string
      add :domain_sponsored, :boolean, null: false, default: false
      add :notes, :text

      timestamps(type: :utc_datetime_usec)
    end

    create index(:deals, [:lead_id])
    create index(:deals, [:user_id])
    create index(:deals, [:stage])

    alter table(:meetings) do
      add :deal_id, references(:deals, type: :uuid, on_delete: :nilify_all)
    end

    create index(:meetings, [:deal_id])
  end
end
