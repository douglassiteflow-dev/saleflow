defmodule Saleflow.Repo.Migrations.AddTelavoxIntegrationFields do
  use Ecto.Migration

  def change do
    alter table(:users) do
      add :telavox_token, :text
    end

    alter table(:phone_calls) do
      add :recording_key, :text
      add :recording_id, :text
      add :telavox_call_id, :text
      add :direction, :text
    end

    create index(:phone_calls, [:recording_id])
    create index(:phone_calls, [:telavox_call_id])
  end
end
