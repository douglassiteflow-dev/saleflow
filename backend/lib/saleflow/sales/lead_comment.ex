defmodule Saleflow.Sales.LeadComment do
  use Ash.Resource,
    data_layer: AshPostgres.DataLayer,
    domain: Saleflow.Sales

  postgres do
    table "lead_comments"
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

    attribute :text, :string do
      allow_nil? false
      public? true
    end

    create_timestamp :inserted_at
  end

  actions do
    defaults [:read]

    create :create do
      accept [:lead_id, :user_id, :text]
    end

    read :for_lead do
      argument :lead_id, :uuid, allow_nil?: false
      filter expr(lead_id == ^arg(:lead_id))
      prepare build(sort: [inserted_at: :desc])
    end
  end
end
