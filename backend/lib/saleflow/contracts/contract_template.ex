defmodule Saleflow.Contracts.ContractTemplate do
  @moduledoc """
  Contract template resource — stores reusable HTML templates for contracts.

  Each template defines header, footer, and terms HTML along with branding
  (logo, color, font). One template per user can be marked as default.
  """

  use Ash.Resource,
    data_layer: AshPostgres.DataLayer,
    domain: Saleflow.Contracts

  postgres do
    table "contract_templates"
    repo Saleflow.Repo
  end

  attributes do
    uuid_primary_key :id

    attribute :name, :string do
      allow_nil? false
      public? true
    end

    attribute :header_html, :string do
      default ""
      public? true
    end

    attribute :footer_html, :string do
      default ""
      public? true
    end

    attribute :terms_html, :string do
      default ""
      public? true
    end

    attribute :logo_url, :string do
      public? true
    end

    attribute :primary_color, :string do
      default "#0f172a"
      public? true
    end

    attribute :font, :string do
      default "Inter"
      public? true
    end

    attribute :is_default, :boolean do
      default false
      allow_nil? false
      public? true
    end

    attribute :user_id, :uuid do
      allow_nil? true
      public? true
    end

    create_timestamp :inserted_at
    update_timestamp :updated_at
  end

  actions do
    defaults [:read, :destroy]

    create :create do
      accept [
        :name, :header_html, :footer_html, :terms_html,
        :logo_url, :primary_color, :font, :is_default, :user_id
      ]
    end

    update :update do
      accept [
        :name, :header_html, :footer_html, :terms_html,
        :logo_url, :primary_color, :font, :is_default
      ]
    end

    update :set_default do
      accept []
      change set_attribute(:is_default, true)
    end

    update :unset_default do
      accept []
      change set_attribute(:is_default, false)
    end
  end
end
