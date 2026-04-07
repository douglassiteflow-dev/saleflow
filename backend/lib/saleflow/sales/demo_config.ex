defmodule Saleflow.Sales.DemoConfig do
  @moduledoc """
  DemoConfig resource — tracks a demo website generation for a lead.

  ## Stages

      meeting_booked → generating → demo_ready → followup
                                                     ↘ cancelled (from any stage)
  """

  use Ash.Resource,
    data_layer: AshPostgres.DataLayer,
    domain: Saleflow.Sales

  postgres do
    table "demo_configs"
    repo Saleflow.Repo
  end

  attributes do
    uuid_primary_key :id

    attribute :lead_id, :uuid do
      allow_nil? false
      public? true
    end

    attribute :user_id, :uuid do
      allow_nil? false
      public? true
    end

    attribute :stage, :atom do
      constraints one_of: [
        :meeting_booked,
        :generating,
        :demo_ready,
        :followup,
        :cancelled
      ]
      default :meeting_booked
      allow_nil? false
      public? true
    end

    attribute :source_url, :string do
      allow_nil? true
      public? true
    end

    attribute :website_path, :string do
      allow_nil? true
      public? true
    end

    attribute :preview_url, :string do
      allow_nil? true
      public? true
    end

    attribute :notes, :string do
      allow_nil? true
      public? true
    end

    attribute :error, :string do
      allow_nil? true
      public? true
    end

    create_timestamp :inserted_at
    update_timestamp :updated_at
  end

  relationships do
    belongs_to :lead, Saleflow.Sales.Lead do
      define_attribute? false
      source_attribute :lead_id
      destination_attribute :id
    end

    belongs_to :user, Saleflow.Accounts.User do
      define_attribute? false
      source_attribute :user_id
      destination_attribute :id
    end

    has_many :meetings, Saleflow.Sales.Meeting do
      destination_attribute :demo_config_id
    end
  end

  actions do
    defaults [:read]

    create :create do
      description "Create a new demo config for a lead"
      accept [:lead_id, :user_id, :source_url, :notes]

      change {Saleflow.Audit.Changes.CreateAuditLog, action: "demo_config.created"}
    end

    update :start_generation do
      description "Transition from meeting_booked to generating"
      require_atomic? false

      change fn changeset, _context ->
        current = Ash.Changeset.get_attribute(changeset, :stage)

        if current == :meeting_booked do
          Ash.Changeset.force_change_attribute(changeset, :stage, :generating)
        else
          Ash.Changeset.add_error(changeset,
            field: :stage,
            message: "must be meeting_booked to start generation"
          )
        end
      end

      change {Saleflow.Audit.Changes.CreateAuditLog, action: "demo_config.generation_started"}
    end

    update :generation_complete do
      description "Transition from generating to demo_ready, saving website_path and preview_url"
      require_atomic? false
      accept [:website_path, :preview_url]

      change fn changeset, _context ->
        current = Ash.Changeset.get_attribute(changeset, :stage)

        if current == :generating do
          changeset
          |> Ash.Changeset.force_change_attribute(:stage, :demo_ready)
          |> Ash.Changeset.force_change_attribute(:error, nil)
        else
          Ash.Changeset.add_error(changeset,
            field: :stage,
            message: "must be generating to complete generation"
          )
        end
      end

      change {Saleflow.Audit.Changes.CreateAuditLog, action: "demo_config.generation_complete"}
    end

    update :generation_failed do
      description "Record a generation error, stage stays generating"
      require_atomic? false
      accept [:error]

      change fn changeset, _context ->
        current = Ash.Changeset.get_attribute(changeset, :stage)

        if current == :generating do
          changeset
        else
          Ash.Changeset.add_error(changeset,
            field: :stage,
            message: "must be generating to record failure"
          )
        end
      end

      change {Saleflow.Audit.Changes.CreateAuditLog, action: "demo_config.generation_failed"}
    end

    update :advance_to_followup do
      description "Transition from demo_ready to followup"
      require_atomic? false

      change fn changeset, _context ->
        current = Ash.Changeset.get_attribute(changeset, :stage)

        if current == :demo_ready do
          Ash.Changeset.force_change_attribute(changeset, :stage, :followup)
        else
          Ash.Changeset.add_error(changeset,
            field: :stage,
            message: "must be demo_ready to advance to followup"
          )
        end
      end

      change {Saleflow.Audit.Changes.CreateAuditLog, action: "demo_config.advanced_to_followup"}
    end

    update :cancel do
      description "Cancel a demo config (from any stage)"
      require_atomic? false

      change fn changeset, _context ->
        Ash.Changeset.force_change_attribute(changeset, :stage, :cancelled)
      end

      change {Saleflow.Audit.Changes.CreateAuditLog, action: "demo_config.cancelled"}
    end

    update :update_notes do
      description "Update notes on a demo config"
      require_atomic? false
      accept [:notes]

      change {Saleflow.Audit.Changes.CreateAuditLog, action: "demo_config.notes_updated"}
    end

    update :reset_for_retry do
      description "Clear error and reset stage to meeting_booked for retry"
      require_atomic? false

      change fn changeset, _context ->
        current = Ash.Changeset.get_attribute(changeset, :stage)

        if current == :generating do
          changeset
          |> Ash.Changeset.force_change_attribute(:stage, :meeting_booked)
          |> Ash.Changeset.force_change_attribute(:error, nil)
        else
          Ash.Changeset.add_error(changeset,
            field: :stage,
            message: "must be in generating stage to retry"
          )
        end
      end

      change {Saleflow.Audit.Changes.CreateAuditLog, action: "demo_config.reset_for_retry"}
    end
  end
end
