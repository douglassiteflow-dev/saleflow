defmodule Saleflow.Sales.Meeting do
  @moduledoc """
  Meeting resource for SaleFlow.

  Records a sales meeting booked against a lead. Meetings are created with
  status `:scheduled` and can be transitioned to `:completed` or `:cancelled`.

  ## Status

  - `:scheduled`  — the meeting is upcoming
  - `:completed`  — the meeting took place
  - `:cancelled`  — the meeting was cancelled before it happened
  """

  use Ash.Resource,
    data_layer: AshPostgres.DataLayer,
    domain: Saleflow.Sales

  postgres do
    table "meetings"
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

    attribute :title, :string do
      allow_nil? false
      public? true
    end

    attribute :meeting_date, :date do
      allow_nil? false
      public? true
    end

    attribute :meeting_time, :time do
      allow_nil? false
      public? true
    end

    attribute :notes, :string do
      allow_nil? true
      public? true
    end

    attribute :google_calendar_id, :string do
      allow_nil? true
      public? true
    end

    attribute :status, :atom do
      constraints one_of: [:scheduled, :completed, :cancelled]
      default :scheduled
      allow_nil? false
      public? true
    end

    create_timestamp :inserted_at
    update_timestamp :updated_at
  end

  actions do
    defaults [:read]

    create :create do
      description "Create a new meeting for a lead"
      accept [:lead_id, :user_id, :title, :meeting_date, :meeting_time, :notes]

      change {Saleflow.Audit.Changes.CreateAuditLog, action: "meeting.created"}
    end

    update :cancel do
      description "Cancel a scheduled meeting"
      require_atomic? false

      change fn changeset, _context ->
        Ash.Changeset.force_change_attribute(changeset, :status, :cancelled)
      end

      change {Saleflow.Audit.Changes.CreateAuditLog, action: "meeting.cancelled"}
    end

    update :complete do
      description "Mark a meeting as completed"
      require_atomic? false

      change fn changeset, _context ->
        Ash.Changeset.force_change_attribute(changeset, :status, :completed)
      end

      change {Saleflow.Audit.Changes.CreateAuditLog, action: "meeting.completed"}
    end
  end
end
