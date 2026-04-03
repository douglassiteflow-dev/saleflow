defmodule Saleflow.Sales.CallLogTest do
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

  defp log_call!(lead, user, opts \\ []) do
    outcome = Keyword.get(opts, :outcome, :callback)
    notes = Keyword.get(opts, :notes, nil)

    params =
      %{lead_id: lead.id, user_id: user.id, outcome: outcome}
      |> then(fn p -> if notes, do: Map.put(p, :notes, notes), else: p end)

    {:ok, call} = Sales.log_call(params)
    call
  end

  # ---------------------------------------------------------------------------
  # log_call/1
  # ---------------------------------------------------------------------------

  describe "log_call/1" do
    test "creates a call log with all required fields" do
      lead = create_lead!()
      user = create_user!()

      assert {:ok, call} =
               Sales.log_call(%{lead_id: lead.id, user_id: user.id, outcome: :callback})

      assert call.lead_id == lead.id
      assert call.user_id == user.id
      assert call.outcome == :callback
      refute is_nil(call.id)
    end

    test "auto-sets called_at to approximately now" do
      lead = create_lead!()
      user = create_user!()
      before = DateTime.utc_now()

      assert {:ok, call} =
               Sales.log_call(%{lead_id: lead.id, user_id: user.id, outcome: :no_answer})

      assert DateTime.compare(call.called_at, before) in [:gt, :eq]
      assert DateTime.diff(DateTime.utc_now(), call.called_at, :second) < 5
    end

    test "accepts optional notes" do
      lead = create_lead!()
      user = create_user!()

      assert {:ok, call} =
               Sales.log_call(%{
                 lead_id: lead.id,
                 user_id: user.id,
                 outcome: :callback,
                 notes: "Call back Wednesday morning"
               })

      assert call.notes == "Call back Wednesday morning"
    end

    test "stores nil notes when not provided" do
      lead = create_lead!()
      user = create_user!()

      assert {:ok, call} =
               Sales.log_call(%{lead_id: lead.id, user_id: user.id, outcome: :no_answer})

      assert is_nil(call.notes)
    end

    test "logs outcome :meeting_booked" do
      lead = create_lead!()
      user = create_user!()
      assert {:ok, call} = Sales.log_call(%{lead_id: lead.id, user_id: user.id, outcome: :meeting_booked})
      assert call.outcome == :meeting_booked
    end

    test "logs outcome :not_interested" do
      lead = create_lead!()
      user = create_user!()
      assert {:ok, call} = Sales.log_call(%{lead_id: lead.id, user_id: user.id, outcome: :not_interested})
      assert call.outcome == :not_interested
    end

    test "logs outcome :no_answer" do
      lead = create_lead!()
      user = create_user!()
      assert {:ok, call} = Sales.log_call(%{lead_id: lead.id, user_id: user.id, outcome: :no_answer})
      assert call.outcome == :no_answer
    end

    test "logs outcome :bad_number" do
      lead = create_lead!()
      user = create_user!()
      assert {:ok, call} = Sales.log_call(%{lead_id: lead.id, user_id: user.id, outcome: :bad_number})
      assert call.outcome == :bad_number
    end

    test "logs outcome :customer" do
      lead = create_lead!()
      user = create_user!()
      assert {:ok, call} = Sales.log_call(%{lead_id: lead.id, user_id: user.id, outcome: :customer})
      assert call.outcome == :customer
    end

    test "logs outcome :other" do
      lead = create_lead!()
      user = create_user!()
      assert {:ok, call} = Sales.log_call(%{lead_id: lead.id, user_id: user.id, outcome: :other})
      assert call.outcome == :other
    end

    test "creates an audit log entry on call" do
      lead = create_lead!()
      user = create_user!()

      assert {:ok, call} = Sales.log_call(%{lead_id: lead.id, user_id: user.id, outcome: :callback})

      assert {:ok, logs} = Saleflow.Audit.list_for_resource("CallLog", call.id)
      audit_entry = Enum.find(logs, fn l -> l.action == "call.logged" end)
      refute is_nil(audit_entry)
      assert audit_entry.resource_id == call.id
    end
  end

  # ---------------------------------------------------------------------------
  # list_calls_for_lead/1
  # ---------------------------------------------------------------------------

  describe "list_calls_for_lead/1" do
    test "returns calls for a given lead" do
      lead = create_lead!()
      user1 = create_user!()
      user2 = create_user!()

      log_call!(lead, user1, outcome: :no_answer)
      log_call!(lead, user2, outcome: :callback)

      assert {:ok, calls} = Sales.list_calls_for_lead(lead.id)
      assert length(calls) == 2
      assert Enum.all?(calls, fn c -> c.lead_id == lead.id end)
    end

    test "returns empty list when no calls for lead" do
      lead = create_lead!()

      assert {:ok, []} = Sales.list_calls_for_lead(lead.id)
    end

    test "does not return calls for other leads" do
      lead1 = create_lead!()
      lead2 = create_lead!()
      user = create_user!()

      log_call!(lead1, user, outcome: :callback)
      log_call!(lead2, user, outcome: :no_answer)

      assert {:ok, calls} = Sales.list_calls_for_lead(lead1.id)
      assert length(calls) == 1
      assert hd(calls).lead_id == lead1.id
    end

    test "sorts calls by called_at descending (newest first)" do
      lead = create_lead!()
      user = create_user!()

      call1 = log_call!(lead, user, outcome: :no_answer)

      # Backdate call1's called_at by 1 hour so timestamps differ
      Saleflow.Repo.query!(
        "UPDATE call_logs SET called_at = called_at - INTERVAL '1 hour' WHERE id = $1",
        [Ecto.UUID.dump!(call1.id)]
      )

      call2 = log_call!(lead, user, outcome: :callback)

      assert {:ok, calls} = Sales.list_calls_for_lead(lead.id)
      assert length(calls) == 2
      # call2 is newer, so it should be first (descending order)
      assert hd(calls).id == call2.id
    end
  end

  # ---------------------------------------------------------------------------
  # list_calls_for_user/1
  # ---------------------------------------------------------------------------

  describe "list_calls_for_user/1" do
    test "returns calls made by the given user" do
      lead1 = create_lead!()
      lead2 = create_lead!()
      user = create_user!()

      log_call!(lead1, user, outcome: :no_answer)
      log_call!(lead2, user, outcome: :callback)

      assert {:ok, calls} = Sales.list_calls_for_user(user.id)
      assert length(calls) == 2
      assert Enum.all?(calls, fn c -> c.user_id == user.id end)
    end

    test "returns empty list when user has made no calls" do
      user = create_user!()
      assert {:ok, []} = Sales.list_calls_for_user(user.id)
    end

    test "does not return calls made by other users" do
      lead = create_lead!()
      user1 = create_user!()
      user2 = create_user!()

      log_call!(lead, user1, outcome: :callback)
      log_call!(lead, user2, outcome: :no_answer)

      assert {:ok, calls} = Sales.list_calls_for_user(user1.id)
      assert length(calls) == 1
      assert hd(calls).user_id == user1.id
    end
  end
end
