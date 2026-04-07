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
  - `:skipped`         — the agent skipped the lead without calling
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
      constraints one_of: [:meeting_booked, :callback, :not_interested, :no_answer, :call_later, :bad_number, :customer, :skipped, :other]
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

      validate fn changeset, _context ->
        lead_id = Ash.Changeset.get_attribute(changeset, :lead_id)
        user_id = Ash.Changeset.get_attribute(changeset, :user_id)

        if lead_id && user_id do
          cutoff = DateTime.utc_now() |> DateTime.add(-20, :second)
          uid = Ecto.UUID.dump!(user_id)
          lid = Ecto.UUID.dump!(lead_id)

          case Saleflow.Repo.query(
                 "SELECT COUNT(*) FROM call_logs WHERE user_id = $1 AND lead_id = $2 AND called_at > $3",
                 [uid, lid, cutoff]
               ) do
            {:ok, %{rows: [[0]]}} -> :ok
            _ -> {:error, field: :lead_id, message: "Utfall redan loggat för denna kund"}
          end
        else
          :ok
        end
      end

      change {Saleflow.Audit.Changes.CreateAuditLog, action: "call.logged"}
    end
  end
end
