defmodule Saleflow.Repo.Migrations.FixSkippedCallLogs do
  use Ecto.Migration

  @doc """
  Updates historical call_logs where outcome was recorded as 'no_answer'
  but the notes indicate the lead was actually skipped ("Hoppade över").
  These should use the new 'skipped' outcome instead, so they are excluded
  from call counts and conversion rate calculations.
  """

  def up do
    execute """
    UPDATE call_logs
    SET outcome = 'skipped'
    WHERE outcome = 'no_answer'
      AND notes LIKE '%Hoppade över%'
    """
  end

  def down do
    execute """
    UPDATE call_logs
    SET outcome = 'no_answer'
    WHERE outcome = 'skipped'
      AND notes LIKE '%Hoppade över%'
    """
  end
end
