defmodule Saleflow.Audit.AuditLog do
  @moduledoc """
  AuditLog resource for Saleflow.

  Records every mutating action across all domains for compliance and
  traceability. Each entry captures who did what to which resource and
  what specifically changed.
  """

  use Ash.Resource,
    data_layer: AshPostgres.DataLayer,
    domain: Saleflow.Audit

  postgres do
    table "audit_logs"
    repo Saleflow.Repo
  end

  attributes do
    uuid_primary_key :id

    attribute :user_id, :uuid do
      allow_nil? true
      public? true
    end

    attribute :action, :string do
      allow_nil? false
      public? true
    end

    attribute :resource_type, :string do
      allow_nil? false
      public? true
    end

    attribute :resource_id, :uuid do
      allow_nil? false
      public? true
    end

    attribute :changes, :map do
      default %{}
      allow_nil? false
      public? true
    end

    attribute :metadata, :map do
      default %{}
      allow_nil? false
      public? true
    end

    create_timestamp :inserted_at
  end

  actions do
    defaults [:read]

    create :create do
      description "Create an audit log entry"
      accept [:user_id, :action, :resource_type, :resource_id, :changes, :metadata]
    end

    read :list_for_resource do
      description "List audit logs for a specific resource, sorted by inserted_at desc"
      argument :resource_type, :string, allow_nil?: false
      argument :resource_id, :uuid, allow_nil?: false

      filter expr(resource_type == ^arg(:resource_type) and resource_id == ^arg(:resource_id))
      prepare build(sort: [inserted_at: :desc])
    end

    read :list_logs do
      description "List all audit logs with optional filters, sorted by inserted_at desc"
      argument :user_id, :uuid, allow_nil?: true
      argument :action, :string, allow_nil?: true

      filter expr(
        (is_nil(^arg(:user_id)) or user_id == ^arg(:user_id)) and
        (is_nil(^arg(:action)) or action == ^arg(:action))
      )

      prepare build(sort: [inserted_at: :desc])
    end
  end
end
