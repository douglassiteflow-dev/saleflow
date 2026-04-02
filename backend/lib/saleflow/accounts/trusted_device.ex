defmodule Saleflow.Accounts.TrustedDevice do
  @moduledoc """
  TrustedDevice resource for SaleFlow.

  Stores "remember me" tokens that allow users to skip OTP verification
  for 30 days. Each device is identified by a unique cryptographic token
  stored as an httpOnly cookie.
  """

  use Ash.Resource,
    data_layer: AshPostgres.DataLayer,
    domain: Saleflow.Accounts

  postgres do
    table "trusted_devices"
    repo Saleflow.Repo
  end

  attributes do
    uuid_primary_key :id

    attribute :user_id, :uuid do
      allow_nil? false
      public? true
    end

    attribute :device_token, :string do
      allow_nil? false
      public? true
    end

    attribute :device_name, :string do
      allow_nil? true
      public? true
    end

    attribute :expires_at, :utc_datetime_usec do
      allow_nil? false
      public? true
    end

    create_timestamp :inserted_at
  end

  identities do
    identity :unique_device_token, [:device_token]
  end

  actions do
    defaults [:read]

    create :create do
      description "Create a new trusted device"
      accept [:user_id, :device_name]

      change fn changeset, _context ->
        token = :crypto.strong_rand_bytes(32) |> Base.url_encode64(padding: false)
        expires_at = DateTime.add(DateTime.utc_now(), 30 * 24 * 3600, :second)

        changeset
        |> Ash.Changeset.force_change_attribute(:device_token, token)
        |> Ash.Changeset.force_change_attribute(:expires_at, expires_at)
      end
    end

    destroy :destroy do
      description "Delete a trusted device"
      primary? true
    end
  end
end
