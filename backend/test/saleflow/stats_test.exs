defmodule Saleflow.StatsTest do
  use Saleflow.DataCase, async: true

  alias Saleflow.Stats
  alias Saleflow.Sales

  # ---------------------------------------------------------------------------
  # Helpers
  # ---------------------------------------------------------------------------

  defp create_lead! do
    unique = System.unique_integer([:positive])
    {:ok, lead} = Sales.create_lead(%{företag: "Test AB #{unique}", telefon: "+46701234567"})
    lead
  end

  defp create_user!(opts \\ []) do
    unique = System.unique_integer([:positive])
    role = Keyword.get(opts, :role, :agent)

    {:ok, user} =
      Saleflow.Accounts.User
      |> Ash.Changeset.for_create(:register_with_password, %{
        email: "agent#{unique}@test.se",
        name: "Agent #{unique}",
        password: "Password123!",
        password_confirmation: "Password123!",
        role: role
      })
      |> Ash.create()

    user
  end

  defp create_meeting!(lead, user) do
    {:ok, meeting} =
      Sales.create_meeting(%{
        lead_id: lead.id,
        user_id: user.id,
        title: "Demo",
        meeting_date: Date.utc_today() |> Date.add(7),
        meeting_time: ~T[10:00:00]
      })

    meeting
  end

  defp create_outgoing_call!(user, opts \\ []) do
    params =
      %{
        user_id: user.id,
        caller: "+46701111111",
        callee: "+46702222222",
        direction: :outgoing
      }
      |> then(fn p ->
        case Keyword.get(opts, :lead_id) do
          nil -> p
          lead_id -> Map.put(p, :lead_id, lead_id)
        end
      end)

    {:ok, call} = Sales.create_phone_call(params)
    call
  end

  defp set_lead_status!(lead, status) do
    {:ok, updated} = Sales.update_lead_status(lead, %{status: status})
    updated
  end

  defp create_incoming_call!(user) do
    {:ok, call} =
      Sales.create_phone_call(%{
        user_id: user.id,
        caller: "+46702222222",
        callee: "+46701111111",
        direction: :incoming
      })

    call
  end

  defp create_skipped_call!(user, opts \\ []) do
    lead_id = Keyword.get(opts, :lead_id)
    lead = if lead_id, do: nil, else: create_lead!()
    actual_lead_id = lead_id || lead.id

    {:ok, call_log} = Sales.log_call(%{
      lead_id: actual_lead_id,
      user_id: user.id,
      outcome: :skipped,
      notes: "Hoppade över"
    })

    params =
      %{
        user_id: user.id,
        caller: "+46701111111",
        callee: "+46702222222",
        direction: :outgoing,
        call_log_id: call_log.id
      }
      |> then(fn p -> Map.put(p, :lead_id, actual_lead_id) end)

    {:ok, phone_call} = Sales.create_phone_call(params)
    phone_call
  end

  # ---------------------------------------------------------------------------
  # leaderboard/0
  # ---------------------------------------------------------------------------

  describe "leaderboard/0" do
    test "net_meetings_today equals booked (non-cancelled) meetings" do
      user = create_user!()
      lead1 = create_lead!()
      lead2 = create_lead!()

      # Book 2 meetings
      _m1 = create_meeting!(lead1, user)
      m2 = create_meeting!(lead2, user)

      # Cancel 1
      {:ok, _} = Sales.cancel_meeting(m2)

      rows = Stats.leaderboard()
      row = Enum.find(rows, fn r -> r.user_id == user.id end)

      assert row != nil
      assert row.meetings_booked_today == 1
      assert row.meetings_cancelled_today == 1
      assert row.net_meetings_today == 1
    end

    test "net_meetings_today is correct with no cancellations" do
      user = create_user!()
      lead = create_lead!()

      _m = create_meeting!(lead, user)

      rows = Stats.leaderboard()
      row = Enum.find(rows, fn r -> r.user_id == user.id end)

      assert row.meetings_booked_today == 1
      assert row.meetings_cancelled_today == 0
      assert row.net_meetings_today == 1
    end

    test "calls_today excludes skipped calls" do
      user = create_user!()

      create_outgoing_call!(user)
      create_outgoing_call!(user)
      create_skipped_call!(user)

      rows = Stats.leaderboard()
      row = Enum.find(rows, fn r -> r.user_id == user.id end)

      assert row != nil
      assert row.calls_today == 2
    end

    test "calls_today excludes calls to leads with meeting_booked or customer status" do
      user = create_user!()
      lead_booked = create_lead!()
      set_lead_status!(lead_booked, :meeting_booked)
      lead_customer = create_lead!()
      set_lead_status!(lead_customer, :customer)
      lead_new = create_lead!()

      create_outgoing_call!(user, lead_id: lead_booked.id)
      create_outgoing_call!(user, lead_id: lead_customer.id)
      create_outgoing_call!(user, lead_id: lead_new.id)
      create_outgoing_call!(user)

      rows = Stats.leaderboard()
      row = Enum.find(rows, fn r -> r.user_id == user.id end)

      assert row != nil
      assert row.calls_today == 2
    end
  end

  # ---------------------------------------------------------------------------
  # calls_today/1
  # ---------------------------------------------------------------------------

  describe "calls_today/1" do
    test "counts only outgoing calls" do
      user = create_user!()

      create_outgoing_call!(user)
      create_outgoing_call!(user)
      create_incoming_call!(user)

      assert Stats.calls_today(user.id) == 2
    end

    test "returns 0 when no calls" do
      user = create_user!()
      assert Stats.calls_today(user.id) == 0
    end

    test "excludes calls to leads with status meeting_booked" do
      user = create_user!()
      lead = create_lead!()
      set_lead_status!(lead, :meeting_booked)

      create_outgoing_call!(user, lead_id: lead.id)
      create_outgoing_call!(user)

      assert Stats.calls_today(user.id) == 1
    end

    test "excludes calls to leads with status customer" do
      user = create_user!()
      lead = create_lead!()
      set_lead_status!(lead, :customer)

      create_outgoing_call!(user, lead_id: lead.id)
      create_outgoing_call!(user)

      assert Stats.calls_today(user.id) == 1
    end

    test "includes calls to leads with status new, assigned, callback" do
      user = create_user!()
      lead_new = create_lead!()
      lead_assigned = create_lead!()
      set_lead_status!(lead_assigned, :assigned)
      lead_callback = create_lead!()
      set_lead_status!(lead_callback, :callback)

      create_outgoing_call!(user, lead_id: lead_new.id)
      create_outgoing_call!(user, lead_id: lead_assigned.id)
      create_outgoing_call!(user, lead_id: lead_callback.id)

      assert Stats.calls_today(user.id) == 3
    end

    test "includes calls without a lead_id (backward compatibility)" do
      user = create_user!()

      create_outgoing_call!(user)
      create_outgoing_call!(user)

      assert Stats.calls_today(user.id) == 2
    end

    test "excludes skipped calls" do
      user = create_user!()

      create_outgoing_call!(user)
      create_skipped_call!(user)
      create_outgoing_call!(user)

      assert Stats.calls_today(user.id) == 2
    end
  end

  # ---------------------------------------------------------------------------
  # total_calls/1
  # ---------------------------------------------------------------------------

  describe "total_calls/1" do
    test "excludes calls to leads with status meeting_booked" do
      user = create_user!()
      lead = create_lead!()
      set_lead_status!(lead, :meeting_booked)

      create_outgoing_call!(user, lead_id: lead.id)
      create_outgoing_call!(user)

      assert Stats.total_calls(user.id) == 1
    end

    test "excludes calls to leads with status customer" do
      user = create_user!()
      lead = create_lead!()
      set_lead_status!(lead, :customer)

      create_outgoing_call!(user, lead_id: lead.id)
      create_outgoing_call!(user)

      assert Stats.total_calls(user.id) == 1
    end

    test "includes calls without a lead_id" do
      user = create_user!()
      create_outgoing_call!(user)
      assert Stats.total_calls(user.id) == 1
    end

    test "excludes skipped calls" do
      user = create_user!()

      create_outgoing_call!(user)
      create_skipped_call!(user)

      assert Stats.total_calls(user.id) == 1
    end
  end

  # ---------------------------------------------------------------------------
  # all_calls_today/0
  # ---------------------------------------------------------------------------

  describe "all_calls_today/0" do
    test "counts outgoing calls across all users" do
      user1 = create_user!()
      user2 = create_user!()

      create_outgoing_call!(user1)
      create_outgoing_call!(user1)
      create_outgoing_call!(user2)
      create_incoming_call!(user2)

      assert Stats.all_calls_today() == 3
    end

    test "excludes calls to leads with status meeting_booked or customer" do
      user1 = create_user!()
      user2 = create_user!()
      lead_booked = create_lead!()
      set_lead_status!(lead_booked, :meeting_booked)
      lead_customer = create_lead!()
      set_lead_status!(lead_customer, :customer)

      create_outgoing_call!(user1, lead_id: lead_booked.id)
      create_outgoing_call!(user2, lead_id: lead_customer.id)
      create_outgoing_call!(user1)
      create_outgoing_call!(user2)

      assert Stats.all_calls_today() == 2
    end

    test "excludes skipped calls" do
      user1 = create_user!()
      user2 = create_user!()

      create_outgoing_call!(user1)
      create_skipped_call!(user1)
      create_outgoing_call!(user2)
      create_skipped_call!(user2)

      assert Stats.all_calls_today() == 2
    end
  end

  # ---------------------------------------------------------------------------
  # all_total_calls/0
  # ---------------------------------------------------------------------------

  describe "all_total_calls/0" do
    test "excludes calls to leads with status meeting_booked or customer" do
      user = create_user!()
      lead_booked = create_lead!()
      set_lead_status!(lead_booked, :meeting_booked)
      lead_customer = create_lead!()
      set_lead_status!(lead_customer, :customer)

      create_outgoing_call!(user, lead_id: lead_booked.id)
      create_outgoing_call!(user, lead_id: lead_customer.id)
      create_outgoing_call!(user)

      assert Stats.all_total_calls() == 1
    end

    test "includes calls without a lead_id" do
      user = create_user!()
      create_outgoing_call!(user)
      assert Stats.all_total_calls() >= 1
    end

    test "excludes skipped calls" do
      user = create_user!()

      create_outgoing_call!(user)
      create_skipped_call!(user)

      # all_total_calls is global so we can't assert exact count,
      # but skipped should not be counted
      real_calls = Stats.all_total_calls()

      # Add another skipped — count should stay the same
      create_skipped_call!(user)
      assert Stats.all_total_calls() == real_calls
    end
  end

  # ---------------------------------------------------------------------------
  # conversion_rate/2
  # ---------------------------------------------------------------------------

  describe "conversion_rate/2" do
    test "returns 0.0 when calls is 0" do
      assert Stats.conversion_rate(0, 0) == 0.0
      assert Stats.conversion_rate(0, 5) == 0.0
    end

    test "calculates correct percentage" do
      assert Stats.conversion_rate(10, 2) == 20.0
      assert Stats.conversion_rate(3, 1) == 33.3
    end

    test "rounds to one decimal" do
      # 1/7 * 100 = 14.2857...
      assert Stats.conversion_rate(7, 1) == 14.3
    end
  end
end
