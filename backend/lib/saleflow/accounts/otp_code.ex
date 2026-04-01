defmodule Saleflow.Accounts.OtpCode do
  @moduledoc """
  OtpCode resource for SaleFlow.

  Stores one-time password codes used for email-based authentication.
  Each code is 6 digits, valid for 5 minutes, and can only be used once.

  Codes are invalidated (marked as used) when a new OTP is requested for
  the same user, or when they are successfully verified.
  """

  use Ash.Resource,
    data_layer: AshPostgres.DataLayer,
    domain: Saleflow.Accounts

  postgres do
    table "otp_codes"
    repo Saleflow.Repo
  end

  attributes do
    uuid_primary_key :id

    attribute :user_id, :uuid do
      allow_nil? false
      public? true
    end

    attribute :code, :string do
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

  actions do
    defaults [:read]

    create :create do
      description "Create a new OTP code for a user"
      accept [:user_id]

      change fn changeset, _context ->
        code = :rand.uniform(899_999) + 100_000 |> Integer.to_string()
        expires_at = DateTime.add(DateTime.utc_now(), 5 * 60, :second)

        changeset
        |> Ash.Changeset.force_change_attribute(:code, code)
        |> Ash.Changeset.force_change_attribute(:expires_at, expires_at)
      end

      change {Saleflow.Audit.Changes.CreateAuditLog, action: "otp.created"}
    end

    update :mark_used do
      description "Mark an OTP code as used"
      require_atomic? false

      change fn changeset, _context ->
        Ash.Changeset.force_change_attribute(changeset, :used_at, DateTime.utc_now())
      end

      change {Saleflow.Audit.Changes.CreateAuditLog, action: "otp.verified"}
    end
  end
end
