defmodule Saleflow.Sales.DemoConfigTest do
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

  describe "create_demo_config/1" do
    test "creates with valid params, stage defaults to :meeting_booked" do
      lead = create_lead!()
      user = create_user!()

      assert {:ok, dc} =
               Sales.create_demo_config(%{
                 lead_id: lead.id,
                 user_id: user.id,
                 source_url: "https://example.com"
               })

      assert dc.lead_id == lead.id
      assert dc.user_id == user.id
      assert dc.stage == :meeting_booked
      assert dc.source_url == "https://example.com"
      assert dc.website_path == nil
      assert dc.preview_url == nil
      assert dc.error == nil
    end

    test "creates without source_url" do
      lead = create_lead!()
      user = create_user!()

      assert {:ok, dc} =
               Sales.create_demo_config(%{
                 lead_id: lead.id,
                 user_id: user.id
               })

      assert dc.source_url == nil
      assert dc.stage == :meeting_booked
    end

    test "fails without lead_id" do
      user = create_user!()
      assert {:error, _} = Sales.create_demo_config(%{user_id: user.id})
    end
  end

  describe "start_generation/1" do
    test "transitions meeting_booked to generating" do
      lead = create_lead!()
      user = create_user!()
      {:ok, dc} = Sales.create_demo_config(%{lead_id: lead.id, user_id: user.id})
      assert dc.stage == :meeting_booked

      assert {:ok, updated} = Sales.start_generation(dc)
      assert updated.stage == :generating
    end

    test "rejects transition from wrong stage" do
      lead = create_lead!()
      user = create_user!()
      {:ok, dc} = Sales.create_demo_config(%{lead_id: lead.id, user_id: user.id})
      {:ok, dc} = Sales.start_generation(dc)
      assert dc.stage == :generating

      assert {:error, _} = Sales.start_generation(dc)
    end
  end

  describe "generation_complete/2" do
    test "transitions generating to demo_ready, saves website_path and preview_url" do
      lead = create_lead!()
      user = create_user!()
      {:ok, dc} = Sales.create_demo_config(%{lead_id: lead.id, user_id: user.id})
      {:ok, dc} = Sales.start_generation(dc)
      assert dc.stage == :generating

      assert {:ok, updated} =
               Sales.generation_complete(dc, %{
                 website_path: "/sites/abc123",
                 preview_url: "https://preview.example.com/abc123"
               })

      assert updated.stage == :demo_ready
      assert updated.website_path == "/sites/abc123"
      assert updated.preview_url == "https://preview.example.com/abc123"
    end

    test "rejects transition from wrong stage" do
      lead = create_lead!()
      user = create_user!()
      {:ok, dc} = Sales.create_demo_config(%{lead_id: lead.id, user_id: user.id})
      assert dc.stage == :meeting_booked

      assert {:error, _} =
               Sales.generation_complete(dc, %{
                 website_path: "/sites/abc123",
                 preview_url: "https://preview.example.com/abc123"
               })
    end
  end

  describe "generation_failed/2" do
    test "sets error field, stage stays generating" do
      lead = create_lead!()
      user = create_user!()
      {:ok, dc} = Sales.create_demo_config(%{lead_id: lead.id, user_id: user.id})
      {:ok, dc} = Sales.start_generation(dc)
      assert dc.stage == :generating

      assert {:ok, updated} =
               Sales.generation_failed(dc, %{error: "Timeout after 60s"})

      assert updated.stage == :generating
      assert updated.error == "Timeout after 60s"
    end

    test "rejects from wrong stage" do
      lead = create_lead!()
      user = create_user!()
      {:ok, dc} = Sales.create_demo_config(%{lead_id: lead.id, user_id: user.id})
      assert dc.stage == :meeting_booked

      assert {:error, _} = Sales.generation_failed(dc, %{error: "Something"})
    end
  end

  describe "advance_to_followup/1" do
    test "transitions demo_ready to followup" do
      lead = create_lead!()
      user = create_user!()
      {:ok, dc} = Sales.create_demo_config(%{lead_id: lead.id, user_id: user.id})
      {:ok, dc} = Sales.start_generation(dc)

      {:ok, dc} =
        Sales.generation_complete(dc, %{
          website_path: "/sites/abc",
          preview_url: "https://preview.example.com/abc"
        })

      assert dc.stage == :demo_ready

      assert {:ok, updated} = Sales.advance_to_followup(dc)
      assert updated.stage == :followup
    end

    test "rejects transition from wrong stage" do
      lead = create_lead!()
      user = create_user!()
      {:ok, dc} = Sales.create_demo_config(%{lead_id: lead.id, user_id: user.id})
      assert dc.stage == :meeting_booked

      assert {:error, _} = Sales.advance_to_followup(dc)
    end
  end

  describe "cancel_demo_config/1" do
    test "sets stage to cancelled" do
      lead = create_lead!()
      user = create_user!()
      {:ok, dc} = Sales.create_demo_config(%{lead_id: lead.id, user_id: user.id})

      assert {:ok, updated} = Sales.cancel_demo_config(dc)
      assert updated.stage == :cancelled
    end

    test "can cancel from any stage" do
      lead = create_lead!()
      user = create_user!()
      {:ok, dc} = Sales.create_demo_config(%{lead_id: lead.id, user_id: user.id})
      {:ok, dc} = Sales.start_generation(dc)
      assert dc.stage == :generating

      assert {:ok, updated} = Sales.cancel_demo_config(dc)
      assert updated.stage == :cancelled
    end
  end

  describe "get_demo_config/1" do
    test "returns demo config by id" do
      lead = create_lead!()
      user = create_user!()
      {:ok, dc} = Sales.create_demo_config(%{lead_id: lead.id, user_id: user.id})

      assert {:ok, found} = Sales.get_demo_config(dc.id)
      assert found.id == dc.id
    end
  end

  describe "list_demo_configs/0" do
    test "returns all demo configs" do
      lead = create_lead!()
      user = create_user!()
      {:ok, _dc1} = Sales.create_demo_config(%{lead_id: lead.id, user_id: user.id})
      {:ok, _dc2} = Sales.create_demo_config(%{lead_id: lead.id, user_id: user.id})

      assert {:ok, configs} = Sales.list_demo_configs()
      assert length(configs) >= 2
    end
  end

  describe "update_notes" do
    test "updates notes on a demo config" do
      lead = create_lead!()
      user = create_user!()
      {:ok, dc} = Sales.create_demo_config(%{lead_id: lead.id, user_id: user.id})

      assert {:ok, updated} =
               dc
               |> Ash.Changeset.for_update(:update_notes, %{notes: "Bra möte, kunden intresserad"})
               |> Ash.update()

      assert updated.notes == "Bra möte, kunden intresserad"
    end

    test "clears notes with nil" do
      lead = create_lead!()
      user = create_user!()
      {:ok, dc} = Sales.create_demo_config(%{lead_id: lead.id, user_id: user.id, notes: "Initial"})

      assert {:ok, updated} =
               dc
               |> Ash.Changeset.for_update(:update_notes, %{notes: nil})
               |> Ash.update()

      assert is_nil(updated.notes)
    end
  end

  describe "list_demo_configs_for_user/1" do
    test "returns configs for user, excluding cancelled, sorted by inserted_at desc" do
      lead = create_lead!()
      user1 = create_user!()
      user2 = create_user!()

      {:ok, dc1} = Sales.create_demo_config(%{lead_id: lead.id, user_id: user1.id})
      {:ok, dc2} = Sales.create_demo_config(%{lead_id: lead.id, user_id: user1.id})
      {:ok, dc3} = Sales.create_demo_config(%{lead_id: lead.id, user_id: user1.id})
      {:ok, _dc_other} = Sales.create_demo_config(%{lead_id: lead.id, user_id: user2.id})

      # Cancel one
      {:ok, _} = Sales.cancel_demo_config(dc1)

      assert {:ok, configs} = Sales.list_demo_configs_for_user(user1.id)
      # dc1 cancelled, so only dc2 and dc3
      assert length(configs) == 2
      ids = Enum.map(configs, & &1.id)
      refute dc1.id in ids
      assert dc2.id in ids
      assert dc3.id in ids

      # Verify results are sorted by inserted_at descending
      timestamps = Enum.map(configs, & &1.inserted_at)
      assert timestamps == Enum.sort(timestamps, {:desc, DateTime})
    end
  end
end
