defmodule Saleflow.Apps.App do
  use Ash.Resource,
    data_layer: AshPostgres.DataLayer,
    domain: Saleflow.Apps

  postgres do
    table "apps"
    repo Saleflow.Repo
  end

  attributes do
    uuid_primary_key :id

    attribute :slug, :string do
      allow_nil? false
      public? true
    end

    attribute :name, :string do
      allow_nil? false
      public? true
    end

    attribute :description, :string do
      allow_nil? true
      public? true
    end

    attribute :long_description, :string do
      allow_nil? true
      public? true
    end

    attribute :icon, :string do
      allow_nil? true
      public? true
    end

    attribute :active, :boolean do
      default false
      allow_nil? false
      public? true
    end

    create_timestamp :inserted_at
    update_timestamp :updated_at
  end

  identities do
    identity :unique_slug, [:slug]
  end

  actions do
    defaults [:read]

    create :create do
      accept [:slug, :name, :description, :long_description, :icon, :active]
    end

    update :toggle do
      accept [:active]
    end

    read :by_slug do
      argument :slug, :string, allow_nil?: false
      get? true
      filter expr(slug == ^arg(:slug))
    end

    read :list_all do
      prepare build(sort: [name: :asc])
    end

    read :list_active do
      filter expr(active == true)
      prepare build(sort: [name: :asc])
    end
  end
end
