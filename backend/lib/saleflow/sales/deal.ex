defmodule Saleflow.Sales.Deal do
  @moduledoc """
  Deal resource — represents a customer journey through the sales pipeline.

  ## Stages (fixed order, cannot skip)

      meeting_booked → needs_website → generating_website → reviewing →
      deployed → demo_followup → contract_sent → signed → dns_launch → won
  """

  use Ash.Resource,
    data_layer: AshPostgres.DataLayer,
    domain: Saleflow.Sales

  @stages [
    :meeting_booked,
    :needs_website,
    :generating_website,
    :reviewing,
    :deployed,
    :demo_followup,
    :contract_sent,
    :signed,
    :dns_launch,
    :won
  ]

  def stages, do: @stages

  def next_stage(current) do
    idx = Enum.find_index(@stages, &(&1 == current))

    if idx && idx < length(@stages) - 1 do
      {:ok, Enum.at(@stages, idx + 1)}
    else
      {:error, :no_next_stage}
    end
  end

  postgres do
    table "deals"
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

    attribute :stage, :atom do
      constraints one_of: [
        :meeting_booked,
        :needs_website,
        :generating_website,
        :reviewing,
        :deployed,
        :demo_followup,
        :contract_sent,
        :signed,
        :dns_launch,
        :won,
        :cancelled
      ]
      default :meeting_booked
      allow_nil? false
      public? true
    end

    attribute :website_url, :string do
      allow_nil? true
      public? true
    end

    attribute :contract_url, :string do
      allow_nil? true
      public? true
    end

    attribute :domain, :string do
      allow_nil? true
      public? true
    end

    attribute :domain_sponsored, :boolean do
      default false
      allow_nil? false
      public? true
    end

    attribute :notes, :string do
      allow_nil? true
      public? true
    end

    create_timestamp :inserted_at
    update_timestamp :updated_at
  end

  actions do
    defaults [:read]

    create :create do
      description "Create a new deal for a lead"
      accept [:lead_id, :user_id, :notes]

      change {Saleflow.Audit.Changes.CreateAuditLog, action: "deal.created"}
    end

    update :advance do
      description "Advance the deal to the next pipeline stage"
      require_atomic? false

      change fn changeset, _context ->
        current = Ash.Changeset.get_attribute(changeset, :stage)

        case Saleflow.Sales.Deal.next_stage(current) do
          {:ok, next} ->
            Ash.Changeset.force_change_attribute(changeset, :stage, next)

          {:error, :no_next_stage} ->
            Ash.Changeset.add_error(changeset, field: :stage, message: "already at final stage")
        end
      end

      change {Saleflow.Audit.Changes.CreateAuditLog, action: "deal.advanced"}
    end

    update :cancel do
      description "Cancel a deal (e.g. when all meetings are cancelled)"
      require_atomic? false

      change fn changeset, _context ->
        Ash.Changeset.force_change_attribute(changeset, :stage, :cancelled)
      end

      change {Saleflow.Audit.Changes.CreateAuditLog, action: "deal.cancelled"}
    end

    update :update_fields do
      description "Update editable fields on a deal"
      require_atomic? false
      accept [:notes, :website_url, :contract_url, :domain, :domain_sponsored]

      change {Saleflow.Audit.Changes.CreateAuditLog, action: "deal.updated"}
    end
  end
end
