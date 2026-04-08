defmodule Saleflow.Sales.QuestionnaireTemplate do
  use Ash.Resource,
    data_layer: AshPostgres.DataLayer,
    domain: Saleflow.Sales

  postgres do
    table "questionnaire_templates"
    repo Saleflow.Repo
  end

  attributes do
    uuid_primary_key :id

    attribute :name, :string do
      allow_nil? false
      public? true
    end

    attribute :questions, :map do
      default %{}
      allow_nil? false
      public? true
    end

    attribute :is_default, :boolean do
      default false
      allow_nil? false
      public? true
    end

    create_timestamp :inserted_at
    update_timestamp :updated_at
  end

  actions do
    defaults [:read]

    create :create do
      accept [:name, :questions, :is_default]
    end

    update :update do
      accept [:name, :questions, :is_default]
    end
  end
end
