defmodule Saleflow.Repo.Migrations.CreateLeadComments do
  use Ecto.Migration

  def change do
    create table(:lead_comments, primary_key: false) do
      add :id, :uuid, primary_key: true, default: fragment("gen_random_uuid()")
      add :lead_id, references(:leads, type: :uuid, on_delete: :delete_all), null: false
      add :user_id, references(:users, type: :uuid, on_delete: :delete_all), null: false
      add :text, :text, null: false
      add :inserted_at, :utc_datetime_usec, null: false, default: fragment("now()")
    end

    create index(:lead_comments, [:lead_id])
  end
end
