defmodule Saleflow.Sales.Request do
  @moduledoc """
  Request resource for SaleFlow.

  Allows users (agents and admins) to submit bug reports or feature requests.
  Admins can update the status and add notes.
  """

  use Ash.Resource,
    data_layer: AshPostgres.DataLayer,
    domain: Saleflow.Sales

  postgres do
    table "requests"
    repo Saleflow.Repo
  end

  attributes do
    uuid_primary_key :id

    attribute :user_id, :uuid do
      allow_nil? false
      public? true
    end

    attribute :type, :atom do
      constraints one_of: [:bug, :feature]
      allow_nil? false
      public? true
    end

    attribute :description, :string do
      allow_nil? false
      public? true
    end

    attribute :status, :atom do
      constraints one_of: [:new, :in_progress, :done, :rejected]
      default :new
      allow_nil? false
      public? true
    end

    attribute :admin_notes, :string do
      allow_nil? true
      public? true
    end

    create_timestamp :inserted_at
    update_timestamp :updated_at
  end

  actions do
    defaults [:read]

    create :create do
      description "Submit a bug report or feature request"
      accept [:user_id, :type, :description]
    end

    update :update_status do
      description "Admin updates status and/or notes on a request"
      accept [:status, :admin_notes]
      require_atomic? false
    end

    read :list_all do
      description "List all requests sorted by inserted_at desc (admin)"
      prepare fn query, _context ->
        Ash.Query.sort(query, inserted_at: :desc)
      end
    end

    read :list_for_user do
      description "List requests for a specific user (agent sees own)"
      argument :user_id, :uuid, allow_nil?: false

      filter expr(user_id == ^arg(:user_id))

      prepare fn query, _context ->
        Ash.Query.sort(query, inserted_at: :desc)
      end
    end
  end
end
