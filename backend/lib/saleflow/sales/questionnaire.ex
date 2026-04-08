defmodule Saleflow.Sales.Questionnaire do
  use Ash.Resource,
    data_layer: AshPostgres.DataLayer,
    domain: Saleflow.Sales

  postgres do
    table "questionnaires"
    repo Saleflow.Repo
  end

  attributes do
    uuid_primary_key :id

    attribute :deal_id, :uuid do
      allow_nil? true
      public? true
    end

    attribute :token, :string do
      allow_nil? false
      public? true
    end

    attribute :status, :atom do
      constraints one_of: [:pending, :in_progress, :completed]
      default :pending
      allow_nil? false
      public? true
    end

    attribute :customer_email, :string do
      allow_nil? false
      public? true
    end

    attribute :capacity, :string do
      allow_nil? true
      public? true
    end

    attribute :color_theme, :string do
      allow_nil? true
      public? true
    end

    attribute :services_text, :string do
      allow_nil? true
      public? true
    end

    attribute :services_file_url, :string do
      allow_nil? true
      public? true
    end

    attribute :custom_changes, :string do
      allow_nil? true
      public? true
    end

    attribute :wants_ads, :boolean do
      allow_nil? true
      public? true
    end

    attribute :most_profitable_service, :string do
      allow_nil? true
      public? true
    end

    attribute :wants_quote_generator, :boolean do
      allow_nil? true
      public? true
    end

    attribute :addon_services, {:array, :string} do
      default []
      allow_nil? false
      public? true
    end

    attribute :media_urls, {:array, :string} do
      default []
      allow_nil? false
      public? true
    end

    attribute :completed_at, :utc_datetime_usec do
      allow_nil? true
      public? true
    end

    create_timestamp :inserted_at
    update_timestamp :updated_at
  end

  actions do
    defaults [:read]

    create :create do
      description "Create a questionnaire for a deal"
      accept [:deal_id, :customer_email, :token]
      change {Saleflow.Audit.Changes.CreateAuditLog, action: "questionnaire.created"}
    end

    update :save_answers do
      description "Autosave questionnaire answers"
      require_atomic? false
      accept [
        :capacity, :color_theme, :services_text, :services_file_url,
        :custom_changes, :wants_ads, :most_profitable_service,
        :wants_quote_generator, :addon_services, :media_urls
      ]

      change fn changeset, _context ->
        current = Ash.Changeset.get_attribute(changeset, :status)
        if current == :pending do
          Ash.Changeset.force_change_attribute(changeset, :status, :in_progress)
        else
          changeset
        end
      end
    end

    update :complete do
      description "Mark questionnaire as completed"
      require_atomic? false

      change fn changeset, _context ->
        changeset
        |> Ash.Changeset.force_change_attribute(:status, :completed)
        |> Ash.Changeset.force_change_attribute(:completed_at, DateTime.utc_now())
      end

      change {Saleflow.Audit.Changes.CreateAuditLog, action: "questionnaire.completed"}
    end
  end
end
