defmodule Saleflow.Sales.DealTest do
  use Saleflow.DataCase, async: true

  alias Saleflow.Sales

  defp create_lead! do
    unique = System.unique_integer([:positive])
    {:ok, lead} = Sales.create_lead(%{företag: "Test AB #{unique}", telefon: "+46701234567"})
    lead
  end

  defp create_user! do
    unique = System.unique_integer([:positive])

    {:ok, user} =
      Saleflow.Accounts.User
      |> Ash.Changeset.for_create(:register_with_password, %{
        email: "agent#{unique}@test.se",
        name: "Agent #{unique}",
        password: "Password123!",
        password_confirmation: "Password123!"
      })
      |> Ash.create()

    user
  end

  describe "create_deal/1" do
    test "creates a deal with valid params" do
      lead = create_lead!()
      user = create_user!()

      assert {:ok, deal} =
               Sales.create_deal(%{
                 lead_id: lead.id,
                 user_id: user.id
               })

      assert deal.lead_id == lead.id
      assert deal.user_id == user.id
      assert deal.stage == :meeting_booked
      assert deal.website_url == nil
      assert deal.domain_sponsored == false
    end

    test "rejects deal without lead_id" do
      user = create_user!()
      assert {:error, _} = Sales.create_deal(%{user_id: user.id})
    end

    test "rejects deal without user_id" do
      lead = create_lead!()
      assert {:error, _} = Sales.create_deal(%{lead_id: lead.id})
    end
  end

  describe "advance_deal/1" do
    test "advances deal to next stage" do
      lead = create_lead!()
      user = create_user!()
      {:ok, deal} = Sales.create_deal(%{lead_id: lead.id, user_id: user.id})

      assert deal.stage == :meeting_booked
      {:ok, deal} = Sales.advance_deal(deal)
      assert deal.stage == :needs_website
      {:ok, deal} = Sales.advance_deal(deal)
      assert deal.stage == :generating_website
    end

    test "advances through all stages in order" do
      lead = create_lead!()
      user = create_user!()
      {:ok, deal} = Sales.create_deal(%{lead_id: lead.id, user_id: user.id})

      expected_stages = [
        :needs_website,
        :generating_website,
        :reviewing,
        :deployed,
        :demo_followup,
        :contract_sent,
        :signed,
        :dns_launch,
        :won
      ]

      deal =
        Enum.reduce(expected_stages, deal, fn expected_stage, current_deal ->
          {:ok, advanced} = Sales.advance_deal(current_deal)
          assert advanced.stage == expected_stage
          advanced
        end)

      assert deal.stage == :won
    end

    test "cannot advance past won" do
      lead = create_lead!()
      user = create_user!()
      {:ok, deal} = Sales.create_deal(%{lead_id: lead.id, user_id: user.id})

      deal =
        Enum.reduce(1..9, deal, fn _, d ->
          {:ok, advanced} = Sales.advance_deal(d)
          advanced
        end)

      assert deal.stage == :won
      assert {:error, _} = Sales.advance_deal(deal)
    end
  end

  describe "update_deal/2" do
    test "updates notes" do
      lead = create_lead!()
      user = create_user!()
      {:ok, deal} = Sales.create_deal(%{lead_id: lead.id, user_id: user.id})

      {:ok, updated} = Sales.update_deal(deal, %{notes: "Important customer"})
      assert updated.notes == "Important customer"
    end

    test "updates website_url" do
      lead = create_lead!()
      user = create_user!()
      {:ok, deal} = Sales.create_deal(%{lead_id: lead.id, user_id: user.id})

      {:ok, updated} = Sales.update_deal(deal, %{website_url: "https://example.vercel.app"})
      assert updated.website_url == "https://example.vercel.app"
    end

    test "updates domain fields" do
      lead = create_lead!()
      user = create_user!()
      {:ok, deal} = Sales.create_deal(%{lead_id: lead.id, user_id: user.id})

      {:ok, updated} = Sales.update_deal(deal, %{domain: "example.se", domain_sponsored: true})
      assert updated.domain == "example.se"
      assert updated.domain_sponsored == true
    end
  end

  describe "list_deals_for_user/1" do
    test "returns only deals for given user" do
      lead1 = create_lead!()
      lead2 = create_lead!()
      user1 = create_user!()
      user2 = create_user!()

      {:ok, _d1} = Sales.create_deal(%{lead_id: lead1.id, user_id: user1.id})
      {:ok, _d2} = Sales.create_deal(%{lead_id: lead2.id, user_id: user2.id})

      {:ok, deals} = Sales.list_deals_for_user(user1.id)
      assert length(deals) == 1
      assert hd(deals).user_id == user1.id
    end
  end

  describe "get_active_deal_for_lead/1" do
    test "returns active deal for lead" do
      lead = create_lead!()
      user = create_user!()
      {:ok, deal} = Sales.create_deal(%{lead_id: lead.id, user_id: user.id})

      assert {:ok, found} = Sales.get_active_deal_for_lead(lead.id)
      assert found.id == deal.id
    end

    test "returns nil when no active deal" do
      lead = create_lead!()
      assert {:ok, nil} = Sales.get_active_deal_for_lead(lead.id)
    end
  end

  describe "meeting-deal association" do
    test "meeting can be created with deal_id" do
      lead = create_lead!()
      user = create_user!()
      {:ok, deal} = Sales.create_deal(%{lead_id: lead.id, user_id: user.id})

      {:ok, meeting} =
        Sales.create_meeting(%{
          lead_id: lead.id,
          user_id: user.id,
          title: "Demo",
          meeting_date: Date.utc_today() |> Date.add(7),
          meeting_time: ~T[10:00:00],
          deal_id: deal.id
        })

      assert meeting.deal_id == deal.id
    end

    test "meeting can be created without deal_id" do
      lead = create_lead!()
      user = create_user!()

      {:ok, meeting} =
        Sales.create_meeting(%{
          lead_id: lead.id,
          user_id: user.id,
          title: "Demo",
          meeting_date: Date.utc_today() |> Date.add(7),
          meeting_time: ~T[10:00:00]
        })

      assert meeting.deal_id == nil
    end
  end
end
