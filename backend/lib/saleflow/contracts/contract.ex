defmodule Saleflow.Contracts.Contract do
  @moduledoc """
  Contract resource — represents a signed agreement in the sales pipeline.

  ## Status flow

      draft → sent → viewed → signed
                              → superseded (renegotiation)
                              → cancelled

  After signing, the linked Deal is automatically advanced to :won.
  """

  use Ash.Resource,
    data_layer: AshPostgres.DataLayer,
    domain: Saleflow.Contracts

  require Logger

  postgres do
    table "contracts"
    repo Saleflow.Repo
  end

  attributes do
    uuid_primary_key :id

    attribute :deal_id, :uuid do
      allow_nil? true
      public? true
    end

    attribute :user_id, :uuid do
      allow_nil? true
      public? true
    end

    attribute :contract_number, :string do
      allow_nil? false
      public? true
    end

    attribute :status, :atom do
      constraints one_of: [:draft, :sent, :viewed, :signed, :superseded, :cancelled]
      default :draft
      allow_nil? false
      public? true
    end

    attribute :access_token, :string do
      allow_nil? false
      public? true
    end

    attribute :verification_code, :string do
      allow_nil? false
      public? true
    end

    attribute :recipient_email, :string do
      public? true
    end

    attribute :recipient_name, :string do
      public? true
    end

    attribute :amount, :integer do
      allow_nil? false
      public? true
    end

    attribute :currency, :string do
      default "SEK"
      allow_nil? false
      public? true
    end

    attribute :terms, :string do
      public? true
    end

    attribute :customer_signature_url, :string do
      public? true
    end

    attribute :customer_name, :string do
      public? true
    end

    attribute :customer_signed_at, :utc_datetime do
      public? true
    end

    attribute :seller_name, :string do
      public? true
    end

    attribute :seller_signed_at, :utc_datetime do
      public? true
    end

    attribute :pdf_url, :string do
      public? true
    end

    attribute :signed_pdf_url, :string do
      public? true
    end

    attribute :last_viewed_page, :string do
      public? true
    end

    attribute :total_view_time, :integer do
      default 0
      public? true
    end

    attribute :page_views, :map do
      default %{}
      public? true
    end

    attribute :expires_at, :utc_datetime do
      public? true
    end

    attribute :version, :integer do
      default 1
      public? true
    end

    attribute :auto_renew, :boolean do
      default false
      public? true
    end

    attribute :renewal_status, :atom do
      constraints one_of: [:active, :pending_renewal, :renewed, :cancelled]
      default :active
      public? true
    end

    attribute :renewal_date, :date do
      public? true
    end

    attribute :cancelled_at, :utc_datetime do
      public? true
    end

    attribute :cancellation_end_date, :date do
      public? true
    end

    attribute :custom_fields, :map do
      default %{}
      public? true
    end

    create_timestamp :inserted_at, public?: true
    update_timestamp :updated_at, public?: true
  end

  actions do
    defaults [:read]

    read :get do
      get_by [:id]
    end

    read :read_by_token do
      argument :token, :string, allow_nil?: false
      filter expr(access_token == ^arg(:token))
      get? true
    end

    create :create do
      accept [
        :deal_id, :user_id, :recipient_email, :recipient_name,
        :amount, :currency, :terms, :seller_name, :expires_at,
        :custom_fields
      ]

      # seller_signed_at is auto-set at creation time — creating the contract
      # implies seller approval. No separate seller signature flow.
      change fn changeset, _context ->
        number =
          "SF-#{Date.utc_today().year}-#{:rand.uniform(9999) |> Integer.to_string() |> String.pad_leading(4, "0")}"

        token = :crypto.strong_rand_bytes(32) |> Base.url_encode64(padding: false)

        code =
          :rand.uniform(999_999) |> Integer.to_string() |> String.pad_leading(6, "0")

        changeset
        |> Ash.Changeset.force_change_attribute(:contract_number, number)
        |> Ash.Changeset.force_change_attribute(:access_token, token)
        |> Ash.Changeset.force_change_attribute(:verification_code, code)
        |> Ash.Changeset.force_change_attribute(:seller_signed_at, DateTime.utc_now())
        |> Ash.Changeset.force_change_attribute(:status, :draft)
      end

      change {Saleflow.Audit.Changes.CreateAuditLog, action: "contract.created"}
    end

    update :mark_sent do
      require_atomic? false
      accept []
      change set_attribute(:status, :sent)

      change {Saleflow.Audit.Changes.CreateAuditLog, action: "contract.sent"}
    end

    update :mark_viewed do
      require_atomic? false
      accept []

      change fn changeset, _context ->
        current = changeset.data.status
        if current in [:draft, :sent] do
          Ash.Changeset.force_change_attribute(changeset, :status, :viewed)
        else
          changeset
        end
      end

      change {Saleflow.Audit.Changes.CreateAuditLog, action: "contract.viewed"}
    end

    update :update_tracking do
      accept [:last_viewed_page, :total_view_time, :page_views]
    end

    update :sign do
      require_atomic? false
      accept [:customer_signature_url, :customer_name]

      argument :customer_email, :string do
        allow_nil? true
      end

      change fn changeset, _context ->
        # Store customer_email as customer_name if provided and customer_name not set
        email = Ash.Changeset.get_argument(changeset, :customer_email)
        name = Ash.Changeset.get_attribute(changeset, :customer_name)

        changeset =
          if email && (is_nil(name) || name == "") do
            Ash.Changeset.force_change_attribute(changeset, :customer_name, email)
          else
            changeset
          end

        changeset
        |> Ash.Changeset.force_change_attribute(:customer_signed_at, DateTime.utc_now())
        |> Ash.Changeset.force_change_attribute(:status, :signed)
      end

      change after_action(fn _changeset, contract, _context ->
        # Advance the linked Deal to :won
        if contract.deal_id do
          case Saleflow.Sales.get_deal(contract.deal_id) do
            {:ok, deal} ->
              case Saleflow.Sales.advance_deal(deal) do
                {:ok, _deal} ->
                  Logger.info("Contract #{contract.contract_number}: advanced deal #{contract.deal_id} to next stage")

                {:error, reason} ->
                  Logger.warning("Contract #{contract.contract_number}: could not advance deal #{contract.deal_id}: #{inspect(reason)}")
              end

            {:error, _} ->
              Logger.warning("Contract #{contract.contract_number}: deal #{contract.deal_id} not found")
          end
        end

        {:ok, contract}
      end)

      change {Saleflow.Audit.Changes.CreateAuditLog, action: "contract.signed"}
    end

    update :cancel_contract do
      require_atomic? false
      accept []

      change fn changeset, _context ->
        now = DateTime.utc_now()
        end_date = Date.utc_today() |> Date.add(90)

        changeset
        |> Ash.Changeset.force_change_attribute(:cancelled_at, now)
        |> Ash.Changeset.force_change_attribute(:cancellation_end_date, end_date)
      end

      change {Saleflow.Audit.Changes.CreateAuditLog, action: "contract.cancelled"}
    end

    update :supersede do
      require_atomic? false
      accept []
      change set_attribute(:status, :superseded)

      change {Saleflow.Audit.Changes.CreateAuditLog, action: "contract.superseded"}
    end

    update :toggle_auto_renew do
      require_atomic? false
      accept [:auto_renew]
    end
  end
end
