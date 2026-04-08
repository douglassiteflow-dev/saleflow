defmodule SaleflowWeb.DealControllerTest do
  use SaleflowWeb.ConnCase

  alias Saleflow.Sales

  # ---------------------------------------------------------------------------
  # Helpers
  # ---------------------------------------------------------------------------

  defp create_lead! do
    unique = System.unique_integer([:positive])
    {:ok, lead} = Sales.create_lead(%{företag: "Test AB #{unique}", telefon: "+46701234567"})
    lead
  end

  defp create_agent!(conn, attrs \\ %{}) do
    register_and_log_in_user(conn, Map.merge(%{name: "Agent"}, attrs))
  end

  defp create_admin!(conn) do
    {conn, user} = register_and_log_in_user(conn, %{name: "Admin"})

    # Promote to admin via raw SQL
    Saleflow.Repo.query!(
      "UPDATE users SET role = 'admin' WHERE id = $1",
      [Ecto.UUID.dump!(user.id)]
    )

    # Re-fetch so role is up to date
    {:ok, admin} = Ash.get(Saleflow.Accounts.User, user.id)
    {conn, admin}
  end

  defp create_deal!(lead, user) do
    {:ok, deal} = Sales.create_deal(%{lead_id: lead.id, user_id: user.id})
    deal
  end

  defp create_meeting!(lead, user, opts \\ []) do
    deal_id = Keyword.get(opts, :deal_id)

    params = %{
      lead_id: lead.id,
      user_id: user.id,
      title: Keyword.get(opts, :title, "Sales Demo"),
      meeting_date: Keyword.get(opts, :meeting_date, Date.utc_today() |> Date.add(7)),
      meeting_time: Keyword.get(opts, :meeting_time, ~T[10:00:00])
    }

    params = if deal_id, do: Map.put(params, :deal_id, deal_id), else: params

    {:ok, meeting} = Sales.create_meeting(params)
    meeting
  end

  # ---------------------------------------------------------------------------
  # GET /api/deals (index)
  # ---------------------------------------------------------------------------

  describe "GET /api/deals" do
    test "agent sees only own deals", %{conn: conn} do
      lead = create_lead!()
      {agent_conn, agent} = create_agent!(conn)

      # Create a deal for the agent
      _deal = create_deal!(lead, agent)

      # Create another agent with a deal
      {_other_conn, other_agent} = create_agent!(build_conn(), %{name: "Other Agent"})
      _other_deal = create_deal!(create_lead!(), other_agent)

      resp = get(agent_conn, "/api/deals")
      assert %{"deals" => deals} = json_response(resp, 200)
      assert length(deals) == 1
      assert hd(deals)["user_id"] == agent.id
    end

    test "admin sees all deals", %{conn: conn} do
      lead1 = create_lead!()
      lead2 = create_lead!()
      {admin_conn, admin} = create_admin!(conn)

      # Create agent with a deal
      {_agent_conn, agent} = create_agent!(build_conn(), %{name: "Some Agent"})
      _deal1 = create_deal!(lead1, agent)

      # Admin's own deal
      _deal2 = create_deal!(lead2, admin)

      resp = get(admin_conn, "/api/deals")
      assert %{"deals" => deals} = json_response(resp, 200)
      assert length(deals) == 2
    end

    test "deals are enriched with lead_name and user_name", %{conn: conn} do
      lead = create_lead!()
      {agent_conn, agent} = create_agent!(conn)
      _deal = create_deal!(lead, agent)

      resp = get(agent_conn, "/api/deals")
      assert %{"deals" => [deal]} = json_response(resp, 200)
      assert deal["lead_name"] == lead.företag
      assert is_binary(deal["user_name"])
    end
  end

  # ---------------------------------------------------------------------------
  # GET /api/deals/:id (show)
  # ---------------------------------------------------------------------------

  describe "GET /api/deals/:id" do
    test "returns deal + lead + meetings + audit_logs", %{conn: conn} do
      lead = create_lead!()
      {agent_conn, agent} = create_agent!(conn)
      deal = create_deal!(lead, agent)
      _meeting = create_meeting!(lead, agent, deal_id: deal.id)

      resp = get(agent_conn, "/api/deals/#{deal.id}")
      body = json_response(resp, 200)

      assert body["deal"]["id"] == deal.id
      assert body["lead"]["id"] == lead.id
      assert length(body["meetings"]) == 1
      assert is_list(body["audit_logs"])
    end

    test "agent cannot see another agent's deal", %{conn: conn} do
      lead = create_lead!()
      {_other_conn, other_agent} = create_agent!(conn, %{name: "Other"})
      deal = create_deal!(lead, other_agent)

      {agent_conn, _agent} = create_agent!(build_conn(), %{name: "Me"})

      resp = get(agent_conn, "/api/deals/#{deal.id}")
      assert json_response(resp, 403)
    end

    test "admin can see any agent's deal", %{conn: conn} do
      lead = create_lead!()
      {_agent_conn, agent} = create_agent!(conn, %{name: "Agent"})
      deal = create_deal!(lead, agent)

      {admin_conn, _admin} = create_admin!(build_conn())

      resp = get(admin_conn, "/api/deals/#{deal.id}")
      assert json_response(resp, 200)
    end

    test "returns 404 for non-existent deal", %{conn: conn} do
      {agent_conn, _agent} = create_agent!(conn)
      resp = get(agent_conn, "/api/deals/#{Ecto.UUID.generate()}")
      assert json_response(resp, 404)
    end
  end

  # ---------------------------------------------------------------------------
  # POST /api/deals/:id/advance
  # ---------------------------------------------------------------------------

  describe "POST /api/deals/:id/advance" do
    test "advances deal to next stage", %{conn: conn} do
      lead = create_lead!()
      {agent_conn, agent} = create_agent!(conn)
      deal = create_deal!(lead, agent)
      assert deal.stage == :booking_wizard

      resp = post(agent_conn, "/api/deals/#{deal.id}/advance")
      body = json_response(resp, 200)
      assert body["deal"]["stage"] == "demo_scheduled"
    end

    test "agent cannot advance another agent's deal", %{conn: conn} do
      lead = create_lead!()
      {_other_conn, other_agent} = create_agent!(conn, %{name: "Other"})
      deal = create_deal!(lead, other_agent)

      {agent_conn, _agent} = create_agent!(build_conn(), %{name: "Me"})

      resp = post(agent_conn, "/api/deals/#{deal.id}/advance")
      assert json_response(resp, 403)
    end

    test "admin can advance any deal", %{conn: conn} do
      lead = create_lead!()
      {_agent_conn, agent} = create_agent!(conn, %{name: "Agent"})
      deal = create_deal!(lead, agent)

      {admin_conn, _admin} = create_admin!(build_conn())

      resp = post(admin_conn, "/api/deals/#{deal.id}/advance")
      assert json_response(resp, 200)["deal"]["stage"] == "demo_scheduled"
    end
  end

  # ---------------------------------------------------------------------------
  # PATCH /api/deals/:id (update)
  # ---------------------------------------------------------------------------

  describe "PATCH /api/deals/:id" do
    test "updates notes", %{conn: conn} do
      lead = create_lead!()
      {agent_conn, agent} = create_agent!(conn)
      deal = create_deal!(lead, agent)

      resp = patch(agent_conn, "/api/deals/#{deal.id}", %{"notes" => "Updated notes"})
      body = json_response(resp, 200)
      assert body["deal"]["notes"] == "Updated notes"
    end

    test "updates website_url", %{conn: conn} do
      lead = create_lead!()
      {agent_conn, agent} = create_agent!(conn)
      deal = create_deal!(lead, agent)

      resp =
        patch(agent_conn, "/api/deals/#{deal.id}", %{
          "website_url" => "https://example.com"
        })

      body = json_response(resp, 200)
      assert body["deal"]["website_url"] == "https://example.com"
    end

    test "updates meeting_outcome", %{conn: conn} do
      lead = create_lead!()
      {agent_conn, agent} = create_agent!(conn)
      deal = create_deal!(lead, agent)

      resp =
        patch(agent_conn, "/api/deals/#{deal.id}", %{
          "meeting_outcome" => "Very interested, send contract"
        })

      body = json_response(resp, 200)
      assert body["deal"]["meeting_outcome"] == "Very interested, send contract"
    end

    test "updates needs_followup", %{conn: conn} do
      lead = create_lead!()
      {agent_conn, agent} = create_agent!(conn)
      deal = create_deal!(lead, agent)

      resp =
        patch(agent_conn, "/api/deals/#{deal.id}", %{
          "needs_followup" => true
        })

      body = json_response(resp, 200)
      assert body["deal"]["needs_followup"] == true
    end

    test "updates domain and domain_sponsored", %{conn: conn} do
      lead = create_lead!()
      {agent_conn, agent} = create_agent!(conn)
      deal = create_deal!(lead, agent)

      resp =
        patch(agent_conn, "/api/deals/#{deal.id}", %{
          "domain" => "example.se",
          "domain_sponsored" => true
        })

      body = json_response(resp, 200)
      assert body["deal"]["domain"] == "example.se"
      assert body["deal"]["domain_sponsored"] == true
    end

    test "agent cannot update another agent's deal", %{conn: conn} do
      lead = create_lead!()
      {_other_conn, other_agent} = create_agent!(conn, %{name: "Other"})
      deal = create_deal!(lead, other_agent)

      {agent_conn, _agent} = create_agent!(build_conn(), %{name: "Me"})

      resp = patch(agent_conn, "/api/deals/#{deal.id}", %{"notes" => "hack"})
      assert json_response(resp, 403)
    end
  end

  # ---------------------------------------------------------------------------
  # Auto-create deal on meeting_booked outcome
  # ---------------------------------------------------------------------------

  # ---------------------------------------------------------------------------
  # POST /api/deals/:id/send-questionnaire
  # ---------------------------------------------------------------------------

  describe "POST /api/deals/:id/send-questionnaire" do
    test "creates questionnaire and advances deal to questionnaire_sent", %{conn: conn} do
      lead = create_lead!()
      {agent_conn, agent} = create_agent!(conn)
      deal = create_deal!(lead, agent)

      # Advance to meeting_completed stage (required before questionnaire_sent)
      {:ok, deal} = Sales.advance_deal(deal)
      {:ok, deal} = Sales.advance_deal(deal)
      assert deal.stage == :meeting_completed

      resp =
        post(agent_conn, "/api/deals/#{deal.id}/send-questionnaire", %{
          "customer_email" => "kund@example.se"
        })

      body = json_response(resp, 200)
      assert body["questionnaire"]["customer_email"] == "kund@example.se"
      assert body["questionnaire"]["status"] == "pending"
      assert is_binary(body["questionnaire"]["token"])

      # Deal should have advanced to questionnaire_sent
      {:ok, refreshed} = Sales.get_deal(deal.id)
      assert refreshed.stage == :questionnaire_sent
    end

    test "returns 404 for non-existent deal", %{conn: conn} do
      {agent_conn, _agent} = create_agent!(conn)

      resp =
        post(agent_conn, "/api/deals/#{Ecto.UUID.generate()}/send-questionnaire", %{
          "customer_email" => "kund@example.se"
        })

      assert json_response(resp, 404)
    end

    test "agent cannot send questionnaire for another agent's deal", %{conn: conn} do
      lead = create_lead!()
      {_other_conn, other_agent} = create_agent!(conn, %{name: "Other"})
      deal = create_deal!(lead, other_agent)

      {agent_conn, _agent} = create_agent!(build_conn(), %{name: "Me"})

      resp =
        post(agent_conn, "/api/deals/#{deal.id}/send-questionnaire", %{
          "customer_email" => "kund@example.se"
        })

      assert json_response(resp, 403)
    end
  end

  # ---------------------------------------------------------------------------
  # POST /api/leads/:id/outcome (meeting_booked auto-deal)
  # ---------------------------------------------------------------------------

  describe "POST /api/leads/:id/outcome (meeting_booked auto-deal)" do
    test "creates a deal when none exists", %{conn: conn} do
      lead = create_lead!()
      {agent_conn, agent} = create_agent!(conn)

      # Need an assignment so release_active works
      tomorrow = Date.utc_today() |> Date.add(1) |> Date.to_iso8601()

      resp =
        post(agent_conn, "/api/leads/#{lead.id}/outcome", %{
          "outcome" => "meeting_booked",
          "meeting_date" => tomorrow,
          "meeting_time" => "14:00",
          "create_teams_meeting" => false
        })

      assert json_response(resp, 200)["ok"] == true

      # Verify deal was created
      {:ok, deals} = Sales.list_deals_for_user(agent.id)
      deal = Enum.find(deals, fn d -> d.lead_id == lead.id end)
      assert deal != nil
      assert deal.stage == :booking_wizard

      # Verify meeting is linked to deal
      {:ok, meetings} = Sales.list_meetings_for_deal(deal.id)
      assert length(meetings) == 1
    end

    test "reuses existing deal for subsequent meetings", %{conn: conn} do
      lead = create_lead!()
      {agent_conn, agent} = create_agent!(conn)

      # Pre-create a deal for the lead (simulates a previous meeting_booked)
      existing_deal = create_deal!(lead, agent)

      # Now book a meeting via outcome — should reuse existing deal
      tomorrow = Date.utc_today() |> Date.add(1) |> Date.to_iso8601()

      resp =
        post(agent_conn, "/api/leads/#{lead.id}/outcome", %{
          "outcome" => "meeting_booked",
          "meeting_date" => tomorrow,
          "meeting_time" => "10:00",
          "create_teams_meeting" => false
        })

      assert json_response(resp, 200)["ok"] == true

      # No new deal should have been created — same deal reused
      {:ok, deals} = Sales.list_deals_for_user(agent.id)
      lead_deals = Enum.filter(deals, fn d -> d.lead_id == lead.id end)
      assert length(lead_deals) == 1
      assert hd(lead_deals).id == existing_deal.id

      # Meeting should be linked to the existing deal
      {:ok, meetings} = Sales.list_meetings_for_deal(existing_deal.id)
      assert length(meetings) == 1
    end
  end

  # ---------------------------------------------------------------------------
  # POST /api/deals/:id/send-contract
  # ---------------------------------------------------------------------------

  describe "POST /api/deals/:id/send-contract" do
    test "creates contract, advances deal to contract_sent, returns contract data", %{conn: conn} do
      lead = create_lead!()
      {agent_conn, agent} = create_agent!(conn)
      deal = create_deal!(lead, agent)

      # Advance to questionnaire_sent stage (required before contract_sent)
      {:ok, deal} = Sales.advance_deal(deal)
      {:ok, deal} = Sales.advance_deal(deal)
      {:ok, deal} = Sales.advance_deal(deal)
      assert deal.stage == :questionnaire_sent

      resp =
        post(agent_conn, "/api/deals/#{deal.id}/send-contract", %{
          "recipient_email" => "kund@example.se",
          "recipient_name" => "Kund AB",
          "amount" => 9500,
          "terms" => "Anpassade villkor"
        })

      body = json_response(resp, 200)
      assert body["contract"]["amount"] == 9500
      assert body["contract"]["recipient_email"] == "kund@example.se"
      assert body["contract"]["recipient_name"] == "Kund AB"
      assert body["contract"]["status"] == "sent"
      assert is_binary(body["contract"]["contract_number"])
      assert is_binary(body["contract"]["access_token"])
      assert is_binary(body["contract"]["verification_code"])

      # Deal should have advanced to contract_sent
      {:ok, refreshed} = Sales.get_deal(deal.id)
      assert refreshed.stage == :contract_sent
    end

    test "requires amount param", %{conn: conn} do
      lead = create_lead!()
      {agent_conn, agent} = create_agent!(conn)
      deal = create_deal!(lead, agent)

      # Advance to questionnaire_sent
      {:ok, deal} = Sales.advance_deal(deal)
      {:ok, deal} = Sales.advance_deal(deal)
      {:ok, deal} = Sales.advance_deal(deal)
      assert deal.stage == :questionnaire_sent

      resp =
        post(agent_conn, "/api/deals/#{deal.id}/send-contract", %{
          "recipient_email" => "kund@example.se",
          "recipient_name" => "Kund AB"
        })

      assert json_response(resp, 422)
      assert json_response(resp, 422)["error"] =~ "Belopp"
    end

    test "returns 404 for non-existent deal", %{conn: conn} do
      {agent_conn, _agent} = create_agent!(conn)

      resp =
        post(agent_conn, "/api/deals/#{Ecto.UUID.generate()}/send-contract", %{
          "amount" => 5000,
          "recipient_email" => "kund@example.se"
        })

      assert json_response(resp, 404)
    end

    test "returns 403 for wrong owner", %{conn: conn} do
      lead = create_lead!()
      {_other_conn, other_agent} = create_agent!(conn, %{name: "Other"})
      deal = create_deal!(lead, other_agent)

      {agent_conn, _agent} = create_agent!(build_conn(), %{name: "Me"})

      resp =
        post(agent_conn, "/api/deals/#{deal.id}/send-contract", %{
          "amount" => 5000,
          "recipient_email" => "kund@example.se"
        })

      assert json_response(resp, 403)
    end
  end
end
