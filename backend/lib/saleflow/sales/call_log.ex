defmodule Saleflow.Sales.CallLog do
  @moduledoc """
  CallLog resource for Saleflow.

  Records every call attempt made by a sales agent against a lead. Capturing
  the outcome of each call drives the lead's workflow state.

  ## Outcomes

  - `:meeting_booked`  — the call resulted in a meeting being scheduled
  - `:callback`        — the prospect asked to be called back later
  - `:not_interested`  — the prospect explicitly declined
  - `:no_answer`       — no one picked up
  - `:bad_number`      — the number is unreachable / wrong
  - `:customer`        — the prospect is already a customer
  - `:other`           — any other outcome; use `notes` for details
  """

  use Ash.Resource,
    data_layer: AshPostgres.DataLayer,
    domain: Saleflow.Sales

  postgres do
    table "call_logs"
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

    attribute :outcome, :atom do
      constraints one_of: [:meeting_booked, :callback, :not_interested, :no_answer, :call_later, :bad_number, :customer, :other]
      allow_nil? false
      public? true
    end

    attribute :notes, :string do
      allow_nil? true
      public? true
    end

    attribute :called_at, :utc_datetime_usec do
      allow_nil? false
      public? true
    end
  end

  actions do
    defaults [:read]

    create :create do
      description "Log a call attempt against a lead"
      accept [:lead_id, :user_id, :outcome, :notes]

      change fn changeset, _context ->
        Ash.Changeset.force_change_attribute(changeset, :called_at, DateTime.utc_now())
      end

      change {Saleflow.Audit.Changes.CreateAuditLog, action: "call.logged"}
    end
  end
end
