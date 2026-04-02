defmodule Saleflow.Accounts.PasswordResetToken do
  @moduledoc """
  PasswordResetToken resource for SaleFlow.

  Stores password reset tokens sent via email. Each token is valid for
  1 hour and can only be used once. Using a token invalidates all active
  sessions for the user (forcing re-login everywhere).
  """

  use Ash.Resource,
    data_layer: AshPostgres.DataLayer,
    domain: Saleflow.Accounts

  postgres do
    table "password_reset_tokens"
    repo Saleflow.Repo
  end

  attributes do
    uuid_primary_key :id

    attribute :user_id, :uuid do
      allow_nil? false
      public? true
    end

    attribute :token, :string do
      allow_nil? false
      public? true
    end

    attribute :expires_at, :utc_datetime_usec do
      allow_nil? false
      public? true
    end

    attribute :used_at, :utc_datetime_usec do
      allow_nil? true
      public? true
    end

    create_timestamp :inserted_at
  end

  identities do
    identity :unique_token, [:token]
  end

  actions do
    defaults [:read]

    create :create do
      description "Create a new password reset token"
      accept [:user_id]

      change fn changeset, _context ->
        token = :crypto.strong_rand_bytes(32) |> Base.url_encode64(padding: false)
        expires_at = DateTime.add(DateTime.utc_now(), 3600, :second)

        changeset
        |> Ash.Changeset.force_change_attribute(:token, token)
        |> Ash.Changeset.force_change_attribute(:expires_at, expires_at)
      end
    end

    update :mark_used do
      description "Mark a password reset token as used"
      require_atomic? false

      change fn changeset, _context ->
        Ash.Changeset.force_change_attribute(changeset, :used_at, DateTime.utc_now())
      end
    end
  end
end
