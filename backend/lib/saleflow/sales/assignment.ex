defmodule Saleflow.Sales.Assignment do
  @moduledoc """
  Assignment resource for SaleFlow.

  Represents an assignment of a Lead to a User (sales agent). At any point in
  time a lead should have at most one *active* assignment — one where
  `released_at` is `nil`.

  ## Lifecycle

      :assign    → creates the assignment record
      :release   → sets released_at + release_reason

  ## Release reasons

  - `:outcome_logged` — agent logged a call outcome (meeting_booked, customer, etc.)
  - `:timeout`        — assignment expired (not actively released by agent)
  - `:manual`         — admin or agent manually released the assignment
  """

  use Ash.Resource,
    data_layer: AshPostgres.DataLayer,
    domain: Saleflow.Sales

  postgres do
    table "assignments"
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

    attribute :assigned_at, :utc_datetime_usec do
      allow_nil? false
      public? true
    end

    attribute :released_at, :utc_datetime_usec do
      allow_nil? true
      public? true
    end

    attribute :release_reason, :atom do
      constraints one_of: [:outcome_logged, :timeout, :manual]
      allow_nil? true
      public? true
    end
  end

  actions do
    defaults [:read]

    create :assign do
      description "Assign a lead to a user"
      accept [:lead_id, :user_id]

      change fn changeset, _context ->
        Ash.Changeset.force_change_attribute(changeset, :assigned_at, DateTime.utc_now())
      end

      change {Saleflow.Audit.Changes.CreateAuditLog, action: "assignment.created"}
    end

    update :release do
      description "Release an assignment, recording the reason"
      require_atomic? false
      accept [:release_reason]

      change fn changeset, _context ->
        Ash.Changeset.force_change_attribute(changeset, :released_at, DateTime.utc_now())
      end

      change {Saleflow.Audit.Changes.CreateAuditLog, action: "assignment.released"}
    end
  end
end
