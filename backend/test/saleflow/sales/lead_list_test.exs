defmodule Saleflow.Sales.LeadListTest do
  @moduledoc """
  Tests for LeadList, LeadListAssignment, and list-related queue behaviour.
  """

  use Saleflow.DataCase, async: false

  alias Saleflow.Sales
  alias Saleflow.Sales.Import

  # ---------------------------------------------------------------------------
  # Helpers
  # ---------------------------------------------------------------------------

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

  defp create_lead!(params \\ %{}) do
    base = %{företag: "Test AB #{System.unique_integer([:positive])}", telefon: "+4670#{:rand.uniform(9_999_999) |> Integer.to_string() |> String.pad_leading(7, "0")}"}

    {:ok, lead} = Sales.create_lead(Map.merge(base, params))
    lead
  end

  defp create_list!(params \\ %{}) do
    base = %{name: "Test List #{System.unique_integer([:positive])}"}
    {:ok, list} = Sales.create_lead_list(Map.merge(base, params))
    list
  end

  # ---------------------------------------------------------------------------
  # LeadList CRUD
  # ---------------------------------------------------------------------------

  describe "create_lead_list/1" do
    test "creates a lead list with name" do
      {:ok, list} = Sales.create_lead_list(%{name: "Kunder utan hemsida"})
      assert list.name == "Kunder utan hemsida"
      assert list.status == :active
      assert list.total_count == 0
      refute is_nil(list.imported_at)
    end

    test "creates a lead list with description" do
      {:ok, list} = Sales.create_lead_list(%{name: "Test", description: "Beskrivning"})
      assert list.description == "Beskrivning"
    end

    test "fails without name" do
      assert {:error, _} = Sales.create_lead_list(%{})
    end
  end

  describe "update_lead_list/2" do
    test "updates name" do
      list = create_list!()
      {:ok, updated} = Sales.update_lead_list(list, %{name: "Nytt namn"})
      assert updated.name == "Nytt namn"
    end

    test "updates status to paused" do
      list = create_list!()
      {:ok, updated} = Sales.update_lead_list(list, %{status: :paused})
      assert updated.status == :paused
    end

    test "updates status to completed" do
      list = create_list!()
      {:ok, updated} = Sales.update_lead_list(list, %{status: :completed})
      assert updated.status == :completed
    end

    test "updates description" do
      list = create_list!()
      {:ok, updated} = Sales.update_lead_list(list, %{description: "New desc"})
      assert updated.description == "New desc"
    end
  end

  describe "list_lead_lists/0" do
    test "returns all lists" do
      create_list!(%{name: "List A"})
      create_list!(%{name: "List B"})

      {:ok, lists} = Sales.list_lead_lists()
      names = Enum.map(lists, & &1.name)
      assert "List A" in names
      assert "List B" in names
    end
  end

  describe "get_lead_list/1" do
    test "returns a list by ID" do
      list = create_list!()
      {:ok, found} = Sales.get_lead_list(list.id)
      assert found.id == list.id
    end

    test "returns error for non-existent ID" do
      assert {:error, _} = Sales.get_lead_list(Ecto.UUID.generate())
    end
  end

  # ---------------------------------------------------------------------------
  # LeadList stats
  # ---------------------------------------------------------------------------

  describe "get_lead_list_stats/1" do
    test "returns correct status breakdown" do
      list = create_list!()
      create_lead!(%{lead_list_id: list.id, status: :new})
      create_lead!(%{lead_list_id: list.id, status: :new})
      lead3 = create_lead!(%{lead_list_id: list.id})
      {:ok, _} = Sales.update_lead_status(lead3, %{status: :customer})

      {:ok, stats} = Sales.get_lead_list_stats(list.id)
      assert stats.total == 3
      assert stats.new == 2
      assert stats.customer == 1
    end

    test "returns zeros for empty list" do
      list = create_list!()
      {:ok, stats} = Sales.get_lead_list_stats(list.id)
      assert stats.total == 0
      assert stats.new == 0
    end
  end

  # ---------------------------------------------------------------------------
  # LeadListAssignment
  # ---------------------------------------------------------------------------

  describe "assign_agent_to_list/2" do
    test "assigns an agent to a list" do
      list = create_list!()
      user = create_user!()

      {:ok, assignment} = Sales.assign_agent_to_list(list.id, user.id)
      assert assignment.lead_list_id == list.id
      assert assignment.user_id == user.id
    end
  end

  describe "remove_agent_from_list/2" do
    test "removes an agent from a list" do
      list = create_list!()
      user = create_user!()
      {:ok, _} = Sales.assign_agent_to_list(list.id, user.id)

      assert :ok = Sales.remove_agent_from_list(list.id, user.id)

      {:ok, assignments} = Sales.list_agents_for_list(list.id)
      assert assignments == []
    end

    test "returns error when assignment doesn't exist" do
      list = create_list!()
      user = create_user!()

      assert {:error, :not_found} = Sales.remove_agent_from_list(list.id, user.id)
    end
  end

  describe "list_agents_for_list/1" do
    test "returns all assignments for a list" do
      list = create_list!()
      user1 = create_user!()
      user2 = create_user!()

      {:ok, _} = Sales.assign_agent_to_list(list.id, user1.id)
      {:ok, _} = Sales.assign_agent_to_list(list.id, user2.id)

      {:ok, assignments} = Sales.list_agents_for_list(list.id)
      user_ids = Enum.map(assignments, & &1.user_id)
      assert user1.id in user_ids
      assert user2.id in user_ids
    end
  end

  # ---------------------------------------------------------------------------
  # Leads in list
  # ---------------------------------------------------------------------------

  describe "list_leads_in_list/2" do
    test "returns only leads from the specified list" do
      list = create_list!()
      lead1 = create_lead!(%{lead_list_id: list.id})
      _standalone = create_lead!()

      {:ok, leads} = Sales.list_leads_in_list(list.id)
      ids = Enum.map(leads, & &1.id)
      assert lead1.id in ids
      assert length(ids) == 1
    end

    test "search within a list" do
      list = create_list!()
      create_lead!(%{lead_list_id: list.id, företag: "Acme AB"})
      create_lead!(%{lead_list_id: list.id, företag: "Beta Corp"})

      {:ok, leads} = Sales.list_leads_in_list(list.id, "Acme")
      assert length(leads) == 1
      assert hd(leads).företag == "Acme AB"
    end
  end

  # ---------------------------------------------------------------------------
  # Import with list_name
  # ---------------------------------------------------------------------------

  describe "import with lead_list_id" do
    test "import_rows with list_id assigns leads to the list" do
      list = create_list!()

      rows = [
        %{"företag" => "Import A", "telefon" => "+46701100001"},
        %{"företag" => "Import B", "telefon" => "+46701100002"}
      ]

      {:ok, %{created: 2}} = Import.import_rows(rows, list.id)

      {:ok, leads} = Sales.list_leads_in_list(list.id)
      assert length(leads) == 2
      assert Enum.all?(leads, fn l -> l.lead_list_id == list.id end)
    end

    test "import_rows without list_id leaves lead_list_id nil" do
      rows = [
        %{"företag" => "Standalone", "telefon" => "+46701100003"}
      ]

      {:ok, %{created: 1}} = Import.import_rows(rows)

      {:ok, leads} = Sales.list_leads()
      standalone = Enum.find(leads, fn l -> l.telefon == "+46701100003" end)
      assert is_nil(standalone.lead_list_id)
    end
  end

  # ---------------------------------------------------------------------------
  # Queue with list assignments
  # ---------------------------------------------------------------------------

  describe "get_next_lead/1 — list assignment filtering" do
    test "agent with no list assignments gets leads from all lists" do
      list = create_list!()
      lead1 = create_lead!(%{lead_list_id: list.id})
      lead2 = create_lead!()
      agent = create_user!()

      # Agent has no list assignments — should get any lead
      {:ok, result} = Sales.get_next_lead(agent)
      refute is_nil(result)
      assert result.id in [lead1.id, lead2.id]
    end

    test "agent with list assignment only gets leads from assigned lists" do
      list1 = create_list!()
      list2 = create_list!()
      _lead_in_list1 = create_lead!(%{lead_list_id: list1.id})
      lead_in_list2 = create_lead!(%{lead_list_id: list2.id})
      agent = create_user!()

      # Assign agent to list2 only
      {:ok, _} = Sales.assign_agent_to_list(list2.id, agent.id)

      # Age list1 lead to be older so it would normally be picked first
      Saleflow.Repo.query!(
        "UPDATE leads SET inserted_at = inserted_at - INTERVAL '10 minutes' WHERE lead_list_id = $1",
        [Ecto.UUID.dump!(list1.id)]
      )

      {:ok, result} = Sales.get_next_lead(agent)
      refute is_nil(result)
      assert result.id == lead_in_list2.id
    end

    test "agent with list assignment does not get standalone leads (no list)" do
      _standalone = create_lead!()
      list = create_list!()
      list_lead = create_lead!(%{lead_list_id: list.id})
      agent = create_user!()

      {:ok, _} = Sales.assign_agent_to_list(list.id, agent.id)

      {:ok, result} = Sales.get_next_lead(agent)
      refute is_nil(result)
      assert result.id == list_lead.id
    end

    test "agent with list assignment gets nil when their lists are empty" do
      list = create_list!()
      _other_list_lead = create_lead!(%{lead_list_id: create_list!().id})
      agent = create_user!()

      {:ok, _} = Sales.assign_agent_to_list(list.id, agent.id)

      {:ok, result} = Sales.get_next_lead(agent)
      assert is_nil(result)
    end

    test "agent with multiple list assignments gets leads from any assigned list" do
      list1 = create_list!()
      list2 = create_list!()
      lead1 = create_lead!(%{lead_list_id: list1.id})
      lead2 = create_lead!(%{lead_list_id: list2.id})
      agent = create_user!()

      {:ok, _} = Sales.assign_agent_to_list(list1.id, agent.id)
      {:ok, _} = Sales.assign_agent_to_list(list2.id, agent.id)

      {:ok, result1} = Sales.get_next_lead(agent)
      refute is_nil(result1)
      assert result1.id in [lead1.id, lead2.id]
    end
  end
end
