defmodule Saleflow.Sales.PhoneCallTest do
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

  # ---------------------------------------------------------------------------
  # create_phone_call/1
  # ---------------------------------------------------------------------------

  describe "create_phone_call/1" do
    test "creates a phone call with all required fields" do
      lead = create_lead!()
      user = create_user!()

      assert {:ok, phone_call} =
               Sales.create_phone_call(%{
                 caller: "+46701234567",
                 callee: "+46709876543",
                 lead_id: lead.id,
                 user_id: user.id,
                 duration: 120
               })

      assert phone_call.caller == "+46701234567"
      assert phone_call.callee == "+46709876543"
      assert phone_call.lead_id == lead.id
      assert phone_call.user_id == user.id
      assert phone_call.duration == 120
      refute is_nil(phone_call.id)
      refute is_nil(phone_call.received_at)
    end

    test "creates a phone call without lead or user (nullable)" do
      assert {:ok, phone_call} =
               Sales.create_phone_call(%{
                 caller: "+46701234567",
                 callee: "+46709876543"
               })

      assert is_nil(phone_call.lead_id)
      assert is_nil(phone_call.user_id)
      refute is_nil(phone_call.id)
    end

    test "defaults duration to 0" do
      assert {:ok, phone_call} =
               Sales.create_phone_call(%{
                 caller: "+46701234567",
                 callee: "+46709876543"
               })

      assert phone_call.duration == 0
    end

    test "auto-sets received_at to approximately now" do
      before = DateTime.utc_now()

      assert {:ok, phone_call} =
               Sales.create_phone_call(%{
                 caller: "+46701234567",
                 callee: "+46709876543"
               })

      assert DateTime.compare(phone_call.received_at, before) in [:gt, :eq]
      assert DateTime.diff(DateTime.utc_now(), phone_call.received_at, :second) < 5
    end

    test "received_at is not in accept list (always server-set)" do
      # Verify that passing received_at as a param is rejected by Ash
      # because it's not in the accept list — only force_change_attribute sets it
      result =
        Saleflow.Sales.PhoneCall
        |> Ash.Changeset.for_create(:create, %{
          caller: "+46701234567",
          callee: "+46709876543",
          received_at: ~U[2020-01-01 00:00:00.000000Z]
        })
        |> Ash.create()

      assert {:error, _} = result
    end

    test "accepts optional call_log_id" do
      lead = create_lead!()
      user = create_user!()

      {:ok, call_log} =
        Sales.log_call(%{lead_id: lead.id, user_id: user.id, outcome: :callback})

      assert {:ok, phone_call} =
               Sales.create_phone_call(%{
                 caller: "+46701234567",
                 callee: "+46709876543",
                 call_log_id: call_log.id
               })

      assert phone_call.call_log_id == call_log.id
    end
  end

  # ---------------------------------------------------------------------------
  # count_phone_calls_today/1
  # ---------------------------------------------------------------------------

  describe "count_phone_calls_today/1" do
    test "returns correct count for calls made today" do
      user = create_user!()

      {:ok, _} =
        Sales.create_phone_call(%{
          caller: "+46701234567",
          callee: "+46709876543",
          user_id: user.id
        })

      {:ok, _} =
        Sales.create_phone_call(%{
          caller: "+46701234568",
          callee: "+46709876544",
          user_id: user.id
        })

      assert {:ok, 2} = Sales.count_phone_calls_today(user.id)
    end

    test "returns 0 when no calls exist for user" do
      user = create_user!()

      assert {:ok, 0} = Sales.count_phone_calls_today(user.id)
    end

    test "does not count calls from other users" do
      user1 = create_user!()
      user2 = create_user!()

      {:ok, _} =
        Sales.create_phone_call(%{
          caller: "+46701234567",
          callee: "+46709876543",
          user_id: user1.id
        })

      {:ok, _} =
        Sales.create_phone_call(%{
          caller: "+46701234568",
          callee: "+46709876544",
          user_id: user2.id
        })

      assert {:ok, 1} = Sales.count_phone_calls_today(user1.id)
    end
  end
end
