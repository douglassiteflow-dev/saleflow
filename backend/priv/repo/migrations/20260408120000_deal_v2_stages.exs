defmodule Saleflow.Repo.Migrations.DealV2Stages do
  use Ecto.Migration

  def up do
    # 1. Add new columns
    alter table(:deals) do
      add :meeting_outcome, :text
      add :needs_followup, :boolean, default: false, null: false
    end

    # 2. Remove old contract_url column
    alter table(:deals) do
      remove :contract_url
    end

    # 3. Migrate existing stages to v2 equivalents
    execute """
    UPDATE deals SET stage = CASE
      WHEN stage = 'meeting_booked' THEN 'demo_scheduled'
      WHEN stage = 'needs_website' THEN 'demo_scheduled'
      WHEN stage = 'generating_website' THEN 'demo_scheduled'
      WHEN stage = 'reviewing' THEN 'demo_scheduled'
      WHEN stage = 'deployed' THEN 'demo_scheduled'
      WHEN stage = 'demo_followup' THEN 'meeting_completed'
      WHEN stage = 'contract_sent' THEN 'contract_sent'
      WHEN stage = 'signed' THEN 'contract_sent'
      WHEN stage = 'dns_launch' THEN 'contract_sent'
      WHEN stage = 'won' THEN 'won'
      WHEN stage = 'cancelled' THEN 'cancelled'
      ELSE stage
    END
    """
  end

  def down do
    alter table(:deals) do
      add :contract_url, :string
    end

    alter table(:deals) do
      remove :meeting_outcome
      remove :needs_followup
    end

    execute """
    UPDATE deals SET stage = CASE
      WHEN stage = 'booking_wizard' THEN 'meeting_booked'
      WHEN stage = 'demo_scheduled' THEN 'deployed'
      WHEN stage = 'meeting_completed' THEN 'demo_followup'
      WHEN stage = 'questionnaire_sent' THEN 'demo_followup'
      WHEN stage = 'contract_sent' THEN 'contract_sent'
      WHEN stage = 'won' THEN 'won'
      WHEN stage = 'cancelled' THEN 'cancelled'
      ELSE stage
    END
    """
  end
end
