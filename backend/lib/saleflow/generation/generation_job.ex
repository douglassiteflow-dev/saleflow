defmodule Saleflow.Generation.GenerationJob do
  use Ash.Resource,
    data_layer: AshPostgres.DataLayer,
    domain: Saleflow.Generation

  postgres do
    table "generation_jobs"
    repo Saleflow.Repo
  end

  attributes do
    uuid_primary_key :id

    attribute :deal_id, :uuid, allow_nil?: true, public?: true
    attribute :demo_config_id, :uuid, allow_nil?: true, public?: true
    attribute :source_url, :string, allow_nil?: false, public?: true
    attribute :slug, :string, allow_nil?: false, public?: true
    attribute :source_type, :string, allow_nil?: true, default: "bokadirekt", public?: true
    attribute :source_text, :string, allow_nil?: true, public?: true

    attribute :status, :atom do
      constraints one_of: [:pending, :processing, :completed, :failed]
      default :pending
      allow_nil? false
      public? true
    end

    attribute :result_url, :string, allow_nil?: true, public?: true
    attribute :error, :string, allow_nil?: true, public?: true
    attribute :picked_up_at, :utc_datetime_usec, allow_nil?: true, public?: true
    attribute :completed_at, :utc_datetime_usec, allow_nil?: true, public?: true

    create_timestamp :inserted_at, public?: true
    update_timestamp :updated_at, public?: true
  end

  actions do
    defaults [:read]

    create :create do
      accept [:deal_id, :demo_config_id, :source_url, :slug, :source_type, :source_text]
    end

    update :pick do
      require_atomic? false
      change fn changeset, _context ->
        changeset
        |> Ash.Changeset.force_change_attribute(:status, :processing)
        |> Ash.Changeset.force_change_attribute(:picked_up_at, DateTime.utc_now())
      end
    end

    update :complete do
      require_atomic? false
      accept [:result_url]
      change fn changeset, _context ->
        changeset
        |> Ash.Changeset.force_change_attribute(:status, :completed)
        |> Ash.Changeset.force_change_attribute(:completed_at, DateTime.utc_now())
      end
    end

    update :fail do
      require_atomic? false
      accept [:error]
      change fn changeset, _context ->
        changeset
        |> Ash.Changeset.force_change_attribute(:status, :failed)
        |> Ash.Changeset.force_change_attribute(:completed_at, DateTime.utc_now())
      end
    end
  end
end
