defmodule Saleflow.Sales.Contact do
  @moduledoc """
  Contact resource — stores additional contact persons (phone numbers,
  emails, roles) for a lead.

  Each lead can have many contacts (e.g. different people at the same company).
  """

  use Ash.Resource,
    data_layer: AshPostgres.DataLayer,
    domain: Saleflow.Sales

  postgres do
    table "contacts"
    repo Saleflow.Repo
  end

  attributes do
    uuid_primary_key :id

    attribute :lead_id, :uuid do
      allow_nil? false
      public? true
    end

    attribute :name, :string do
      allow_nil? false
      public? true
    end

    attribute :role, :string do
      allow_nil? true
      public? true
    end

    attribute :phone, :string do
      allow_nil? true
      public? true
    end

    attribute :email, :string do
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
  end

  actions do
    defaults [:read]

    create :create do
      description "Create a new contact for a lead"
      accept [:lead_id, :name, :role, :phone, :email]
    end

    destroy :destroy do
      description "Delete a contact"
      primary? true
    end
  end
end
