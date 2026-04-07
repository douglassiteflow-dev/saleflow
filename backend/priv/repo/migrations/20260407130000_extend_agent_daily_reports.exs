defmodule Saleflow.Repo.Migrations.ExtendAgentDailyReports do
  use Ecto.Migration

  def change do
    alter table(:agent_daily_reports) do
      add :score_breakdown, :jsonb
      add :talk_ratio_avg, :float
      add :sentiment_positive_pct, :float
      add :meeting_count, :integer, default: 0
      add :conversion_rate, :float
      add :focus_area, :string
      add :focus_area_score_today, :float
      add :previous_focus_followed_up, :boolean, default: false
      add :top_competitors, :jsonb
      add :top_objections, :jsonb
    end
  end
end
