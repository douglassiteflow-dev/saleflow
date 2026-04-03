defmodule Saleflow.Sales.LeadList do
  @moduledoc """
  LeadList resource for Saleflow.

  Represents a named list of leads, typically created during an import.
  Lists can be assigned to specific agents via LeadListAssignment so that
  agents only see leads from their assigned lists.

  ## Status Flow

      :active → :paused → :completed
              ↔ :active
  """

  use Ash.Resource,
    data_layer: AshPostgres.DataLayer,
    domain: Saleflow.Sales

  postgres do
    table "lead_lists"
    repo Saleflow.Repo
  end

  attributes do
    uuid_primary_key :id

    attribute :name, :string do
      allow_nil? false
      public? true
    end

    attribute :description, :string do
      allow_nil? true
      public? true
    end

    attribute :imported_at, :utc_datetime_usec do
      allow_nil? true
      public? true
    end

    attribute :total_count, :integer do
      default 0
      allow_nil? false
      public? true
    end

    attribute :status, :atom do
      constraints one_of: [:active, :paused, :completed]
      default :active
      allow_nil? false
      public? true
    end

    create_timestamp :inserted_at
    update_timestamp :updated_at
  end

  actions do
    defaults [:read]

    create :create do
      description "Create a new lead list"
      accept [:name, :description]

      change fn changeset, _context ->
        Ash.Changeset.force_change_attribute(changeset, :imported_at, DateTime.utc_now())
      end

      change {Saleflow.Audit.Changes.CreateAuditLog, action: "lead_list.created"}
    end

    update :update do
      description "Update a lead list"
      require_atomic? false
      accept [:name, :description, :status]

      change {Saleflow.Audit.Changes.CreateAuditLog, action: "lead_list.updated"}
    end

    update :update_count do
      description "Update the total_count of a lead list"
      require_atomic? false
      accept [:total_count]
    end
  end
end
