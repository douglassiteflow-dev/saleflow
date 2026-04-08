defmodule Saleflow.Sales.Meeting do
  @moduledoc """
  Meeting resource for Saleflow.

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

    attribute :duration_minutes, :integer do
      allow_nil? false
      default 30
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

    attribute :reminded_at, :utc_datetime_usec do
      allow_nil? true
      public? true
    end

    attribute :teams_join_url, :string do
      allow_nil? true
      public? true
    end

    attribute :teams_event_id, :string do
      allow_nil? true
      public? true
    end

    attribute :attendee_email, :string do
      allow_nil? true
      public? true
    end

    attribute :attendee_name, :string do
      allow_nil? true
      public? true
    end

    attribute :deal_id, :uuid do
      allow_nil? true
      public? true
    end

    attribute :demo_config_id, :uuid do
      allow_nil? true
      public? true
    end

    create_timestamp :inserted_at
    update_timestamp :updated_at
  end

  relationships do
    belongs_to :demo_config, Saleflow.Sales.DemoConfig do
      define_attribute? false
      source_attribute :demo_config_id
      destination_attribute :id
      allow_nil? true
    end
  end

  actions do
    defaults [:read]

    create :create do
      description "Create a new meeting for a lead"
      accept [:lead_id, :user_id, :title, :meeting_date, :meeting_time, :notes, :duration_minutes, :attendee_email, :attendee_name, :deal_id, :demo_config_id]

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

    update :mark_reminded do
      description "Set reminded_at to now"
      require_atomic? false

      change fn changeset, _context ->
        Ash.Changeset.force_change_attribute(changeset, :reminded_at, DateTime.utc_now())
      end
    end

    update :update do
      description "Update meeting fields (date, time, notes, status)"
      require_atomic? false
      accept [:meeting_date, :meeting_time, :notes, :status, :deal_id, :demo_config_id]

      change {Saleflow.Audit.Changes.CreateAuditLog, action: "meeting.updated"}
    end

    update :update_teams do
      description "Set Teams meeting fields"
      require_atomic? false
      accept [:teams_join_url, :teams_event_id, :attendee_email, :attendee_name]
    end
  end
end
