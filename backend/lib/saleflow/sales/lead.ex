defmodule Saleflow.Sales.Lead do
  @moduledoc """
  Lead resource for Saleflow.

  Represents a prospective customer (company) that sales agents work through.
  Each lead has a status that drives the sales workflow, from initial import
  (`:new`) through assignment, callback scheduling, meeting booking, and
  ultimately resolution as a customer, quarantine, or bad number.

  ## Status Flow

      :new → :assigned → :callback → :meeting_booked → :customer
                ↓              ↓
           :bad_number    :quarantine (auto-sets quarantine_until = now + 7 days)

  ## Quarantine

  When a lead's status is set to `:quarantine`, the `quarantine_until` field
  is automatically set to 7 days from now. This field can also be provided
  explicitly in the update params, in which case the explicit value wins.
  """

  use Ash.Resource,
    data_layer: AshPostgres.DataLayer,
    domain: Saleflow.Sales

  postgres do
    table "leads"
    repo Saleflow.Repo
  end

  attributes do
    uuid_primary_key :id

    # Core company data (Swedish field names per product spec)
    attribute :företag, :string do
      allow_nil? false
      public? true
    end

    attribute :telefon, :string do
      allow_nil? false
      public? true
    end

    attribute :epost, :string do
      allow_nil? true
      public? true
    end

    attribute :hemsida, :string do
      allow_nil? true
      public? true
    end

    attribute :adress, :string do
      allow_nil? true
      public? true
    end

    attribute :postnummer, :string do
      allow_nil? true
      public? true
    end

    attribute :stad, :string do
      allow_nil? true
      public? true
    end

    attribute :bransch, :string do
      allow_nil? true
      public? true
    end

    attribute :orgnr, :string do
      allow_nil? true
      public? true
    end

    attribute :omsättning_tkr, :string do
      allow_nil? true
      public? true
    end

    attribute :vinst_tkr, :string do
      allow_nil? true
      public? true
    end

    attribute :anställda, :string do
      allow_nil? true
      public? true
    end

    attribute :vd_namn, :string do
      allow_nil? true
      public? true
    end

    attribute :bolagsform, :string do
      allow_nil? true
      public? true
    end

    attribute :telefon_2, :string do
      allow_nil? true
      public? true
    end

    attribute :källa, :string do
      allow_nil? true
      public? true
    end

    attribute :status, :atom do
      constraints one_of: [:new, :assigned, :callback, :meeting_booked, :quarantine, :bad_number, :customer]
      default :new
      allow_nil? false
      public? true
    end

    attribute :quarantine_until, :utc_datetime_usec do
      allow_nil? true
      public? true
    end

    attribute :callback_at, :utc_datetime_usec do
      allow_nil? true
      public? true
    end

    attribute :callback_reminded_at, :utc_datetime_usec do
      allow_nil? true
      public? true
    end

    attribute :imported_at, :utc_datetime_usec do
      allow_nil? true
      public? true
    end

    attribute :lead_list_id, :uuid do
      allow_nil? true
      public? true
    end

    create_timestamp :inserted_at
    update_timestamp :updated_at
  end

  actions do
    defaults [:read]

    create :create do
      description "Create a new lead"

      accept [
        :företag,
        :telefon,
        :epost,
        :hemsida,
        :adress,
        :postnummer,
        :stad,
        :bransch,
        :orgnr,
        :omsättning_tkr,
        :vinst_tkr,
        :anställda,
        :vd_namn,
        :bolagsform,
        :telefon_2,
        :status,
        :quarantine_until,
        :callback_at,
        :imported_at,
        :källa,
        :lead_list_id
      ]

      change {Saleflow.Audit.Changes.CreateAuditLog, action: "lead.created"}
    end

    create :create_bulk do
      description "Create a lead without audit log (for bulk import)"

      accept [
        :företag, :telefon, :telefon_2, :epost, :hemsida, :adress, :postnummer, :stad,
        :bransch, :orgnr, :omsättning_tkr, :vinst_tkr, :anställda, :vd_namn,
        :bolagsform, :status, :imported_at, :källa, :lead_list_id
      ]
    end

    update :update_status do
      description "Update the status of a lead, with auto-quarantine logic"
      require_atomic? false

      accept [:status, :quarantine_until, :callback_at]

      change fn changeset, _context ->
        case Ash.Changeset.get_attribute(changeset, :status) do
          :quarantine ->
            case Ash.Changeset.get_attribute(changeset, :quarantine_until) do
              # :permanent sentinel → set quarantine_until to nil (permanent quarantine)
              :permanent ->
                Ash.Changeset.force_change_attribute(changeset, :quarantine_until, nil)

              # Explicit DateTime provided → use it
              %DateTime{} ->
                changeset

              # No value provided → default to 7 days
              nil ->
                seven_days_from_now = DateTime.add(DateTime.utc_now(), 7, :day)
                Ash.Changeset.force_change_attribute(changeset, :quarantine_until, seven_days_from_now)
            end

          _ ->
            changeset
        end
      end

      change {Saleflow.Audit.Changes.CreateAuditLog, action: "lead.status_changed"}
    end

    update :update_fields do
      description "Update editable fields on a lead (e.g. telefon_2)"
      require_atomic? false

      accept [:telefon_2]

      change {Saleflow.Audit.Changes.CreateAuditLog, action: "lead.updated"}
    end

    update :mark_callback_reminded do
      description "Set callback_reminded_at to now"
      require_atomic? false

      change fn changeset, _context ->
        Ash.Changeset.force_change_attribute(changeset, :callback_reminded_at, DateTime.utc_now())
      end
    end
  end
end
