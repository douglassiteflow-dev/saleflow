defmodule Saleflow.Sales.Quarantine do
  @moduledoc """
  Quarantine resource for SaleFlow.

  Records an explicit quarantine of a lead. When a lead is quarantined it is
  excluded from the call queue until `released_at` passes.

  `released_at` is auto-calculated as `quarantined_at + 7 days`. Both
  timestamps are set on create.
  """

  use Ash.Resource,
    data_layer: AshPostgres.DataLayer,
    domain: Saleflow.Sales

  postgres do
    table "quarantines"
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

    attribute :reason, :string do
      allow_nil? false
      public? true
    end

    attribute :quarantined_at, :utc_datetime_usec do
      allow_nil? false
      public? true
    end

    attribute :released_at, :utc_datetime_usec do
      allow_nil? false
      public? true
    end
  end

  actions do
    defaults [:read]

    create :create do
      description "Quarantine a lead for 7 days from now"
      accept [:lead_id, :user_id, :reason]

      change fn changeset, _context ->
        now = DateTime.utc_now()
        released = DateTime.add(now, 7, :day)

        changeset
        |> Ash.Changeset.force_change_attribute(:quarantined_at, now)
        |> Ash.Changeset.force_change_attribute(:released_at, released)
      end

      change {Saleflow.Audit.Changes.CreateAuditLog, action: "quarantine.created"}
    end
  end
end
