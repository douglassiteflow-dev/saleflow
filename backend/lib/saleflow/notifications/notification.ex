defmodule Saleflow.Notifications.Notification do
  @moduledoc """
  Notification resource for Saleflow.

  Stores in-app notifications for users. Each notification has a type,
  title, optional body, and optional reference to the resource it relates to.
  Notifications can be marked as read via the `:mark_read` action.
  """

  use Ash.Resource,
    data_layer: AshPostgres.DataLayer,
    domain: Saleflow.Sales

  postgres do
    table "notifications"
    repo Saleflow.Repo
  end

  attributes do
    uuid_primary_key :id

    attribute :user_id, :uuid do
      allow_nil? false
      public? true
    end

    attribute :type, :string do
      allow_nil? false
      public? true
    end

    attribute :title, :string do
      allow_nil? false
      public? true
    end

    attribute :body, :string do
      allow_nil? true
      public? true
    end

    attribute :resource_type, :string do
      allow_nil? true
      public? true
    end

    attribute :resource_id, :uuid do
      allow_nil? true
      public? true
    end

    attribute :read_at, :utc_datetime_usec do
      allow_nil? true
      public? true
    end

    create_timestamp :inserted_at
  end

  actions do
    defaults [:read]

    create :create do
      accept [:user_id, :type, :title, :body, :resource_type, :resource_id]
    end

    update :mark_read do
      require_atomic? false

      change fn changeset, _context ->
        Ash.Changeset.force_change_attribute(changeset, :read_at, DateTime.utc_now())
      end
    end

    read :for_user do
      argument :user_id, :uuid, allow_nil?: false
      filter expr(user_id == ^arg(:user_id))
      prepare build(sort: [inserted_at: :desc], limit: 50)
    end

    read :unread_for_user do
      argument :user_id, :uuid, allow_nil?: false
      filter expr(user_id == ^arg(:user_id) and is_nil(read_at))
      prepare build(sort: [inserted_at: :desc])
    end
  end
end
