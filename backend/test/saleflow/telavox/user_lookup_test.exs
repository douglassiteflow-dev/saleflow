defmodule Saleflow.Telavox.UserLookupTest do
  use Saleflow.DataCase

  alias Saleflow.Telavox.UserLookup

  # ---------------------------------------------------------------------------
  # Helpers
  # ---------------------------------------------------------------------------

  defp create_user(attrs \\ %{}) do
    unique = System.unique_integer([:positive])

    {:ok, user} =
      Saleflow.Accounts.register(%{
        email: "lookup-#{unique}@example.com",
        name: "User #{unique}",
        password: "password123",
        password_confirmation: "password123"
      })

    if map_size(attrs) > 0 do
      {:ok, user} =
        user
        |> Ash.Changeset.for_update(:update_user, attrs)
        |> Ash.update()

      user
    else
      user
    end
  end

  defp create_lead(telefon) do
    {:ok, lead} =
      Saleflow.Sales.create_lead(%{
        företag: "Test AB",
        telefon: telefon
      })

    lead
  end

  # ---------------------------------------------------------------------------
  # build_user_map/0
  # ---------------------------------------------------------------------------

  describe "build_user_map/0" do
    test "returns empty map when no users have extension or phone" do
      _user = create_user()
      map = UserLookup.build_user_map()

      refute Map.has_key?(map, nil)
      refute Map.has_key?(map, "")
    end

    test "maps extension_number to user_id" do
      user = create_user(%{extension_number: "0101111111"})
      map = UserLookup.build_user_map()

      assert Map.get(map, "0101111111") == user.id
    end

    test "maps phone_number to user_id" do
      user = create_user(%{phone_number: "0701234567"})
      map = UserLookup.build_user_map()

      assert Map.get(map, "0701234567") == user.id
    end

    test "maps both extension and phone for same user" do
      user = create_user(%{extension_number: "0101111111", phone_number: "0701234567"})
      map = UserLookup.build_user_map()

      assert Map.get(map, "0101111111") == user.id
      assert Map.get(map, "0701234567") == user.id
    end
  end

  # ---------------------------------------------------------------------------
  # find_user_id/1
  # ---------------------------------------------------------------------------

  describe "find_user_id/1" do
    test "returns nil for nil" do
      assert UserLookup.find_user_id(nil) == nil
    end

    test "returns nil for empty string" do
      assert UserLookup.find_user_id("") == nil
    end

    test "finds user by extension_number" do
      user = create_user(%{extension_number: "0109999999"})
      assert UserLookup.find_user_id("0109999999") == user.id
    end

    test "finds user by phone_number" do
      user = create_user(%{phone_number: "0709999999"})
      assert UserLookup.find_user_id("0709999999") == user.id
    end

    test "returns nil when no match" do
      assert UserLookup.find_user_id("0000000000") == nil
    end
  end

  # ---------------------------------------------------------------------------
  # find_lead_id/1
  # ---------------------------------------------------------------------------

  describe "find_lead_id/1" do
    test "returns nil for nil" do
      assert UserLookup.find_lead_id(nil) == nil
    end

    test "returns nil for empty string" do
      assert UserLookup.find_lead_id("") == nil
    end

    test "finds lead by exact phone match" do
      lead = create_lead("0701234567")
      assert UserLookup.find_lead_id("0701234567") == lead.id
    end

    test "finds lead by suffix match" do
      lead = create_lead("+460701234567")
      assert UserLookup.find_lead_id("0701234567") == lead.id
    end

    test "returns nil when no match" do
      assert UserLookup.find_lead_id("0000000000") == nil
    end
  end
end
