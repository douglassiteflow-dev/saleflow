defmodule Saleflow.Repo.Migrations.CreateContracts do
  use Ecto.Migration

  def change do
    create_if_not_exists table(:contract_templates, primary_key: false) do
      add :id, :uuid, primary_key: true
      add :name, :string, null: false
      add :header_html, :text, default: ""
      add :footer_html, :text, default: ""
      add :terms_html, :text, default: ""
      add :logo_url, :string
      add :primary_color, :string, default: "#0f172a"
      add :font, :string, default: "Inter"
      add :is_default, :boolean, default: false, null: false
      add :user_id, references(:users, type: :uuid, on_delete: :nilify_all)

      timestamps()
    end

    create_if_not_exists index(:contract_templates, [:user_id])

    create_if_not_exists table(:contracts, primary_key: false) do
      add :id, :uuid, primary_key: true
      add :deal_id, references(:deals, type: :uuid, on_delete: :nilify_all)
      add :user_id, references(:users, type: :uuid, on_delete: :nilify_all)
      add :contract_number, :string, null: false
      add :status, :string, default: "draft", null: false
      add :access_token, :string, null: false
      add :verification_code, :string, null: false
      add :recipient_email, :string
      add :recipient_name, :string
      add :amount, :integer, null: false
      add :currency, :string, default: "SEK", null: false
      add :terms, :text
      add :customer_signature_url, :string
      add :customer_name, :string
      add :customer_signed_at, :utc_datetime
      add :seller_name, :string
      add :seller_signed_at, :utc_datetime
      add :pdf_url, :string
      add :signed_pdf_url, :string
      add :last_viewed_page, :string
      add :total_view_time, :integer, default: 0
      add :page_views, :map, default: %{}
      add :expires_at, :utc_datetime
      add :version, :integer, default: 1
      add :auto_renew, :boolean, default: false
      add :renewal_status, :string, default: "active"
      add :renewal_date, :date
      add :cancelled_at, :utc_datetime
      add :cancellation_end_date, :date
      add :custom_fields, :map, default: %{}

      timestamps()
    end

    create_if_not_exists unique_index(:contracts, [:access_token])
    create_if_not_exists index(:contracts, [:deal_id])
    create_if_not_exists index(:contracts, [:user_id])
    create_if_not_exists index(:contracts, [:status])
    create_if_not_exists index(:contracts, [:contract_number])
  end
end
