defmodule Saleflow.Workers.GoalCheckWorker do
  @moduledoc """
  Oban worker that checks if agents have reached their goals.

  Runs every 10 minutes. For each active goal, checks if current_value >= target_value
  and no "goal_reached" notification exists for this goal today.
  """

  use Oban.Worker, queue: :scheduled

  require Logger

  alias Saleflow.Repo
  alias Saleflow.Stats

  @impl Oban.Worker
  def perform(%Oban.Job{}) do
    today = Date.utc_today()

    # Get all active goals
    {:ok, %{rows: goals}} =
      Repo.query("""
        SELECT g.id, g.user_id, g.metric::text, g.target_value, g.period::text
        FROM goals g
        WHERE g.active = true
      """)

    checked =
      Enum.reduce(goals, 0, fn [id, user_id_bin, metric, target, period], acc ->
        user_id = Saleflow.Sales.decode_uuid(user_id_bin)
        goal_id = Saleflow.Sales.decode_uuid(id)

        current = get_current_value(metric, period, user_id)

        if current >= target do
          # Check if notification already sent today
          {:ok, %{rows: existing}} =
            Repo.query(
              "SELECT 1 FROM notifications WHERE resource_id = $1 AND type = 'goal_reached' AND inserted_at::date = $2 LIMIT 1",
              [Ecto.UUID.dump!(goal_id), today]
            )

          if existing == [] do
            label =
              case metric do
                "calls_per_day" -> "#{current} samtal idag"
                "meetings_per_week" -> "#{current} möten denna vecka"
                _ -> "#{current}/#{target}"
              end

            Saleflow.Notifications.Notify.send(%{
              user_id: user_id,
              type: "goal_reached",
              title: "Mål uppnått!",
              body: label,
              resource_type: "Goal",
              resource_id: goal_id
            })

            acc + 1
          else
            acc
          end
        else
          acc
        end
      end)

    Logger.info("GoalCheckWorker: #{checked} goal(s) reached")
    :ok
  end

  defp get_current_value("calls_per_day", "daily", user_id), do: Stats.calls_today(user_id)

  defp get_current_value("meetings_per_week", "weekly", user_id) do
    today = Date.utc_today()
    start_of_week = Date.add(today, -(Date.day_of_week(today) - 1))
    uid = Ecto.UUID.dump!(user_id)

    {:ok, %{rows: [[count]]}} =
      Saleflow.Repo.query(
        "SELECT COUNT(*) FROM meetings WHERE user_id = $1 AND inserted_at::date >= $2 AND inserted_at::date <= $3 AND status != 'cancelled'",
        [uid, start_of_week, today]
      )

    count
  end

  defp get_current_value(_, _, _), do: 0
end
