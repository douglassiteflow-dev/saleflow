defmodule Saleflow.Sales.AssignmentTest do
  use Saleflow.DataCase, async: true

  alias Saleflow.Sales

  # ---------------------------------------------------------------------------
  # Helpers
  # ---------------------------------------------------------------------------

  defp create_lead! do
    {:ok, lead} = Sales.create_lead(%{företag: "Test AB", telefon: "+46701234567"})
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

  # ---------------------------------------------------------------------------
  # assign_lead/2
  # ---------------------------------------------------------------------------

  describe "assign_lead/2" do
    test "creates an assignment with correct lead_id and user_id" do
      lead = create_lead!()
      user = create_user!()

      assert {:ok, assignment} = Sales.assign_lead(lead, user)
      assert assignment.lead_id == lead.id
      assert assignment.user_id == user.id
    end

    test "creates an assignment with assigned_at set to now" do
      lead = create_lead!()
      user = create_user!()
      before = DateTime.utc_now()

      assert {:ok, assignment} = Sales.assign_lead(lead, user)

      assert DateTime.compare(assignment.assigned_at, before) in [:gt, :eq]
      assert DateTime.diff(DateTime.utc_now(), assignment.assigned_at, :second) < 5
    end

    test "creates an assignment with released_at nil (active)" do
      lead = create_lead!()
      user = create_user!()

      assert {:ok, assignment} = Sales.assign_lead(lead, user)
      assert is_nil(assignment.released_at)
    end

    test "creates an assignment with release_reason nil" do
      lead = create_lead!()
      user = create_user!()

      assert {:ok, assignment} = Sales.assign_lead(lead, user)
      assert is_nil(assignment.release_reason)
    end

    test "returns an assignment id" do
      lead = create_lead!()
      user = create_user!()

      assert {:ok, assignment} = Sales.assign_lead(lead, user)
      refute is_nil(assignment.id)
    end

    test "creates an audit log entry on assign" do
      lead = create_lead!()
      user = create_user!()

      assert {:ok, assignment} = Sales.assign_lead(lead, user)

      assert {:ok, logs} = Saleflow.Audit.list_for_resource("Assignment", assignment.id)
      created_log = Enum.find(logs, fn l -> l.action == "assignment.created" end)
      refute is_nil(created_log)
      assert created_log.resource_type == "Assignment"
      assert created_log.resource_id == assignment.id
    end
  end

  # ---------------------------------------------------------------------------
  # release_assignment/2
  # ---------------------------------------------------------------------------

  describe "release_assignment/2" do
    test "sets released_at to a recent timestamp" do
      lead = create_lead!()
      user = create_user!()
      {:ok, assignment} = Sales.assign_lead(lead, user)
      before = DateTime.utc_now()

      assert {:ok, released} = Sales.release_assignment(assignment, :manual)

      assert DateTime.compare(released.released_at, before) in [:gt, :eq]
      assert DateTime.diff(DateTime.utc_now(), released.released_at, :second) < 5
    end

    test "sets release_reason to :manual" do
      lead = create_lead!()
      user = create_user!()
      {:ok, assignment} = Sales.assign_lead(lead, user)

      assert {:ok, released} = Sales.release_assignment(assignment, :manual)
      assert released.release_reason == :manual
    end

    test "sets release_reason to :outcome_logged" do
      lead = create_lead!()
      user = create_user!()
      {:ok, assignment} = Sales.assign_lead(lead, user)

      assert {:ok, released} = Sales.release_assignment(assignment, :outcome_logged)
      assert released.release_reason == :outcome_logged
    end

    test "sets release_reason to :timeout" do
      lead = create_lead!()
      user = create_user!()
      {:ok, assignment} = Sales.assign_lead(lead, user)

      assert {:ok, released} = Sales.release_assignment(assignment, :timeout)
      assert released.release_reason == :timeout
    end

    test "creates an audit log entry on release" do
      lead = create_lead!()
      user = create_user!()
      {:ok, assignment} = Sales.assign_lead(lead, user)

      assert {:ok, released} = Sales.release_assignment(assignment, :manual)

      assert {:ok, logs} = Saleflow.Audit.list_for_resource("Assignment", released.id)
      released_log = Enum.find(logs, fn l -> l.action == "assignment.released" end)
      refute is_nil(released_log)
    end
  end

  # ---------------------------------------------------------------------------
  # get_active_assignment/1
  # ---------------------------------------------------------------------------

  describe "get_active_assignment/1" do
    test "returns the active (unreleased) assignment for a user" do
      lead = create_lead!()
      user = create_user!()
      {:ok, assignment} = Sales.assign_lead(lead, user)

      assert {:ok, found} = Sales.get_active_assignment(user)
      assert found.id == assignment.id
    end

    test "returns nil when user has no active assignment" do
      user = create_user!()

      assert {:ok, nil} = Sales.get_active_assignment(user)
    end

    test "returns nil after assignment is released" do
      lead = create_lead!()
      user = create_user!()
      {:ok, assignment} = Sales.assign_lead(lead, user)
      {:ok, _released} = Sales.release_assignment(assignment, :manual)

      assert {:ok, nil} = Sales.get_active_assignment(user)
    end

    test "returns the unreleased assignment when released ones also exist" do
      lead1 = create_lead!()
      lead2 = create_lead!()
      user = create_user!()

      {:ok, old_assignment} = Sales.assign_lead(lead1, user)
      {:ok, _released} = Sales.release_assignment(old_assignment, :outcome_logged)
      {:ok, active} = Sales.assign_lead(lead2, user)

      assert {:ok, found} = Sales.get_active_assignment(user)
      assert found.id == active.id
    end
  end
end
