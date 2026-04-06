defmodule Saleflow.Apps.AppPermission do
  use Ash.Resource,
    data_layer: AshPostgres.DataLayer,
    domain: Saleflow.Apps

  postgres do
    table "app_permissions"
    repo Saleflow.Repo
  end

  attributes do
    uuid_primary_key :id

    attribute :app_id, :uuid do
      allow_nil? false
      public? true
    end

    attribute :user_id, :uuid do
      allow_nil? false
      public? true
    end

    create_timestamp :inserted_at
  end

  identities do
    identity :unique_app_user, [:app_id, :user_id]
  end

  actions do
    defaults [:read]

    create :create do
      accept [:app_id, :user_id]
    end

    destroy :destroy do
      primary? true
    end

    read :for_user do
      argument :user_id, :uuid, allow_nil?: false
      filter expr(user_id == ^arg(:user_id))
    end

    read :for_app do
      argument :app_id, :uuid, allow_nil?: false
      filter expr(app_id == ^arg(:app_id))
    end

    read :for_app_and_user do
      argument :app_id, :uuid, allow_nil?: false
      argument :user_id, :uuid, allow_nil?: false
      filter expr(app_id == ^arg(:app_id) and user_id == ^arg(:user_id))
    end
  end
end
