defmodule Saleflow.Sales.QueueIntegrityTest do
  @moduledoc """
  Tests for queue integrity fixes:
  - Bug #5:  Unique index preventing multiple active assignments per lead
  - Bug #10: Per-user skip filter (skipped leads hidden for 24h from same agent)
  - Bug #14: Oldest-first ordering (inserted_at ASC, not RANDOM)
  """

  use Saleflow.DataCase, async: false

  alias Saleflow.Sales

  # ---------------------------------------------------------------------------
  # Helpers
  # ---------------------------------------------------------------------------

  defp create_lead!(params \\ %{}) do
    base = %{företag: "Test AB #{System.unique_integer([:positive])}", telefon: "+46701234567"}
    {:ok, lead} = Sales.create_lead(Map.merge(base, params))
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

  defp skip_lead!(lead, agent) do
    {:ok, _} =
      Saleflow.Sales.CallLog
      |> Ash.Changeset.for_create(:create, %{
        lead_id: lead.id,
        user_id: agent.id,
        outcome: :skipped
      })
      |> Ash.create()
  end

  # ---------------------------------------------------------------------------
  # Bug #14: Oldest-first ordering
  # ---------------------------------------------------------------------------

  describe "oldest-first ordering (Bug #14)" do
    test "returns oldest lead first (not random)" do
      old_lead = create_lead!(%{företag: "Old Lead"})
      _new_lead = create_lead!(%{företag: "New Lead"})
      agent = create_user!()

      assert {:ok, result} = Sales.get_next_lead(agent)
      assert result.id == old_lead.id
    end
  end

  # ---------------------------------------------------------------------------
  # Bug #10: Per-user skip filter
  # ---------------------------------------------------------------------------

  describe "per-user skip filter (Bug #10)" do
    test "skipped lead within 24h is not returned to same agent" do
      lead1 = create_lead!(%{företag: "Skipped Lead"})
      lead2 = create_lead!(%{företag: "Other Lead"})
      agent = create_user!()

      # Agent skips lead1
      skip_lead!(lead1, agent)

      # Agent should get lead2 (lead1 is filtered out for this agent)
      assert {:ok, result} = Sales.get_next_lead(agent)
      assert result.id == lead2.id
    end

    test "skipped lead IS returned to a different agent" do
      lead = create_lead!(%{företag: "Skipped Lead"})
      agent_a = create_user!()
      agent_b = create_user!()

      # Agent A skips the lead
      skip_lead!(lead, agent_a)

      # Agent B should still get it
      assert {:ok, result} = Sales.get_next_lead(agent_b)
      assert result.id == lead.id
    end

    test "skipped lead returns to same agent after 24h" do
      lead = create_lead!(%{företag: "Skipped Lead"})
      agent = create_user!()

      # Insert a skip log with called_at > 24 hours ago
      past = DateTime.add(DateTime.utc_now(), -25, :hour)
      uid = Ecto.UUID.dump!(agent.id)
      lid = Ecto.UUID.dump!(lead.id)

      Saleflow.Repo.query!(
        "INSERT INTO call_logs (id, lead_id, user_id, outcome, called_at) VALUES ($1, $2, $3, 'skipped', $4)",
        [Ecto.UUID.dump!(Ecto.UUID.generate()), lid, uid, past]
      )

      # Agent should get the lead back since skip was > 24h ago
      assert {:ok, result} = Sales.get_next_lead(agent)
      assert result.id == lead.id
    end
  end

  # ---------------------------------------------------------------------------
  # Bug #5: Unique active assignment constraint
  # ---------------------------------------------------------------------------

  describe "unique active assignment constraint (Bug #5)" do
    test "duplicate active assignment raises constraint error" do
      lead = create_lead!()
      agent1 = create_user!()
      agent2 = create_user!()

      # First assignment succeeds
      {:ok, _} = Sales.assign_lead(lead, agent1)

      # Second active assignment for same lead should violate the unique index
      assert {:error, _} = Sales.assign_lead(lead, agent2)
    end

    test "released assignment allows new active assignment for same lead" do
      lead = create_lead!()
      agent1 = create_user!()
      agent2 = create_user!()

      # First assignment
      {:ok, assignment} = Sales.assign_lead(lead, agent1)

      # Release it
      {:ok, _} = Sales.release_assignment(assignment, :manual)

      # New assignment for same lead should succeed
      {:ok, new_assignment} = Sales.assign_lead(lead, agent2)
      assert new_assignment.lead_id == lead.id
    end
  end
end
