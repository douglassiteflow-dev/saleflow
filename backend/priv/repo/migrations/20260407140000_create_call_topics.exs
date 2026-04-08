defmodule Saleflow.Repo.Migrations.CreateCallTopics do
  use Ecto.Migration

  def change do
    create table(:call_topics, primary_key: false) do
      add :id, :uuid, primary_key: true, default: fragment("gen_random_uuid()")
      add :phone_call_id, references(:phone_calls, type: :uuid, on_delete: :delete_all), null: false
      add :topic_type, :string, null: false
      add :keyword, :string, null: false
      add :context, :text
      add :timestamp_seconds, :integer
      add :sentiment, :string
      timestamps(type: :utc_datetime)
    end

    create index(:call_topics, [:phone_call_id])
    create index(:call_topics, [:topic_type])
    create index(:call_topics, [:keyword])
  end
end
