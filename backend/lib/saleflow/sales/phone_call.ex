defmodule Saleflow.Sales.PhoneCall do
  @moduledoc """
  PhoneCall resource for SaleFlow.

  Records actual phone calls received from the Telavox webhook. Unlike CallLog
  (which tracks agent-initiated call attempts and their outcomes), PhoneCall
  captures raw telephony data — caller, callee, duration, etc.
  """

  use Ash.Resource,
    data_layer: AshPostgres.DataLayer,
    domain: Saleflow.Sales

  postgres do
    table "phone_calls"
    repo Saleflow.Repo
  end

  attributes do
    uuid_primary_key :id

    attribute :lead_id, :uuid do
      allow_nil? true
      public? true
    end

    attribute :user_id, :uuid do
      allow_nil? true
      public? true
    end

    attribute :caller, :string do
      allow_nil? false
      public? true
    end

    attribute :callee, :string do
      allow_nil? false
      public? true
    end

    attribute :duration, :integer do
      allow_nil? false
      default 0
      public? true
    end

    attribute :call_log_id, :uuid do
      allow_nil? true
      public? true
    end

    attribute :received_at, :utc_datetime_usec do
      allow_nil? false
      public? true
    end

    create_timestamp :inserted_at
  end

  actions do
    defaults [:read]

    create :create do
      description "Record a phone call from Telavox webhook"
      accept [:lead_id, :user_id, :caller, :callee, :duration, :call_log_id]

      change fn changeset, _context ->
        Ash.Changeset.force_change_attribute(changeset, :received_at, DateTime.utc_now())
      end
    end
  end
end
