defmodule Saleflow.Workers.DailyReportWorkerTest do
  @moduledoc """
  Tests for the personal AI sales coach DailyReportWorker.
  """

  use Saleflow.DataCase, async: false

  alias Saleflow.Workers.DailyReportWorker

  # ---------------------------------------------------------------------------
  # Helpers
  # ---------------------------------------------------------------------------

  defp create_agent! do
    unique = System.unique_integer([:positive])

    {:ok, user} =
      Saleflow.Accounts.User
      |> Ash.Changeset.for_create(:register_with_password, %{
        email: "agent#{unique}@test.se",
        name: "Test Agent #{unique}",
        password: "Password123!",
        password_confirmation: "Password123!"
      })
      |> Ash.create()

    user
  end

  defp create_admin! do
    unique = System.unique_integer([:positive])

    {:ok, user} =
      Saleflow.Accounts.User
      |> Ash.Changeset.for_create(:register_with_password, %{
        email: "admin#{unique}@test.se",
        name: "Admin #{unique}",
        password: "Password123!",
        password_confirmation: "Password123!",
        role: :admin
      })
      |> Ash.create()

    user
  end

  defp insert_phone_call_with_analysis!(user_id, date, analysis_json) do
    call_id = Ecto.UUID.generate()

    Saleflow.Repo.query!(
      """
      INSERT INTO phone_calls (id, user_id, caller, callee, direction, received_at, duration, transcription_analysis, inserted_at)
      VALUES ($1, $2, '+46701234567', '+46812345678', 'outgoing', $3, 120, $4, NOW())
      """,
      [
        Ecto.UUID.dump!(call_id),
        Ecto.UUID.dump!(user_id),
        NaiveDateTime.new!(date, ~T[10:00:00]),
        analysis_json
      ]
    )

    call_id
  end

  defp insert_agent_report!(user_id, date, report_json, score_avg \\ 7.0, call_count \\ 5) do
    Saleflow.Repo.query!(
      """
      INSERT INTO agent_daily_reports (id, user_id, date, report, score_avg, call_count, inserted_at)
      VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, NOW())
      """,
      [Ecto.UUID.dump!(user_id), date, report_json, score_avg, call_count]
    )
  end

  defp sample_analysis do
    Jason.encode!(%{
      "summary" => "Bra samtal med kund om solpaneler",
      "score" => %{
        "opening" => %{"score" => 8, "comment" => "Bra öppning"},
        "needs_discovery" => %{"score" => 7, "comment" => "Ställde bra frågor"},
        "pitch" => %{"score" => 6, "comment" => "Kunde vara tydligare"},
        "objection_handling" => %{"score" => 5, "comment" => "Hanterade invändningar ok"},
        "closing" => %{"score" => 7, "comment" => "Bra avslut"},
        "overall" => 6.6,
        "top_feedback" => "Fokusera på behovsanalysen"
      }
    })
  end

  # ---------------------------------------------------------------------------
  # Tests
  # ---------------------------------------------------------------------------

  describe "perform/1" do
    test "returns :ok when no agents exist" do
      # Remove all users with agent role
      Saleflow.Repo.query!("DELETE FROM users WHERE role = 'agent'")

      assert :ok = DailyReportWorker.perform(%Oban.Job{})
    end

    test "returns :ok when agent has no calls today" do
      _agent = create_agent!()

      assert :ok = DailyReportWorker.perform(%Oban.Job{})
    end

    test "only processes agents, not admins" do
      admin = create_admin!()
      today = Date.utc_today()

      insert_phone_call_with_analysis!(admin.id, today, sample_analysis())

      # Should return :ok without generating report for admin
      assert :ok = DailyReportWorker.perform(%Oban.Job{})

      # Verify no report was saved for the admin
      {:ok, %{rows: rows}} =
        Saleflow.Repo.query(
          "SELECT count(*) FROM agent_daily_reports WHERE user_id = $1",
          [Ecto.UUID.dump!(admin.id)]
        )

      assert [[0]] = rows
    end
  end

  describe "agent_daily_reports table" do
    test "unique constraint on user_id + date" do
      agent = create_agent!()
      today = Date.utc_today()

      report_json = Jason.encode!(%{"greeting" => "Hej!"})
      insert_agent_report!(agent.id, today, report_json)

      # Second insert with same user_id + date should fail
      assert_raise Postgrex.Error, fn ->
        insert_agent_report!(agent.id, today, report_json)
      end
    end

    test "allows same date for different agents" do
      agent1 = create_agent!()
      agent2 = create_agent!()
      today = Date.utc_today()

      report_json = Jason.encode!(%{"greeting" => "Hej!"})
      insert_agent_report!(agent1.id, today, report_json)
      insert_agent_report!(agent2.id, today, report_json)

      {:ok, %{rows: [[count]]}} =
        Saleflow.Repo.query("SELECT count(*) FROM agent_daily_reports WHERE date = $1", [today])

      assert count == 2
    end

    test "cascade deletes reports when user is deleted" do
      agent = create_agent!()
      today = Date.utc_today()

      report_json = Jason.encode!(%{"greeting" => "Hej!"})
      insert_agent_report!(agent.id, today, report_json)

      # Verify report exists
      {:ok, %{rows: [[1]]}} =
        Saleflow.Repo.query(
          "SELECT count(*) FROM agent_daily_reports WHERE user_id = $1",
          [Ecto.UUID.dump!(agent.id)]
        )

      # Delete user
      Saleflow.Repo.query!("DELETE FROM users WHERE id = $1", [Ecto.UUID.dump!(agent.id)])

      # Report should be cascade deleted
      {:ok, %{rows: [[0]]}} =
        Saleflow.Repo.query(
          "SELECT count(*) FROM agent_daily_reports WHERE user_id = $1",
          [Ecto.UUID.dump!(agent.id)]
        )
    end

    test "stores and retrieves report with all fields" do
      agent = create_agent!()
      today = Date.utc_today()

      report = %{
        "greeting" => "Hej Agent!",
        "score_summary" => "Ditt snitt idag: 7.5/10",
        "wins" => ["Bra öppning", "Stark pitch"],
        "focus_area" => "Behovsanalys",
        "progress_note" => "Du har förbättrats!",
        "tip_of_the_day" => "Ställ fler öppna frågor",
        "motivation" => "Fortsätt så!"
      }

      report_json = Jason.encode!(report)
      insert_agent_report!(agent.id, today, report_json, 7.5, 8)

      {:ok, %{rows: [[stored_report, score, calls]]}} =
        Saleflow.Repo.query(
          "SELECT report, score_avg, call_count FROM agent_daily_reports WHERE user_id = $1 AND date = $2",
          [Ecto.UUID.dump!(agent.id), today]
        )

      {:ok, parsed} = Jason.decode(stored_report)
      assert parsed["greeting"] == "Hej Agent!"
      assert parsed["wins"] == ["Bra öppning", "Stark pitch"]
      assert score == 7.5
      assert calls == 8
    end
  end
end
