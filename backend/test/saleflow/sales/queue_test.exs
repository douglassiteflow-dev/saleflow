defmodule Saleflow.Sales.QueueTest do
  @moduledoc """
  Comprehensive tests for `Saleflow.Sales.get_next_lead/1`.

  This module uses `async: false` because several tests spawn concurrent
  processes that all write to and read from the same database tables. Running
  these concurrently with other test modules would produce unpredictable results
  since FOR UPDATE SKIP LOCKED interacts with real transaction boundaries.
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

  # Sets quarantine_until to a time in the past so the lead re-enters the queue.
  defp expire_quarantine!(lead) do
    past = DateTime.add(DateTime.utc_now(), -1, :day)

    {:ok, updated} =
      Sales.update_lead_status(lead, %{status: :quarantine, quarantine_until: past})

    updated
  end

  # Sets quarantine_until to 7 days in the future (active quarantine).
  defp quarantine_lead!(lead) do
    future = DateTime.add(DateTime.utc_now(), 7, :day)

    {:ok, updated} =
      Sales.update_lead_status(lead, %{status: :quarantine, quarantine_until: future})

    updated
  end

  # ---------------------------------------------------------------------------
  # Basic get_next_lead behaviour
  # ---------------------------------------------------------------------------

  describe "get_next_lead/1 — basic behaviour" do
    test "returns a new lead when the queue has one" do
      lead = create_lead!()
      agent = create_user!()

      assert {:ok, result} = Sales.get_next_lead(agent)
      refute is_nil(result)
      assert result.id == lead.id
    end

    test "returns the oldest lead first (inserted_at ASC)" do
      agent = create_user!()

      old_lead = create_lead!(%{företag: "Old Company"})
      _new_lead = create_lead!(%{företag: "New Company"})

      assert {:ok, result} = Sales.get_next_lead(agent)
      assert result.id == old_lead.id
    end

    test "sets lead status to :assigned after dequeue" do
      create_lead!()
      agent = create_user!()

      assert {:ok, result} = Sales.get_next_lead(agent)
      refute is_nil(result)

      {:ok, refreshed} = Sales.get_lead(result.id)
      assert refreshed.status == :assigned
    end

    test "creates an active assignment for the agent" do
      create_lead!()
      agent = create_user!()

      assert {:ok, _lead} = Sales.get_next_lead(agent)

      assert {:ok, assignment} = Sales.get_active_assignment(agent)
      refute is_nil(assignment)
      assert assignment.user_id == agent.id
    end

    test "returns nil when the queue is empty" do
      agent = create_user!()

      assert {:ok, nil} = Sales.get_next_lead(agent)
    end
  end

  # ---------------------------------------------------------------------------
  # Status filtering — which leads are eligible
  # ---------------------------------------------------------------------------

  describe "get_next_lead/1 — lead eligibility" do
    test "picks up a lead with status :new" do
      lead = create_lead!()
      assert lead.status == :new

      agent = create_user!()
      assert {:ok, result} = Sales.get_next_lead(agent)
      assert result.id == lead.id
    end

    test "skips leads with status :assigned" do
      lead = create_lead!()
      agent1 = create_user!()
      agent2 = create_user!()

      # Agent 1 takes the lead
      {:ok, _} = Sales.get_next_lead(agent1)

      # Queue should now be empty for agent 2
      assert {:ok, nil} = Sales.get_next_lead(agent2)
    end

    test "skips leads with status :callback" do
      lead = create_lead!()
      {:ok, _} = Sales.update_lead_status(lead, %{status: :callback})

      agent = create_user!()
      assert {:ok, nil} = Sales.get_next_lead(agent)
    end

    test "skips leads with status :meeting_booked" do
      lead = create_lead!()
      {:ok, _} = Sales.update_lead_status(lead, %{status: :meeting_booked})

      agent = create_user!()
      assert {:ok, nil} = Sales.get_next_lead(agent)
    end

    test "skips leads with status :customer" do
      lead = create_lead!()
      {:ok, _} = Sales.update_lead_status(lead, %{status: :customer})

      agent = create_user!()
      assert {:ok, nil} = Sales.get_next_lead(agent)
    end

    test "skips leads with status :bad_number" do
      lead = create_lead!()
      {:ok, _} = Sales.update_lead_status(lead, %{status: :bad_number})

      agent = create_user!()
      assert {:ok, nil} = Sales.get_next_lead(agent)
    end

    test "skips leads in active quarantine (quarantine_until in the future)" do
      lead = create_lead!()
      _quarantined = quarantine_lead!(lead)

      agent = create_user!()
      assert {:ok, nil} = Sales.get_next_lead(agent)
    end

    test "returns lead whose quarantine has expired (quarantine_until in the past)" do
      lead = create_lead!()
      _expired = expire_quarantine!(lead)

      agent = create_user!()
      assert {:ok, result} = Sales.get_next_lead(agent)
      refute is_nil(result)
      assert result.id == lead.id
    end

    test "skips leads that already have an active (unreleased) assignment" do
      lead = create_lead!()
      agent1 = create_user!()
      agent2 = create_user!()

      # Manually assign without going through the queue, so we can test the
      # NOT EXISTS guard independently of status filtering.
      {:ok, _} = Sales.assign_lead(lead, agent1)
      # Lead is still :new in status (we didn't update it), but has active assignment

      assert {:ok, nil} = Sales.get_next_lead(agent2)
    end

    test "returns lead after its assignment is released and status reset to :new" do
      lead = create_lead!()
      agent1 = create_user!()
      agent2 = create_user!()

      {:ok, _taken_lead} = Sales.get_next_lead(agent1)

      # Simulate no-answer: release assignment, reset status to :new.
      # Reload the lead from DB first — the struct is stale (still shows
      # status: :new) and Ash would skip a no-op update.
      {:ok, active_assignment} = Sales.get_active_assignment(agent1)
      {:ok, _} = Sales.release_assignment(active_assignment, :outcome_logged)
      {:ok, assigned_lead} = Sales.get_lead(lead.id)
      {:ok, _} = Sales.update_lead_status(assigned_lead, %{status: :new})

      # Now agent2 should be able to pick it up
      assert {:ok, result} = Sales.get_next_lead(agent2)
      refute is_nil(result)
      assert result.id == lead.id
    end
  end

  # ---------------------------------------------------------------------------
  # Agent assignment management
  # ---------------------------------------------------------------------------

  describe "get_next_lead/1 — previous assignment release" do
    test "releases the agent's previous active assignment before creating a new one" do
      lead1 = create_lead!()
      lead2 = create_lead!()
      agent = create_user!()

      # Agent gets the oldest lead first (inserted_at ASC)
      {:ok, first_lead} = Sales.get_next_lead(agent)
      assert first_lead.id == lead1.id

      {:ok, assignment1} = Sales.get_active_assignment(agent)
      assert assignment1.lead_id == first_lead.id

      # Agent calls get_next again — should release assignment1 and take lead2
      {:ok, second_lead} = Sales.get_next_lead(agent)
      assert second_lead.id == lead2.id

      # Old assignment should now be released
      {:ok, old_assignment} = Ash.get(Saleflow.Sales.Assignment, assignment1.id)
      refute is_nil(old_assignment.released_at)
      assert old_assignment.release_reason == :manual

      # New active assignment points to second lead
      {:ok, assignment2} = Sales.get_active_assignment(agent)
      assert assignment2.lead_id == second_lead.id
    end

    test "does not fail when agent has no previous assignment" do
      create_lead!()
      agent = create_user!()

      # Agent has no prior assignment — get_next should still work
      assert {:ok, result} = Sales.get_next_lead(agent)
      refute is_nil(result)
    end
  end

  # ---------------------------------------------------------------------------
  # Two agents get different leads
  # ---------------------------------------------------------------------------

  describe "get_next_lead/1 — concurrent agent access" do
    test "two agents get different leads when both leads are available" do
      lead1 = create_lead!(%{företag: "Lead One"})
      lead2 = create_lead!(%{företag: "Lead Two"})
      agent1 = create_user!()
      agent2 = create_user!()

      {:ok, result1} = Sales.get_next_lead(agent1)
      {:ok, result2} = Sales.get_next_lead(agent2)

      refute is_nil(result1)
      refute is_nil(result2)
      assert result1.id != result2.id
      assert result1.id in [lead1.id, lead2.id]
      assert result2.id in [lead1.id, lead2.id]
    end

    test "second agent gets nil when only one lead is available" do
      create_lead!()
      agent1 = create_user!()
      agent2 = create_user!()

      {:ok, result1} = Sales.get_next_lead(agent1)
      {:ok, result2} = Sales.get_next_lead(agent2)

      refute is_nil(result1)
      assert is_nil(result2)
    end

    test "concurrent access — N agents each get a unique lead with no duplicates" do
      n = 5

      # Create N leads
      leads = for _ <- 1..n, do: create_lead!()
      lead_ids = Enum.map(leads, & &1.id) |> MapSet.new()

      # Create N agents
      agents = for _ <- 1..n, do: create_user!()

      # All agents race to get a lead via concurrent processes.
      # We use Task.async_stream so they all start near-simultaneously.
      # Each task runs in the Ecto SQL sandbox — we must allow the owner
      # pid (this test process) to share the connection.
      test_pid = self()

      results =
        agents
        |> Task.async_stream(
          fn agent ->
            # Allow this task to use the sandbox connection owned by the test.
            Ecto.Adapters.SQL.Sandbox.allow(Saleflow.Repo, test_pid, self())
            Sales.get_next_lead(agent)
          end,
          max_concurrency: n,
          timeout: 10_000
        )
        |> Enum.map(fn {:ok, {:ok, lead}} -> lead end)

      # Every result should be a non-nil lead
      assert Enum.all?(results, &(not is_nil(&1))),
             "Some agents got nil — expected every agent to receive a lead"

      # All returned lead IDs must be distinct
      returned_ids = Enum.map(results, & &1.id)
      assert length(returned_ids) == length(Enum.uniq(returned_ids)),
             "Duplicate lead IDs returned: #{inspect(returned_ids)}"

      # All returned IDs must be from our original set
      assert Enum.all?(returned_ids, &MapSet.member?(lead_ids, &1)),
             "Unexpected lead IDs in results"
    end
  end

  # ---------------------------------------------------------------------------
  # Queue ordering
  # ---------------------------------------------------------------------------

  describe "get_next_lead/1 — queue ordering" do
    test "leads are served in oldest-first order (inserted_at ASC)" do
      lead_a = create_lead!(%{företag: "A Corp"})
      lead_b = create_lead!(%{företag: "B Corp"})
      lead_c = create_lead!(%{företag: "C Corp"})

      agent1 = create_user!()
      agent2 = create_user!()
      agent3 = create_user!()

      {:ok, first} = Sales.get_next_lead(agent1)
      {:ok, second} = Sales.get_next_lead(agent2)
      {:ok, third} = Sales.get_next_lead(agent3)

      # Oldest lead first
      assert first.id == lead_a.id
      assert second.id == lead_b.id
      assert third.id == lead_c.id
    end
  end

  # ---------------------------------------------------------------------------
  # Error handling
  # ---------------------------------------------------------------------------

  describe "get_next_lead/1 — error handling" do
    test "returns {:error, _} when the SQL query fails" do
      agent = create_user!()

      # Temporarily rename the leads table to cause a SQL error
      Saleflow.Repo.query!("ALTER TABLE leads RENAME TO leads_tmp")

      result = Sales.get_next_lead(agent)
      assert {:error, _} = result

      # Restore the table name
      Saleflow.Repo.query!("ALTER TABLE leads_tmp RENAME TO leads")
    end
  end
end
