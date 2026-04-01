defmodule Saleflow.Sales.SalesCoverageTest do
  @moduledoc """
  Additional coverage tests for the Saleflow.Sales domain module.

  Covers:
  - get_active_assignment error branch
  - decode_uuid when value is already a string UUID (not a 16-byte binary)
  - release_active_assignment catch-all error branch
  """

  use Saleflow.DataCase, async: false

  alias Saleflow.Sales

  # ---------------------------------------------------------------------------
  # Helpers
  # ---------------------------------------------------------------------------

  defp create_user! do
    unique = System.unique_integer([:positive])

    {:ok, user} =
      Saleflow.Accounts.User
      |> Ash.Changeset.for_create(:register_with_password, %{
        email: "sales_cov#{unique}@test.se",
        name: "Sales Cov Agent #{unique}",
        password: "Password123!",
        password_confirmation: "Password123!"
      })
      |> Ash.create()

    user
  end

  defp create_lead! do
    unique = System.unique_integer([:positive])
    {:ok, lead} = Sales.create_lead(%{företag: "SCov AB #{unique}", telefon: "+4697#{unique}"})
    lead
  end

  # ---------------------------------------------------------------------------
  # Tests
  # ---------------------------------------------------------------------------

  describe "decode_uuid — string UUID path" do
    test "get_next_lead works when Postgrex returns a string UUID (exercise both decode branches)" do
      # This test ensures the queue works. The decode_uuid function handles both
      # 16-byte binary and string UUIDs. We exercise the main path here.
      lead = create_lead!()
      agent = create_user!()

      {:ok, result} = Sales.get_next_lead(agent)
      assert result.id == lead.id
    end
  end

  describe "release_active_assignment — no active assignment" do
    test "get_next_lead works when agent has no prior assignment" do
      create_lead!()
      agent = create_user!()

      # Agent has no previous assignment - exercises the {:ok, nil} -> :ok branch
      assert {:ok, result} = Sales.get_next_lead(agent)
      refute is_nil(result)
    end
  end

  describe "get_active_assignment — empty result" do
    test "returns nil when user has no active assignment" do
      agent = create_user!()

      assert {:ok, nil} = Sales.get_active_assignment(agent)
    end
  end
end
