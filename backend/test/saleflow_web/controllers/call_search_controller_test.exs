defmodule SaleflowWeb.CallSearchControllerTest do
  use SaleflowWeb.ConnCase, async: false

  alias Saleflow.Sales

  setup %{conn: conn} do
    # Create authenticated user (agent)
    {conn, user} = register_and_log_in_user(conn)

    # Create a lead
    {:ok, lead} = Sales.create_lead(%{företag: "Test AB", telefon: "+46701234567"})

    # Create a call_log with outcome
    {:ok, call_log} =
      Sales.log_call(%{
        lead_id: lead.id,
        user_id: user.id,
        outcome: :meeting_booked,
        notes: "Bokat demo"
      })

    # Create a phone_call with transcription containing searchable Swedish text
    phone_call_id = Ecto.UUID.generate()

    transcription =
      "Hej, jag ringer fran Saleflow. Vi erbjuder en bra losning till ett mycket bra pris. " <>
        "Kunden var intresserad av var produkt och ville veta mer om prissattning och leveranstider."

    Saleflow.Repo.query!(
      """
      INSERT INTO phone_calls (id, caller, callee, duration, user_id, lead_id, call_log_id,
        received_at, inserted_at, transcription, scorecard_avg, sentiment, call_summary)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      """,
      [
        Ecto.UUID.dump!(phone_call_id),
        "+46701111111",
        "+46701234567",
        120,
        Ecto.UUID.dump!(user.id),
        Ecto.UUID.dump!(lead.id),
        Ecto.UUID.dump!(call_log.id),
        DateTime.utc_now(),
        DateTime.utc_now(),
        transcription,
        8.5,
        "positive",
        "Bra samtal om prissattning"
      ]
    )

    {:ok, conn: conn, user: user, lead: lead, phone_call_id: phone_call_id, call_log: call_log}
  end

  describe "GET /api/calls/search" do
    test "searches transcriptions by keyword", %{conn: conn} do
      conn = get(conn, "/api/calls/search?q=pris")
      assert %{"results" => results} = json_response(conn, 200)
      assert is_list(results)
      assert length(results) > 0
    end

    test "returns highlighted snippets", %{conn: conn} do
      conn = get(conn, "/api/calls/search?q=pris")
      %{"results" => [result | _]} = json_response(conn, 200)
      assert Map.has_key?(result, "snippet")
      assert is_binary(result["snippet"])
    end

    test "returns expected fields in results", %{conn: conn, phone_call_id: phone_call_id} do
      conn = get(conn, "/api/calls/search?q=pris")
      %{"results" => [result | _]} = json_response(conn, 200)

      assert result["id"] == phone_call_id
      assert result["duration"] == 120
      assert result["scorecard_avg"] == 8.5
      assert result["sentiment"] == "positive"
      assert result["summary"] == "Bra samtal om prissattning"
      assert result["outcome"] == "meeting_booked"
      assert result["agent_name"] == "Test User"
    end

    test "filters by agent", %{conn: conn, user: user} do
      conn = get(conn, "/api/calls/search?q=pris&agent=#{user.id}")
      assert %{"results" => results} = json_response(conn, 200)
      assert length(results) > 0
    end

    test "filters by date range", %{conn: conn} do
      today = Date.to_iso8601(Date.utc_today())
      conn = get(conn, "/api/calls/search?q=pris&from=#{today}&to=#{today}")
      assert %{"results" => results} = json_response(conn, 200)
      assert length(results) > 0
    end

    test "filters by date range excludes out-of-range", %{conn: conn} do
      conn = get(conn, "/api/calls/search?q=pris&from=2020-01-01&to=2020-01-02")
      assert %{"results" => []} = json_response(conn, 200)
    end

    test "filters by outcome", %{conn: conn} do
      conn = get(conn, "/api/calls/search?q=pris&outcome=meeting_booked")
      assert %{"results" => results} = json_response(conn, 200)
      assert length(results) > 0
    end

    test "filters by outcome excludes non-matching", %{conn: conn} do
      conn = get(conn, "/api/calls/search?q=pris&outcome=no_answer")
      assert %{"results" => []} = json_response(conn, 200)
    end

    test "filters by minimum score", %{conn: conn} do
      conn = get(conn, "/api/calls/search?q=pris&min_score=7")
      assert %{"results" => results} = json_response(conn, 200)
      assert length(results) > 0
    end

    test "filters by minimum score excludes low scores", %{conn: conn} do
      conn = get(conn, "/api/calls/search?q=pris&min_score=9.5")
      assert %{"results" => []} = json_response(conn, 200)
    end

    test "returns empty for no matches", %{conn: conn} do
      conn = get(conn, "/api/calls/search?q=xyznonexistent")
      assert %{"results" => []} = json_response(conn, 200)
    end

    test "returns 400 without query param", %{conn: conn} do
      conn = get(conn, "/api/calls/search")
      assert json_response(conn, 400)
      assert %{"error" => _} = json_response(conn, 400)
    end

    test "returns 400 with empty query param", %{conn: conn} do
      conn = get(conn, "/api/calls/search?q=")
      assert json_response(conn, 400)
    end

    test "agent only sees own calls", %{conn: conn} do
      # Create another user with a phone call
      {_conn2, other_user} = register_and_log_in_user(build_conn())

      other_call_id = Ecto.UUID.generate()

      Saleflow.Repo.query!(
        """
        INSERT INTO phone_calls (id, caller, callee, duration, user_id,
          received_at, inserted_at, transcription)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        """,
        [
          Ecto.UUID.dump!(other_call_id),
          "+46702222222",
          "+46703333333",
          60,
          Ecto.UUID.dump!(other_user.id),
          DateTime.utc_now(),
          DateTime.utc_now(),
          "Kunden frågade om pris och leverans."
        ]
      )

      # Original agent should only see their own call
      conn = get(conn, "/api/calls/search?q=pris")
      %{"results" => results} = json_response(conn, 200)

      result_ids = Enum.map(results, & &1["id"])
      refute other_call_id in result_ids
    end

    test "admin sees all calls", %{conn: _conn} do
      # Create another user with a phone call
      {_conn2, other_user} = register_and_log_in_user(build_conn())

      other_call_id = Ecto.UUID.generate()

      Saleflow.Repo.query!(
        """
        INSERT INTO phone_calls (id, caller, callee, duration, user_id,
          received_at, inserted_at, transcription)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        """,
        [
          Ecto.UUID.dump!(other_call_id),
          "+46702222222",
          "+46703333333",
          60,
          Ecto.UUID.dump!(other_user.id),
          DateTime.utc_now(),
          DateTime.utc_now(),
          "Kunden frågade om pris och leverans."
        ]
      )

      # Login as admin
      {admin_conn, _admin} = register_and_log_in_user(build_conn(), %{role: :admin})

      admin_conn = get(admin_conn, "/api/calls/search?q=pris")
      %{"results" => results} = json_response(admin_conn, 200)

      result_ids = Enum.map(results, & &1["id"])
      assert other_call_id in result_ids
    end

    test "admin can filter by agent", %{conn: _conn, user: user, phone_call_id: phone_call_id} do
      # Create another user with a phone call
      {_conn2, other_user} = register_and_log_in_user(build_conn())

      other_call_id = Ecto.UUID.generate()

      Saleflow.Repo.query!(
        """
        INSERT INTO phone_calls (id, caller, callee, duration, user_id,
          received_at, inserted_at, transcription)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        """,
        [
          Ecto.UUID.dump!(other_call_id),
          "+46702222222",
          "+46703333333",
          60,
          Ecto.UUID.dump!(other_user.id),
          DateTime.utc_now(),
          DateTime.utc_now(),
          "Kunden frågade om pris och leverans."
        ]
      )

      # Login as admin and filter by original user
      {admin_conn, _admin} = register_and_log_in_user(build_conn(), %{role: :admin})

      admin_conn = get(admin_conn, "/api/calls/search?q=pris&agent=#{user.id}")
      %{"results" => results} = json_response(admin_conn, 200)

      result_ids = Enum.map(results, & &1["id"])
      assert phone_call_id in result_ids
      refute other_call_id in result_ids
    end

    test "requires authentication", %{conn: _conn} do
      conn =
        build_conn()
        |> Plug.Test.init_test_session(%{})
        |> get("/api/calls/search?q=pris")

      assert json_response(conn, 401)
    end

    test "returns empty results on DB error", %{conn: conn} do
      # Temporarily rename the table to force a query error
      Saleflow.Repo.query!("ALTER TABLE phone_calls RENAME TO phone_calls_bak")

      conn = get(conn, "/api/calls/search?q=pris")
      assert %{"results" => []} = json_response(conn, 200)

      # Restore
      Saleflow.Repo.query!("ALTER TABLE phone_calls_bak RENAME TO phone_calls")
    end
  end
end
