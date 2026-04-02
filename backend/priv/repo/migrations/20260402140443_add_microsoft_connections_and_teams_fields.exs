defmodule Saleflow.Repo.Migrations.AddMicrosoftConnectionsAndTeamsFields do
  use Ecto.Migration

  def change do
    create table(:microsoft_connections, primary_key: false) do
      add :id, :uuid, primary_key: true, default: fragment("gen_random_uuid()")
      add :user_id, references(:users, type: :uuid, on_delete: :delete_all), null: false
      add :microsoft_user_id, :string, null: false
      add :email, :string, null: false
      add :access_token, :text, null: false
      add :refresh_token, :text, null: false
      add :token_expires_at, :utc_datetime_usec, null: false

      timestamps(type: :utc_datetime_usec)
    end

    create unique_index(:microsoft_connections, [:user_id])
    create index(:microsoft_connections, [:microsoft_user_id])

    alter table(:meetings) do
      add :teams_join_url, :text
      add :teams_event_id, :string
    end
  end
end
