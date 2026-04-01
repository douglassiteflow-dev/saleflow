defmodule Saleflow.Sales.QuarantineTest do
  use Saleflow.DataCase, async: true

  alias Saleflow.Sales

  # ---------------------------------------------------------------------------
  # Helpers
  # ---------------------------------------------------------------------------

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

  defp quarantine!(lead, user, reason \\ "Too many calls recently") do
    {:ok, q} =
      Sales.create_quarantine(%{lead_id: lead.id, user_id: user.id, reason: reason})

    q
  end

  # ---------------------------------------------------------------------------
  # create_quarantine/1
  # ---------------------------------------------------------------------------

  describe "create_quarantine/1" do
    test "creates a quarantine record with correct lead_id and user_id" do
      lead = create_lead!()
      user = create_user!()

      assert {:ok, q} =
               Sales.create_quarantine(%{
                 lead_id: lead.id,
                 user_id: user.id,
                 reason: "Requested by prospect"
               })

      assert q.lead_id == lead.id
      assert q.user_id == user.id
      assert q.reason == "Requested by prospect"
    end

    test "auto-sets quarantined_at to approximately now" do
      lead = create_lead!()
      user = create_user!()
      before = DateTime.utc_now()

      q = quarantine!(lead, user)

      assert DateTime.compare(q.quarantined_at, before) in [:gt, :eq]
      assert DateTime.diff(DateTime.utc_now(), q.quarantined_at, :second) < 5
    end

    test "auto-sets released_at to 7 days after quarantined_at" do
      lead = create_lead!()
      user = create_user!()

      assert {:ok, q} =
               Sales.create_quarantine(%{
                 lead_id: lead.id,
                 user_id: user.id,
                 reason: "Test"
               })

      diff_seconds = DateTime.diff(q.released_at, q.quarantined_at, :second)
      # 7 days = 604800 seconds; allow ±5 seconds for execution time
      assert diff_seconds >= 604_795
      assert diff_seconds <= 604_805
    end

    test "released_at is in the future" do
      lead = create_lead!()
      user = create_user!()

      q = quarantine!(lead, user)
      assert DateTime.compare(q.released_at, DateTime.utc_now()) == :gt
    end

    test "creates an audit log entry on quarantine" do
      lead = create_lead!()
      user = create_user!()

      assert {:ok, q} =
               Sales.create_quarantine(%{
                 lead_id: lead.id,
                 user_id: user.id,
                 reason: "Audit test"
               })

      assert {:ok, logs} = Saleflow.Audit.list_for_resource("Quarantine", q.id)
      created_log = Enum.find(logs, fn l -> l.action == "quarantine.created" end)
      refute is_nil(created_log)
      assert created_log.resource_id == q.id
    end
  end

  # ---------------------------------------------------------------------------
  # list_active_quarantines/0
  # ---------------------------------------------------------------------------

  describe "list_active_quarantines/0" do
    test "returns quarantine records where released_at is in the future" do
      lead = create_lead!()
      user = create_user!()

      {:ok, q} =
        Sales.create_quarantine(%{
          lead_id: lead.id,
          user_id: user.id,
          reason: "Active quarantine"
        })

      assert {:ok, active} = Sales.list_active_quarantines()
      ids = Enum.map(active, & &1.id)
      assert q.id in ids
    end

    test "all returned quarantines have released_at in the future" do
      assert {:ok, active} = Sales.list_active_quarantines()

      now = DateTime.utc_now()

      assert Enum.all?(active, fn q ->
               DateTime.compare(q.released_at, now) == :gt
             end)
    end

    test "returns multiple active quarantines" do
      lead1 = create_lead!()
      lead2 = create_lead!()
      user = create_user!()

      {:ok, q1} = Sales.create_quarantine(%{lead_id: lead1.id, user_id: user.id, reason: "First"})
      {:ok, q2} = Sales.create_quarantine(%{lead_id: lead2.id, user_id: user.id, reason: "Second"})

      assert {:ok, active} = Sales.list_active_quarantines()
      ids = Enum.map(active, & &1.id)
      assert q1.id in ids
      assert q2.id in ids
    end
  end
end
