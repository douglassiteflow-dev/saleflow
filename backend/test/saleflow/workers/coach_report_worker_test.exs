defmodule Saleflow.Workers.CoachReportWorkerTest do
  @moduledoc """
  Tests for the CoachReportWorker — AI coaching report generator with
  longitudinal tracking, scorecard breakdown, and keyword intelligence.
  """

  use Saleflow.DataCase, async: false

  alias Saleflow.Workers.CoachReportWorker

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

  defp insert_phone_call_with_analysis!(user_id, date, analysis_json, opts \\ []) do
    call_id = Ecto.UUID.generate()
    duration = Keyword.get(opts, :duration, 120)
    talk_ratio = Keyword.get(opts, :talk_ratio_seller, 55)
    sentiment = Keyword.get(opts, :sentiment, "positive")
    scorecard_avg = Keyword.get(opts, :scorecard_avg, 7.0)
    summary = Keyword.get(opts, :summary, "Bra samtal med kund")
    outcome = Keyword.get(opts, :outcome, nil)

    # Insert phone call
    Saleflow.Repo.query!(
      """
      INSERT INTO phone_calls (id, user_id, caller, callee, direction, received_at, duration,
                               transcription_analysis, talk_ratio_seller, sentiment, scorecard_avg,
                               call_summary, inserted_at)
      VALUES ($1, $2, '+46701234567', '+46812345678', 'outgoing', $3, $4, $5, $6, $7, $8, $9, NOW())
      """,
      [
        Ecto.UUID.dump!(call_id),
        Ecto.UUID.dump!(user_id),
        NaiveDateTime.new!(date, ~T[10:00:00]),
        duration,
        analysis_json,
        talk_ratio,
        sentiment,
        scorecard_avg,
        summary
      ]
    )

    # Insert call_log with outcome if provided
    if outcome do
      call_log_id = Ecto.UUID.generate()

      Saleflow.Repo.query!(
        """
        INSERT INTO call_logs (id, user_id, phone_number, status, outcome, inserted_at, updated_at)
        VALUES ($1, $2, '+46812345678', 'completed', $3, NOW(), NOW())
        """,
        [Ecto.UUID.dump!(call_log_id), Ecto.UUID.dump!(user_id), outcome]
      )

      Saleflow.Repo.query!(
        "UPDATE phone_calls SET call_log_id = $1 WHERE id = $2",
        [Ecto.UUID.dump!(call_log_id), Ecto.UUID.dump!(call_id)]
      )
    end

    call_id
  end

  defp insert_agent_report!(user_id, date, report_html, opts \\ []) do
    score_avg = Keyword.get(opts, :score_avg, 7.0)
    call_count = Keyword.get(opts, :call_count, 5)
    focus_area = Keyword.get(opts, :focus_area, nil)
    focus_area_score_today = Keyword.get(opts, :focus_area_score_today, nil)
    score_breakdown = Keyword.get(opts, :score_breakdown, nil)
    talk_ratio_avg = Keyword.get(opts, :talk_ratio_avg, nil)

    score_breakdown_json = if score_breakdown, do: Jason.encode!(score_breakdown), else: nil

    Saleflow.Repo.query!(
      """
      INSERT INTO agent_daily_reports
        (id, user_id, date, report, score_avg, call_count, focus_area,
         focus_area_score_today, score_breakdown, talk_ratio_avg, inserted_at)
      VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, NOW())
      """,
      [
        Ecto.UUID.dump!(user_id), date, report_html, score_avg, call_count,
        focus_area, focus_area_score_today, score_breakdown_json, talk_ratio_avg
      ]
    )
  end

  defp sample_analysis do
    Jason.encode!(%{
      "summary" => "Bra samtal med kund om solpaneler",
      "scorecard" => %{
        "opening" => %{"q1" => %{"score" => 8}, "avg" => 8.0},
        "discovery" => %{"q1" => %{"score" => 6}, "avg" => 6.0},
        "pitch" => %{"q1" => %{"score" => 7}, "avg" => 7.0},
        "objection_handling" => %{"q1" => %{"score" => 5}, "avg" => 5.0},
        "closing" => %{"q1" => %{"score" => 7}, "avg" => 7.0}
      },
      "score" => %{
        "opening" => %{"score" => 8},
        "overall" => 6.6
      },
      "keywords" => %{
        "competitors" => [%{"keyword" => "Webnode"}, %{"keyword" => "Wix"}],
        "buying_signals" => []
      },
      "customer_needs" => ["Bra hemsida"],
      "objections" => ["har leverantor", "for dyrt"],
      "positive_signals" => ["Det later intressant"]
    })
  end

  defp insert_playbook! do
    Saleflow.Repo.query!(
      """
      INSERT INTO playbooks (id, name, opening, pitch, objections, closing, guidelines, active, inserted_at, updated_at)
      VALUES (gen_random_uuid(), 'Test Playbook', $1, $2, $3, $4, $5, true, NOW(), NOW())
      """,
      ["Hej, jag heter...", "Vi erbjuder...", "Jag forstar att...", "Vill du ga vidare?", "Alltid lyssna aktivt"]
    )
  end

  defp insert_goal!(user_id, metric \\ "meetings", target_value \\ 3, period \\ "day") do
    admin = create_agent!()

    Saleflow.Repo.query!(
      """
      INSERT INTO goals (id, scope, metric, target_value, user_id, set_by_id, active, period, inserted_at, updated_at)
      VALUES (gen_random_uuid(), 'agent', $1, $2, $3, $4, true, $5, NOW(), NOW())
      """,
      [metric, target_value, Ecto.UUID.dump!(user_id), Ecto.UUID.dump!(admin.id), period]
    )
  end

  # Fake HTTP client for Claude API success
  defmodule FakeClaudeSuccess do
    def post(_url, _opts) do
      {:ok, %{status: 200, body: %{"content" => [%{"type" => "text", "text" => "<html><body>Coach report</body></html>"}]}}}
    end
  end

  # Fake HTTP client for Claude API failure
  defmodule FakeClaudeError do
    def post(_url, _opts) do
      {:ok, %{status: 500, body: %{"error" => "internal_error"}}}
    end
  end

  # Fake HTTP client simulating a network-level error (connection refused, timeout, etc.)
  defmodule FakeClaudeNetworkError do
    def post(_url, _opts) do
      {:error, :timeout}
    end
  end

  # Fake HTTP client that verifies prompt caching headers
  defmodule FakeClaudeWithHeaderCheck do
    def post(_url, opts) do
      headers = Keyword.get(opts, :headers, [])
      header_map = Map.new(headers)

      # Store headers for assertion in test
      :persistent_term.put(:coach_test_headers, header_map)

      body = Jason.decode!(Keyword.get(opts, :body, "{}"))
      :persistent_term.put(:coach_test_body, body)

      {:ok, %{status: 200, body: %{"content" => [%{"type" => "text", "text" => "<html><body>Cached report</body></html>"}]}}}
    end
  end

  setup do
    original_client = Application.get_env(:saleflow, :coach_http_client)

    on_exit(fn ->
      if original_client do
        Application.put_env(:saleflow, :coach_http_client, original_client)
      else
        Application.delete_env(:saleflow, :coach_http_client)
      end

      :persistent_term.erase(:coach_test_headers)
      :persistent_term.erase(:coach_test_body)
    end)

    :ok
  end

  # ---------------------------------------------------------------------------
  # collect_data/2
  # ---------------------------------------------------------------------------

  describe "collect_data/2" do
    test "returns parsed call data for a given date" do
      agent = create_agent!()
      today = Date.utc_today()

      insert_phone_call_with_analysis!(agent.id, today, sample_analysis(),
        talk_ratio_seller: 60,
        sentiment: "positive",
        scorecard_avg: 6.6
      )

      calls = CoachReportWorker.collect_data(agent.id, today)

      assert length(calls) == 1
      [call] = calls

      assert is_binary(call.id)
      assert call.analysis["scorecard"]["opening"]["avg"] == 8.0
      assert call.talk_ratio_seller == 60
      assert call.sentiment == "positive"
      assert call.scorecard_avg == 6.6
      assert call.summary == "Bra samtal med kund"
    end

    test "returns empty list when no calls exist" do
      agent = create_agent!()
      today = Date.utc_today()

      assert [] == CoachReportWorker.collect_data(agent.id, today)
    end

    test "only returns calls with transcription_analysis" do
      agent = create_agent!()
      today = Date.utc_today()

      # Insert a call with analysis
      insert_phone_call_with_analysis!(agent.id, today, sample_analysis())

      # Insert a call without analysis
      Saleflow.Repo.query!(
        """
        INSERT INTO phone_calls (id, user_id, caller, callee, direction, received_at, duration, inserted_at)
        VALUES ($1, $2, '+46701234567', '+46812345678', 'outgoing', $3, 60, NOW())
        """,
        [
          Ecto.UUID.dump!(Ecto.UUID.generate()),
          Ecto.UUID.dump!(agent.id),
          NaiveDateTime.new!(today, ~T[11:00:00])
        ]
      )

      calls = CoachReportWorker.collect_data(agent.id, today)
      assert length(calls) == 1
    end
  end

  # ---------------------------------------------------------------------------
  # collect_history/2
  # ---------------------------------------------------------------------------

  describe "collect_history/2" do
    test "returns previous 14 days of reports" do
      agent = create_agent!()
      today = Date.utc_today()

      # Insert reports for past 3 days
      for days_ago <- 1..3 do
        date = Date.add(today, -days_ago)
        insert_agent_report!(agent.id, date, "<html>Report #{days_ago}</html>",
          score_avg: 7.0 + days_ago * 0.1,
          call_count: 5 + days_ago,
          focus_area: "opening"
        )
      end

      history = CoachReportWorker.collect_history(agent.id, today)

      assert length(history) == 3
      # Ordered by date ASC
      assert hd(history).date == Date.add(today, -3)
      assert List.last(history).date == Date.add(today, -1)
      assert List.last(history).focus_area == "opening"
    end

    test "excludes reports older than 14 days" do
      agent = create_agent!()
      today = Date.utc_today()

      # Insert report 15 days ago (should be excluded)
      insert_agent_report!(agent.id, Date.add(today, -15), "<html>Old</html>")

      # Insert report 13 days ago (should be included)
      insert_agent_report!(agent.id, Date.add(today, -13), "<html>Recent</html>")

      history = CoachReportWorker.collect_history(agent.id, today)

      assert length(history) == 1
      assert hd(history).date == Date.add(today, -13)
    end

    test "excludes today's report" do
      agent = create_agent!()
      today = Date.utc_today()

      insert_agent_report!(agent.id, today, "<html>Today</html>")

      history = CoachReportWorker.collect_history(agent.id, today)
      assert history == []
    end

    test "returns empty list when no history exists" do
      agent = create_agent!()
      today = Date.utc_today()

      assert [] == CoachReportWorker.collect_history(agent.id, today)
    end
  end

  # ---------------------------------------------------------------------------
  # extract_structured_data/2
  # ---------------------------------------------------------------------------

  describe "extract_structured_data/2" do
    test "calculates score averages correctly" do
      calls = [
        %{scorecard_avg: 7.0, talk_ratio_seller: 60, sentiment: "positive", outcome: "meeting_booked",
          analysis: %{"scorecard" => %{"opening" => %{"avg" => 8.0}, "discovery" => %{"avg" => 6.0}}}},
        %{scorecard_avg: 5.0, talk_ratio_seller: 40, sentiment: "neutral", outcome: nil,
          analysis: %{"scorecard" => %{"opening" => %{"avg" => 6.0}, "discovery" => %{"avg" => 4.0}}}}
      ]

      result = CoachReportWorker.extract_structured_data(calls, [])

      assert result.score_avg == 6.0
      assert result.call_count == 2
      assert result.talk_ratio_avg == 50.0
      assert result.sentiment_positive_pct == 50.0
      assert result.meeting_count == 1
      assert result.conversion_rate == 50.0
    end

    test "handles calls with nil scores" do
      calls = [
        %{scorecard_avg: nil, talk_ratio_seller: nil, sentiment: "neutral", outcome: nil,
          analysis: %{}}
      ]

      result = CoachReportWorker.extract_structured_data(calls, [])

      assert result.score_avg == nil
      assert result.talk_ratio_avg == nil
      assert result.sentiment_positive_pct == 0.0
      assert result.call_count == 1
    end

    test "detects previous focus follow-up" do
      calls = [
        %{scorecard_avg: 7.0, talk_ratio_seller: 50, sentiment: "positive", outcome: nil,
          analysis: %{"scorecard" => %{"opening" => %{"avg" => 7.0}}}}
      ]

      history = [
        %{focus_area: "opening", focus_area_score_today: 6.0, date: ~D[2026-04-06],
          score_avg: 6.5, call_count: 5, score_breakdown: nil, talk_ratio_avg: nil,
          meeting_count: 0, conversion_rate: nil}
      ]

      result = CoachReportWorker.extract_structured_data(calls, history)

      assert result.previous_focus_followed_up == true
    end

    test "previous_focus_followed_up is false when no history" do
      calls = [
        %{scorecard_avg: 7.0, talk_ratio_seller: 50, sentiment: "positive", outcome: nil,
          analysis: %{"scorecard" => %{"opening" => %{"avg" => 7.0}}}}
      ]

      result = CoachReportWorker.extract_structured_data(calls, [])

      assert result.previous_focus_followed_up == false
    end

    test "extracts competitor and objection keywords" do
      calls = [
        %{scorecard_avg: 7.0, talk_ratio_seller: 50, sentiment: "positive", outcome: nil,
          analysis: %{
            "scorecard" => %{},
            "keywords" => %{"competitors" => [%{"keyword" => "Webnode"}, %{"keyword" => "Wix"}]},
            "objections" => ["har leverantor", "for dyrt"]
          }},
        %{scorecard_avg: 6.0, talk_ratio_seller: 45, sentiment: "neutral", outcome: nil,
          analysis: %{
            "scorecard" => %{},
            "keywords" => %{"competitors" => [%{"keyword" => "Webnode"}]},
            "objections" => ["har leverantor"]
          }}
      ]

      result = CoachReportWorker.extract_structured_data(calls, [])

      assert result.top_competitors == %{"Webnode" => 2, "Wix" => 1}
      assert result.top_objections == %{"har leverantor" => 2, "for dyrt" => 1}
    end
  end

  # ---------------------------------------------------------------------------
  # find_weakest_category/1
  # ---------------------------------------------------------------------------

  describe "find_weakest_category/1" do
    test "identifies lowest scoring category" do
      calls = [
        %{analysis: %{
          "scorecard" => %{
            "opening" => %{"avg" => 8.0},
            "discovery" => %{"avg" => 3.0},
            "pitch" => %{"avg" => 7.0},
            "objection_handling" => %{"avg" => 5.0},
            "closing" => %{"avg" => 7.0}
          }
        }}
      ]

      assert "discovery" == CoachReportWorker.find_weakest_category(calls)
    end

    test "handles calls without scorecard" do
      calls = [%{analysis: %{}}]

      # Falls back to default
      assert "opening" == CoachReportWorker.find_weakest_category(calls)
    end

    test "averages across multiple calls" do
      calls = [
        %{analysis: %{
          "scorecard" => %{
            "opening" => %{"avg" => 9.0},
            "closing" => %{"avg" => 3.0}
          }
        }},
        %{analysis: %{
          "scorecard" => %{
            "opening" => %{"avg" => 7.0},
            "closing" => %{"avg" => 5.0}
          }
        }}
      ]

      # opening avg = 8.0, closing avg = 4.0
      assert "closing" == CoachReportWorker.find_weakest_category(calls)
    end
  end

  # ---------------------------------------------------------------------------
  # calculate_category_averages/1
  # ---------------------------------------------------------------------------

  describe "calculate_category_averages/1" do
    test "calculates averages for all 5 categories" do
      calls = [
        %{analysis: %{
          "scorecard" => %{
            "opening" => %{"avg" => 8.0},
            "discovery" => %{"avg" => 6.0},
            "pitch" => %{"avg" => 7.0},
            "objection_handling" => %{"avg" => 5.0},
            "closing" => %{"avg" => 9.0}
          }
        }},
        %{analysis: %{
          "scorecard" => %{
            "opening" => %{"avg" => 6.0},
            "discovery" => %{"avg" => 8.0},
            "pitch" => %{"avg" => 7.0},
            "objection_handling" => %{"avg" => 7.0},
            "closing" => %{"avg" => 7.0}
          }
        }}
      ]

      result = CoachReportWorker.calculate_category_averages(calls)

      assert result["opening"] == 7.0
      assert result["discovery"] == 7.0
      assert result["pitch"] == 7.0
      assert result["objection_handling"] == 6.0
      assert result["closing"] == 8.0
    end

    test "returns nil for categories without data" do
      calls = [%{analysis: %{}}]

      result = CoachReportWorker.calculate_category_averages(calls)

      assert result["opening"] == nil
      assert result["discovery"] == nil
    end
  end

  # ---------------------------------------------------------------------------
  # build_prompt/4
  # ---------------------------------------------------------------------------

  describe "build_prompt/4" do
    test "includes all sections in prompt" do
      calls = [
        %{id: "abc-123", analysis: %{"scorecard" => %{}, "score" => %{"overall" => 7}},
          summary: "Bra samtal", talk_ratio_seller: 55, sentiment: "positive",
          scorecard_avg: 7.0, outcome: "meeting_booked", duration: 120,
          received_at: ~N[2026-04-07 10:00:00]}
      ]

      history = [
        %{focus_area: "opening", date: ~D[2026-04-06], score_avg: 6.5}
      ]

      goals = [%{metric: "meetings", target_value: "3", period: "day"}]

      prompt = CoachReportWorker.build_prompt(calls, history, goals, "Test Agent")

      assert prompt =~ "Test Agent"
      assert prompt =~ "abc-123"
      assert prompt =~ "DAGENS SAMTAL"
      assert prompt =~ "HISTORIK"
      assert prompt =~ "AGENTENS MAL"
      assert prompt =~ "meetings"
      assert prompt =~ "IGÅRS FOKUSOMRADE: opening"
    end

    test "omits goals section when no goals" do
      calls = [
        %{id: "abc-123", analysis: %{}, summary: "Test", talk_ratio_seller: 50,
          sentiment: "neutral", scorecard_avg: 5.0, outcome: nil, duration: 60,
          received_at: ~N[2026-04-07 10:00:00]}
      ]

      prompt = CoachReportWorker.build_prompt(calls, [], [], "Agent")

      refute prompt =~ "AGENTENS MAL"
    end

    test "omits yesterday focus when no history" do
      calls = [
        %{id: "abc-123", analysis: %{}, summary: "Test", talk_ratio_seller: 50,
          sentiment: "neutral", scorecard_avg: 5.0, outcome: nil, duration: 60,
          received_at: ~N[2026-04-07 10:00:00]}
      ]

      prompt = CoachReportWorker.build_prompt(calls, [], [], "Agent")

      refute prompt =~ "IGÅRS FOKUSOMRADE"
    end
  end

  # ---------------------------------------------------------------------------
  # get_yesterday_focus/1
  # ---------------------------------------------------------------------------

  describe "get_yesterday_focus/1" do
    test "returns focus area from last history entry" do
      history = [
        %{focus_area: "pitch"},
        %{focus_area: "closing"}
      ]

      assert "closing" == CoachReportWorker.get_yesterday_focus(history)
    end

    test "returns nil for empty history" do
      assert nil == CoachReportWorker.get_yesterday_focus([])
    end

    test "returns nil when last entry has nil focus" do
      history = [%{focus_area: nil}]
      assert nil == CoachReportWorker.get_yesterday_focus(history)
    end
  end

  # ---------------------------------------------------------------------------
  # extract_keywords/1
  # ---------------------------------------------------------------------------

  describe "extract_keywords/1" do
    test "counts competitor and objection frequencies" do
      calls = [
        %{analysis: %{
          "keywords" => %{"competitors" => [%{"keyword" => "Webnode"}, %{"name" => "Wix"}]},
          "objections" => ["for dyrt", "har leverantor"]
        }},
        %{analysis: %{
          "keywords" => %{"competitors" => [%{"keyword" => "Webnode"}]},
          "objections" => ["for dyrt"]
        }}
      ]

      {competitors, objections} = CoachReportWorker.extract_keywords(calls)

      assert competitors == %{"Webnode" => 2, "Wix" => 1}
      assert objections == %{"for dyrt" => 2, "har leverantor" => 1}
    end

    test "handles missing keywords gracefully" do
      calls = [%{analysis: %{}}]

      {competitors, objections} = CoachReportWorker.extract_keywords(calls)

      assert competitors == %{}
      assert objections == %{}
    end
  end

  # ---------------------------------------------------------------------------
  # perform/1
  # ---------------------------------------------------------------------------

  describe "perform/1" do
    test "returns :ok when no agents exist" do
      Saleflow.Repo.query!("DELETE FROM users WHERE role = 'agent'")

      assert :ok = CoachReportWorker.perform(%Oban.Job{args: %{}})
    end

    test "returns :ok when agent has no calls today" do
      _agent = create_agent!()
      Application.put_env(:saleflow, :coach_http_client, FakeClaudeSuccess)

      assert :ok = CoachReportWorker.perform(%Oban.Job{args: %{}})
    end

    test "returns :ok with nil args" do
      Saleflow.Repo.query!("DELETE FROM users WHERE role = 'agent'")

      assert :ok = CoachReportWorker.perform(%Oban.Job{args: nil})
    end

    test "generates report when agent has calls" do
      Application.put_env(:saleflow, :coach_http_client, FakeClaudeSuccess)

      agent = create_agent!()
      today = Date.utc_today()

      insert_phone_call_with_analysis!(agent.id, today, sample_analysis(),
        scorecard_avg: 7.0,
        talk_ratio_seller: 55,
        sentiment: "positive"
      )

      assert :ok = CoachReportWorker.perform(%Oban.Job{args: %{"date" => Date.to_iso8601(today)}})

      # Verify report was saved
      {:ok, %{rows: [[report, score_avg, call_count, focus_area]]}} =
        Saleflow.Repo.query(
          "SELECT report, score_avg, call_count, focus_area FROM agent_daily_reports WHERE user_id = $1 AND date = $2",
          [Ecto.UUID.dump!(agent.id), today]
        )

      assert report =~ "Coach report"
      assert score_avg == 7.0
      assert call_count == 1
      assert is_binary(focus_area)
    end

    test "handles Claude API failure gracefully" do
      Application.put_env(:saleflow, :coach_http_client, FakeClaudeError)

      agent = create_agent!()
      today = Date.utc_today()

      insert_phone_call_with_analysis!(agent.id, today, sample_analysis())

      # Should not crash
      assert :ok = CoachReportWorker.perform(%Oban.Job{args: %{"date" => Date.to_iso8601(today)}})

      # No report should be saved
      {:ok, %{rows: rows}} =
        Saleflow.Repo.query(
          "SELECT count(*) FROM agent_daily_reports WHERE user_id = $1 AND date = $2",
          [Ecto.UUID.dump!(agent.id), today]
        )

      assert [[0]] = rows
    end

    test "accepts date parameter" do
      Application.put_env(:saleflow, :coach_http_client, FakeClaudeSuccess)

      agent = create_agent!()
      yesterday = Date.add(Date.utc_today(), -1)

      insert_phone_call_with_analysis!(agent.id, yesterday, sample_analysis())

      assert :ok = CoachReportWorker.perform(%Oban.Job{args: %{"date" => Date.to_iso8601(yesterday)}})

      {:ok, %{rows: [[1]]}} =
        Saleflow.Repo.query(
          "SELECT count(*) FROM agent_daily_reports WHERE user_id = $1 AND date = $2",
          [Ecto.UUID.dump!(agent.id), yesterday]
        )
    end
  end

  # ---------------------------------------------------------------------------
  # save_report/4
  # ---------------------------------------------------------------------------

  describe "save_report/4" do
    test "writes all fields correctly" do
      agent = create_agent!()
      today = Date.utc_today()

      structured = %{
        score_avg: 7.2,
        call_count: 5,
        score_breakdown: %{"opening" => 8.0, "discovery" => 6.0, "pitch" => 7.0, "objection_handling" => 5.5, "closing" => 7.5},
        talk_ratio_avg: 55.0,
        sentiment_positive_pct: 60.0,
        meeting_count: 2,
        conversion_rate: 40.0,
        focus_area: "objection_handling",
        focus_area_score_today: 5.5,
        previous_focus_followed_up: true,
        top_competitors: %{"Webnode" => 3, "Wix" => 1},
        top_objections: %{"har leverantor" => 5, "for dyrt" => 2}
      }

      {:ok, _} = CoachReportWorker.save_report(agent.id, today, "<html>Report</html>", structured)

      {:ok, %{rows: [row], columns: cols}} =
        Saleflow.Repo.query(
          """
          SELECT report, score_avg, call_count, score_breakdown, talk_ratio_avg,
                 sentiment_positive_pct, meeting_count, conversion_rate, focus_area,
                 focus_area_score_today, previous_focus_followed_up, top_competitors, top_objections
          FROM agent_daily_reports
          WHERE user_id = $1 AND date = $2
          """,
          [Ecto.UUID.dump!(agent.id), today]
        )

      data = cols |> Enum.zip(row) |> Map.new()

      assert data["report"] == "<html>Report</html>"
      assert data["score_avg"] == 7.2
      assert data["call_count"] == 5
      assert Jason.decode!(data["score_breakdown"]) == %{"opening" => 8.0, "discovery" => 6.0, "pitch" => 7.0, "objection_handling" => 5.5, "closing" => 7.5}
      assert data["talk_ratio_avg"] == 55.0
      assert data["sentiment_positive_pct"] == 60.0
      assert data["meeting_count"] == 2
      assert data["conversion_rate"] == 40.0
      assert data["focus_area"] == "objection_handling"
      assert data["focus_area_score_today"] == 5.5
      assert data["previous_focus_followed_up"] == true
      assert Jason.decode!(data["top_competitors"]) == %{"Webnode" => 3, "Wix" => 1}
      assert Jason.decode!(data["top_objections"]) == %{"har leverantor" => 5, "for dyrt" => 2}
    end

    test "upserts on conflict (same user_id + date)" do
      agent = create_agent!()
      today = Date.utc_today()

      structured = %{
        score_avg: 6.0, call_count: 3, score_breakdown: nil,
        talk_ratio_avg: nil, sentiment_positive_pct: nil, meeting_count: 0,
        conversion_rate: 0.0, focus_area: "opening", focus_area_score_today: nil,
        previous_focus_followed_up: false, top_competitors: nil, top_objections: nil
      }

      {:ok, _} = CoachReportWorker.save_report(agent.id, today, "<html>First</html>", structured)

      updated = %{structured | score_avg: 8.0, call_count: 7}
      {:ok, _} = CoachReportWorker.save_report(agent.id, today, "<html>Updated</html>", updated)

      {:ok, %{rows: [[report, score_avg, call_count]]}} =
        Saleflow.Repo.query(
          "SELECT report, score_avg, call_count FROM agent_daily_reports WHERE user_id = $1 AND date = $2",
          [Ecto.UUID.dump!(agent.id), today]
        )

      assert report == "<html>Updated</html>"
      assert score_avg == 8.0
      assert call_count == 7
    end

    test "handles nil jsonb fields" do
      agent = create_agent!()
      today = Date.utc_today()

      structured = %{
        score_avg: nil, call_count: 0, score_breakdown: nil,
        talk_ratio_avg: nil, sentiment_positive_pct: nil, meeting_count: 0,
        conversion_rate: 0.0, focus_area: nil, focus_area_score_today: nil,
        previous_focus_followed_up: false, top_competitors: nil, top_objections: nil
      }

      assert {:ok, _} = CoachReportWorker.save_report(agent.id, today, "<html>Empty</html>", structured)
    end
  end

  # ---------------------------------------------------------------------------
  # call_claude uses prompt caching
  # ---------------------------------------------------------------------------

  describe "call_claude prompt caching" do
    test "sends anthropic-beta header for prompt caching" do
      Application.put_env(:saleflow, :coach_http_client, FakeClaudeWithHeaderCheck)

      agent = create_agent!()
      today = Date.utc_today()

      insert_phone_call_with_analysis!(agent.id, today, sample_analysis())

      assert :ok = CoachReportWorker.perform(%Oban.Job{args: %{"date" => Date.to_iso8601(today)}})

      headers = :persistent_term.get(:coach_test_headers, %{})
      assert headers["anthropic-beta"] == "prompt-caching-2024-07-31"
      assert headers["anthropic-version"] == "2023-06-01"

      body = :persistent_term.get(:coach_test_body, %{})
      [system_msg] = body["system"]
      assert system_msg["cache_control"] == %{"type" => "ephemeral"}
      assert system_msg["text"] =~ "AI-säljcoach"
    end
  end

  # ---------------------------------------------------------------------------
  # get_category_avg/1
  # ---------------------------------------------------------------------------

  describe "get_category_avg/1" do
    test "extracts avg from map" do
      assert 7.5 == CoachReportWorker.get_category_avg(%{"avg" => 7.5})
    end

    test "returns nil for non-map" do
      assert nil == CoachReportWorker.get_category_avg("invalid")
    end

    test "returns nil for map without avg key" do
      assert nil == CoachReportWorker.get_category_avg(%{"score" => 7})
    end
  end

  # ---------------------------------------------------------------------------
  # parse_date/1
  # ---------------------------------------------------------------------------

  describe "parse_date/1" do
    test "parses ISO 8601 string to Date" do
      assert ~D[2026-04-07] == CoachReportWorker.parse_date("2026-04-07")
    end

    test "passes through a Date struct unchanged" do
      date = ~D[2026-04-07]
      assert date == CoachReportWorker.parse_date(date)
    end
  end

  # ---------------------------------------------------------------------------
  # collect_data/2 — invalid JSON fallback
  # ---------------------------------------------------------------------------

  describe "collect_data/2 invalid JSON" do
    test "falls back to empty map when transcription_analysis is invalid JSON" do
      agent = create_agent!()
      today = Date.utc_today()

      # Insert call with invalid JSON in transcription_analysis
      Saleflow.Repo.query!(
        """
        INSERT INTO phone_calls (id, user_id, caller, callee, direction, received_at, duration,
                                 transcription_analysis, talk_ratio_seller, sentiment, scorecard_avg,
                                 call_summary, inserted_at)
        VALUES ($1, $2, '+46701234567', '+46812345678', 'outgoing', $3, 60, $4, 50, 'neutral', 5.0, 'Test', NOW())
        """,
        [
          Ecto.UUID.dump!(Ecto.UUID.generate()),
          Ecto.UUID.dump!(agent.id),
          NaiveDateTime.new!(today, ~T[09:00:00]),
          "not-valid-json{{{"
        ]
      )

      calls = CoachReportWorker.collect_data(agent.id, today)
      assert length(calls) == 1
      assert hd(calls).analysis == %{}
    end
  end

  # ---------------------------------------------------------------------------
  # generate_report/2 — with active playbook and agent goals
  # ---------------------------------------------------------------------------

  describe "generate_report/2 with playbook and goals" do
    test "uses active playbook as formatted system context" do
      Application.put_env(:saleflow, :coach_http_client, FakeClaudeWithHeaderCheck)

      agent = create_agent!()
      today = Date.utc_today()

      insert_phone_call_with_analysis!(agent.id, today, sample_analysis())
      insert_playbook!()
      insert_goal!(agent.id, "meetings", 3, "day")

      assert :ok = CoachReportWorker.perform(%Oban.Job{args: %{"date" => Date.to_iso8601(today)}})

      body = :persistent_term.get(:coach_test_body, %{})
      [system_msg] = body["system"]
      # Playbook text should be embedded in system message
      assert system_msg["text"] =~ "PLAYBOOK"
      assert system_msg["text"] =~ "Hej, jag heter"

      # Report should be saved
      {:ok, %{rows: rows}} =
        Saleflow.Repo.query(
          "SELECT count(*) FROM agent_daily_reports WHERE user_id = $1 AND date = $2",
          [Ecto.UUID.dump!(agent.id), today]
        )

      assert [[1]] = rows
    end

    test "prompt includes agent goals when goals exist in DB" do
      Application.put_env(:saleflow, :coach_http_client, FakeClaudeWithHeaderCheck)

      agent = create_agent!()
      today = Date.utc_today()

      insert_phone_call_with_analysis!(agent.id, today, sample_analysis())
      insert_goal!(agent.id, "calls", 10, "day")

      assert :ok = CoachReportWorker.perform(%Oban.Job{args: %{"date" => Date.to_iso8601(today)}})

      body = :persistent_term.get(:coach_test_body, %{})
      [%{"content" => prompt}] = body["messages"]
      assert prompt =~ "AGENTENS MAL"
      assert prompt =~ "calls"
    end
  end

  # ---------------------------------------------------------------------------
  # call_claude — network-level error branch ({:error, reason})
  # ---------------------------------------------------------------------------

  describe "call_claude network error" do
    test "handles {:error, reason} from HTTP client gracefully" do
      Application.put_env(:saleflow, :coach_http_client, FakeClaudeNetworkError)

      agent = create_agent!()
      today = Date.utc_today()

      insert_phone_call_with_analysis!(agent.id, today, sample_analysis())

      # Should not crash — network error is caught and logged
      assert :ok = CoachReportWorker.perform(%Oban.Job{args: %{"date" => Date.to_iso8601(today)}})

      # No report saved
      {:ok, %{rows: rows}} =
        Saleflow.Repo.query(
          "SELECT count(*) FROM agent_daily_reports WHERE user_id = $1 AND date = $2",
          [Ecto.UUID.dump!(agent.id), today]
        )

      assert [[0]] = rows
    end
  end

  # ---------------------------------------------------------------------------
  # DB error fallbacks (list_agents and get_agent_goals)
  # Temporarily rename tables to force a SQL error and exercise the _ -> []
  # branches in the private helpers. Table is always restored after the test.
  # ---------------------------------------------------------------------------

  describe "DB error fallbacks" do
    test "list_agents returns empty list when users table is unavailable" do
      # Rename table to force a SQL error inside list_agents/0
      Saleflow.Repo.query!("ALTER TABLE users RENAME TO users_tmp")

      result =
        try do
          CoachReportWorker.perform(%Oban.Job{args: %{}})
        after
          Saleflow.Repo.query!("ALTER TABLE users_tmp RENAME TO users")
        end

      assert result == :ok
    end

    test "get_agent_goals returns empty list when goals table is unavailable" do
      Application.put_env(:saleflow, :coach_http_client, FakeClaudeSuccess)

      agent = create_agent!()
      today = Date.utc_today()
      insert_phone_call_with_analysis!(agent.id, today, sample_analysis())

      # Rename goals table to force a SQL error inside get_agent_goals/1
      Saleflow.Repo.query!("ALTER TABLE goals RENAME TO goals_tmp")

      result =
        try do
          CoachReportWorker.perform(%Oban.Job{args: %{"date" => Date.to_iso8601(today)}})
        after
          Saleflow.Repo.query!("ALTER TABLE goals_tmp RENAME TO goals")
        end

      assert result == :ok
    end
  end
end
