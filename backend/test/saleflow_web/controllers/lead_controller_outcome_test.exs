defmodule SaleflowWeb.LeadControllerOutcomeTest do
  @moduledoc """
  Tests for outcome/2 transaction safety, ordering, and lead-scoped release.
  Covers bugs #4 (no transaction), #11 (release before outcome), #12 (release scoped to user not lead).
  """
  use SaleflowWeb.ConnCase

  alias Saleflow.Accounts
  alias Saleflow.Sales

  setup %{conn: conn} do
    {:ok, user} =
      Accounts.register(%{
        email: "outcome-agent-#{System.unique_integer([:positive])}@test.se",
        name: "Outcome Agent",
        password: "password123",
        password_confirmation: "password123"
      })

    conn = log_in_user(conn, user)
    %{conn: conn, user: user}
  end

  # ---------------------------------------------------------------------------
  # Test 1: Successful outcome updates lead status AND releases assignment
  # ---------------------------------------------------------------------------

  describe "successful outcome updates lead status AND releases assignment" do
    test "no_answer outcome updates status and releases the specific lead assignment",
         %{conn: conn, user: user} do
      {:ok, lead} = Sales.create_lead(%{företag: "TX Test AB", telefon: "+46700000001"})
      {:ok, assignment} = Sales.assign_lead(lead, user)
      {:ok, _lead} = Sales.update_lead_status(lead, %{status: :assigned})

      conn = post(conn, "/api/leads/#{lead.id}/outcome", %{outcome: "no_answer"})
      assert %{"ok" => true} = json_response(conn, 200)

      # Lead status should be updated (quarantine for no_answer)
      {:ok, updated_lead} = Sales.get_lead(lead.id)
      assert updated_lead.status == :quarantine

      # Assignment should be released
      {:ok, reloaded_assignment} = Ash.get(Saleflow.Sales.Assignment, assignment.id)
      refute is_nil(reloaded_assignment.released_at)
      assert reloaded_assignment.release_reason == :outcome_logged
    end

    test "callback outcome updates lead status and releases the specific lead assignment",
         %{conn: conn, user: user} do
      {:ok, lead} = Sales.create_lead(%{företag: "CB Test AB", telefon: "+46700000002"})
      {:ok, assignment} = Sales.assign_lead(lead, user)
      {:ok, _lead} = Sales.update_lead_status(lead, %{status: :assigned})

      conn = post(conn, "/api/leads/#{lead.id}/outcome", %{outcome: "callback"})
      assert %{"ok" => true} = json_response(conn, 200)

      {:ok, updated_lead} = Sales.get_lead(lead.id)
      assert updated_lead.status == :callback

      {:ok, reloaded_assignment} = Ash.get(Saleflow.Sales.Assignment, assignment.id)
      refute is_nil(reloaded_assignment.released_at)
    end
  end

  # ---------------------------------------------------------------------------
  # Test 2: All call history visible to any agent
  # ---------------------------------------------------------------------------

  describe "all call history visible to any agent" do
    test "agent B can see calls made by agent A on the same lead",
         %{conn: _conn, user: user_a} do
      # Create agent B
      {:ok, user_b} =
        Accounts.register(%{
          email: "agent-b-#{System.unique_integer([:positive])}@test.se",
          name: "Agent B",
          password: "password123",
          password_confirmation: "password123"
        })

      {:ok, lead} = Sales.create_lead(%{företag: "Visible History AB", telefon: "+46700000003"})

      # Agent A makes a call on the lead
      {:ok, _call1} =
        Sales.log_call(%{lead_id: lead.id, user_id: user_a.id, outcome: :no_answer})

      # Agent B also makes a call on the lead
      {:ok, _call2} =
        Sales.log_call(%{lead_id: lead.id, user_id: user_b.id, outcome: :callback})

      # Agent B logs in and requests the lead
      conn_b =
        build_conn()
        |> log_in_user(user_b)

      conn_b = get(conn_b, "/api/leads/#{lead.id}")
      assert %{"calls" => calls} = json_response(conn_b, 200)

      # Agent B should see ALL calls, including those made by Agent A
      assert length(calls) == 2
      outcomes = Enum.map(calls, & &1["outcome"])
      assert "no_answer" in outcomes
      assert "callback" in outcomes
    end
  end

  # ---------------------------------------------------------------------------
  # Test 3: Outcome failure does not leave orphaned call_log (transaction safety)
  # ---------------------------------------------------------------------------

  describe "outcome failure does not leave orphaned call_log" do
    test "invalid outcome value returns error without creating call_log",
         %{conn: conn, user: user} do
      {:ok, lead} = Sales.create_lead(%{företag: "Rollback AB", telefon: "+46700000004"})
      {:ok, _assignment} = Sales.assign_lead(lead, user)
      {:ok, _lead} = Sales.update_lead_status(lead, %{status: :assigned})

      # Count call logs before
      {:ok, calls_before} = Sales.list_calls_for_lead(lead.id)
      count_before = length(calls_before)

      # Submit an invalid outcome (not in @valid_outcomes) — caught before transaction
      conn = post(conn, "/api/leads/#{lead.id}/outcome", %{outcome: "invalid_nonsense"})
      assert json_response(conn, 422)

      # No new call_log should be created
      {:ok, calls_after} = Sales.list_calls_for_lead(lead.id)
      assert length(calls_after) == count_before
    end

    test "outcome for non-existent lead rolls back transaction — no call_log created",
         %{conn: conn} do
      fake_id = "00000000-0000-0000-0000-000000000000"

      {:ok, calls_before} = Sales.list_calls_for_lead(fake_id)
      count_before = length(calls_before)

      conn = post(conn, "/api/leads/#{fake_id}/outcome", %{outcome: "no_answer"})
      assert json_response(conn, 422)

      {:ok, calls_after} = Sales.list_calls_for_lead(fake_id)
      assert length(calls_after) == count_before
    end
  end

  # ---------------------------------------------------------------------------
  # Test 4: Release is scoped to specific lead (Bug #12)
  # ---------------------------------------------------------------------------

  describe "release is scoped to specific lead" do
    test "outcome on lead A does NOT release assignment for lead B",
         %{conn: conn, user: user} do
      {:ok, lead_a} = Sales.create_lead(%{företag: "Lead A AB", telefon: "+46700000010"})
      {:ok, lead_b} = Sales.create_lead(%{företag: "Lead B AB", telefon: "+46700000011"})

      {:ok, _assignment_a} = Sales.assign_lead(lead_a, user)
      {:ok, assignment_b} = Sales.assign_lead(lead_b, user)
      {:ok, _} = Sales.update_lead_status(lead_a, %{status: :assigned})
      {:ok, _} = Sales.update_lead_status(lead_b, %{status: :assigned})

      # Outcome on lead A
      conn = post(conn, "/api/leads/#{lead_a.id}/outcome", %{outcome: "no_answer"})
      assert %{"ok" => true} = json_response(conn, 200)

      # Lead B's assignment should still be active (not released)
      {:ok, reloaded_b} = Ash.get(Saleflow.Sales.Assignment, assignment_b.id)
      assert is_nil(reloaded_b.released_at),
        "Assignment for lead B should NOT be released when outcome is submitted for lead A"
    end
  end

  # ---------------------------------------------------------------------------
  # Test 5: Skip count off-by-one (Bug #7)
  # ---------------------------------------------------------------------------

  describe "skip count off-by-one fix" do
    test "3rd skip is still quarantine not permanent (off-by-one regression)",
         %{conn: conn, user: user} do
      {:ok, lead} = Sales.create_lead(%{företag: "Skip3 AB", telefon: "+46700000020"})

      # Insert 2 previous skip call_logs directly via SQL to bypass 20s dedup validation
      uid = Ecto.UUID.dump!(user.id)
      lid = Ecto.UUID.dump!(lead.id)
      past = DateTime.utc_now() |> DateTime.add(-3600, :second)

      for i <- 1..2 do
        cid = Ecto.UUID.dump!(Ecto.UUID.generate())
        ts = DateTime.add(past, -i * 60, :second)
        Saleflow.Repo.query!(
          "INSERT INTO call_logs (id, lead_id, user_id, outcome, called_at) VALUES ($1, $2, $3, 'skipped', $4)",
          [cid, lid, uid, ts]
        )
      end

      # 3rd skip via API — should be quarantine, NOT permanent
      {:ok, _} = Sales.assign_lead(lead, user)
      {:ok, _} = Sales.update_lead_status(lead, %{status: :assigned})

      conn = post(conn, "/api/leads/#{lead.id}/outcome", %{outcome: "skipped"})
      assert %{"ok" => true} = json_response(conn, 200)

      {:ok, updated} = Sales.get_lead(lead.id)
      assert updated.status == :quarantine
      # Should NOT be permanent (quarantine_until should be ~24h from now, not 2099)
      assert DateTime.compare(updated.quarantine_until, ~U[2098-01-01 00:00:00Z]) == :lt
    end

    test "4th skip triggers permanent not_interested",
         %{conn: conn, user: user} do
      {:ok, lead} = Sales.create_lead(%{företag: "Skip4 AB", telefon: "+46700000021"})

      # Insert 3 previous skip call_logs directly via SQL
      uid = Ecto.UUID.dump!(user.id)
      lid = Ecto.UUID.dump!(lead.id)
      past = DateTime.utc_now() |> DateTime.add(-3600, :second)

      for i <- 1..3 do
        cid = Ecto.UUID.dump!(Ecto.UUID.generate())
        ts = DateTime.add(past, -i * 60, :second)
        Saleflow.Repo.query!(
          "INSERT INTO call_logs (id, lead_id, user_id, outcome, called_at) VALUES ($1, $2, $3, 'skipped', $4)",
          [cid, lid, uid, ts]
        )
      end

      # 4th skip via API — should trigger permanent not_interested
      {:ok, _} = Sales.assign_lead(lead, user)
      {:ok, _} = Sales.update_lead_status(lead, %{status: :assigned})

      conn = post(conn, "/api/leads/#{lead.id}/outcome", %{outcome: "skipped"})
      assert %{"ok" => true} = json_response(conn, 200)

      {:ok, updated} = Sales.get_lead(lead.id)
      assert updated.status == :quarantine
      # Permanent: quarantine_until should be 2099
      assert DateTime.compare(updated.quarantine_until, ~U[2098-01-01 00:00:00Z]) == :gt
    end
  end

  # ---------------------------------------------------------------------------
  # Test 6: meeting_booked creates meeting before status update (Bug #8)
  # ---------------------------------------------------------------------------

  describe "meeting_booked creates meeting and updates status" do
    test "meeting_booked with valid future date creates meeting and updates lead status",
         %{conn: conn, user: user} do
      {:ok, lead} = Sales.create_lead(%{företag: "Meeting AB", telefon: "+46700000040"})
      {:ok, _assignment} = Sales.assign_lead(lead, user)
      {:ok, _lead} = Sales.update_lead_status(lead, %{status: :assigned})

      future_date = Date.utc_today() |> Date.add(3) |> Date.to_iso8601()

      conn =
        post(conn, "/api/leads/#{lead.id}/outcome", %{
          outcome: "meeting_booked",
          meeting_date: future_date,
          meeting_time: "10:00"
        })

      assert %{"ok" => true} = json_response(conn, 200)

      # Lead status should be :meeting_booked
      {:ok, updated_lead} = Sales.get_lead(lead.id)
      assert updated_lead.status == :meeting_booked

      # Meeting should exist for this lead
      {:ok, meetings} = Sales.list_meetings_for_lead(lead.id)
      assert length(meetings) == 1

      meeting = hd(meetings)
      assert meeting.meeting_date == Date.from_iso8601!(future_date)
      assert meeting.meeting_time == ~T[10:00:00]
    end

    test "meeting_booked with conflict returns error and does not change lead status",
         %{conn: conn, user: user} do
      {:ok, lead_a} = Sales.create_lead(%{företag: "First Meeting AB", telefon: "+46700000041"})
      {:ok, _} = Sales.assign_lead(lead_a, user)
      {:ok, _} = Sales.update_lead_status(lead_a, %{status: :assigned})

      future_date = Date.utc_today() |> Date.add(5) |> Date.to_iso8601()

      # Book first meeting
      conn_a =
        post(conn, "/api/leads/#{lead_a.id}/outcome", %{
          outcome: "meeting_booked",
          meeting_date: future_date,
          meeting_time: "14:00"
        })

      assert %{"ok" => true} = json_response(conn_a, 200)

      # Try to book second meeting at same time with a different lead
      {:ok, lead_b} = Sales.create_lead(%{företag: "Conflict Meeting AB", telefon: "+46700000042"})
      {:ok, _} = Sales.assign_lead(lead_b, user)
      {:ok, _} = Sales.update_lead_status(lead_b, %{status: :assigned})

      conn_b =
        build_conn()
        |> log_in_user(user)
        |> post("/api/leads/#{lead_b.id}/outcome", %{
          outcome: "meeting_booked",
          meeting_date: future_date,
          meeting_time: "14:00"
        })

      assert %{"error" => error_msg} = json_response(conn_b, 422)
      assert error_msg =~ "redan ett möte"

      # Lead B status should be unchanged (not :meeting_booked)
      {:ok, lead_b_reloaded} = Sales.get_lead(lead_b.id)
      refute lead_b_reloaded.status == :meeting_booked
    end
  end

  # ---------------------------------------------------------------------------
  # Test 7: Reactivate sets status to :new (Bug #9)
  # ---------------------------------------------------------------------------

  describe "reactivate sets status to :new" do
    test "reactivate sets status to :new not :assigned",
         %{conn: conn} do
      {:ok, lead} = Sales.create_lead(%{företag: "Reactivate AB", telefon: "+46700000030"})

      # Quarantine the lead
      {:ok, _} = Sales.update_lead_status(lead, %{
        status: :quarantine,
        quarantine_until: DateTime.utc_now() |> DateTime.add(24, :hour)
      })

      conn = post(conn, "/api/leads/#{lead.id}/reactivate")
      assert %{"ok" => true, "lead" => lead_json} = json_response(conn, 200)
      assert lead_json["status"] == "new"

      # Verify in database too
      {:ok, reloaded} = Sales.get_lead(lead.id)
      assert reloaded.status == :new
    end
  end
end
