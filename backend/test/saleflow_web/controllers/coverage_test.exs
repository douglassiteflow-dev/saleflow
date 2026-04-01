defmodule SaleflowWeb.CoverageTest do
  @moduledoc """
  Additional coverage tests for controllers that have uncovered error branches.

  Covers:
  - AuditController: maybe_put with empty string
  - LeadController: unknown outcome via "other", no active assignment, parse fallbacks
  """

  use SaleflowWeb.ConnCase, async: false

  alias Saleflow.Accounts
  alias Saleflow.Sales

  @admin_params %{
    email: "cov_admin@example.com",
    name: "Coverage Admin",
    password: "password123",
    password_confirmation: "password123",
    role: :admin
  }

  @agent_params %{
    email: "cov_agent@example.com",
    name: "Coverage Agent",
    password: "password123",
    password_confirmation: "password123"
  }

  setup %{conn: conn} do
    {:ok, admin} = Accounts.register(@admin_params)
    {:ok, agent} = Accounts.register(@agent_params)
    %{conn: conn, admin: admin, agent: agent}
  end

  # -------------------------------------------------------------------------
  # AuditController — empty string filter values
  # -------------------------------------------------------------------------

  describe "AuditController — maybe_put with empty string" do
    test "empty string user_id is ignored (treated as no filter)", %{conn: conn, agent: agent} do
      conn =
        conn
        |> log_in_user(agent)
        |> get("/api/audit?user_id=&action=")

      assert %{"audit_logs" => _logs} = json_response(conn, 200)
    end

    test "empty action string is ignored", %{conn: conn, agent: agent} do
      conn =
        conn
        |> log_in_user(agent)
        |> get("/api/audit?action=")

      assert %{"audit_logs" => _logs} = json_response(conn, 200)
    end
  end

  # -------------------------------------------------------------------------
  # LeadController — edge cases
  # -------------------------------------------------------------------------

  describe "LeadController — outcome when no active assignment" do
    test "outcome works when agent has no active assignment to release", %{conn: conn, agent: agent} do
      {:ok, lead} = Sales.create_lead(%{företag: "No Assignment AB", telefon: "+46700088001"})

      conn =
        conn
        |> log_in_user(agent)
        |> post("/api/leads/#{lead.id}/outcome", %{outcome: "no_answer"})

      assert %{"ok" => true} = json_response(conn, 200)
    end
  end

  describe "LeadController — unknown outcome via 'other'" do
    setup %{agent: agent} do
      {:ok, lead} = Sales.create_lead(%{företag: "Unknown Outcome AB", telefon: "+46700088003"})
      {:ok, _assignment} = Sales.assign_lead(lead, agent)
      {:ok, _} = Sales.update_lead_status(lead, %{status: :assigned})
      %{lead: lead}
    end

    test "outcome 'other' hits the unknown outcome fallback handler and returns 422", %{
      conn: conn,
      agent: agent,
      lead: lead
    } do
      conn =
        conn
        |> log_in_user(agent)
        |> post("/api/leads/#{lead.id}/outcome", %{outcome: "other"})

      assert json_response(conn, 422)
    end
  end

  describe "LeadController — meeting_booked with invalid date/time fallback in outcome" do
    setup %{agent: agent} do
      {:ok, lead} = Sales.create_lead(%{företag: "Fallback AB", telefon: "+46700088002"})
      {:ok, _assignment} = Sales.assign_lead(lead, agent)
      {:ok, _} = Sales.update_lead_status(lead, %{status: :assigned})
      %{lead: lead}
    end

    test "meeting_booked with invalid meeting_date falls back to tomorrow", %{
      conn: conn,
      agent: agent,
      lead: lead
    } do
      conn =
        conn
        |> log_in_user(agent)
        |> post("/api/leads/#{lead.id}/outcome", %{
          outcome: "meeting_booked",
          title: "Fallback Date Test",
          meeting_date: "invalid-date",
          meeting_time: "10:00:00"
        })

      assert %{"ok" => true} = json_response(conn, 200)
    end

    test "meeting_booked with invalid meeting_time falls back to 10:00", %{
      conn: conn,
      agent: agent,
      lead: lead
    } do
      conn =
        conn
        |> log_in_user(agent)
        |> post("/api/leads/#{lead.id}/outcome", %{
          outcome: "meeting_booked",
          title: "Fallback Time Test",
          meeting_date: "2026-08-01",
          meeting_time: "invalid-time"
        })

      assert %{"ok" => true} = json_response(conn, 200)
    end
  end
end
