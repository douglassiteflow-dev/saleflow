defmodule Saleflow.Accounts.MicrosoftConnection do
  @moduledoc """
  Stores Microsoft OAuth tokens for a user's Teams integration.
  One connection per user.
  """

  use Ash.Resource,
    data_layer: AshPostgres.DataLayer,
    domain: Saleflow.Accounts

  postgres do
    table "microsoft_connections"
    repo Saleflow.Repo
  end

  attributes do
    uuid_primary_key :id

    attribute :user_id, :uuid do
      allow_nil? false
      public? true
    end

    attribute :microsoft_user_id, :string do
      allow_nil? false
      public? true
    end

    attribute :email, :string do
      allow_nil? false
      public? true
    end

    attribute :access_token, :string do
      allow_nil? false
      public? true
    end

    attribute :refresh_token, :string do
      allow_nil? false
      public? true
    end

    attribute :token_expires_at, :utc_datetime_usec do
      allow_nil? false
      public? true
    end

    create_timestamp :inserted_at
    update_timestamp :updated_at
  end

  identities do
    identity :unique_user, [:user_id]
  end

  actions do
    defaults [:read, :destroy]

    create :create do
      accept [
        :user_id,
        :microsoft_user_id,
        :email,
        :access_token,
        :refresh_token,
        :token_expires_at
      ]
    end

    update :update_tokens do
      accept [:access_token, :refresh_token, :token_expires_at]
    end
  end
end
