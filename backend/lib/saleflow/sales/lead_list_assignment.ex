defmodule Saleflow.Sales.LeadListAssignment do
  @moduledoc """
  LeadListAssignment resource for SaleFlow.

  Maps which agents (users) have access to which lead lists.
  When an agent has one or more list assignments, the lead queue
  only returns leads from those assigned lists.
  """

  use Ash.Resource,
    data_layer: AshPostgres.DataLayer,
    domain: Saleflow.Sales

  postgres do
    table "lead_list_assignments"
    repo Saleflow.Repo
  end

  attributes do
    uuid_primary_key :id

    attribute :lead_list_id, :uuid do
      allow_nil? false
      public? true
    end

    attribute :user_id, :uuid do
      allow_nil? false
      public? true
    end

    create_timestamp :inserted_at
  end

  actions do
    defaults [:read, :destroy]

    create :create do
      description "Assign an agent to a lead list"
      accept [:lead_list_id, :user_id]
    end

    read :list_for_list do
      description "List all assignments for a given lead list"
      argument :lead_list_id, :uuid, allow_nil?: false

      filter expr(lead_list_id == ^arg(:lead_list_id))
    end

    read :list_for_user do
      description "List all assignments for a given user"
      argument :user_id, :uuid, allow_nil?: false

      filter expr(user_id == ^arg(:user_id))
    end
  end
end
