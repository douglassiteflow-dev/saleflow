defmodule SaleflowWeb.CallControllerTest do
  use SaleflowWeb.ConnCase

  import Mox

  alias Saleflow.Telavox.MockClient

  setup :verify_on_exit!

  # -------------------------------------------------------------------------
  # Helpers
  # -------------------------------------------------------------------------

  defp authenticated_conn(conn, attrs \\ %{}) do
    register_and_log_in_user(conn, attrs)
  end

  defp set_telavox_token(user, token) do
    {:ok, user} =
      user
      |> Ash.Changeset.for_update(:update_user, %{telavox_token: token})
      |> Ash.update()

    user
  end

  defp create_lead(attrs \\ %{}) do
    lead_attrs =
      Map.merge(
        %{
          företag: "Test AB",
          telefon: "+46701234567"
        },
        attrs
      )

    {:ok, lead} =
      Saleflow.Sales.Lead
      |> Ash.Changeset.for_create(:create_bulk, lead_attrs)
      |> Ash.create()

    lead
  end

  # -------------------------------------------------------------------------
  # POST /api/calls/dial
  # -------------------------------------------------------------------------

  describe "POST /api/calls/dial" do
    test "returns 422 when no lead_id provided", %{conn: conn} do
      {conn, user} = authenticated_conn(conn)
      _user = set_telavox_token(user, "valid-token")

      conn = post(conn, "/api/calls/dial", %{})

      assert json_response(conn, 422) == %{"error" => "lead_id krävs"}
    end

    test "returns 422 when user has no telavox_token", %{conn: conn} do
      {conn, _user} = authenticated_conn(conn)
      lead = create_lead()

      conn = post(conn, "/api/calls/dial", %{"lead_id" => lead.id})

      assert json_response(conn, 422) == %{
               "error" => "Koppla Telavox i din profil för att ringa"
             }
    end

    test "returns 422 when user has empty telavox_token", %{conn: conn} do
      {conn, user} = authenticated_conn(conn)
      _user = set_telavox_token(user, "")
      lead = create_lead()

      conn = post(conn, "/api/calls/dial", %{"lead_id" => lead.id})

      assert json_response(conn, 422) == %{
               "error" => "Koppla Telavox i din profil för att ringa"
             }
    end

    test "returns 404 when lead does not exist", %{conn: conn} do
      {conn, user} = authenticated_conn(conn)
      _user = set_telavox_token(user, "valid-token")

      fake_id = Ecto.UUID.generate()
      conn = post(conn, "/api/calls/dial", %{"lead_id" => fake_id})

      assert json_response(conn, 404) == %{"error" => "Lead saknar telefonnummer"}
    end

    test "returns 404 when lead has empty phone number", %{conn: conn} do
      {conn, user} = authenticated_conn(conn)
      _user = set_telavox_token(user, "valid-token")

      # Insert directly via SQL since Ash validation rejects empty telefon
      lead_id = Ecto.UUID.generate()

      Saleflow.Repo.query!(
        "INSERT INTO leads (id, företag, telefon, status, inserted_at, updated_at) VALUES ($1, $2, $3, $4, NOW(), NOW())",
        [Ecto.UUID.dump!(lead_id), "Test AB", "", "new"]
      )

      conn = post(conn, "/api/calls/dial", %{"lead_id" => lead_id})

      assert json_response(conn, 404) == %{"error" => "Lead saknar telefonnummer"}
    end

    test "returns 200 on successful dial", %{conn: conn} do
      {conn, user} = authenticated_conn(conn)
      _user = set_telavox_token(user, "valid-token")
      lead = create_lead(%{telefon: "+46701234567"})

      MockClient
      |> expect(:get_as, fn "valid-token", "/dial/+46701234567" ->
        {:ok, %{"status" => "dialing"}}
      end)

      conn = post(conn, "/api/calls/dial", %{"lead_id" => lead.id})

      assert json_response(conn, 200) == %{"ok" => true, "number" => "+46701234567"}
    end

    test "returns 401 and clears token when Telavox returns unauthorized", %{conn: conn} do
      {conn, user} = authenticated_conn(conn)
      _user = set_telavox_token(user, "expired-token")
      lead = create_lead()

      MockClient
      |> expect(:get_as, fn "expired-token", _path ->
        {:error, :unauthorized}
      end)

      conn = post(conn, "/api/calls/dial", %{"lead_id" => lead.id})

      assert json_response(conn, 401) == %{"error" => "Telavox-token har gått ut"}

      # Verify token was cleared
      refreshed = Ash.get!(Saleflow.Accounts.User, user.id)
      assert is_nil(refreshed.telavox_token)
    end

    test "returns 502 on Telavox API error", %{conn: conn} do
      {conn, user} = authenticated_conn(conn)
      _user = set_telavox_token(user, "valid-token")
      lead = create_lead()

      MockClient
      |> expect(:get_as, fn "valid-token", _path ->
        {:error, {:http, 500, "Internal Server Error"}}
      end)

      conn = post(conn, "/api/calls/dial", %{"lead_id" => lead.id})

      response = json_response(conn, 502)
      assert response["error"] =~ "Telavox fel:"
    end

    test "returns 502 on timeout error", %{conn: conn} do
      {conn, user} = authenticated_conn(conn)
      _user = set_telavox_token(user, "valid-token")
      lead = create_lead()

      MockClient
      |> expect(:get_as, fn "valid-token", _path ->
        {:error, :timeout}
      end)

      conn = post(conn, "/api/calls/dial", %{"lead_id" => lead.id})

      response = json_response(conn, 502)
      assert response["error"] =~ "Telavox fel:"
    end

    test "requires authentication", %{conn: conn} do
      conn =
        conn
        |> Plug.Test.init_test_session(%{})
        |> post("/api/calls/dial", %{"lead_id" => Ecto.UUID.generate()})

      assert json_response(conn, 401)
    end
  end

  # -------------------------------------------------------------------------
  # POST /api/calls/hangup
  # -------------------------------------------------------------------------

  describe "POST /api/calls/hangup" do
    test "returns 422 when user has no telavox_token", %{conn: conn} do
      {conn, _user} = authenticated_conn(conn)

      conn = post(conn, "/api/calls/hangup")

      assert json_response(conn, 422) == %{"error" => "Inte kopplad till Telavox"}
    end

    test "returns 422 when user has empty telavox_token", %{conn: conn} do
      {conn, user} = authenticated_conn(conn)
      _user = set_telavox_token(user, "")

      conn = post(conn, "/api/calls/hangup")

      assert json_response(conn, 422) == %{"error" => "Inte kopplad till Telavox"}
    end

    test "returns 200 on successful hangup", %{conn: conn} do
      {conn, user} = authenticated_conn(conn)
      _user = set_telavox_token(user, "valid-token")

      MockClient
      |> expect(:post_as, fn "valid-token", "/hangup" ->
        {:ok, %{"status" => "ok"}}
      end)

      conn = post(conn, "/api/calls/hangup")

      assert json_response(conn, 200) == %{"ok" => true}
    end

    test "returns 200 with message when no call to hangup (bad_request)", %{conn: conn} do
      {conn, user} = authenticated_conn(conn)
      _user = set_telavox_token(user, "valid-token")

      MockClient
      |> expect(:post_as, fn "valid-token", "/hangup" ->
        {:error, {:bad_request, "No active call"}}
      end)

      conn = post(conn, "/api/calls/hangup")

      assert json_response(conn, 200) == %{"ok" => true}
    end

    test "returns 401 and clears token when Telavox returns unauthorized", %{conn: conn} do
      {conn, user} = authenticated_conn(conn)
      _user = set_telavox_token(user, "expired-token")

      MockClient
      |> expect(:post_as, fn "expired-token", "/hangup" ->
        {:error, :unauthorized}
      end)

      conn = post(conn, "/api/calls/hangup")

      assert json_response(conn, 401) == %{"error" => "Telavox-token har gått ut"}

      # Verify token was cleared
      refreshed = Ash.get!(Saleflow.Accounts.User, user.id)
      assert is_nil(refreshed.telavox_token)
    end

    test "returns 502 on Telavox API error", %{conn: conn} do
      {conn, user} = authenticated_conn(conn)
      _user = set_telavox_token(user, "valid-token")

      MockClient
      |> expect(:post_as, fn "valid-token", "/hangup" ->
        {:error, {:http, 500, "Internal Server Error"}}
      end)

      conn = post(conn, "/api/calls/hangup")

      response = json_response(conn, 502)
      assert response["error"] =~ "Telavox fel:"
    end

    test "returns 502 on timeout error", %{conn: conn} do
      {conn, user} = authenticated_conn(conn)
      _user = set_telavox_token(user, "valid-token")

      MockClient
      |> expect(:post_as, fn "valid-token", "/hangup" ->
        {:error, :timeout}
      end)

      conn = post(conn, "/api/calls/hangup")

      response = json_response(conn, 502)
      assert response["error"] =~ "Telavox fel:"
    end

    test "requires authentication", %{conn: conn} do
      conn =
        conn
        |> Plug.Test.init_test_session(%{})
        |> post("/api/calls/hangup")

      assert json_response(conn, 401)
    end
  end

  # -------------------------------------------------------------------------
  # GET /api/calls/:id/recording
  # -------------------------------------------------------------------------

  describe "GET /api/calls/:id/recording" do
    test "returns 200 with url when recording exists and user owns the call", %{conn: conn} do
      {conn, user} = authenticated_conn(conn)

      # Create a phone call owned by this user and set recording_key
      {:ok, phone_call} =
        Saleflow.Sales.create_phone_call(%{
          caller: "+46701111111",
          callee: "+46812345678",
          duration: 30,
          user_id: user.id
        })

      Saleflow.Repo.query!(
        "UPDATE phone_calls SET recording_key = $1 WHERE id = $2",
        ["recordings/2026/04/#{phone_call.id}.mp3", Ecto.UUID.dump!(phone_call.id)]
      )

      conn = get(conn, "/api/calls/#{phone_call.id}/recording")

      response = json_response(conn, 200)
      assert response["url"] =~ "recordings/2026/04/#{phone_call.id}.mp3"
    end

    test "returns 200 when admin accesses another user's recording", %{conn: conn} do
      {_conn, agent} = authenticated_conn(conn)

      {:ok, phone_call} =
        Saleflow.Sales.create_phone_call(%{
          caller: "+46701111111",
          callee: "+46812345678",
          duration: 30,
          user_id: agent.id
        })

      Saleflow.Repo.query!(
        "UPDATE phone_calls SET recording_key = $1 WHERE id = $2",
        ["recordings/2026/04/#{phone_call.id}.mp3", Ecto.UUID.dump!(phone_call.id)]
      )

      {admin_conn, _admin} = authenticated_conn(conn, %{role: :admin})
      admin_conn = get(admin_conn, "/api/calls/#{phone_call.id}/recording")

      response = json_response(admin_conn, 200)
      assert response["url"] =~ "recordings/2026/04/#{phone_call.id}.mp3"
    end

    test "returns 403 when user does not own the recording", %{conn: conn} do
      {_conn, other_user} = authenticated_conn(conn)

      {:ok, phone_call} =
        Saleflow.Sales.create_phone_call(%{
          caller: "+46701111111",
          callee: "+46812345678",
          duration: 30,
          user_id: other_user.id
        })

      Saleflow.Repo.query!(
        "UPDATE phone_calls SET recording_key = $1 WHERE id = $2",
        ["recordings/2026/04/#{phone_call.id}.mp3", Ecto.UUID.dump!(phone_call.id)]
      )

      {requester_conn, _requester} = authenticated_conn(conn)
      requester_conn = get(requester_conn, "/api/calls/#{phone_call.id}/recording")

      assert json_response(requester_conn, 403) == %{"error" => "Access denied"}
    end

    test "returns 404 when phone_call has no recording", %{conn: conn} do
      {conn, user} = authenticated_conn(conn)

      {:ok, phone_call} =
        Saleflow.Sales.create_phone_call(%{
          caller: "+46701111111",
          callee: "+46812345678",
          duration: 30,
          user_id: user.id
        })

      conn = get(conn, "/api/calls/#{phone_call.id}/recording")

      assert json_response(conn, 404) == %{"error" => "Ingen inspelning"}
    end

    test "returns 404 when phone_call does not exist", %{conn: conn} do
      {conn, _user} = authenticated_conn(conn)
      fake_id = Ecto.UUID.generate()

      conn = get(conn, "/api/calls/#{fake_id}/recording")

      assert json_response(conn, 404) == %{"error" => "Ingen inspelning"}
    end

    test "requires authentication", %{conn: conn} do
      conn =
        conn
        |> Plug.Test.init_test_session(%{})
        |> get("/api/calls/#{Ecto.UUID.generate()}/recording")

      assert json_response(conn, 401)
    end
  end

  # -------------------------------------------------------------------------
  # GET /api/calls/agent-report
  # -------------------------------------------------------------------------

  describe "GET /api/calls/agent-report" do
    test "returns null report when no report exists for date", %{conn: conn} do
      {conn, _user} = authenticated_conn(conn)

      conn = get(conn, "/api/calls/agent-report?date=2026-04-01")

      response = json_response(conn, 200)
      assert response["date"] == "2026-04-01"
      assert response["report"] == nil
      assert response["score_avg"] == nil
      assert response["call_count"] == nil
    end

    test "returns report when it exists for the user and date", %{conn: conn} do
      {conn, user} = authenticated_conn(conn)
      today = Date.utc_today()

      report = %{
        "greeting" => "Hej Test User!",
        "score_summary" => "7.5/10",
        "wins" => ["Bra pitch"],
        "focus_area" => "Avslut",
        "progress_note" => "Bra utveckling",
        "tip_of_the_day" => "Var mer specifik",
        "motivation" => "Du rockar!"
      }

      Saleflow.Repo.query!(
        """
        INSERT INTO agent_daily_reports (id, user_id, date, report, score_avg, call_count, inserted_at)
        VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, NOW())
        """,
        [Ecto.UUID.dump!(user.id), today, Jason.encode!(report), 7.5, 4]
      )

      conn = get(conn, "/api/calls/agent-report?date=#{Date.to_iso8601(today)}")

      response = json_response(conn, 200)
      assert response["date"] == Date.to_iso8601(today)
      assert response["report"]["greeting"] == "Hej Test User!"
      assert response["report"]["wins"] == ["Bra pitch"]
      assert response["score_avg"] == 7.5
      assert response["call_count"] == 4
    end

    test "defaults to today when no date param", %{conn: conn} do
      {conn, _user} = authenticated_conn(conn)

      conn = get(conn, "/api/calls/agent-report")

      response = json_response(conn, 200)
      assert response["date"] == Date.to_iso8601(Date.utc_today())
      assert response["report"] == nil
    end

    test "returns only the authenticated user's report", %{conn: conn} do
      # Create a report for user A
      {_conn_a, user_a} = authenticated_conn(conn)
      today = Date.utc_today()

      report_a = Jason.encode!(%{"greeting" => "Hej A!"})

      Saleflow.Repo.query!(
        """
        INSERT INTO agent_daily_reports (id, user_id, date, report, score_avg, call_count, inserted_at)
        VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, NOW())
        """,
        [Ecto.UUID.dump!(user_a.id), today, report_a, 8.0, 3]
      )

      # User B should NOT see User A's report
      {conn_b, _user_b} = authenticated_conn(conn)
      conn_b = get(conn_b, "/api/calls/agent-report?date=#{Date.to_iso8601(today)}")

      response = json_response(conn_b, 200)
      assert response["report"] == nil
    end

    test "requires authentication", %{conn: conn} do
      conn =
        conn
        |> Plug.Test.init_test_session(%{})
        |> get("/api/calls/agent-report")

      assert json_response(conn, 401)
    end
  end
end
