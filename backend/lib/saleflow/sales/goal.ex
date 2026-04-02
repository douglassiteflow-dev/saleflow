defmodule Saleflow.Sales.Goal do
  @moduledoc """
  Goal resource for SaleFlow.

  Represents performance targets (e.g. meetings per week, calls per day).
  Goals can be global, team-wide, or personal. When multiple goals exist
  for the same metric, priority is: admin-set personal > self-set personal > global.
  """

  use Ash.Resource,
    data_layer: AshPostgres.DataLayer,
    domain: Saleflow.Sales

  postgres do
    table "goals"
    repo Saleflow.Repo
  end

  attributes do
    uuid_primary_key :id

    attribute :scope, :atom do
      constraints one_of: [:global, :team, :personal]
      allow_nil? false
      public? true
    end

    attribute :metric, :atom do
      constraints one_of: [:meetings_per_week, :calls_per_day]
      allow_nil? false
      public? true
    end

    attribute :target_value, :integer do
      allow_nil? false
      public? true
    end

    attribute :user_id, :uuid do
      allow_nil? true
      public? true
    end

    attribute :set_by_id, :uuid do
      allow_nil? false
      public? true
    end

    attribute :active, :boolean do
      default true
      allow_nil? false
      public? true
    end

    attribute :period, :atom do
      constraints one_of: [:daily, :weekly]
      allow_nil? false
      public? true
    end

    create_timestamp :inserted_at
    update_timestamp :updated_at
  end

  actions do
    defaults [:read]

    create :create do
      description "Create a new goal"
      accept [:scope, :metric, :target_value, :user_id, :set_by_id, :active, :period]
    end

    update :update do
      description "Update goal target value or active status"
      require_atomic? false
      accept [:target_value, :active]
    end

    update :deactivate do
      description "Soft-delete a goal by setting active to false"
      require_atomic? false

      change fn changeset, _context ->
        Ash.Changeset.force_change_attribute(changeset, :active, false)
      end
    end
  end
end
