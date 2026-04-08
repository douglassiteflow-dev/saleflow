defmodule Saleflow.Repo.Migrations.CreateQuestionnaires do
  use Ecto.Migration

  def change do
    create_if_not_exists table(:questionnaire_templates, primary_key: false) do
      add :id, :uuid, primary_key: true
      add :name, :string, null: false
      add :questions, :map, default: %{}
      add :is_default, :boolean, default: false, null: false

      timestamps()
    end

    create_if_not_exists table(:questionnaires, primary_key: false) do
      add :id, :uuid, primary_key: true
      add :deal_id, references(:deals, type: :uuid, on_delete: :nilify_all)
      add :token, :string, null: false
      add :status, :string, default: "pending", null: false
      add :customer_email, :string, null: false
      add :capacity, :string
      add :color_theme, :string
      add :services_text, :text
      add :services_file_url, :string
      add :custom_changes, :text
      add :wants_ads, :boolean
      add :most_profitable_service, :string
      add :wants_quote_generator, :boolean
      add :addon_services, {:array, :string}, default: []
      add :media_urls, {:array, :string}, default: []
      add :completed_at, :utc_datetime_usec

      timestamps()
    end

    create_if_not_exists unique_index(:questionnaires, [:token])
    create_if_not_exists unique_index(:questionnaires, [:deal_id])
  end
end
